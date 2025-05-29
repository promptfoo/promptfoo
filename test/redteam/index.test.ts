import cliProgress from 'cli-progress';
import { loadApiProvider } from '../../src/providers';
import { extractEntities } from '../../src/redteam/extraction/entities';
import { extractSystemPurpose } from '../../src/redteam/extraction/purpose';
import {
  calculateTotalTests,
  getMultilingualRequestedCount,
  getTestCount,
  resolvePluginConfig,
  synthesize,
} from '../../src/redteam/index';
import { validateStrategies } from '../../src/redteam/strategies';
import { DEFAULT_LANGUAGES } from '../../src/redteam/strategies/multilingual';
import type { TestCaseWithPlugin } from '../../src/types';

jest.mock('cli-progress');
jest.mock('../../src/providers');
jest.mock('../../src/redteam/extraction/entities');
jest.mock('../../src/redteam/extraction/purpose');
jest.mock('../../src/util/templates', () => {
  const originalModule = jest.requireActual('../../src/util/templates');
  return {
    ...originalModule,
    extractVariablesFromTemplates: jest.fn(originalModule.extractVariablesFromTemplates),
  };
});

jest.mock('process', () => ({
  ...jest.requireActual('process'),
  exit: jest.fn(),
}));

jest.mock('../../src/redteam/strategies', () => ({
  ...jest.requireActual('../../src/redteam/strategies'),
  validateStrategies: jest.fn().mockImplementation((strategies) => {
    if (strategies.some((s: { id: string }) => s.id === 'invalid-strategy')) {
      throw new Error('Invalid strategies');
    }
  }),
}));

jest.mock('../../src/util/apiHealth');
jest.mock('../../src/redteam/remoteGeneration');
jest.mock('../../src/redteam/util', () => ({
  ...jest.requireActual('../../src/redteam/util'),
  extractIntentFromPrompt: jest.fn().mockResolvedValue('mocked-intent'),
}));

describe('synthesize', () => {
  const mockProvider = {
    callApi: jest.fn(),
    generate: jest.fn(),
    id: () => 'test-provider',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(extractEntities).mockResolvedValue(['entity1', 'entity2']);
    jest.mocked(extractSystemPurpose).mockResolvedValue('Test purpose');
    jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);
    jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('Process.exit called');
    });
    jest.mocked(validateStrategies).mockImplementation(async () => {});
    jest.mocked(cliProgress.SingleBar).mockReturnValue({
      increment: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      update: jest.fn(),
    } as any);
  });

  describe('Input handling', () => {
    it('should use provided purpose and entities if given', async () => {
      const result = await synthesize({
        entities: ['custom-entity'],
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        purpose: 'Custom purpose',
        strategies: [],
        targetLabels: ['test-provider'],
      });

      expect(result).toEqual(
        expect.objectContaining({
          entities: ['custom-entity'],
          purpose: 'Custom purpose',
        }),
      );
      expect(extractEntities).not.toHaveBeenCalled();
      expect(extractSystemPurpose).not.toHaveBeenCalled();
    });
  });

  describe('resolvePluginConfig', () => {
    it('should return an empty object if config is undefined', () => {
      const result = resolvePluginConfig(undefined);
      expect(result).toEqual({});
    });

    it('should return the original config if no file references are present', () => {
      const config = { key: 'value' };
      const result = resolvePluginConfig(config);
      expect(result).toEqual(config);
    });
  });
});

