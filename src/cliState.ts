import type { UnifiedConfig } from './types';

interface CliState {
  basePath?: string;
  config?: Partial<UnifiedConfig>;

  // Forces remote inference wherever possible
  remote?: boolean;

  // Indicates we're running in web UI mode
  webUI?: boolean;

  // Indicates we're running redteam mode
  isRedteam?: boolean;
}

const state: CliState = {};

export default state;
