import { afterEach, describe, expect, it, vi } from 'vitest';

import chalk from 'chalk';
import { checkNodeVersion } from '../src/checkNodeVersion';
import { ENGINES } from '../src/version';
import logger from '../src/logger';

vi.mock('../src/logger', () => ({
  default: {
    warn: vi.fn(),
  },
}));

const setNodeVersion = (version: string) => {
  Object.defineProperty(process, 'version', {
    value: version,
    configurable: true,
  });
};

describe('checkNodeVersion', () => {
  const originalProcessVersion = process.version;
  const requiredVersion = ENGINES.node;

  afterEach(() => {
    setNodeVersion(originalProcessVersion);
    vi.clearAllMocks();
  });

  it('should handle version strings correctly and throw if required version is not met', () => {
    // Use a version that's definitely below the requirement (currently >=20.0.0)
    setNodeVersion('v19.9.9');

    expect(() => checkNodeVersion()).toThrow(
      `You are using Node.js 19.9.9. This version is not supported. Please use Node.js ${requiredVersion}.`,
    );
  });

  it('should not throw if Node.js version is supported', () => {
    // Use a version that meets the requirement
    setNodeVersion('v20.0.0');

    expect(() => checkNodeVersion()).not.toThrow();
  });

  it('should log a warning if Node.js version format is unexpected', () => {
    setNodeVersion('v20');

    checkNodeVersion();
    expect(logger.warn).toHaveBeenCalledWith(
      chalk.yellow(
        `Unexpected Node.js version format: v20. Please use Node.js ${requiredVersion}.`,
      ),
    );
  });
});
