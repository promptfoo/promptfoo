import type { EventSource } from './eventSource';
import type { EvaluateOptions } from './index';

/**
 * Internal orchestration metadata that should not be accepted from reusable
 * package callers. Process-lifecycle behavior keys off `eventSource`, so keep it
 * separate from the public `EvaluateOptions` surface.
 */
export type InternalEvaluateOptions = EvaluateOptions & {
  eventSource?: EventSource;
  /** Allow internal provider probes that intentionally evaluate outputs without assertions. */
  skipStrictAssertionValidation?: boolean;
  /** Snapshot the effective strict-config policy for this suite instead of ambient global state. */
  strictConfigEnabled?: boolean;
};
