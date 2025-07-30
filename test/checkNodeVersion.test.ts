import { checkNodeVersion } from '../src/checkNodeVersion';

jest.mock('../package.json', () => ({
  engines: { node: '>=18.0.1' },
}));

// Mock the logger module
const mockLoggerWarn = jest.fn();
jest.mock('../src/logger', () => ({
  __esModule: true,
  default: {
    warn: mockLoggerWarn,
  },
}));

// Mock chalk - need to mock as ES module
const mockChalkYellow = jest.fn((text) => text);
jest.mock('chalk', () => ({
  __esModule: true,
  default: {
    yellow: mockChalkYellow,
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

  beforeEach(() => {
    mockLoggerWarn.mockClear();
    mockChalkYellow.mockClear();
  });

  afterEach(() => {
    setNodeVersion(originalProcessVersion);
  });

  it('should handle version strings correctly and throw if required version is not met', async () => {
    setNodeVersion('v18.0.0');

    await expect(checkNodeVersion()).rejects.toThrow(
      'You are using Node.js 18.0.0. This version is not supported. Please use Node.js >=18.0.1.',
    );
    expect(mockChalkYellow).toHaveBeenCalledWith(
      'You are using Node.js 18.0.0. This version is not supported. Please use Node.js >=18.0.1.',
    );
  });

  it('should not throw if Node.js version is supported', async () => {
    setNodeVersion('v18.0.1');

    await expect(checkNodeVersion()).resolves.not.toThrow();
    expect(mockLoggerWarn).not.toHaveBeenCalled();
    expect(mockChalkYellow).not.toHaveBeenCalled();
  });

  it('should log a warning if Node.js version format is unexpected', async () => {
    setNodeVersion('v18');

    await checkNodeVersion();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Unexpected Node.js version format: v18. Please use Node.js >=18.0.1.',
    );
    expect(mockChalkYellow).toHaveBeenCalledWith(
      'Unexpected Node.js version format: v18. Please use Node.js >=18.0.1.',
    );
  });
});
