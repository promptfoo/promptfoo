---
sidebar_label: Webhook Integration
title: Webhook Integration
description: Receive Promptfoo Enterprise issue, remediation, and eval notifications. Configure team-scoped webhooks, rotate secrets, and verify request signatures safely.
---

# Webhook Integration

[Promptfoo Enterprise](/docs/enterprise/) provides webhooks for security vulnerabilities (issues), remediation, and eval job events.

## What is an Issue?

An "issue" in Promptfoo Enterprise refers to a **security vulnerability** or weakness detected during AI security testing. Issues are created when red team plugins identify potential security risks such as prompt injections, data leaks, harmful content generation, or other AI-specific vulnerabilities.

## Event Types

The following webhook event types are available:

- `issue.created`: Triggered when a new security vulnerability is detected and created
- `issue.updated`: Triggered when a vulnerability is updated (such as when multiple attributes change at once)
- `issue.status_changed`: Triggered when a vulnerability's status changes (e.g., from open to fixed)
- `issue.severity_changed`: Triggered when a vulnerability's severity level changes
- `issue.comment_added`: Triggered when a comment is added to a vulnerability
- `remediation.created`: Triggered when a new remediation is created for an issue
- `evaluation.created`: Triggered when an eval job is created
- `evaluation.completed`: Triggered when an eval job completes, including partial completion
- `evaluation.failed`: Triggered when an eval job fails

> Note: When multiple properties of a vulnerability are updated simultaneously (for example, both status and severity), a single issue.updated event will be sent rather than separate issue.status_changed and issue.severity_changed events. This helps prevent webhook consumers from receiving multiple notifications for what is logically a single update operation.

## Managing Webhooks

On-prem administrators can manage webhooks under **Organization → Webhooks** or through the API. Management requires organization-admin access. Use your signed-in administrator session or an administrator [service-account API key](./service-accounts.md); team-scoped user API tokens are rejected.

Each webhook subscribes to selected events for one team. When creating a webhook through the API, set `teamId` to that team's UUID. If omitted, the webhook belongs to the organization's default team, including webhooks created through the UI. It does not receive events from other teams.

