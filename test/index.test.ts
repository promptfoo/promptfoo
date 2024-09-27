import { evaluate as doEvaluate } from '../src/evaluator';
import * as index from '../src/index';
import { readProviderPromptMap } from '../src/prompts';

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
});

describe('evaluate function', () => {
  it('should handle function prompts correctly', async () => {
    // Mock the necessary dependencies

    // Use a named function expression instead of an arrow function
    const mockPromptFunction = function testPrompt() {
      return 'Test prompt';
    };

    const testSuite = {
      prompts: [mockPromptFunction],
      providers: [],
      tests: [],
    };

    await index.evaluate(testSuite);

    // Check if readProviderPromptMap was called with the correct arguments
    expect(readProviderPromptMap).toHaveBeenCalledWith(testSuite, [
      {
        raw: mockPromptFunction.toString(),
        label: 'testPrompt',
        function: mockPromptFunction,
      },
    ]);

    // Check if doEvaluate was called with the correct arguments
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
});
