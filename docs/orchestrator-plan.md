# Orchestrator Design Plan (Provider-Aware Scheduling)

This plan revises the orchestration approach using a code audit of `src/evaluator.ts` and `src/commands/eval.ts`. It is an implementation guide, not code. The goal is to replace the single global `async.forEachOfLimit` gate with provider-aware scheduling while preserving current evaluator semantics.

## Audit Summary (Current Behavior)

Key observations from the existing evaluator flow:

- Global concurrency is applied only to the "concurrent" phase via `async.forEachOfLimit` in `src/evaluator.ts`.
- Tests marked `runSerially` are executed sequentially before the concurrent phase.
- Concurrency is forced to 1 when:
  - `_conversation` var is used in prompts (conversation history mutation),
  - `storeOutputAs` is used (shared registers),
  - user-specified delay is set (CLI sets `maxConcurrency = 1` in `src/commands/eval.ts`).
- Each eval step calls `runEval` which:
  - uses an AbortSignal if provided,
  - executes provider-specific `callApi`,
  - sleeps for provider delay after non-cached responses, which currently consumes a concurrency slot,
  - updates registers and conversation state.
- Progress reporting relies on `runEvalOptions` ordering and per-step completion callbacks.
- Resume mode filters `runEvalOptions` by `(testIdx, promptIdx)` pairs.
- Max eval duration uses a global abort signal; any unprocessed indices are emitted as timeout errors.

These constraints must remain true after orchestration changes.

## First-Principles Constraints

Correctness and safety take priority over throughput:

- **Isolation:** Providers must be isolated so backoff or 429s do not block unrelated providers.
- **Deterministic side effects:** `storeOutputAs` and `_conversation` mutate shared state and require global serialization to avoid races.
- **Respect aborts/timeouts:** Stop launching new work when aborted; allow in-flight work to be canceled via AbortSignal.
- **Result integrity:** Maintain result indexing and progress reporting without reordering test indices.
- **No new breaking config:** Preserve existing CLI and evaluate option semantics.

## Revised Orchestrator Model

### Task Model

Each `RunEvalOptions` entry is wrapped as a scheduling task.

Fields:
- `providerKey`: lane key for rate-limit scope.
- `estimatedTokens`: input + expected output bound for TPM scheduling.
- `notBefore`: earliest start time (e.g., Retry-After).
- `run(): Promise<void>`: calls the existing `processEvalStepWithTimeout`.
- `index`: stable index into `runEvalOptions` (for progress and timeout handling).

### Lane Model (Per-Provider Actor)

Each provider lane owns its queue and scheduling state:
- `queue`, `inFlight`.
- `maxConcurrentConfig`, `maxConcurrentDynamic`.
- `rpm`, `tpm`, `nextReqAt`, `nextTokAt`.
- `blockedUntil` and `timer`.
- `minGapMs` for provider delay semantics.

### Global Serialization Gates

Some constraints are global, not per-lane:

- If any task uses `_conversation` or `storeOutputAs`, force **global serial** execution.
- If CLI delay is set (and thus `maxConcurrency = 1`), respect it as global serial.
- Tasks marked `runSerially` should still run before any concurrent scheduling (preserving current behavior).

### Rate-Limit Scheduling (Virtual Time)

For lanes with RPM/TPM:
- `startAt = max(now, blockedUntil, nextReqAt, nextTokAt, task.notBefore)`
- On start at `t0`:
  - `nextReqAt = max(nextReqAt, t0) + 60_000 / rpm`
  - `nextTokAt = max(nextTokAt, t0) + estimatedTokens * 60_000 / tpm`

### Provider Delay Semantics

Today, provider delay is implemented as `sleep()` after each call, which wastes a concurrency slot. The orchestrator should:

- Treat provider delay as `minGapMs` at the lane level, enforced by `nextReqAt`.
- Avoid sleeping within a running task once orchestration takes over.

### Retry and Backoff

