import type { UnifiedConfig } from './types';

interface CliState {
  basePath?: string;
  config?: Partial<UnifiedConfig>;

  // Forces remote inference wherever possible
  remote?: boolean;

  // Indicates we're running in web UI mode
  webUI?: boolean;

  // Indicates we're running in redteam mode
  isRedteam: boolean;
}

let _isRedteam = false;

const state: CliState = {
  basePath: undefined,
  config: undefined,
  remote: undefined,
  webUI: undefined,

  get isRedteam() {
    return _isRedteam;
  },
  set isRedteam(value: boolean) {
    _isRedteam = value;
  },
};

export default state;
