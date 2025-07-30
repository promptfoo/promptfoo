import { doEval } from '../../../src/commands/eval';
import logger from '../../../src/logger';

// Mock util/config/default.ts
jest.mock('../../../src/util/config/default', () => ({
  loadDefaultConfig: jest.fn().mockResolvedValue({
    defaultConfig: {},
    defaultConfigPath: null,
  }),
  clearConfigCache: jest.fn(),
}));

jest.mock('../../../src/util/config/load', () => ({
  resolveConfigs: jest.fn().mockResolvedValue({
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
}));

jest.mock('../../../src/evaluator', () => ({
  evaluate: jest.fn().mockResolvedValue({}),
  DEFAULT_MAX_CONCURRENCY: 4,
}));

// Mock other dependencies to prevent actual execution
jest.mock('../../../src/migrate', () => ({
  runDbMigrations: jest.fn().mockResolvedValue(undefined),
}));

// Mock the table generation
jest.mock('../../../src/table', () => ({
  generateTable: jest.fn().mockReturnValue({
    toString: jest.fn().mockReturnValue('Mock Table Output'),
  }),
}));

jest.mock('../../../src/models/eval', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      addResult: jest.fn().mockResolvedValue({}),
      addPrompts: jest.fn().mockResolvedValue({}),
      clearResults: jest.fn().mockReturnValue(undefined),
      getTable: jest.fn().mockResolvedValue({
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
    })),
  };
});

// Mock the logger module with both default and named exports
jest.mock('../../../src/logger', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  return {
    __esModule: true,
    default: mockLogger,
    getLogLevel: jest.fn().mockReturnValue('info'),
    setLogLevel: jest.fn(),
  };
});

describe('redteam warning in eval command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
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
