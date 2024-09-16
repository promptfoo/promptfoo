import type { UnifiedConfig } from './types';

interface CliState {
  basePath?: string;
  config?: Partial<UnifiedConfig>;

  // Forces remote inference wherever possible
  remote?: boolean;
}

const state: CliState = {};

export default state;
