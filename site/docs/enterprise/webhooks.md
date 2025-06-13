---
sidebar_label: Webhook Integration
---

# Webhook Integration

Promptfoo Enterprise provides webhooks to notify external systems when issues are created or updated.

## Event Types

The following webhook event types are available:

- `issue.created`: Triggered when a new issue is created
- `issue.updated`: Triggered when an issue is updated (such as when multiple attributes change at once)
- `issue.status_changed`: Triggered when an issue's status changes (e.g., from open to fixed)
- `issue.severity_changed`: Triggered when an issue's severity level changes
- `issue.comment_added`: Triggered when a comment is added to an issue

> Note: When multiple properties of an issue are updated simultaneously (for example, both status and severity), a single issue.updated event will be sent rather than separate issue.status_changed and issue.severity_changed events. This helps prevent webhook consumers from receiving multiple notifications for what is logically a single update operation.

## Managing Webhooks

Webhooks can be managed via the API. Each webhook is associated with an organization and can be configured to listen for specific event types.

### Creating a Webhook

```
POST /api/webhooks
Content-Type: application/json
Authorization: Bearer YOUR_API_TOKEN

{
  "url": "<https://your-webhook-endpoint.com/callback>",
  "name": "My SIEM Integration",
  "events": ["issue.created", "issue.status_changed"],
  "teamId": "optional-team-id",
  "enabled": true
}

```

Upon creation, a secret is generated for the webhook. This secret is used to sign webhook payloads and should be stored securely.

### Webhook Payload Structure

Webhook payloads are sent as JSON and have the following structure:

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

## Verifying Webhook Signatures

To verify that a webhook is coming from Promptfoo Enterprise, the payload is signed using HMAC SHA-256. The signature is included in the `X-Promptfoo-Signature` header.

Here's an example of how to verify signatures in Node.js:

```jsx
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

// In your webhook handler:
app.post('/webhook-endpoint', (req, res) => {
  const payload = req.body;
  const signature = req.headers['x-promptfoo-signature'];
  const webhookSecret = 'your-webhook-secret';

  if (!verifyWebhookSignature(payload, signature, webhookSecret)) {
    return res.status(401).send('Invalid signature');
  }

  // Process the webhook
  console.log(`Received ${payload.event} event`);

  res.status(200).send('Webhook received');
});
```

## Example Integration Scenarios

### SIEM Integration

When integrating with a SIEM system, you might want to listen for `issue.created` and `issue.updated` events. This allows your security team to be notified of new security issues detected by Promptfoo Enterprise and track their resolution. The complete issue state provided with each webhook makes it easy to keep your SIEM system synchronized.

### Task Tracking Integration

For task tracking systems like JIRA, you can:

- Listen for `issue.created` to create new tickets
- Listen for `issue.updated` to update tickets when any properties change
- Listen for `issue.status_changed` if you only care about status transitions
- Listen for `issue.comment_added` to sync comments between systems

The `changes` array included with `issue.updated` events makes it easy to add appropriate comments to your task tracking system (e.g., "Status changed from open to fixed").

### Custom Notification System

You could build a custom notification system that:

1. Creates different notification channels based on event types
2. Routes notifications to different teams based on severity levels
3. Uses the `changes` information in `issue.updated` events to craft appropriately detailed messages
4. Filters out specific types of changes that aren't relevant to particular teams
