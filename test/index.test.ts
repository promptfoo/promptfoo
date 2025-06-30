import * as cache from '../src/cache';
import { evaluate as doEvaluate } from '../src/evaluator';
import * as index from '../src/index';
import { evaluate } from '../src/index';
import Eval from '../src/models/eval';
import { readProviderPromptMap } from '../src/prompts';
import * as providers from '../src/providers';
import { writeOutput, writeMultipleOutputs } from '../src/util';

jest.mock('../src/cache');
jest.mock('../src/database', () => ({
  getDb: jest
    .fn()
    .mockReturnValue({ select: jest.fn(), insert: jest.fn(), transaction: jest.fn() }),
}));
jest.mock('../src/evaluator', () => {
  const originalModule = jest.requireActual('../src/evaluator');
  return {
    ...originalModule,
    evaluate: jest.fn().mockResolvedValue({ results: [] }),
  };
});
jest.mock('../src/migrate');
jest.mock('../src/prompts', () => {
  const originalModule = jest.requireActual('../src/prompts');
  return {
    ...originalModule,
    readProviderPromptMap: jest.fn().mockReturnValue({}),
  };
});
jest.mock('../src/providers', () => {
  const originalModule = jest.requireActual('../src/providers');
  return {
    ...originalModule,
    loadApiProvider: jest.fn(),
    loadApiProviders: jest.fn(),
  };
});
jest.mock('../src/telemetry');
jest.mock('../src/util');

