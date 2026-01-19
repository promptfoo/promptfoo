/**
 * Tests for cliState.maxConcurrency propagation to Python worker pool.
 * This is a focused test file to avoid the complex mocking issues in pythonCompletion.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';

// Mock all dependencies to avoid import chain issues
vi.mock('../../src/python/pythonUtils', () => ({
  getEnvInt: vi.fn(),
  getConfiguredPythonPath: vi.fn(),
  state: { cachedPythonPath: null, validationPromise: null },
}));

vi.mock('../../src/cache', () => ({
  getCache: vi.fn().mockResolvedValue({ get: vi.fn(), set: vi.fn() }),
  isCacheEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/util/createHash', () => ({
  sha256: vi.fn().mockReturnValue('mockhash'),
}));

vi.mock('../../src/util/fileReference', () => ({
  processConfigFileReferences: vi.fn((config) => config),
}));

vi.mock('../../src/util/index', () => ({
  parsePathOrGlob: vi.fn().mockReturnValue({
    filePath: 'script.py',
    functionName: undefined,
    isPathPattern: false,
    extension: '.py',
  }),
}));

vi.mock('../../src/util/json', () => ({
  safeJsonStringify: vi.fn(JSON.stringify),
}));

vi.mock('../../src/providers/providerRegistry', () => ({
  providerRegistry: {
    register: vi.fn(),
    unregister: vi.fn(),
  },
}));

vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn().mockReturnValue('mock content'),
  },
}));

vi.mock('path', () => ({
  default: {
    resolve: vi.fn().mockReturnValue('/absolute/path/script.py'),
    relative: vi.fn().mockReturnValue('script.py'),
    extname: vi.fn().mockReturnValue('.py'),
    join: vi.fn((...args: string[]) => args.join('/')),
  },
}));

// Create hoisted mock for PythonWorkerPool
const workerPoolMocks = vi.hoisted(() => {
  const mockPoolInstance = {
    initialize: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn().mockResolvedValue({ output: 'test' }),
    getWorkerCount: vi.fn().mockReturnValue(1),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
  // Use function keyword to make it a proper constructor
  const PythonWorkerPoolMock = vi.fn(function (this: any) {
    return mockPoolInstance;
  });
  return { mockPoolInstance, PythonWorkerPoolMock };
});

vi.mock('../../src/python/workerPool', async (importOriginal) => ({
  ...(await importOriginal()),
  PythonWorkerPool: workerPoolMocks.PythonWorkerPoolMock,
}));

import { PythonProvider } from '../../src/providers/pythonCompletion';
// Import after mocks are set up
import { getEnvInt } from '../../src/python/pythonUtils';
import { PythonWorkerPool } from '../../src/python/workerPool';

describe('PythonProvider cliState.maxConcurrency', () => {
  const mockPythonWorkerPool = vi.mocked(PythonWorkerPool);
  const mockGetEnvInt = vi.mocked(getEnvInt);
  const mockPoolInstance = workerPoolMocks.mockPoolInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    workerPoolMocks.PythonWorkerPoolMock.mockClear();
    mockPoolInstance.initialize.mockReset().mockResolvedValue(undefined);
    mockPoolInstance.execute.mockReset().mockResolvedValue({ output: 'test' });

    // Reset cliState
    cliState.maxConcurrency = undefined;

    // Reset getEnvInt
    mockGetEnvInt.mockReset();
    mockGetEnvInt.mockReturnValue(undefined);
  });

  it('should use cliState.maxConcurrency when config.workers is not set', async () => {
    cliState.maxConcurrency = 8;

    const provider = new PythonProvider('script.py');
    await provider.initialize();

    expect(mockPythonWorkerPool).toHaveBeenCalledWith(
      expect.any(String),
      'call_api',
      8, // from cliState.maxConcurrency
      undefined,
      undefined,
    );
  });

  it('should prioritize config.workers over cliState.maxConcurrency', async () => {
    cliState.maxConcurrency = 10;

    const provider = new PythonProvider('script.py', {
      config: {
        basePath: process.cwd(),
        workers: 3,
      },
    });
    await provider.initialize();

    expect(mockPythonWorkerPool).toHaveBeenCalledWith(
      expect.any(String),
      'call_api',
      3, // config.workers takes priority
      undefined,
      undefined,
    );
  });

  it('should prioritize PROMPTFOO_PYTHON_WORKERS over cliState.maxConcurrency', async () => {
    cliState.maxConcurrency = 12;
    mockGetEnvInt.mockReturnValue(5);

    const provider = new PythonProvider('script.py');
    await provider.initialize();

    expect(mockPythonWorkerPool).toHaveBeenCalledWith(
      expect.any(String),
      'call_api',
      5, // env var takes priority over cliState (Python-specific setting over general -j flag)
      undefined,
      undefined,
    );
  });

  it('should fall back to cliState.maxConcurrency when PROMPTFOO_PYTHON_WORKERS is undefined', async () => {
    cliState.maxConcurrency = 6;
    mockGetEnvInt.mockReturnValue(undefined);

    const provider = new PythonProvider('script.py');
    await provider.initialize();

    expect(mockPythonWorkerPool).toHaveBeenCalledWith(
      expect.any(String),
      'call_api',
      6, // from cliState.maxConcurrency when env var not set
      undefined,
      undefined,
    );
  });

  it('should default to 1 worker when nothing is set', async () => {
    cliState.maxConcurrency = undefined;
    mockGetEnvInt.mockReturnValue(undefined);

    const provider = new PythonProvider('script.py');
    await provider.initialize();

    expect(mockPythonWorkerPool).toHaveBeenCalledWith(
      expect.any(String),
      'call_api',
      1, // default
      undefined,
      undefined,
    );
  });

  it('should enforce minimum of 1 worker when cliState.maxConcurrency is 0', async () => {
    cliState.maxConcurrency = 0;

    const provider = new PythonProvider('script.py');
    await provider.initialize();

    expect(mockPythonWorkerPool).toHaveBeenCalledWith(
      expect.any(String),
      'call_api',
      1, // minimum enforced
      undefined,
      undefined,
    );
  });

  it('should enforce minimum of 1 worker when cliState.maxConcurrency is negative', async () => {
    cliState.maxConcurrency = -5;

    const provider = new PythonProvider('script.py');
    await provider.initialize();

    expect(mockPythonWorkerPool).toHaveBeenCalledWith(
      expect.any(String),
      'call_api',
      1, // minimum enforced
      undefined,
      undefined,
    );
  });
});
