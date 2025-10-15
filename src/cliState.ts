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

  // Path to the debug log file
  debugLogPath?: string;

  // Path to the error log file
  errorLogPath?: string;
}

const state: CliState = {};

export default state;
