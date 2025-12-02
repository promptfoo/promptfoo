# http-provider-auth-oauth (HTTP Provider OAuth Authentication)

You can run this example with:

```bash
npx promptfoo@latest init --example http-provider-auth-oauth
```

This example demonstrates how to configure OAuth 2.0 authentication for HTTP providers with promptfoo.

## Overview

The HTTP provider supports two OAuth 2.0 grant types:

1. **Client Credentials** - For server-to-server authentication
2. **Username/Password** (Resource Owner Password Credentials) - For authenticating with user credentials

## Client Credentials Flow

Best for machine-to-machine authentication where there's no user involved:

```yaml
providers:
  - id: https://api.example.com/v1/chat
    config:
      url: 'https://api.example.com/v1/chat'
      method: 'POST'
      body:
        prompt: '{{prompt}}'
      auth:
        type: oauth
        grantType: client_credentials
        tokenUrl: 'https://auth.example.com/oauth/token'
        clientId: 'your-client-id'
        clientSecret: 'your-client-secret'
        scopes:
          - read
          - write
```

## Username/Password Flow

Best when authenticating with user credentials:

```yaml
providers:
  - id: https://api.example.com/v1/chat
    config:
      url: 'https://api.example.com/v1/chat'
      method: 'POST'
      body:
        prompt: '{{prompt}}'
      auth:
        type: oauth
        grantType: password
        tokenUrl: 'https://auth.example.com/oauth/token'
        clientId: 'your-client-id'
        clientSecret: 'your-client-secret'
        username: 'user@example.com'
        password: 'your-password'
        scopes:
          - read
```

## How It Works

The HTTP provider will automatically:

1. Request an access token from the specified `tokenUrl`
2. Cache the token and refresh it when it expires (with a 60-second buffer)
3. Add the token to requests as an `Authorization: Bearer <token>` header

## Security Best Practices

- Store sensitive credentials in environment variables:

```yaml
auth:
  type: oauth
  grantType: client_credentials
  tokenUrl: 'https://auth.example.com/oauth/token'
  clientId: '{{env.OAUTH_CLIENT_ID}}'
  clientSecret: '{{env.OAUTH_CLIENT_SECRET}}'
```

- Never commit credentials to version control
- Use the most restrictive scopes necessary for your use case

## Testing Locally

To test your configuration:

1. Set up your environment variables:

```bash
export OAUTH_CLIENT_ID=your-client-id
export OAUTH_CLIENT_SECRET=your-client-secret
```

2. Run the evaluation:

```bash
promptfoo eval
```

3. View the results:

```bash
promptfoo view
```

For more detailed information, see the [HTTP Provider documentation](/docs/providers/http#authentication).
