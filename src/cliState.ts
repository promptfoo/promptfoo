import type { UnifiedConfig } from './types/index';

interface CliState {
  basePath?: string;
  config?: Partial<UnifiedConfig>;

  // Forces remote inference wherever possible
  remote?: boolean;

  // Indicates we're running in web UI mode
  webUI?: boolean;

  // Indicates an evaluation is running in resume mode
  resume?: boolean;

  // Cloud resume support: the eval ID being resumed from cloud
  cloudResumeEvalId?: string;

  // Cloud resume support: set of completed (testIdx:promptIdx) pairs from cloud
  // Used to skip already-completed tests when resuming a cloud scan
  cloudCompletedPairs?: Set<string>;

  // debug log file
  debugLogFile?: string;

  // error log file
  errorLogFile?: string;

  // Final callback to be called after all output is flushed
  postActionCallback?: () => Promise<void>;
}

const state: CliState = {};

export default state;
