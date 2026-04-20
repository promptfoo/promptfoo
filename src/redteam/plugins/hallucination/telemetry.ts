/**
 * Aggregate-only telemetry for hallucination v2 generation.
 *
 * What we record: counts, reject reasons, dedup-collapsed totals, persona
 * and seed IDs that conditioned the run, degraded-mode flags per stage.
 *
 * What we never record: prompt bodies, purpose text, target tools/system
 * prompts, full seed content. The plugin pipeline runs adversarial content
 * through this module, and the stats object surfaces in test metadata which
 * may be stored or shipped to telemetry endpoints. Keep it boring.
 */

export interface GenerationStats {
  /** Always 'v2' for this plugin. Identifies the pipeline shape in stored runs. */
  pipeline: 'v2';
  /** How many candidates the generator was asked to produce (n * oversampleFactor). */
  requested: number;
  /** Candidates returned by the generator before any filtering. */
  generated: number;
  /** Candidates dropped by literal-equality dedup. */
  literalDuplicatesDropped: number;
  /** Candidates collapsed by LLM-judged near-duplicate clustering. 0 when dedup mode is 'none' or in degraded mode. */
  llmDuplicatesCollapsed: number;
  /** Candidates dropped because they were judged trivially-refused by the critic. */
  trivialRefusalsDropped: number;
  /** Final number of test cases returned to the caller. */
  emitted: number;
  /**
   * Per-stage degraded flags. True means the stage did not produce its
   * intended effect — either an LLM call failed / refused / returned
   * malformed output, or the stage was skipped against user intent
   * (e.g. mutation requested but blocked by multi-input).
   *
   * - `generation`: every persona's `super.generateTests` returned zero
   *   candidates, leaving the candidate pool empty.
   * - `mutator`: mutation was requested but produced no usable result
   *   (every axis call failed at the API/parse level, or mutation was
   *   skipped because of an incompatible config like multi-input).
   *   Distinguishes "mutation was requested and didn't work" from
   *   "mutation disabled" (which leaves mutator=false and
   *   mutationApplied=false together).
   */
  degraded: {
    personaPicker: boolean;
    seedPicker: boolean;
    generation: boolean;
    critic: boolean;
    llmDedup: boolean;
    mutator: boolean;
  };
  /** IDs of personas used to condition this run. */
  personaIds: string[];
  /** IDs of seeds used to condition this run. */
  seedIds: string[];
  /** Oversample factor in effect for this run. */
  oversampleFactor: number;
  /**
   * True iff at least one mutation survived all filters and was appended
   * to the candidate pool. False when mutation is disabled, when every
   * axis call failed, when every output was filtered out (e.g. all
   * overlong), or when mutation was skipped because of an incompatible
   * config. Pair with `degraded.mutator` to distinguish "user didn't ask"
   * from "user asked and we couldn't deliver".
   */
  mutationApplied: boolean;
  /**
   * Mutated candidates that exceeded `config.maxCharsPerMessage` and were
   * dropped before dedup/critic. 0 when mutation didn't run or no cap is
   * configured.
   */
  mutationsRejectedForLength: number;
}

export function createInitialStats(oversampleFactor: number, requested: number): GenerationStats {
  return {
    pipeline: 'v2',
    requested,
    generated: 0,
    literalDuplicatesDropped: 0,
    llmDuplicatesCollapsed: 0,
    trivialRefusalsDropped: 0,
    emitted: 0,
    degraded: {
      personaPicker: false,
      seedPicker: false,
      generation: false,
      critic: false,
      llmDedup: false,
      mutator: false,
    },
    personaIds: [],
    seedIds: [],
    oversampleFactor,
    mutationApplied: false,
    mutationsRejectedForLength: 0,
  };
}
