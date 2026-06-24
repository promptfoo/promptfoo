import type { EventSource } from './eventSource';
import type {
  EvalPromptSelection,
  EvalProviderSelection,
  EvalTestCaseSelection,
  EvaluateOptions,
} from './index';

/**
 * Internal orchestration metadata that should not be accepted from reusable
 * package callers. Process-lifecycle behavior keys off `eventSource`, so keep it
 * separate from the public `EvaluateOptions` surface.
 */
export type InternalEvaluateOptions = EvaluateOptions & {
  /** Configuration base directory; accepted only from trusted orchestration state. */
  configBasePath?: string;
  /** Config environment files; accepted only from trusted orchestration state. */
  configEnvPaths?: string | string[];
  /** Source of effective environment paths; accepted only from trusted orchestration state. */
  configEnvSource?: 'cli' | 'config';
  eventSource?: EventSource;
  /** Zero-based test case indices applied after scenario expansion. */
  testCaseIndices?: number[];
  /** Hashed logical test identities persisted for reproducible resume and retry. */
  testCaseSelection?: EvalTestCaseSelection;
  /** Resolved provider selection persisted for reproducible resume and retry. */
  providerSelection?: EvalProviderSelection;
  /** Logical prompt identities and order persisted for reproducible resume and retry. */
  promptSelection?: EvalPromptSelection;
};
