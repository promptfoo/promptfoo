---
sidebar_label: Connecting to Targets
---

# Connecting to Targets

There are a few common issues that can arise when connecting to targets.

### Authentication

If your target requires authentication you will need to provide a valid authentication token.

If you're using a provider like HTTP or WebSocket, you can pass the token in the `headers` property.

```yaml
headers:
  Authorization: Bearer <token>
```

### Rate Limiting

If you're making a large number of requests to the target, you may encounter rate limiting. This is a common security measure to prevent abuse.

The solution here is to include a custom header or user agent in your configuration and whitelist this in your target's rate limiting settings.

```yaml
headers:
  User-Agent: Promptfoo
```

### Streaming or Polling

Many chatbots will stream responses back to the client or have the client poll for new messages. The solution here is to setup an alternate HTTP endpoint or parameter to return the response in a single message.
