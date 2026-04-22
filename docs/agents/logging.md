# Logging Guidelines

## The Rule

Always use the logger with an object as the second parameter:

```typescript
logger.debug('[Component] Message', { headers, body, config });
```

The object is **auto-sanitized** - sensitive fields are automatically redacted.

## Why This Matters

- **Security**: Prevents accidental exposure of secrets in logs
- **Consistency**: Structured logs are easier to search and analyze
- **Safety**: Red team test content may contain harmful/sensitive data

## Correct Usage

```typescript
import logger from './logger';

// Good - context object is auto-sanitized
logger.debug('[Provider]: Making API request', {
  url: 'https://api.example.com',
  method: 'POST',
  headers: { Authorization: 'Bearer secret-token' },
  body: { apiKey: 'secret-key', data: 'value' },
});
// Output: Authorization and apiKey are [REDACTED]

logger.error('Request failed', {
  headers: response.headers,
  body: errorResponse,
});
```

## Anti-Pattern

```typescript
// WRONG - exposes secrets, bypasses sanitization
logger.debug(`Config: ${JSON.stringify(config)}`);
logger.debug(`Calling ${url} with headers: ${JSON.stringify(headers)}`);
```

## Manual Sanitization

For non-logging contexts:

```typescript
import { sanitizeObject } from './util/sanitizer';

const sanitizedConfig = sanitizeObject(providerConfig, {
  context: 'provider config',
});
```

## What Gets Sanitized

Field names containing (case-insensitive, works with `-`, `_`, camelCase):

| Category     | Fields                                                                     |
| ------------ | -------------------------------------------------------------------------- |
| Passwords    | `password`, `passwd`, `pwd`, `passphrase`                                  |
| API Keys     | `apiKey`, `api_key`, `token`, `accessToken`, `refreshToken`, `bearerToken` |
| Secrets      | `secret`, `clientSecret`, `webhookSecret`                                  |
| Headers      | `authorization`, `cookie`, `x-api-key`, `x-auth-token`                     |
| Certificates | `privateKey`, `certificatePassword`, `keystorePassword`                    |
| Signatures   | `signature`, `sig`, `signingKey`                                           |

See `src/util/sanitizer.ts` for the complete list.
