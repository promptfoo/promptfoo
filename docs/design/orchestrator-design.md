# Evaluation Orchestrator

## Status: Integrated

**Location:** `src/util/orchestration/`
**Integration:** `src/evaluator.ts:421-422`

---

## Core Purpose

**Prevent pile-on to rate-limited endpoints.**

When an endpoint returns 429 (rate limit), the request retries with backoff. Without the orchestrator, other requests continue hammering the same endpoint. With the orchestrator, the retrying request holds its slot, naturally reducing pressure.

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│  EvalOrchestrator                                               │
│                                                                 │
│  openai:gpt-4o          anthropic:claude        http:custom    │
│  ┌───────────────┐      ┌───────────────┐      ┌─────────────┐ │
│  │ Semaphore (4) │      │ Semaphore (4) │      │ Semaphore(4)│ │
│  └───────────────┘      └───────────────┘      └─────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

Each endpoint gets a semaphore with 4 slots (configurable). The slot is held for the **entire request lifecycle including retries**:

```
Request → Acquire Slot → API Call → 429 → Backoff → Retry → Success → Release
              ↑                                                          ↑
              └──────────────── Slot held entire time ───────────────────┘
```

**This IS the retry-aware behavior.** No special retry detection needed.

## Why This Works

| Scenario | Without Orchestrator | With Orchestrator |
|----------|---------------------|-------------------|
| Endpoint rate-limited | All 4 concurrent requests retry + new requests pile on | Retrying requests hold slots, only 4 total in flight |
| One slow endpoint | Blocks slots for fast endpoints | Each endpoint has own pool |
| Mixed providers | Shared pool contention | Independent pools |

## Implementation

```typescript
// evaluator.ts:421-422
response = await EvalOrchestrator.getInstance().execute(
  activeProvider.id(),  // endpoint identifier
  async () => activeProvider.callApi(renderedPrompt, callApiContext),
);
```

The orchestrator wraps `callApi()`, which includes all retry logic internally. The slot is acquired before the call and released after (including all retries).

## Endpoint ID Normalization

Each unique provider ID gets its own pool:

| Input | Normalized | Pool |
|-------|------------|------|
| `openai:gpt-4o` | `openai:gpt-4o` | Own pool |
| `http://api.example.com:8080/v1` | `http:api.example.com:8080` | Own pool (scheme:host) |
| `gpt-4o` (bare) | `id:gpt-4o` | Own pool |

## Known Limitation

The orchestrator sits inside `async.forEachOfLimit`, so global slots are held while waiting on endpoint semaphores. For full isolation benefits, set global concurrency >= sum of endpoint limits.

## Files

| File | Purpose |
|------|---------|
| `src/util/orchestration/orchestrator.ts` | Singleton with execute() |
| `src/util/orchestration/endpointController.ts` | Per-endpoint semaphore |
| `test/util/orchestration/` | Tests |
