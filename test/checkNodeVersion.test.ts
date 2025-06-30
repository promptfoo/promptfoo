import chalk from 'chalk';
import { checkNodeVersion } from '../src/checkNodeVersion';
import logger from '../src/logger';

jest.mock('../package.json', () => ({
  engines: { node: '>=18.0.1' },
}));

const setNodeVersion = (version: string) => {
  Object.defineProperty(process, 'version', {
    value: version,
    configurable: true,
  });
};

describe('checkNodeVersion', () => {
  const originalProcessVersion = process.version;

  afterEach(() => {
    setNodeVersion(originalProcessVersion);
  });

  it('should handle version strings correctly and throw if required version is not met', () => {
    setNodeVersion('v18.0.0');

    expect(() => checkNodeVersion()).toThrow(
      'You are using Node.js 18.0.0. This version is not supported. Please use Node.js >=18.0.1.',
    );
  });

  it('should not throw if Node.js version is supported', () => {
    setNodeVersion('v18.0.1');

    expect(() => checkNodeVersion()).not.toThrow();
  });

  it('should log a warning if Node.js version format is unexpected', () => {
    setNodeVersion('v18');

    checkNodeVersion();
    expect(logger.warn).toHaveBeenCalledWith(
      chalk.yellow('Unexpected Node.js version format: v18. Please use Node.js >=18.0.1.'),
    );
  });
});
