---
sidebar_label: Webhook Integration
title: Webhook Integration
description: Receive Promptfoo Enterprise issue, remediation, and eval notifications. Configure organization webhooks, rotate secrets, and verify request signatures safely.
---

# Webhook Integration

[Promptfoo Enterprise](/docs/enterprise/) provides webhooks for security vulnerabilities (issues), remediation, and eval job events.

## What is an Issue?

An "issue" in Promptfoo Enterprise refers to a **security vulnerability** or weakness detected during AI security testing. Issues are created when red team plugins identify potential security risks such as prompt injections, data leaks, harmful content generation, or other AI-specific vulnerabilities.

## Event Types

Supported webhook event types include:

- `issue.created`: Triggered when a new security vulnerability is detected and created
- `issue.updated`: Triggered when a vulnerability is updated (such as when multiple attributes change at once)
- `issue.status_changed`: Triggered when a vulnerability's status changes (e.g., from open to fixed)
- `issue.severity_changed`: Triggered when a vulnerability's severity level changes
- `issue.comment_added`: Triggered when a comment is added to a vulnerability
- `remediation.created`: Triggered when a new remediation is created for an issue
- `evaluation.created`: Triggered when an eval job is created
- `evaluation.completed`: Triggered when an eval job completes, including partial completion
- `evaluation.failed`: Triggered when an eval job fails
- `team.created`, `team.updated`, `team.deleted`: Team lifecycle events
- `target.created`, `target.updated`, `target.deleted`: Target lifecycle events
- `scan_template.created`, `scan_template.updated`, `scan_template.deleted`: Scan-template lifecycle events

> Note: When multiple properties of a vulnerability are updated simultaneously (for example, both status and severity), a single issue.updated event will be sent rather than separate issue.status_changed and issue.severity_changed events. This helps prevent webhook consumers from receiving multiple notifications for what is logically a single update operation.

## Managing Webhooks

On-prem organization administrators can manage webhooks under **Organization → Webhooks** or through the API. Use your administrator session or an administrator [service account key](./service-accounts.md). The API rejects team-scoped user tokens.

Webhooks deliver the selected events from **every team in the organization**. Choose a receiver authorized to handle data from all those teams. A subscription's `teamId` defaults to the organization's default team and does not filter deliveries.

For request and response schemas, download `/static/openapi.json` from your installation's API host. The public [API reference](/docs/api-reference/) may describe a different release.

### Creating a Webhook

This example uses an administrator service account key. Set `teamId` to your team's UUID or omit it to use the default. If you use an authenticated administrator session, omit the `Authorization` header.

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

Use `GET /api/v1/webhooks/event-types` to list the events supported by your installed version. To rotate a secret, use **Regenerate** in the webhook's edit dialog or `POST /api/v1/webhooks/{webhookId}/regenerate-secret`. Update the receiver with the returned secret immediately.

### Webhook Payload Structure

Webhook payloads are sent as JSON with `event`, `timestamp`, and `data` fields. The examples omit issue history and other metadata from `data.issue`.

```json
{
  "event": "issue.created",
  "timestamp": "2025-03-14T12:34:56Z",
  "data": {
    "issue": {
      "id": "123e4567-e89b-42d3-a456-426614174001",
      "pluginId": "hijacking",
      "status": "open",
      "severity": "high",
      "createdAt": "2025-03-14T12:30:00Z",
      "updatedAt": "2025-03-14T12:30:00Z"
    },
    "eventData": {
      "status": "open",
      "severity": "high",
      "pluginId": "hijacking"
    }
  }
}
```

The optional `eventData` field varies by event type. An `issue.updated` event for a combined status and severity update includes the current issue state and, for user-initiated changes, `userId`:

```json
{
  "event": "issue.updated",
  "timestamp": "2025-03-14T14:22:33Z",
  "data": {
    "issue": {
      "id": "123e4567-e89b-42d3-a456-426614174001",
      "pluginId": "hijacking",
      "status": "fixed",
      "severity": "low",
      "createdAt": "2025-03-14T12:30:00Z",
      "updatedAt": "2025-03-14T14:22:33Z"
    },
    "userId": "123e4567-e89b-42d3-a456-426614174002"
  }
}
```

For `remediation.created`, `data` contains `issueId` and `remediation`. All eval events include `jobId`. Creation includes `config`, completion includes `evalId`, `partial`, and `progress`, and failure includes `error` and `progress` when available.

## Verifying Webhook Signatures

To verify that a webhook is coming from Promptfoo Enterprise, the payload is signed using HMAC SHA-256. The hex-encoded signature is included in the `X-Promptfoo-Signature` header. Verify the raw body before parsing JSON. Reserializing parsed JSON can change the signed bytes.

The Node.js receiver below sets its own `5mb` body limit. Allow for your largest payloads, including eval configurations, on both the receiver and any reverse proxy.

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

Promptfoo sends an HTTP `POST` and expects a `2xx` response within 10 seconds. Redirects are not followed. Deliveries are asynchronous, with no automatic retries for failures. The `X-Webhook-Id` header identifies the subscription and stays the same across events.

To test the integration, trigger a subscribed event in the webhook's organization, such as adding an issue comment. If it does not arrive, check that the webhook is enabled, its organization and event subscription match, and the Promptfoo server can reach the endpoint. For HTTPS, check that the server trusts the endpoint's certificate. On managed Promptfoo Cloud, private and reserved network destinations are blocked. On-prem receivers can use internal addresses reachable from the deployment.

If signature verification fails, check the raw body and current signing secret. On-prem administrators can inspect server logs for `Failed to send webhook` and the endpoint's response status or connection error.

## Example Integration Scenarios

### SIEM Integration

Subscribe to `issue.created`, `issue.updated`, `issue.status_changed`, and `issue.severity_changed` to track vulnerabilities in your SIEM.

### Task Tracking Integration

For task tracking systems like JIRA, you can:

- Listen for `issue.created` to create new tickets for vulnerabilities
- Listen for `issue.updated` to update tickets when any vulnerability properties change
- Listen for `issue.status_changed` if you only care about vulnerability status transitions
- Listen for `issue.comment_added` to sync comments between systems

Use the issue's current state and history to add appropriate comments to your task tracking system (e.g., "Vulnerability status changed from open to fixed"). Do not assume every event includes `eventData` or a `changes` array.

### Custom Notification System

You could build a custom notification system that:

1. Creates different notification channels based on event types
2. Routes notifications to different teams based on severity levels
3. Uses issue state and history to craft appropriately detailed messages
4. Filters out specific types of changes that aren't relevant to particular teams
