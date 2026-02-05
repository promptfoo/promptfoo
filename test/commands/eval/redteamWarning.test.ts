import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { doEval } from '../../../src/commands/eval';
import logger from '../../../src/logger';

// Mock util/config/default.ts
vi.mock('../../../src/util/config/default', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    loadDefaultConfig: vi.fn().mockResolvedValue({
      defaultConfig: {},
      defaultConfigPath: null,
    }),

    clearConfigCache: vi.fn(),
  };
});

vi.mock('../../../src/util/config/load', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    resolveConfigs: vi.fn().mockResolvedValue({
      config: {
        redteam: {
          purpose: 'Test red team purpose',
        },
      },
      testSuite: {
        prompts: [],
        providers: [],
        tests: [], // Empty tests array
      },
      basePath: '',
    }),
  };
});

vi.mock('../../../src/evaluator', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    evaluate: vi.fn().mockResolvedValue({}),
    DEFAULT_MAX_CONCURRENCY: 4,
  };
});

// Mock other dependencies to prevent actual execution
vi.mock('../../../src/migrate', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    runDbMigrations: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock the table generation
vi.mock('../../../src/table', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    generateTable: vi.fn().mockReturnValue({
      toString: vi.fn().mockReturnValue('Mock Table Output'),
    }),
  };
});

vi.mock('../../../src/models/eval', () => {
  return {
    __esModule: true,
    default: vi.fn().mockImplementation(function (config) {
      return {
        addResult: vi.fn().mockResolvedValue({}),
        addPrompts: vi.fn().mockResolvedValue({}),
        clearResults: vi.fn().mockReturnValue(undefined),
        setDurationMs: vi.fn(),

        getTable: vi.fn().mockResolvedValue({
          head: {
            prompts: [],
            vars: [],
          },
          body: [],
        }),

        resultsCount: 0,
        prompts: [],
        persisted: false,
        results: [],
        config: config || {},
      };
    }),
  };
});

// Mock the logger module with both default and named exports
vi.mock('../../../src/logger', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  return {
    __esModule: true,
    default: mockLogger,
    getLogLevel: vi.fn().mockReturnValue('info'),
    setLogLevel: vi.fn(),
    isDebugEnabled: vi.fn().mockReturnValue(false),
  };
});

vi.mock('../../../src/share', () => ({
  isSharingEnabled: vi.fn().mockReturnValue(false),
  createShareableUrl: vi.fn().mockResolvedValue(null),
}));

describe('redteam warning in eval command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should warn when config has redteam section but no test cases', async () => {
    // Mock command object with all required properties
    const mockCmd = {
      config: ['test-config.yaml'],
      write: false, // Prevent database operations
      progressBar: false,
      verbose: false,
      table: false, // Set to false to avoid table generation
    };

    // Mock defaultConfig
    const mockDefaultConfig = {};

    // Mock defaultConfigPath
    const mockDefaultConfigPath = 'test-config.yaml';

    // Mock evaluateOptions
    const mockEvaluateOptions = {};

    // Call doEval
    await doEval(mockCmd, mockDefaultConfig, mockDefaultConfigPath, mockEvaluateOptions);

    // Verify that logger.warn was called with a message containing the expected text
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('redteam section but no test cases'),
    );
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('promptfoo redteam generate'));
  });
});
