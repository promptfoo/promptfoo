# redteam-mcp-auth (Red Team MCP Authentication)

You can run this example with:

```bash
npx promptfoo@latest init --example redteam-mcp-auth
```

This example demonstrates how to configure authentication for red team evaluations against MCP (Model Context Protocol) servers. It shows OAuth 2.0 client credentials flow for authenticating with remote MCP servers.

## Overview

When running red team evaluations against protected MCP servers, you need to configure authentication. This example shows how to set up OAuth authentication in your MCP target configuration.

## Configuration

### OAuth Authentication

The `promptfooconfig.oauth.yaml` file demonstrates OAuth 2.0 client credentials flow:

```yaml
targets:
  - id: mcp
    label: MCP Example
    config:
      enabled: true
      server:
        url: https://example-bot.promptfoo.app/mcp/minnow?auth_type=bearer
        auth:
          type: oauth
          grantType: client_credentials
          clientId: '{{env.PROMPTFOO_TARGET_CLIENT_ID}}'
          clientSecret: '{{env.PROMPTFOO_TARGET_CLIENT_SECRET}}'
          tokenUrl: https://example-bot.promptfoo.app/oauth/token
          scopes: []
```

## Environment Variables

This example requires the following environment variables:

- `PROMPTFOO_TARGET_CLIENT_ID` - Your OAuth client ID
- `PROMPTFOO_TARGET_CLIENT_SECRET` - Your OAuth client secret

NOTE: The values for these environment variables are available upon request.

## Running the Example

1. **Set up environment variables:**

```bash
export PROMPTFOO_TARGET_CLIENT_ID=your-client-id
export PROMPTFOO_TARGET_CLIENT_SECRET=your-client-secret
```

2. **Run the red team evaluation:**

```bash
promptfoo redteam run -c promptfooconfig.oauth.yaml
```

3. **View the results:**

```bash
promptfoo view
```

## How It Works

### OAuth Flow for MCP

When using OAuth authentication with MCP servers:

1. If `tokenUrl` is not specified, the provider discovers it using RFC 8414 OAuth metadata
2. The MCP provider requests an access token from the `tokenUrl` using client credentials
3. The token is cached and proactively refreshed before it expires (with a 60-second buffer)
4. The token is added to MCP transport requests as an `Authorization: Bearer <token>` header
5. If a token expires during an evaluation, the provider automatically reconnects with a fresh token

### Token Refresh

The MCP provider implements proactive token refresh:

- Tokens are refreshed 60 seconds before expiration
- Concurrent requests share the same refresh operation (no duplicate token fetches)
- If a 401 error occurs, the provider automatically refreshes and retries

## Other Authentication Methods

The MCP provider also supports these authentication types:

### Bearer Token

```yaml
server:
  url: https://mcp-server.example.com
  auth:
    type: bearer
    token: '{{env.MCP_BEARER_TOKEN}}'
```

### Basic Authentication

```yaml
server:
  url: https://mcp-server.example.com
  auth:
    type: basic
    username: '{{env.MCP_USERNAME}}'
    password: '{{env.MCP_PASSWORD}}'
```

### API Key

```yaml
server:
  url: https://mcp-server.example.com
  auth:
    type: api_key
    value: '{{env.MCP_API_KEY}}'
    placement: header # or 'query'
    keyName: X-API-Key # header/param name
```

### OAuth Password Grant

```yaml
server:
  url: https://mcp-server.example.com
  auth:
    type: oauth
    grantType: password
    tokenUrl: https://auth.example.com/token
    username: '{{env.MCP_USERNAME}}'
    password: '{{env.MCP_PASSWORD}}'
    clientId: '{{env.MCP_CLIENT_ID}}' # optional
    clientSecret: '{{env.MCP_CLIENT_SECRET}}' # optional
    scopes: ['read', 'write']
```

## Security Best Practices

- **Never commit credentials** to version control
- **Use environment variables** for all sensitive values
- **Use the most restrictive scopes** necessary for OAuth
- **Rotate credentials regularly** in production environments

## Customizing for Your MCP Server

To use this example with your own MCP server:

1. Update the `url` to point to your MCP server endpoint
2. Update the `tokenUrl` for OAuth authentication
3. Set the appropriate environment variables
4. Adjust the `redteam.purpose` to describe your system
5. Configure the appropriate plugins for your security testing needs

For more information, see the [MCP Provider documentation](/docs/providers/mcp) and [Red Team documentation](/docs/red-team/getting-started).
