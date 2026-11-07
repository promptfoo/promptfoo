/**
 * Reserved keys for eval-step runtime vars. `EvalRuntimeVars` is keyed by
 * this tuple, so adding a new key to {@link getEvalRuntimeVars} fails to
 * type-check until the key is added here too — keeping the omit list and the
 * producer in lockstep.
 *
 * `__evalId` changes on every eval run. `__evalStepId` and `__repeatIndex`
 * are stable across runs for the same step.
 *
 * This module imports nothing. The evaluator and script providers take these
 * helpers from `src/util/json.ts`, which they already import, so the
 * architecture edge counts stay put.
 */
export const EVAL_RUNTIME_VAR_KEYS = ['__evalId', '__evalStepId', '__repeatIndex'] as const;

type EvalRuntimeVarKey = (typeof EVAL_RUNTIME_VAR_KEYS)[number];

type RuntimeVarValue = string | number | boolean | object | unknown[];

/**
 * Runtime vars that must not be part of a provider response cache key.
 * Only the per-run id is omitted. Step and repeat ids stay so different
 * steps and repeats do not share a cached response.
 */
export const PER_RUN_EVAL_RUNTIME_VAR_KEYS = [
  '__evalId',
] as const satisfies readonly EvalRuntimeVarKey[];

type EvalRuntimeVars = Partial<Record<EvalRuntimeVarKey, RuntimeVarValue>>;

export function getEvalRuntimeVars({
  evalId,
  promptIndex,
  repeatIndex,
  testIndex,
}: {
  evalId?: string;
  promptIndex: number;
  repeatIndex: number;
  testIndex: number;
}): EvalRuntimeVars {
  return {
    ...(evalId ? { __evalId: evalId } : {}),
    __evalStepId: `test-${testIndex}-prompt-${promptIndex}-repeat-${repeatIndex}`,
    __repeatIndex: repeatIndex,
  };
}

/**
 * Returns a copy of `vars` without reserved eval runtime vars. They are
 * merged into an eval step's vars so prompts and providers can reference them,
 * but must not reach the persisted `EvaluateResult.vars` or assertion/grader
 * inputs: they are positional per-step identifiers that would pollute stored
 * results and — being `_`-prefixed — get restored onto re-run `test.vars` by
 * `--filter-*` re-runs. The input is not mutated; it is shared by reference
 * with the provider call context.
 *
 * The default key list is every eval runtime var. Provider response cache keys
 * pass {@link PER_RUN_EVAL_RUNTIME_VAR_KEYS} so only `__evalId` is removed.
 * `__evalStepId` and `__repeatIndex` are stable across runs for the same step,
 * so they stay in the key and still separate steps and repeats. User vars are
 * never removed.
 */
export function omitEvalRuntimeVars<T extends Record<string, RuntimeVarValue>>(
  vars: T,
  keys: readonly EvalRuntimeVarKey[] = EVAL_RUNTIME_VAR_KEYS,
): T {
  // Keep non-serialized metadata needed by assertion and grader providers.
  const result: Record<string, RuntimeVarValue> = { ...vars };
  for (const key of keys) {
    delete result[key];
  }
  return result as T;
}
