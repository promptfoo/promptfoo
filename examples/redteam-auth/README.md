# redteam-auth (Red Team Authentication)

You can run this example with:

```bash
npx promptfoo@latest init --example redteam-auth
```

This example demonstrates how to configure authentication for red team evaluations against HTTP endpoints. It includes three configuration files showing different authentication methods:

1. **OAuth 2.0** (`promptfooconfig.oauth.yaml`) - Client credentials flow for server-to-server authentication
2. **API Key** (`promptfooconfig.api_key.yaml`) - API key authentication via headers
3. **Digital Signature** (`promptfooconfig.digital_signature.yaml`) - Digital signature authentication using private keys

## Overview

When running red team evaluations against protected HTTP endpoints, you need to configure authentication. This example shows how to set up OAuth, API key, and digital signature authentication in your red team target configuration.

## Configuration Files

### OAuth Authentication

The `promptfooconfig.oauth.yaml` file demonstrates OAuth 2.0 client credentials flow:

```yaml
targets:
  - id: http
    config:
      url: https://example-app.promptfoo.app/minnow/chat?auth_type=bearer
      method: POST
      auth:
        type: oauth
        grantType: client_credentials
        clientId: '{{env.PROMPTFOO_TARGET_CLIENT_ID}}'
        clientSecret: '{{env.PROMPTFOO_TARGET_CLIENT_SECRET}}'
        tokenUrl: https://example-app.promptfoo.app/oauth/token
        scopes: []
```

### API Key Authentication

The `promptfooconfig.api_key.yaml` file demonstrates API key authentication:

```yaml
targets:
  - id: http
    config:
      url: https://example-app.promptfoo.app/minnow/chat?auth_type=api_key
      method: POST
      auth:
        type: api_key
        value: '{{env.PROMPTFOO_TARGET_API_KEY}}'
        placement: header
        keyName: X-API-Key
```

### Digital Signature Authentication

The `promptfooconfig.digital_signature.yaml` file demonstrates digital signature authentication:

```yaml
targets:
  - id: http
    config:
      url: https://example-app.promptfoo.app/minnow/chat?auth_type=digital_signature
      method: POST
      headers:
        'timestamp': '{{signatureTimestamp}}'
        'signature': '{{signature}}'
      signatureAuth:
        enabled: true
        certificateType: pem
        keyInputType: base64
        type: pem
        privateKey: '{{env.PROMPTFOO_AUTH_PRIVATE_KEY}}'
        signatureValidityMs: 80000
        signatureDataTemplate: 'promptfoo-app{{signatureTimestamp}}'
```

## Environment Variables

This example requires environment variables depending on which authentication method you use:

### For OAuth Authentication

- `PROMPTFOO_TARGET_CLIENT_ID` - Your OAuth client ID
- `PROMPTFOO_TARGET_CLIENT_SECRET` - Your OAuth client secret

### For API Key Authentication

- `PROMPTFOO_TARGET_API_KEY` - Your API key

### For Digital Signature Authentication

- `PROMPTFOO_AUTH_PRIVATE_KEY` - Your base64-encoded private key (PEM format)

NOTE: The values for these environment variables are available upon request.

## Running the Example

1. **Set up environment variables:**

```bash
# For OAuth
export PROMPTFOO_TARGET_CLIENT_ID=your-client-id
export PROMPTFOO_TARGET_CLIENT_SECRET=your-client-secret

# For API Key
export PROMPTFOO_TARGET_API_KEY=your-api-key

# For Digital Signature
export PROMPTFOO_AUTH_PRIVATE_KEY=your-base64-encoded-private-key
```

2. **Run the red team evaluation:**

```bash
# Using OAuth configuration
promptfoo redteam run -c promptfooconfig.oauth.yaml

# Using API Key configuration
promptfoo redteam run -c promptfooconfig.api_key.yaml

# Using Digital Signature configuration
promptfoo redteam run -c promptfooconfig.digital_signature.yaml
```

3. **View the results:**

```bash
promptfoo view
```

## How It Works

### OAuth Flow

When using OAuth authentication:

1. The HTTP provider automatically requests an access token from the `tokenUrl` using client credentials
2. The token is cached and refreshed when it expires (with a 60-second buffer)
3. The token is added to requests as an `Authorization: Bearer <token>` header

### API Key Flow

When using API key authentication:

1. The API key is read from the environment variable
2. The key is added to requests in the specified header (e.g., `X-API-Key: <key>`)
3. The placement can be `header` or `query` (query parameters)

### Digital Signature Flow

When using digital signature authentication:

1. A timestamp is generated for each request
2. The signature data is constructed using the `signatureDataTemplate` (e.g., `promptfoo-app{{signatureTimestamp}}`)
3. The data is signed using the private key from the environment variable
4. The timestamp and signature are added to request headers
5. The signature is valid for the duration specified by `signatureValidityMs` (80 seconds in the example)

## Security Best Practices

- **Never commit credentials** to version control
- **Use environment variables** for all sensitive values
- **Use the most restrictive scopes** necessary for OAuth
- **Rotate credentials regularly** in production environments
- **Keep private keys secure** and use base64 encoding when storing in environment variables
- **Set appropriate signature validity windows** to balance security and usability

## Customizing for Your Endpoint

To use this example with your own endpoint:

1. Update the `url` in the target configuration
2. Update the `tokenUrl` for OAuth (if applicable)
3. Adjust the `body` structure to match your API's expected format
4. Update the `transformResponse` function to extract the response from your API's format
5. For digital signatures, configure the `signatureDataTemplate` to match your API's expected signature format
6. Set the appropriate environment variables

For more information, see the [HTTP Provider documentation](/docs/providers/http#authentication) and [Red Team documentation](/docs/red-team/getting-started).