describe('index.ts exports', () => {
  const expectedNamedExports = [
    'assertions',
    'cache',
    'evaluate',
    'generateTable',
    'guardrails',
    'isApiProvider',
    'isGradingResult',
    'isProviderOptions',
    'loadApiProvider',
    'redteam',
  ];

  const expectedSchemaExports = [
    'AssertionSchema',
    'AssertionTypeSchema',
    'AtomicTestCaseSchema',
    'BaseAssertionTypesSchema',
    'BaseTokenUsageSchema',
    'CommandLineOptionsSchema',
    'CompletedPromptSchema',
    'CompletionTokenDetailsSchema',
    'DerivedMetricSchema',
    'NotPrefixedAssertionTypesSchema',
    'OutputConfigSchema',
    'OutputFileExtension',
    'ResultFailureReason',
    'ScenarioSchema',
    'SpecialAssertionTypesSchema',
    'TestCaseSchema',
    'TestCasesWithMetadataPromptSchema',
    'TestCasesWithMetadataSchema',
    'TestCaseWithVarsFileSchema',
    'TestGeneratorConfigSchema',
    'TestSuiteConfigSchema',
    'TestSuiteSchema',
    'TokenUsageSchema',
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
    expect(actualExports).toEqual([...expectedNamedExports, ...expectedSchemaExports].sort());
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
      guardrails: index.guardrails,
      loadApiProvider: index.loadApiProvider,
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
  let loadApiProvidersSpy: jest.SpyInstance;
  let loadApiProviderSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up spies for provider functions
    loadApiProvidersSpy = jest.spyOn(providers, 'loadApiProviders').mockResolvedValue([]);
    loadApiProviderSpy = jest.spyOn(providers, 'loadApiProvider').mockResolvedValue({
      id: () => 'mock-provider',
      callApi: jest.fn(),
    });
  });

  afterEach(() => {
    loadApiProvidersSpy.mockRestore();
    loadApiProviderSpy.mockRestore();
  });

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
      expect.anything(),
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
      expect.anything(),
      expect.any(Object),
    );
  });

  it('should resolve nested providers', async () => {
    const testSuite = {
      prompts: ['test prompt'],
      providers: [],
      tests: [{ options: { provider: 'openai:gpt-3.5-turbo' } }],
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
      expect.anything(),
    );
  });

  it('should resolve provider configuration in defaultTest', async () => {
    const testSuite = {
      prompts: ['test prompt'],
      providers: [],
      defaultTest: {
        options: {
          provider: {
            id: 'azure:chat:test',
            config: {
              apiHost: 'test-host',
              apiKey: 'test-key',
            },
          },
        },
      },
    };
    await evaluate(testSuite);
    expect(doEvaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultTest: expect.objectContaining({
          options: expect.objectContaining({
            provider: expect.anything(),
          }),
        }),
      }),
      expect.anything(),
      expect.anything(),
    );
  });

  it('should resolve provider configuration in individual tests', async () => {
    const testSuite = {
      prompts: ['test prompt'],
      providers: [],
      tests: [
        {
          options: {
            provider: {
              id: 'azure:chat:test',
              config: {
                apiHost: 'test-host',
                apiKey: 'test-key',
              },
            },
          },
        },
      ],
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
      expect.anything(),
    );
  });

  it('should resolve provider configuration in assertions', async () => {
    const testSuite = {
      prompts: ['test prompt'],
      providers: [],
      tests: [
        {
          assert: [
            {
              type: 'equals' as const,
              value: 'expected value',
              provider: {
                id: 'azure:chat:test',
                config: {
                  apiHost: 'test-host',
                  apiKey: 'test-key',
                },
              },
            },
          ],
        },
      ],
    };
    await evaluate(testSuite);
    expect(doEvaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        tests: expect.arrayContaining([
          expect.objectContaining({
            assert: expect.arrayContaining([
              expect.objectContaining({
                provider: expect.anything(),
              }),
            ]),
          }),
        ]),
      }),
      expect.anything(),
      expect.anything(),
    );
  });

  it('should disable cache when specified', async () => {
    await evaluate({ prompts: ['test'], providers: [] }, { cache: false });
    expect(cache.disableCache).toHaveBeenCalledWith();
  });

  it('should write results to database when writeLatestResults is true', async () => {
    const createEvalSpy = jest.spyOn(Eval, 'create');

    const testSuite = {
      prompts: ['test'],
      providers: [],
      writeLatestResults: true,
    };

    await evaluate(testSuite);

    expect(createEvalSpy).toHaveBeenCalledWith(expect.anything(), expect.anything());

    createEvalSpy.mockRestore();
  });

  it('should write output to file when outputPath is set', async () => {
    const testSuite = {
      prompts: ['test'],
      providers: [],
      outputPath: 'test.json',
    };
    await evaluate(testSuite);
    expect(writeOutput).toHaveBeenCalledWith('test.json', expect.any(Eval), null);
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
      expect.any(Eval),
      null,
    );
  });

  describe('providerMap functionality', () => {
    it('should resolve assertion provider by ID from providerMap', async () => {
      const mockProvider1 = {
        id: () => 'provider-1',
        label: 'Provider One',
        callApi: jest.fn(),
      };
      const mockProvider2 = {
        id: () => 'provider-2',
        callApi: jest.fn(),
      };

      // Mock loadApiProviders to return our test providers
      loadApiProvidersSpy.mockResolvedValueOnce([mockProvider1, mockProvider2]);

      const testSuite = {
        prompts: ['test'],
        providers: ['provider-1', 'provider-2'],
        tests: [
          {
            assert: [
              {
                type: 'equals' as const,
                value: 'expected',
                provider: 'provider-1', // Should resolve from providerMap by ID
              },
            ],
          },
        ],
      };

      await evaluate(testSuite);

      // Verify doEvaluate was called with the resolved provider
      expect(doEvaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          tests: expect.arrayContaining([
            expect.objectContaining({
              assert: expect.arrayContaining([
                expect.objectContaining({
                  provider: mockProvider1, // Should be resolved to the actual provider object
                }),
              ]),
            }),
          ]),
        }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('should resolve assertion provider by label from providerMap', async () => {
      const mockProvider = {
        id: () => 'azure:chat:gpt-4',
        label: 'GPT-4',
        callApi: jest.fn(),
      };

      // Mock loadApiProviders to return our test provider
      loadApiProvidersSpy.mockResolvedValueOnce([mockProvider]);

      const testSuite = {
        prompts: ['test'],
        providers: ['azure:chat:gpt-4'],
        tests: [
          {
            assert: [
              {
                type: 'equals' as const,
                value: 'expected',
                provider: 'GPT-4', // Should resolve by label from providerMap
              },
            ],
          },
        ],
      };

      await evaluate(testSuite);

      // Verify the provider was resolved by label
      expect(doEvaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          tests: expect.arrayContaining([
            expect.objectContaining({
              assert: expect.arrayContaining([
                expect.objectContaining({
                  provider: mockProvider,
                }),
              ]),
            }),
          ]),
        }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('should fall back to loadApiProvider when provider not found in providerMap', async () => {
      const mockExistingProvider = {
        id: () => 'existing-provider',
        callApi: jest.fn(),
      };

      // Mock loadApiProviders to return existing provider
      loadApiProvidersSpy.mockResolvedValueOnce([mockExistingProvider]);

      const testSuite = {
        prompts: ['test'],
        providers: ['existing-provider'],
        tests: [
          {
            assert: [
              {
                type: 'equals' as const,
                value: 'expected',
                provider: 'existing-provider', // Should resolve by ID
              },
            ],
          },
        ],
      };

      await evaluate(testSuite);

      // Verify the evaluation completed successfully using the fallback provider
      expect(doEvaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          tests: expect.arrayContaining([
            expect.objectContaining({
              assert: expect.arrayContaining([
                expect.objectContaining({
                  provider: mockExistingProvider,
                }),
              ]),
            }),
          ]),
        }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('should handle providers without labels in providerMap', async () => {
      const mockProvider = {
        id: () => 'provider-without-label',
        callApi: jest.fn(),
        // No label property
      };

      loadApiProvidersSpy.mockResolvedValueOnce([mockProvider]);

      const testSuite = {
        prompts: ['test'],
        providers: ['provider-without-label'],
        tests: [
          {
            assert: [
              {
                type: 'equals' as const,
                value: 'expected',
                provider: 'provider-without-label', // Should resolve by ID only
              },
            ],
          },
        ],
      };

      await evaluate(testSuite);

      expect(doEvaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          tests: expect.arrayContaining([
            expect.objectContaining({
              assert: expect.arrayContaining([
                expect.objectContaining({
                  provider: mockProvider,
                }),
              ]),
            }),
          ]),
        }),
        expect.anything(),
        expect.anything(),
      );
    });

    // Test cases for GitHub issue #4111: Model-graded assertions with provider resolution
    describe('Model-graded assertions with provider resolution', () => {
      it('should resolve model-graded assertions using providers from main array', async () => {
        const mockLiteLLMProvider = {
          id: () => 'litellm:gemini-pro',
          callApi: jest.fn(),
          config: {
            apiBaseUrl: 'http://localhost:4000',
            apiKey: 'test-key',
            temperature: 0.1,
            max_tokens: 8096,
          },
        };

        // Mock loadApiProviders to return the LiteLLM provider
        loadApiProvidersSpy.mockResolvedValueOnce([mockLiteLLMProvider]);

        const testSuite = {
          prompts: ['What is the capital of France?'],
          providers: [
            {
              id: 'litellm:gemini-pro',
              config: {
                apiBaseUrl: 'http://localhost:4000',
                apiKey: 'test-key',
                temperature: 0.1,
                max_tokens: 8096,
              },
            },
          ],
          tests: [
            {
              assert: [
                {
                  type: 'g-eval' as const,
                  value: 'Evaluate if the response correctly identifies Paris as the capital',
                  threshold: 0.8,
                  provider: 'litellm:gemini-pro', // String ID that should resolve from providerMap
                },
              ],
            },
          ],
        };

        await evaluate(testSuite);

        // Verify the g-eval assertion was resolved with the correct provider
        expect(doEvaluate).toHaveBeenCalledWith(
          expect.objectContaining({
            tests: expect.arrayContaining([
              expect.objectContaining({
                assert: expect.arrayContaining([
                  expect.objectContaining({
                    type: 'g-eval',
                    provider: mockLiteLLMProvider, // Should be resolved to the provider object
                  }),
                ]),
              }),
            ]),
          }),
          expect.anything(),
          expect.anything(),
        );
      });

      it('should resolve different providers for response and model-graded assertions', async () => {
        const mockResponseProvider = {
          id: () => 'litellm:gpt-4',
          callApi: jest.fn(),
        };

        const mockGevalProvider = {
          id: () => 'litellm:gemini-pro',
          callApi: jest.fn(),
        };

        // Mock loadApiProviders to return both providers
        loadApiProvidersSpy.mockResolvedValueOnce([mockResponseProvider, mockGevalProvider]);

        const testSuite = {
          prompts: ['What is the capital of France?'],
          providers: ['litellm:gpt-4', 'litellm:gemini-pro'], // Both providers in main array
          tests: [
            {
              assert: [
                {
                  type: 'g-eval' as const,
                  value: 'Evaluate correctness',
                  provider: 'litellm:gemini-pro', // Different provider for g-eval
                },
              ],
            },
          ],
        };

        await evaluate(testSuite);

        // Verify g-eval uses the gemini provider while main response uses gpt-4
        expect(doEvaluate).toHaveBeenCalledWith(
          expect.objectContaining({
            providers: expect.arrayContaining([mockResponseProvider, mockGevalProvider]),
            tests: expect.arrayContaining([
              expect.objectContaining({
                assert: expect.arrayContaining([
                  expect.objectContaining({
                    provider: mockGevalProvider, // G-eval should use gemini provider
                  }),
                ]),
              }),
            ]),
          }),
          expect.anything(),
          expect.anything(),
        );
      });

      it('should handle multiple model-graded assertions with same provider', async () => {
        const mockLiteLLMProvider = {
          id: () => 'litellm:claude-3',
          callApi: jest.fn(),
        };

        loadApiProvidersSpy.mockResolvedValueOnce([mockLiteLLMProvider]);

        const testSuite = {
          prompts: ['Explain quantum physics'],
          providers: ['litellm:claude-3'],
          tests: [
            {
              assert: [
                {
                  type: 'g-eval' as const,
                  value: 'Evaluate scientific accuracy',
                  provider: 'litellm:claude-3',
                },
                {
                  type: 'g-eval' as const,
                  value: 'Evaluate clarity of explanation',
                  provider: 'litellm:claude-3',
                },
              ],
            },
          ],
        };

        await evaluate(testSuite);

        // Both g-eval assertions should resolve to the same provider object
        expect(doEvaluate).toHaveBeenCalledWith(
          expect.objectContaining({
            tests: expect.arrayContaining([
              expect.objectContaining({
                assert: expect.arrayContaining([
                  expect.objectContaining({
                    type: 'g-eval',
                    provider: mockLiteLLMProvider,
                  }),
                  expect.objectContaining({
                    type: 'g-eval',
                    provider: mockLiteLLMProvider,
                  }),
                ]),
              }),
            ]),
          }),
          expect.anything(),
          expect.anything(),
        );
      });

      it('should fall back to loadApiProvider for model-graded assertions when provider not in main array', async () => {
        const mockMainProvider = {
          id: () => 'litellm:gpt-4',
          callApi: jest.fn(),
        };

        // Mock main providers array (only has gpt-4)
        loadApiProvidersSpy.mockResolvedValueOnce([mockMainProvider]);

        const testSuite = {
          prompts: ['Test prompt'],
          providers: ['litellm:gpt-4'], // Only gpt-4 in main providers
          tests: [
            {
              assert: [
                {
                  type: 'g-eval' as const,
                  value: 'Evaluate response',
                  provider: 'litellm:gpt-4', // Use existing provider from main array
                },
              ],
            },
          ],
        };

        await evaluate(testSuite);

        // Verify the evaluation completed successfully using the fallback provider
        expect(doEvaluate).toHaveBeenCalledWith(
          expect.objectContaining({
            tests: expect.arrayContaining([
              expect.objectContaining({
                assert: expect.arrayContaining([
                  expect.objectContaining({
                    type: 'g-eval',
                    provider: mockMainProvider,
                  }),
                ]),
              }),
            ]),
          }),
          expect.anything(),
          expect.anything(),
        );
      });
    });
  });
});
