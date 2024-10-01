import * as cache from '../src/cache';
import { evaluate as doEvaluate } from '../src/evaluator';
import * as index from '../src/index';
import { evaluate } from '../src/index';
import { readProviderPromptMap } from '../src/prompts';
import { writeResultsToDatabase, writeOutput, writeMultipleOutputs } from '../src/util';

jest.mock('../src/telemetry');
jest.mock('../src/evaluator', () => {
  const originalModule = jest.requireActual('../src/evaluator');
  return {
    ...originalModule,
    evaluate: jest.fn().mockResolvedValue({ results: [] }),
  };
});
jest.mock('../src/prompts', () => {
  const originalModule = jest.requireActual('../src/prompts');
  return {
    ...originalModule,
    readProviderPromptMap: jest.fn().mockReturnValue({}),
  };
});
jest.mock('../src/util');
jest.mock('../src/cache');

describe('index.ts exports', () => {
  const expectedNamedExports = [
    'assertions',
    'cache',
    'evaluate',
    'generateTable',
    'isApiProvider',
    'isGradingResult',
    'isProviderOptions',
    'providers',
    'redteam',
  ];

  const expectedSchemaExports = [
    'AssertionSchema',
    'AtomicTestCaseSchema',
    'BaseAssertionTypesSchema',
    'CommandLineOptionsSchema',
    'CompletedPromptSchema',
    'DerivedMetricSchema',
    'OutputConfigSchema',
    'OutputFileExtension',
    'ScenarioSchema',
    'TestCaseSchema',
    'TestCaseWithVarsFileSchema',
    'TestCasesWithMetadataPromptSchema',
    'TestCasesWithMetadataSchema',
    'TestSuiteConfigSchema',
    'TestSuiteSchema',
    'UnifiedConfigSchema',
    'VarsSchema',
  ];

  it('should export all expected named modules', () => {
    expectedNamedExports.forEach((exportName) => {
      expect(index).toHaveProperty(exportName);
    });
  });

  it('should export all expected schemas', () => {
    expectedSchemaExports.forEach((exportName) => {
      expect(index).toHaveProperty(exportName);
    });
  });

  it('should not have unexpected exports', () => {
    const actualExports = Object.keys(index)
      .filter((key) => key !== 'default')
      .sort();
    const expectedExports = [...expectedNamedExports, ...expectedSchemaExports].sort();
    expect(actualExports).toHaveLength(expectedExports.length);
    expect(actualExports).toEqual(expectedExports);
  });

  it('redteam should have expected properties', () => {
    expect(index.redteam).toEqual({
      Base: {
        Grader: expect.any(Function),
        Plugin: expect.any(Function),
      },
      Extractors: {
        extractEntities: expect.any(Function),
        extractSystemPurpose: expect.any(Function),
      },
      Graders: expect.any(Object),
      Plugins: expect.any(Object),
      Strategies: expect.any(Object),
    });
  });

  it('default export should match named exports', () => {
    expect(index.default).toEqual({
      assertions: index.assertions,
      cache: index.cache,
      evaluate: index.evaluate,
      providers: index.providers,
      redteam: index.redteam,
    });
  });

  it('should export cache with correct methods', () => {
    expect(cache).toHaveProperty('getCache');
    expect(cache).toHaveProperty('fetchWithCache');
    expect(cache).toHaveProperty('enableCache');
    expect(cache).toHaveProperty('disableCache');
    expect(cache).toHaveProperty('clearCache');
    expect(cache).toHaveProperty('isCacheEnabled');
  });
});

describe('evaluate function', () => {
  it('should handle function prompts correctly', async () => {
    const mockPromptFunction = function testPrompt() {
      return 'Test prompt';
    };

    const testSuite = {
      prompts: [mockPromptFunction],
      providers: [],
      tests: [],
    };

    await index.evaluate(testSuite);
    expect(readProviderPromptMap).toHaveBeenCalledWith(testSuite, [
      {
        raw: mockPromptFunction.toString(),
        label: 'testPrompt',
        function: mockPromptFunction,
      },
    ]);
    expect(doEvaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompts: [
          {
            raw: mockPromptFunction.toString(),
            label: 'testPrompt',
            function: mockPromptFunction,
          },
        ],
        providerPromptMap: {},
      }),
      expect.objectContaining({
        eventSource: 'library',
      }),
    );
  });

  it('should process different types of prompts correctly', async () => {
    const testSuite = {
      prompts: [
        'string prompt',
        { raw: 'object prompt' },
        function functionPrompt() {
          return 'function prompt';
        },
      ],
      providers: [],
    };
    await evaluate(testSuite);
    expect(doEvaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompts: expect.arrayContaining([
          expect.any(Object),
          expect.any(Object),
          expect.any(Object),
        ]),
      }),
      expect.any(Object),
    );
  });

  it('should resolve nested providers', async () => {
    const testSuite = {
      prompts: ['test prompt'],
      providers: [],
      tests: [{ options: { provider: 'test-provider' } }],
    };
    await evaluate(testSuite);
    expect(doEvaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        tests: expect.arrayContaining([
          expect.objectContaining({
            options: expect.objectContaining({
              provider: expect.anything(),
            }),
          }),
        ]),
      }),
      expect.anything(),
    );
  });

  it('should disable cache when specified', async () => {
    await evaluate({ prompts: ['test'], providers: [] }, { cache: false });
    expect(cache.disableCache).toHaveBeenCalledWith();
  });

  it('should write results to database when writeLatestResults is true', async () => {
    const testSuite = {
      prompts: ['test'],
      providers: [],
      writeLatestResults: true,
    };
    await evaluate(testSuite);
    expect(writeResultsToDatabase).toHaveBeenCalledWith(
      expect.objectContaining({ results: expect.any(Array) }),
      expect.objectContaining({
        prompts: expect.arrayContaining([
          expect.objectContaining({
            raw: 'test',
            label: 'test',
          }),
        ]),
        providers: [],
        writeLatestResults: true,
      }),
    );
  });

  it('should write output to file when outputPath is set', async () => {
    const testSuite = {
      prompts: ['test'],
      providers: [],
      outputPath: 'test.json',
    };
    await evaluate(testSuite);
    expect(writeOutput).toHaveBeenCalledWith(
      'test.json',
      null,
      expect.objectContaining({ results: expect.any(Array) }),
      expect.objectContaining({
        outputPath: 'test.json',
        prompts: expect.arrayContaining([
          expect.objectContaining({
            raw: 'test',
            label: 'test',
          }),
        ]),
        providers: [],
      }),
      null,
    );
  });

  it('should write multiple outputs when outputPath is an array', async () => {
    const testSuite = {
      prompts: ['test'],
      providers: [],
      outputPath: ['test1.json', 'test2.json'],
    };
    await evaluate(testSuite);
    expect(writeMultipleOutputs).toHaveBeenCalledWith(
      ['test1.json', 'test2.json'],
      null,
      expect.objectContaining({ results: expect.any(Array) }),
      expect.objectContaining({
        outputPath: ['test1.json', 'test2.json'],
        prompts: expect.arrayContaining([
          expect.objectContaining({
            raw: 'test',
            label: 'test',
          }),
        ]),
        providers: [],
      }),
      null,
    );
  });
});