describe('calculateTotalTests', () => {
  const mockPlugins = [
    { id: 'plugin1', numTests: 2 },
    { id: 'plugin2', numTests: 3 },
  ];

  it('should calculate basic test counts with no strategies', () => {
    const result = calculateTotalTests(mockPlugins, []);
    expect(result).toEqual({
      totalTests: 5,
      totalPluginTests: 5,
      effectiveStrategyCount: 0,
      multilingualStrategy: undefined,
      includeBasicTests: true,
    });
  });

  it('should handle basic strategy when enabled', () => {
    const strategies = [{ id: 'basic', config: { enabled: true } }];
    const result = calculateTotalTests(mockPlugins, strategies);
    expect(result).toEqual({
      totalTests: 5,
      totalPluginTests: 5,
      effectiveStrategyCount: 1,
      multilingualStrategy: undefined,
      includeBasicTests: true,
    });
  });

  it('should handle basic strategy when disabled', () => {
    const strategies = [{ id: 'basic', config: { enabled: false } }];
    const result = calculateTotalTests(mockPlugins, strategies);
    expect(result).toEqual({
      totalTests: 0,
      totalPluginTests: 5,
      effectiveStrategyCount: 0,
      multilingualStrategy: undefined,
      includeBasicTests: false,
    });
  });

  it('should handle multilingual strategy with custom languages', () => {
    const strategies = [
      { id: 'multilingual', config: { languages: { en: true, es: true, fr: true } } },
    ];
    const result = calculateTotalTests(mockPlugins, strategies);
    expect(result).toEqual({
      totalTests: 15,
      totalPluginTests: 5,
      effectiveStrategyCount: 1,
      multilingualStrategy: strategies[0],
      includeBasicTests: true,
    });
  });

  it('should handle retry strategy', () => {
    const strategies = [{ id: 'retry', config: { numTests: 2 } }];
    const result = calculateTotalTests(mockPlugins, strategies);
    expect(result.totalTests).toBe(7); // 5 plugin + 2 retry
  });

  it('should handle multiple strategies', () => {
    const strategies = [
      { id: 'basic', config: { enabled: true } },
      { id: 'retry', config: { numTests: 2 } },
      { id: 'multilingual', config: { languages: ['en', 'fr'] } },
    ];
    const result = calculateTotalTests(mockPlugins, strategies);
    // basic: 5, retry: 5+2=7, multilingual: 7*2=14
    expect(result.totalTests).toBe(14);
  });
});

describe('getMultilingualRequestedCount', () => {
  const testCases = [
    { metadata: { pluginId: 'test1' } },
    { metadata: { pluginId: 'test2' } },
  ] as TestCaseWithPlugin[];

  it('should calculate count with custom languages array', () => {
    const strategy = {
      id: 'multilingual',
      config: { languages: ['en', 'es', 'fr'] },
    };
    const count = getMultilingualRequestedCount(testCases, strategy);
    expect(count).toBe(6);
  });

  it('should use DEFAULT_LANGUAGES when no languages config provided', () => {
    const strategy = { id: 'multilingual' };
    const count = getMultilingualRequestedCount(testCases, strategy);
    expect(count).toBe(2 * DEFAULT_LANGUAGES.length);
  });

  it('should handle empty languages array', () => {
    const strategy = {
      id: 'multilingual',
      config: { languages: [] },
    };
    const count = getMultilingualRequestedCount(testCases, strategy);
    expect(count).toBe(0);
  });
});

describe('getTestCount', () => {
  it('should return totalPluginTests when basic strategy is enabled', () => {
    const strategy = { id: 'basic', config: { enabled: true } };
    const result = getTestCount(strategy, 10, []);
    expect(result).toBe(10);
  });

  it('should return 0 when basic strategy is disabled', () => {
    const strategy = { id: 'basic', config: { enabled: false } };
    const result = getTestCount(strategy, 10, []);
    expect(result).toBe(0);
  });

  it('should multiply by number of languages for multilingual strategy', () => {
    const strategy = {
      id: 'multilingual',
      config: { languages: { en: true, es: true, fr: true } },
    };
    const result = getTestCount(strategy, 10, []);
    expect(result).toBe(30);
  });

  it('should return 0 for multilingual with empty languages', () => {
    const strategy = {
      id: 'multilingual',
      config: { languages: [] },
    };
    const result = getTestCount(strategy, 10, []);
    expect(result).toBe(0);
  });

  it('should handle retry strategy', () => {
    const strategy = { id: 'retry', config: { numTests: 3 } };
    const result = getTestCount(strategy, 5, []);
    expect(result).toBe(8);
  });

  it('should handle other strategies', () => {
    const strategy = { id: 'other', config: {} };
    const result = getTestCount(strategy, 4, []);
    expect(result).toBe(4);
  });
});
