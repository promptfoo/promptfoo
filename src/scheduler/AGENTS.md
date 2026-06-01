# Scheduler and Rate Limits

Adaptive concurrency, rate-limit parsing, retry policy, and provider call queueing.

## Risk Areas

- Check the full retry stack before changing retry behavior: scheduler retries, provider/client retries, fetch-level retries, and provider-specific retry config can multiply each other.
- Preserve `maxRetries: 0` semantics where supported: zero should mean no retry at the layer being configured.
- Keep rate-limit keys stable and specific enough to avoid cross-provider or cross-model interference.
- Avoid global mutable state unless it is intentionally scoped by provider/model/account and resettable in tests.
- Concurrency changes should account for cancellation, abort signals, setup failures, and provider calls that return no token usage.

## Testing

Scheduler tests are sensitive to timers and random order:

- Use fake timers deliberately and restore them in `afterEach`.
- Test both success and failure paths, including 429s, transient errors, aborts, and disabled adaptive scheduler behavior.
- Add regression tests for retry amplification, stale state, and cleanup of queued or in-flight work.

## Validation

Run focused scheduler tests first:

```bash
npx vitest run test/scheduler
npm run tsc
```

For behavior changes, run a real local eval with `--no-cache` and inspect the exported JSON for provider errors, request counts, score, and success state.
