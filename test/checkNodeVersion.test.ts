import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { checkNodeVersion } from '../src/checkNodeVersion';
import logger from '../src/logger';

jest.mock('fs');
jest.mock('../src/logger');
jest.mock('path');

const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
  throw new Error('process.exit called');
});

const setNodeVersion = (version: string) => {
  Object.defineProperty(process, 'version', {
    value: version,
    configurable: true,
  });
};

describe('checkNodeVersion', () => {
  const originalProcessVersion = process.version;

  beforeEach(() => {
    jest.resetAllMocks();

    jest.mocked(path.resolve).mockImplementation(() => 'mocked/path/to/package.json');
    jest.mocked(fs.readFileSync).mockImplementation(() =>
      JSON.stringify({
        engines: { node: '>=18.0.0' },
      }),
    );
  });

  afterEach(() => {
    setNodeVersion(originalProcessVersion);
  });

  afterAll(() => {
    mockExit.mockRestore();
  });

  it('should not log a warning if Node.js version is supported', () => {
    setNodeVersion('v18.10.0');
    expect(() => checkNodeVersion()).not.toThrow();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('should log a warning and exit if Node.js version is too low', () => {
    setNodeVersion('v16.10.0');

    expect(checkNodeVersion()).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      chalk.yellow(
        'You are using Node.js 16.10.0. This version is not supported. Please use Node.js >=18.0.0.',
      ),
    );
  });

  it('should log a warning if Node.js version format is unexpected', () => {
    setNodeVersion('v16');

    expect(() => checkNodeVersion()).not.toThrow(); // To ensure the test does not fail due to process.exit
    expect(logger.warn).toHaveBeenCalledWith(
      chalk.yellow('Unexpected Node.js version format: v16. Please use Node.js >=18.0.0.'),
    );
  });

  it('should handle version strings correctly and exit if required version is not met', () => {
    setNodeVersion('v18.0.0');
    jest.mocked(fs.readFileSync).mockImplementation(() =>
      JSON.stringify({
        engines: { node: '>=18.0.1' },
      }),
    );

    expect(checkNodeVersion()).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      chalk.yellow(
        'You are using Node.js 18.0.0. This version is not supported. Please use Node.js >=18.0.1.',
      ),
    );
  });
});
