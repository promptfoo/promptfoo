import type { UnifiedConfig } from './types/index';

interface CliState {
  basePath?: string;
  config?: Partial<UnifiedConfig>;

  // Forces remote inference wherever possible
  remote?: boolean;

  // Indicates we're running in web UI mode
  webUI?: boolean;

  // Indicates experimental Ink CLI UI is active
  experimentalUI?: boolean;

  // Indicates an evaluation is running in resume mode
  resume?: boolean;
}

const state: CliState = {};

export default state;
