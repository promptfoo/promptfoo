import type { UnifiedConfig } from './types/index';

interface CliState {
  basePath?: string;
  config?: Partial<UnifiedConfig>;

  // Forces remote inference wherever possible
  remote?: boolean;

  // Indicates we're running in web UI mode
  webUI?: boolean;

  // Indicates we're running in Ink interactive UI mode
  inkUI?: boolean;

  // Indicates an evaluation is running in resume mode
  resume?: boolean;

  // debug log file
  debugLogFile?: string;

  // error log file
  errorLogFile?: string;

  // Final callback to be called after all output is flushed
  postActionCallback?: () => Promise<void>;
}

const state: CliState = {};

export default state;
