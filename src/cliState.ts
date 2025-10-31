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

  // debug log file
  debugLogFile?: string;

  // error log file
  errorLogFile?: string;
}

const state: CliState = {};

export default state;
