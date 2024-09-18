import type { UnifiedConfig } from './types';

interface CliState {
  basePath?: string;
  config?: Partial<UnifiedConfig>;
}

const state: CliState = {};

export default state;
