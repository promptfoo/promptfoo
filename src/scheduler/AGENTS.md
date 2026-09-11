# Scheduler and Rate Limits

Adaptive concurrency (`adaptiveConcurrency.ts`), rate-limit parsing/keys (`headerParser.ts`, `rateLimitKey.ts`, `rateLimitRegistry.ts`), retry policy (`retryPolicy.ts`), and provider call queueing (`providerCallQueue.ts`, `slotQueue.ts`).

## Risk Areas

- Check the **full** retry stack before changing retry behavior: scheduler retries, provider/client retries, fetch-level retries, and provider-specific retry config can multiply each other.
- Preserve `maxRetries: 0` semantics: zero means no retry at the layer being configured.
- Keep rate-limit keys stable and specific enough to avoid cross-provider/cross-model interference.
- Avoid global mutable state unless it's intentionally scoped by provider/model/account and resettable in tests (`providerRateLimitState.ts`).
- Concurrency changes must account for cancellation/abort signals, setup failures, and provider calls that return no token usage.

## Testing

Scheduler tests are sensitive to timers and ordering:

- Use fake timers deliberately and restore them in `afterEach`.
- Cover success and failure paths: 429s, transient errors, aborts, and the adaptive-scheduler-disabled path.
- Add regression tests for retry amplification, stale state, and cleanup of queued or in-flight work.

## Validation

```bash
npx vitest run test/scheduler
npm run tsc
```

For behavior changes, run a real local eval with `--no-cache` and inspect the exported JSON for provider errors, request counts, score, and success.
