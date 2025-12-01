# Logging Guidelines

## The Rule

Always use the logger with an object as the second parameter:

```typescript
logger.debug('[Component] Message', { headers, body, config });
```

The object is **auto-sanitized** - sensitive fields (API keys, tokens, passwords) are automatically redacted.

## Why This Matters

- **Security**: Prevents accidental exposure of secrets in logs
- **Consistency**: Structured logs are easier to search and analyze
- **Safety**: Redteam test content may contain harmful/sensitive data

## Anti-Pattern

Never use string interpolation with potentially sensitive data:

```typescript
// WRONG - exposes secrets, bypasses sanitization
logger.debug(`Config: ${JSON.stringify(config)}`);
```

## What Gets Sanitized

Field names containing (case-insensitive): `password`, `apiKey`, `token`, `secret`, `authorization`, `cookie`, `privateKey`, `signature`, and more.

See `src/util/sanitizer.ts` for the complete list.
