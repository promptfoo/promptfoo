import type { EventSource } from './eventSource';
import type { EvaluateOptions, VarValue } from './index';
import type { TokenUsage } from './shared';

/**
 * Internal orchestration metadata that should not be accepted from reusable
 * package callers. Process-lifecycle behavior keys off `eventSource`, so keep it
 * separate from the public `EvaluateOptions` surface.
 */
export type InternalEvaluateOptions = EvaluateOptions & {
  eventSource?: EventSource;
  expectedMatrixValuesFingerprint?: string;
  generationEventId?: string;
  generationTokenUsage?: TokenUsage;
  matrixValuesFingerprintError?: string;
  varValuesBasePath?: string;
  varValuesFileCache?: Map<string, VarValue[]>;
};
