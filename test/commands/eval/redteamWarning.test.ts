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
  runDbMigrations: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../../src/models/eval', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      addResult: jest.fn().mockResolvedValue({}),
      addPrompts: jest.fn().mockResolvedValue({}),
      getTable: jest.fn().mockResolvedValue({ body: [] }),
      resultsCount: 0,
      prompts: [],
      persisted: false,
      results: [],
    })),
  };
});

describe('redteam warning in eval command', () => {
  beforeEach(() => {
    // Mock logger.warn
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should warn when config has redteam section but no test cases', async () => {
    // Mock command object
    const mockCmd = {
      config: ['test-config.yaml'],
      write: false, // Prevent database operations
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