For request and response schemas, see **Create webhook**, **List webhook event types**, and **Regenerate webhook secret** in the [API reference](/docs/api-reference/), or download the [OpenAPI specification](https://api.promptfoo.app/static/openapi.json).

### Creating a Webhook

Using an administrator service-account API key, send the following request, replacing the example `teamId` with the intended team's UUID. With an authenticated administrator session, omit the `Authorization` header.

```http
POST /api/v1/webhooks
Content-Type: application/json
Authorization: Bearer YOUR_SERVICE_ACCOUNT_API_KEY

{
  "url": "https://your-webhook-endpoint.com/callback",
  "name": "My SIEM Integration",
  "events": ["issue.created", "issue.status_changed"],
  "teamId": "123e4567-e89b-42d3-a456-426614174000",
  "enabled": true
}
```

Upon creation, a secret is generated for the webhook. This secret is used to sign webhook payloads and should be stored securely.

Use `GET /api/v1/webhooks/event-types` to list the events supported by your installed version. To rotate a secret, use **Regenerate** in the webhook's edit dialog or `POST /api/v1/webhooks/{webhookId}/regenerate-secret`. Update the receiver with the returned secret; new deliveries use the replacement immediately.

### Webhook Payload Structure

Webhook payloads are sent as JSON with `event`, `timestamp`, and `data` fields. Issue events have the following structure:

```json
{
  "event": "issue.created",
  "timestamp": "2025-03-14T12:34:56Z",
  "data": {
    "issue": {
      "id": "issue-uuid",
      "pluginId": "plugin-id",
      "status": "open",
      "severity": "high",
      "organizationId": "org-id",
      "targetId": "target-id",
      "providerId": "provider-id",
      "createdAt": "2025-03-14T12:30:00Z",
      "updatedAt": "2025-03-14T12:30:00Z",
      "weakness": "display-name-of-plugin",
      "history": [...]
    },
    "eventData": {
      // Additional data specific to the event type
    }
  }
}

```

For `issue.updated` events, the `eventData` field includes information about what changed:

```json
{
  "event": "issue.updated",
  "timestamp": "2025-03-14T14:22:33Z",
  "data": {
    "issue": {
      // Complete issue data with the current state
    },
    "eventData": {
      "changes": ["status changed to fixed", "severity changed to low"]
    },
    "userId": "user-123" // If the update was performed by a user
  }
}
```

This structure allows you to:

1. See the complete current state of the issue
2. Understand what specific attributes changed
3. Track who made the change (if applicable)

For `remediation.created`, `data` contains `issueId` and `remediation`. Eval events include `jobId`: creation includes `config`, completion includes `evalId`, `partial`, and `progress`, and failure includes `error` and `progress` when available.

## Verifying Webhook Signatures

To verify that a webhook is coming from Promptfoo Enterprise, the payload is signed using HMAC SHA-256. The hex-encoded signature is included in the `X-Promptfoo-Signature` header. Verify the raw request body before parsing JSON; reserializing parsed JSON can change the signed bytes.

Here's an example of how to verify signatures in Node.js. Its `5mb` body limit is an example receiver limit, not a Promptfoo payload limit. Size this limit and any reverse-proxy limits for your largest expected payload, including eval configurations.

```js
import crypto from 'node:crypto';
import express from 'express';

const app = express();
const webhookSecret = process.env.PROMPTFOO_WEBHOOK_SECRET;

if (!webhookSecret) {
  throw new Error('Set PROMPTFOO_WEBHOOK_SECRET to the webhook signing secret');
}

function verifyWebhookSignature(rawBody, signature, secret) {
  if (
    !Buffer.isBuffer(rawBody) ||
    typeof signature !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(signature)
  ) {
    return false;
  }

  const expectedSignature = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), expectedSignature);
}

// Register this route before any app.use(express.json()) middleware.
app.post(
  '/webhook-endpoint',
  express.raw({ type: 'application/json', limit: '5mb' }),
  (req, res) => {
    if (!verifyWebhookSignature(req.body, req.get('X-Promptfoo-Signature'), webhookSecret)) {
      return res.status(401).send('Invalid signature');
    }

    const payload = JSON.parse(req.body.toString('utf8'));
    // Process the webhook
    console.log(`Received ${payload.event} event`);

    res.status(200).send('Webhook received');
  },
);
```

## Delivery and troubleshooting

Promptfoo sends an HTTP `POST` and expects a `2xx` response within 10 seconds. Redirects are not followed. Deliveries are asynchronous, with no automatic retries for failures. The `X-Webhook-Id` header identifies the webhook subscription, not an individual event.

To test the integration, trigger a subscribed event in the webhook's team, such as adding an issue comment. If it does not arrive, check that the webhook is enabled, its team and event subscription match, and the Promptfoo server can reach the endpoint. For HTTPS, check that the server trusts the endpoint's certificate. On managed Promptfoo Cloud, private and reserved network destinations are blocked; on-prem receivers can use internal addresses reachable from the deployment.

If signature verification fails, check the raw body and current signing secret. On-prem administrators can inspect server logs for `Failed to send webhook` and the endpoint's response status or connection error.

## Example Integration Scenarios

### SIEM Integration

When integrating with a SIEM system, you might want to listen for `issue.created` and `issue.updated` events. This allows your security team to be notified of new security vulnerabilities detected by Promptfoo Enterprise and track their resolution. The complete vulnerability state provided with each webhook makes it easy to keep your SIEM system synchronized.

### Task Tracking Integration

For task tracking systems like JIRA, you can:

- Listen for `issue.created` to create new tickets for vulnerabilities
- Listen for `issue.updated` to update tickets when any vulnerability properties change
- Listen for `issue.status_changed` if you only care about vulnerability status transitions
- Listen for `issue.comment_added` to sync comments between systems

The `changes` array included with `issue.updated` events makes it easy to add appropriate comments to your task tracking system (e.g., "Vulnerability status changed from open to fixed").

### Custom Notification System

You could build a custom notification system that:

1. Creates different notification channels based on event types
2. Routes notifications to different teams based on severity levels
3. Uses the `changes` information in `issue.updated` events to craft appropriately detailed messages
4. Filters out specific types of changes that aren't relevant to particular teams