Use provider-supplied hints when possible:
- `getRetryAfter(err)` and `parseRateLimitHints(response)` to set `blockedUntil`.
- Requeue the task with `notBefore = blockedUntil + jitter`.
- Avoid double-backoff when providers already retry internally; prefer hints over parsing raw errors.

### Adaptive Concurrency (AIMD)

Per lane:
- Start at configured `maxConcurrent`.
- On 429s or rate-limit signals: halve down to a minimum of 1.
- On sustained success: increment slowly (time or N successes).

### Global Concurrency Cap (Optional)

If needed, add a global semaphore:
- Acquire right before `run()` and release after completion.
- Only enable if configuration explicitly requests a global cap.

## Integration Points (Concrete)

### Where the Orchestrator Fits

In `src/evaluator.ts`:

- Preserve construction of `runEvalOptions` (for resume and ordering).
- Keep the **serial phase** unchanged: run all `runSerially` tasks sequentially first.
- Replace `async.forEachOfLimit` for concurrent tasks with `orchestrator.run(...)`.
- Each orchestrated task should call `processEvalStepWithTimeout(evalStep, index)` to preserve:
  - AbortSignal handling,
  - per-step timeouts,
  - progress callbacks,
  - evalRecord writes.

### Processed Indices

- Keep `processedIndices` updates in the same place (task completion).
- Orchestrator must mark processed indices only after successful or failed task completion.
- When max duration is exceeded, the existing timeout-result emission should still use `processedIndices`.

### Progress & Logging

- Progress callback usage must be unchanged; orchestration should not reorder indices.
- CI progress reporter and progress bars should still reflect total counts.

### Provider Lifecycle

- Keep provider cleanup in the existing `finally` block via `providerRegistry.shutdownAll()`.
- Orchestrator should expose `shutdown()` for tests, not for production cleanup.

## Provider Keying Strategy

Provider key should reflect true rate-limit scope:

Examples:
- `openai:gpt-4.1:<apiKeyHash>`
- `anthropic:claude-3-7-sonnet:<apiKeyHash>`
- `bedrock:us-east-1:anthropic.claude-v2`
- `azure-openai:<resourceName>:<deploymentName>`

Implement keying in provider adapters so it evolves with provider-specific rules.

## Migration Plan (Incremental)

1. Add orchestrator behind a feature flag or internal option.
2. Start with per-lane concurrency only (no RPM/TPM).
3. Move provider delay into lane scheduling (no post-call sleep).
4. Add RPM spacing using `nextReqAt` for providers with known limits.
5. Add TPM spacing with conservative `estimatedTokens`.
6. Add Retry-After handling and requeue behavior.
7. Add AIMD adaptive concurrency and telemetry.
8. Consider optional global semaphore if needed.

## Testing Plan

Unit tests (scheduler):
- Tasks start per lane without cross-lane blocking.
- Lane respects RPM/TPM spacing and `minGapMs`.
- Retry-After blocks starts and requeues correctly.
- Adaptive concurrency decreases on 429 and increases on success.
- AbortSignal stops new starts and cancels in-flight tasks.

Integration tests (evaluator flow):
- `runSerially` tasks still execute before concurrent tasks.
- `_conversation` and `storeOutputAs` force global serial behavior.
- Resume mode still skips completed `(testIdx, promptIdx)` pairs.
- Max duration abort produces timeout results for unprocessed indices.
- Progress reporting and totals remain consistent.

## Open Questions

- Where should `estimatedTokens` be sourced (provider metadata vs prompt bounds)?
- Which providers can reliably expose rate-limit hints first?
- Should we expose lane metrics in logs, telemetry, or both?
- Do any providers already do internal retry/backoff that would conflict with orchestrator-level retries?

## Success Criteria

- Improved throughput in mixed-provider runs with fewer 429s.
- Backoff in one provider does not stall others.
- No regressions in result ordering, resume, or progress reporting.
- Clear observability into lane state and throttling.
