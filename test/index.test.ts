import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as cache from '../src/cache';
import { evaluate as doEvaluate } from '../src/evaluator';
import * as index from '../src/index';
import { evaluate } from '../src/index';
import logger from '../src/logger';
import Eval from '../src/models/eval';
import { readProviderPromptMap } from '../src/prompts/index';
import * as providers from '../src/providers/index';
import * as fileUtils from '../src/util/file';
import { writeMultipleOutputs, writeOutput } from '../src/util/index';
import { createMockProvider } from './factories/provider';

vi.mock('../src/cache');
vi.mock('../src/database', () => ({
  getDb: vi.fn().mockReturnValue({ select: vi.fn(), insert: vi.fn(), transaction: vi.fn() }),
}));
vi.mock('../src/evaluator', async () => {
  const originalModule =
    await vi.importActual<typeof import('../src/evaluator')>('../src/evaluator');
  return {
    ...originalModule,
    evaluate: vi.fn().mockImplementation(async (testSuite) => {
      const results = (testSuite.tests || []).map((test: any, idx: number) => {
        const mergedTest = { ...testSuite.defaultTest, ...test };
        if (testSuite.defaultTest?.assert && test.assert) {
          mergedTest.assert = [...(testSuite.defaultTest.assert || []), ...(test.assert || [])];
        }
        if (testSuite.defaultTest?.vars && test.vars) {
          mergedTest.vars = { ...testSuite.defaultTest.vars, ...test.vars };
        }

        return {
          testCase: mergedTest,
          test: mergedTest,
          vars: mergedTest.vars || {},
          promptIdx: 0,
          testIdx: idx,
          success: true,
          score: 1,
          latencyMs: 100,
          namedScores: {},
          failureReason: 0,
        };
      });
      return {
        results,
        toEvaluateSummary: async () => ({ results }),
      };
    }),
  };
});
vi.mock('../src/globalConfig/accounts', async () => {
  const originalModule = await vi.importActual<typeof import('../src/globalConfig/accounts')>(
    '../src/globalConfig/accounts',
  );
  return {
    ...originalModule,
    // Pass the override through so tests can verify the full propagation chain.
    // Individual tests can override this with mockImplementationOnce.
    getAuthor: vi.fn((override?: string | null) => override ?? null),
  };
});
vi.mock('../src/migrate');
vi.mock('../src/prompts', async () => {
  const originalModule = await vi.importActual<typeof import('../src/prompts')>('../src/prompts');
  return {
    ...originalModule,
    readProviderPromptMap: vi.fn().mockReturnValue({}),
  };
});
vi.mock('../src/providers', async () => {
  const originalModule =
    await vi.importActual<typeof import('../src/providers')>('../src/providers');
  return {
    ...originalModule,
    loadApiProvider: vi.fn(),
    loadApiProviders: vi.fn(),
  };
});
vi.mock('../src/telemetry');
vi.mock('../src/util');
vi.mock('../src/util/file');

describe('index.ts exports', () => {
  const expectedNamedExports = [
    'ConfigResolutionError',
    'EmailValidationError',
    'EvalRunError',
    'EVENT_SOURCES',
    'isCliEventSource',
    'MAX_SUGGESTIONS_COUNT',
    'PromptSuggestionsRejectedError',
    'ServerError',
    'assertions',
    'buildInputPromptDescription',
    'cache',
    'evaluate',
    'generateTable',
    'getInputDescription',
    'getInputType',
    'guardrails',
    'isApiProvider',
    'isGradingResult',
    'isProviderOptions',
    'isResultFailureReason',
    'isTransformFunction',
    'loadApiProvider',
    'loadApiProviders',
    'normalizeInputDefinition',
    'normalizeInputs',
    'ProbeLimitExceededError',
    'redteam',
  ];

  const expectedSchemaExports = [
    'AssertionOrSetSchema',
    'AssertionSchema',
    'AssertionSetSchema',
    'AssertionTypeSchema',
    'AtomicTestCaseSchema',
    'BaseAssertionTypesSchema',
    'BaseTokenUsageSchema',
    'CommandLineOptionsSchema',
    'CompletedPromptSchema',
    'CompletionTokenDetailsSchema',
    'ConversationMessageSchema',
    'DerivedMetricSchema',
    'DocumentMediaInjectionPlacementSchema',
    'DocumentMediaInjectionPlacementValues',
    'DocxInjectionPlacementSchema',
    'DocxInjectionPlacementValues',
    'EvalResultsFilterMode',
    'EvaluateOptionsSchema',
    'EventSourceSchema',
    'GradingConfigSchema',
    'InputConfigSchema',
    'InputDefinitionObjectSchema',
    'InputDefinitionSchema',
    'InputTypeSchema',
    'InputTypeValues',
    'InputsSchema',
    'NotPrefixedAssertionTypesSchema',
    'OutputConfigSchema',
    'OutputFileExtension',
    'PartialGenerationError',
    'PluginConfigSchema',
    'PolicyObjectSchema',
    'ProvidersSchema',
    'ResultFailureReason',
    'ScenarioSchema',
    'SpecialAssertionTypesSchema',
    'StrategyConfigSchema',
    'TestCaseSchema',
    'TestCasesWithMetadataPromptSchema',
    'TestCasesWithMetadataSchema',
    'TestCaseWithVarsFileSchema',
    'TestGeneratorConfigSchema',
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
        extractMcpToolsInfo: expect.any(Function),
        extractSystemPurpose: expect.any(Function),
      },
      Graders: expect.any(Object),
      Plugins: expect.any(Object),
      Strategies: expect.any(Object),
      generate: expect.any(Function),
      run: expect.any(Function),
    });
  });

  it('default export should match named exports', () => {
    expect(index.default).toEqual({
      assertions: index.assertions,
      cache: index.cache,
      evaluate: index.evaluate,
      guardrails: index.guardrails,
      loadApiProvider: index.loadApiProvider,
      loadApiProviders: index.loadApiProviders,
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
    expect(cache).toHaveProperty('withCacheEnabled');
  });
});

describe('evaluate function', () => {
  let loadApiProvidersSpy: ReturnType<typeof vi.spyOn>;
  let loadApiProviderSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cache.withCacheEnabled).mockImplementation((_enabled, fn) => fn());

    // Set up spies for provider functions
    loadApiProvidersSpy = vi.spyOn(providers, 'loadApiProviders').mockResolvedValue([]);
    loadApiProviderSpy = vi
      .spyOn(providers, 'loadApiProvider')
      .mockResolvedValue(createMockProvider({ id: 'mock-provider' }));
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

  it('should scope cache disabling to the eval when specified', async () => {
    vi.mocked(cache.withCacheEnabled).mockImplementation((_enabled, fn) => fn());

    await evaluate({ prompts: ['test'], providers: [] }, { cache: false });
    expect(cache.withCacheEnabled).toHaveBeenCalledWith(false, expect.any(Function));
  });

  it('should write results to database when writeLatestResults is true', async () => {
    const createEvalSpy = vi.spyOn(Eval, 'create');

    const testSuite = {
      prompts: ['test'],
      providers: [],
      writeLatestResults: true,
    };

    await evaluate(testSuite);

    expect(createEvalSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ author: null }),
    );

    createEvalSpy.mockRestore();
  });

  it('should not persist evaluate-only author in config', async () => {
    const createEvalSpy = vi.spyOn(Eval, 'create');

    const testSuite = {
      prompts: ['test'],
      providers: [],
      writeLatestResults: true,
      author: 'author@example.com',
    };

    await evaluate(testSuite);

    expect(createEvalSpy.mock.calls[0][0]).not.toHaveProperty('author');

    createEvalSpy.mockRestore();
  });

  it('should propagate the testSuite author through getAuthor to Eval.create', async () => {
    const { getAuthor } = await import('../src/globalConfig/accounts');
    const createEvalSpy = vi.spyOn(Eval, 'create');

    const testSuite = {
      prompts: ['test'],
      providers: [],
      writeLatestResults: true,
      author: 'programmatic@example.com',
    };

    await evaluate(testSuite);

    expect(vi.mocked(getAuthor)).toHaveBeenCalledWith('programmatic@example.com');
    expect(createEvalSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ author: 'programmatic@example.com' }),
    );

    createEvalSpy.mockRestore();
  });

  it('should let cloud identity win over the testSuite author when cloud auth is active', async () => {
    const { getAuthor } = await import('../src/globalConfig/accounts');
    vi.mocked(getAuthor).mockReturnValueOnce('cloud@example.com');
    const createEvalSpy = vi.spyOn(Eval, 'create');

    const testSuite = {
      prompts: ['test'],
      providers: [],
      writeLatestResults: true,
      author: 'override@example.com',
    };

    await evaluate(testSuite);

    expect(vi.mocked(getAuthor)).toHaveBeenCalledWith('override@example.com');
    expect(createEvalSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ author: 'cloud@example.com' }),
    );

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
      const mockProvider1 = createMockProvider({
        id: 'provider-1',
        label: 'Provider One',
      });
      const mockProvider2 = createMockProvider({ id: 'provider-2' });

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
      const mockProvider = createMockProvider({
        id: 'azure:chat:gpt-4',
        label: 'GPT-4',
      });

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
      const mockExistingProvider = createMockProvider({ id: 'existing-provider' });

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
      const mockProvider = createMockProvider({ id: 'provider-without-label' });

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

    // Regression for GitHub issue #4111: model-graded assertions that specified
    // `provider` as a string ID were not resolved from the main providers
    // array/providerMap, causing those assertions to fail.
    describe('Model-graded assertions with provider resolution', () => {
      it('should resolve model-graded assertions using providers from main array', async () => {
        const mockLiteLLMProvider = createMockProvider({
          id: 'litellm:gemini-pro',
          config: {
            apiBaseUrl: 'http://localhost:4000',
            apiKey: 'test-key',
            temperature: 0.1,
            max_tokens: 8096,
          },
        });

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
        const mockResponseProvider = createMockProvider({ id: 'litellm:gpt-4' });
        const mockGevalProvider = createMockProvider({ id: 'litellm:gemini-pro' });

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
        const mockLiteLLMProvider = createMockProvider({ id: 'litellm:claude-3' });

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
        const mockMainProvider = createMockProvider({ id: 'litellm:gpt-4' });

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

describe('evaluate with external defaultTest', () => {
  let loadApiProvidersSpy: ReturnType<typeof vi.spyOn>;
  let loadApiProviderSpy: ReturnType<typeof vi.spyOn>;
  let maybeLoadFromExternalFileSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cache.withCacheEnabled).mockImplementation((_enabled, fn) => fn());

    // Set up spies for provider functions
    loadApiProvidersSpy = vi.spyOn(providers, 'loadApiProviders').mockResolvedValue([]);
    loadApiProviderSpy = vi
      .spyOn(providers, 'loadApiProvider')
      .mockResolvedValue(createMockProvider({ id: 'mock-provider' }));

    maybeLoadFromExternalFileSpy = vi.mocked(fileUtils.maybeLoadFromExternalFile);
  });

  afterEach(() => {
    loadApiProvidersSpy.mockRestore();
    loadApiProviderSpy.mockRestore();
  });

  it('should load defaultTest from external file when using file:// syntax', async () => {
    const externalDefaultTest = {
      assert: [{ type: 'equals' as const, value: 'test' }],
      vars: { foo: 'bar' },
      options: { provider: 'openai:gpt-4' },
    };

    const mockApiProvider = createMockProvider({
      id: 'mock-provider',
      response: { output: 'test output' },
    });

    loadApiProvidersSpy.mockResolvedValueOnce([mockApiProvider]);
    maybeLoadFromExternalFileSpy.mockResolvedValueOnce(externalDefaultTest);

    const testSuite = {
      providers: ['mock-provider'],
      prompts: [{ raw: 'Test prompt', label: 'Test' }],
      tests: [{ vars: { test: 'value' } }],
      defaultTest: 'file://path/to/defaultTest.yaml',
    };

    const summary = await evaluate(testSuite, {});

    expect(fileUtils.maybeLoadFromExternalFile).toHaveBeenCalledWith(
      'file://path/to/defaultTest.yaml',
    );
    const result = summary.results[0] as any;
    expect(result.testCase.assert).toEqual(externalDefaultTest.assert);
  });

  it('should handle inline defaultTest objects', async () => {
    const inlineDefaultTest = {
      assert: [{ type: 'contains' as const, value: 'inline' }],
      vars: { inline: true },
    };

    const mockApiProvider = createMockProvider({
      id: 'mock-provider',
      response: { output: 'test output' },
    });

    loadApiProvidersSpy.mockResolvedValueOnce([mockApiProvider]);

    const testSuite = {
      providers: ['mock-provider'],
      prompts: [{ raw: 'Test prompt', label: 'Test' }],
      tests: [{ vars: { test: 'value' } }],
      defaultTest: inlineDefaultTest,
    };

    const summary = await evaluate(testSuite, {});

    const result = summary.results[0] as any;
    expect(result.test.assert).toEqual(inlineDefaultTest.assert);
    expect(result.test.vars).toMatchObject(inlineDefaultTest.vars);
  });

  it('should handle missing external defaultTest file gracefully', async () => {
    const mockApiProvider = createMockProvider({
      id: 'mock-provider',
      response: { output: 'test output' },
    });

    loadApiProvidersSpy.mockResolvedValueOnce([mockApiProvider]);

    const testSuite = {
      providers: ['mock-provider'],
      prompts: [{ raw: 'Test prompt', label: 'Test' }],
      tests: [{ vars: { test: 'value' } }],
      defaultTest: 'file://nonexistent.yaml',
    };

    maybeLoadFromExternalFileSpy.mockRejectedValueOnce(
      new Error('File does not exist: /Users/mdangelo/projects/pf-codium/nonexistent.yaml'),
    );

    await expect(evaluate(testSuite, {})).rejects.toThrow('File does not exist');
  });

  it('should not load external file when defaultTest is not a file:// string', async () => {
    const mockApiProvider = createMockProvider({
      id: 'mock-provider',
      response: { output: 'test output' },
    });

    loadApiProvidersSpy.mockResolvedValueOnce([mockApiProvider]);

    const testSuite = {
      providers: ['mock-provider'],
      prompts: [{ raw: 'Test prompt', label: 'Test' }],
      tests: [{ vars: { test: 'value' } }],
      defaultTest: undefined,
    };

    const summary = await evaluate(testSuite, {});

    expect(fileUtils.maybeLoadFromExternalFile).not.toHaveBeenCalled();
    expect(summary.results).toHaveLength(1);
  });

  describe('ApiProvider instances in configurations', () => {
    let mockApiProvider: any;
    let mockCustomProvider: any;
    let resolveProviderSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      mockApiProvider = createMockProvider({
        id: 'mock-api-provider',
        response: { output: 'mock response' },
      });

      mockCustomProvider = createMockProvider({
        id: 'custom-validator',
        response: { output: 'custom validation response' },
      });

      // Mock resolveProvider to track calls and return mock providers
      resolveProviderSpy = vi
        .spyOn(providers, 'resolveProvider')
        .mockImplementation(async (provider) => {
          if (typeof provider === 'string') {
            return createMockProvider({ id: provider });
          }
          if (typeof provider === 'object' && 'id' in provider && typeof provider.id === 'string') {
            // This is a ProviderOptions object
            return createMockProvider({ id: provider.id as string });
          }
          // This shouldn't be called for ApiProvider instances due to our fix
          return provider;
        });
    });

    afterEach(() => {
      resolveProviderSpy.mockRestore();
    });

    it('should not resolve ApiProvider instances in defaultTest.options.provider', async () => {
      const testSuite = {
        prompts: ['test prompt'],
        providers: [mockApiProvider],
        tests: [{ vars: { test: 'value' } }],
        defaultTest: {
          options: {
            provider: mockCustomProvider, // ApiProvider instance
          },
        },
      };

      loadApiProvidersSpy.mockResolvedValueOnce([mockApiProvider]);

      await evaluate(testSuite);

      // Verify that resolveProvider was NOT called with the ApiProvider instance
      expect(resolveProviderSpy).not.toHaveBeenCalledWith(
        mockCustomProvider,
        expect.any(Object),
        expect.any(Object),
      );

      // Verify the ApiProvider instance is passed through unchanged
      expect(doEvaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultTest: expect.objectContaining({
            options: expect.objectContaining({
              provider: mockCustomProvider, // Should be the same instance
            }),
          }),
        }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('should not resolve ApiProvider instances in defaultTest.provider', async () => {
      const testSuite = {
        prompts: ['test prompt'],
        providers: [mockApiProvider],
        tests: [{ vars: { test: 'value' } }],
        defaultTest: {
          provider: mockCustomProvider, // ApiProvider instance
        },
      };

      loadApiProvidersSpy.mockResolvedValueOnce([mockApiProvider]);

      await evaluate(testSuite);

      // Verify that resolveProvider was NOT called with the ApiProvider instance
      expect(resolveProviderSpy).not.toHaveBeenCalledWith(
        mockCustomProvider,
        expect.any(Object),
        expect.any(Object),
      );

      // Verify the ApiProvider instance is passed through unchanged
      expect(doEvaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultTest: expect.objectContaining({
            provider: mockCustomProvider, // Should be the same instance
          }),
        }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('should not resolve ApiProvider instances in test.options.provider', async () => {
      const testSuite = {
        prompts: ['test prompt'],
        providers: [mockApiProvider],
        tests: [
          {
            vars: { test: 'value' },
            options: {
              provider: mockCustomProvider, // ApiProvider instance
            },
          },
        ],
      };

      loadApiProvidersSpy.mockResolvedValueOnce([mockApiProvider]);

      await evaluate(testSuite);

      // Verify that resolveProvider was NOT called with the ApiProvider instance
      expect(resolveProviderSpy).not.toHaveBeenCalledWith(
        mockCustomProvider,
        expect.any(Object),
        expect.any(Object),
      );

      // Verify the ApiProvider instance is passed through unchanged
      expect(doEvaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          tests: expect.arrayContaining([
            expect.objectContaining({
              options: expect.objectContaining({
                provider: mockCustomProvider, // Should be the same instance
              }),
            }),
          ]),
        }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('should not resolve ApiProvider instances in assertion.provider', async () => {
      const testSuite = {
        prompts: ['test prompt'],
        providers: [mockApiProvider],
        tests: [
          {
            vars: { test: 'value' },
            assert: [
              {
                type: 'llm-rubric' as const,
                value: 'Test assertion',
                provider: mockCustomProvider, // ApiProvider instance
              },
            ],
          },
        ],
      };

      loadApiProvidersSpy.mockResolvedValueOnce([mockApiProvider]);

      await evaluate(testSuite);

      // Verify that resolveProvider was NOT called with the ApiProvider instance
      expect(resolveProviderSpy).not.toHaveBeenCalledWith(
        mockCustomProvider,
        expect.any(Object),
        expect.any(Object),
      );

      // Verify the ApiProvider instance is passed through unchanged
      expect(doEvaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          tests: expect.arrayContaining([
            expect.objectContaining({
              assert: expect.arrayContaining([
                expect.objectContaining({
                  provider: mockCustomProvider, // Should be the same instance
                }),
              ]),
            }),
          ]),
        }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('should verify ApiProvider instances are preserved through the evaluation', async () => {
      // This test focuses on the key behavior: ApiProvider instances should be passed through unchanged
      const testSuite = {
        prompts: ['test prompt'],
        providers: [mockApiProvider],
        tests: [
          {
            vars: { test: 'value' },
            options: {
              provider: mockCustomProvider, // ApiProvider instance
            },
          },
        ],
        defaultTest: {
          options: {
            provider: mockCustomProvider, // ApiProvider instance
          },
          assert: [
            {
              type: 'llm-rubric' as const,
              value: 'Test assertion',
              provider: mockCustomProvider, // ApiProvider instance
            },
          ],
        },
      };

      loadApiProvidersSpy.mockResolvedValueOnce([mockApiProvider]);

      await evaluate(testSuite);

      // The key test: verify that ApiProvider instances were NOT passed to resolveProvider
      expect(resolveProviderSpy).not.toHaveBeenCalledWith(
        mockCustomProvider,
        expect.any(Object),
        expect.any(Object),
      );

      // Verify that the ApiProvider instances are preserved in the final test suite
      expect(doEvaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultTest: expect.objectContaining({
            options: expect.objectContaining({
              provider: mockCustomProvider, // Same instance
            }),
            assert: expect.arrayContaining([
              expect.objectContaining({
                provider: mockCustomProvider, // Same instance
              }),
            ]),
          }),
          tests: expect.arrayContaining([
            expect.objectContaining({
              options: expect.objectContaining({
                provider: mockCustomProvider, // Same instance
              }),
            }),
          ]),
        }),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  // Regression test for #8687: resolved providers must not mutate the input
  // testSuite, because SDK clients can attach circular references at runtime
  // and break JSON serialization when those mutated objects are reused.
  describe('input testSuite mutation safety', () => {
    let resolveProviderSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.mocked(doEvaluate).mockClear();
      resolveProviderSpy = vi
        .spyOn(providers, 'resolveProvider')
        .mockImplementation(async (provider) => {
          const id =
            typeof provider === 'string'
              ? provider
              : typeof provider === 'object' && provider && 'id' in provider
                ? (provider as { id: string }).id
                : 'resolved-provider';
          return { id: () => id, callApi: vi.fn() as any };
        });
    });

    afterEach(() => {
      resolveProviderSpy.mockRestore();
    });

    it('does not mutate testSuite.defaultTest.options.provider when resolving for the runtime suite', async () => {
      const rawProviderConfig = {
        id: 'bedrock:anthropic.claude-3-haiku-20240307-v1:0',
        config: { region: 'us-east-1' },
      };
      const testSuite = {
        prompts: ['test prompt'],
        providers: [],
        defaultTest: {
          options: {
            provider: rawProviderConfig,
          },
        },
        tests: [{ vars: { x: 'y' } }],
      };
      const originalDefaultTest = testSuite.defaultTest;
      const originalOptions = testSuite.defaultTest.options;

      await evaluate(testSuite);

      expect(testSuite.defaultTest).toBe(originalDefaultTest);
      expect(testSuite.defaultTest.options).toBe(originalOptions);
      expect(testSuite.defaultTest.options.provider).toBe(rawProviderConfig);
      expect(testSuite.defaultTest.options.provider).toEqual({
        id: 'bedrock:anthropic.claude-3-haiku-20240307-v1:0',
        config: { region: 'us-east-1' },
      });
    });

    it('does not mutate testSuite.defaultTest.provider when resolving it', async () => {
      const rawProviderConfig = {
        id: 'anthropic:messages:claude-3-haiku',
        config: { apiKey: 'sk-test' },
      };
      const testSuite = {
        prompts: ['test prompt'],
        providers: [],
        defaultTest: {
          provider: rawProviderConfig,
        },
        tests: [{ vars: { x: 'y' } }],
      };

      await evaluate(testSuite);

      expect(testSuite.defaultTest.provider).toBe(rawProviderConfig);
      expect(testSuite.defaultTest.provider).toEqual({
        id: 'anthropic:messages:claude-3-haiku',
        config: { apiKey: 'sk-test' },
      });
    });

    it('does not mutate inline test.options.provider or assertion.provider', async () => {
      const rawTestProviderConfig = { id: 'bedrock:test-model', config: { region: 'eu-west-1' } };
      const rawAssertProviderConfig = {
        id: 'anthropic:messages:claude-3-haiku',
        config: { apiKey: 'sk-test' },
      };
      const inlineTest = {
        vars: { x: 'y' },
        options: { provider: rawTestProviderConfig },
        assert: [
          {
            type: 'llm-rubric' as const,
            value: 'checks the thing',
            provider: rawAssertProviderConfig,
          },
        ],
      };
      const testSuite = {
        prompts: ['test prompt'],
        providers: [],
        tests: [inlineTest],
      };

      await evaluate(testSuite);

      expect(inlineTest.options.provider).toBe(rawTestProviderConfig);
      expect(inlineTest.assert[0].provider).toBe(rawAssertProviderConfig);
    });

    it('only clones siblings of test cases that need provider resolution; unaffected siblings keep raw config', async () => {
      const rawProviderConfig = { id: 'bedrock:test-model', config: { region: 'eu-west-1' } };
      const testWithProvider = {
        vars: { x: '1' },
        options: { provider: rawProviderConfig },
      };
      const testWithoutProvider = { vars: { x: '2' } };
      const testSuite = {
        prompts: ['test prompt'],
        providers: [],
        tests: [testWithProvider, testWithoutProvider],
      };

      await evaluate(testSuite);

      expect(testWithProvider.options.provider).toBe(rawProviderConfig);
      expect(testSuite.tests[1]).toBe(testWithoutProvider);
    });

    it('passes the resolved provider to doEvaluate on a cloned defaultTest', async () => {
      const rawProviderConfig = {
        id: 'bedrock:anthropic.claude-3-haiku-20240307-v1:0',
        config: { region: 'us-east-1' },
      };
      const testSuite = {
        prompts: ['test prompt'],
        providers: [],
        defaultTest: {
          options: {
            provider: rawProviderConfig,
          },
        },
        tests: [{ vars: { x: 'y' } }],
      };

      await evaluate(testSuite);

      // The runtime defaultTest must be a different object than the input so the
      // lazy SDK-client mutation downstream cannot leak back into the input that the
      // unified config aliases.
      const passedTestSuite = vi.mocked(doEvaluate).mock.calls.at(-1)?.[0];
      expect(passedTestSuite).toBeDefined();
      expect(passedTestSuite!.defaultTest).not.toBe(testSuite.defaultTest);
      expect((passedTestSuite!.defaultTest as { options: unknown }).options).not.toBe(
        testSuite.defaultTest.options,
      );
      expect(
        (
          passedTestSuite!.defaultTest as { options: { provider: { id: () => string } } }
        ).options.provider.id(),
      ).toBe('bedrock:anthropic.claude-3-haiku-20240307-v1:0');
    });

    it('produces an Eval config that is JSON-serializable even when the resolved provider gains circular references', async () => {
      // Mimic the AWS / Anthropic SDK pattern: ApiProvider instance whose first
      // `callApi` lazily attaches a client that holds a circular reference. Without
      // the fix, the resolved instance was stored on the input, and once the cycle
      // appeared the unified config persisted via drizzle's text-json column threw
      // "Converting circular structure to JSON ... AwsRestJsonProtocol.serdeContext".
      type ResolvedProvider = {
        id: () => string;
        callApi: ReturnType<typeof vi.fn>;
        sdkClient?: { self?: unknown };
      };
      const resolvedProvider: ResolvedProvider = {
        id: () => 'bedrock:resolved',
        callApi: vi.fn().mockImplementation(async function (this: ResolvedProvider) {
          const cyclic: { self?: unknown } = {};
          cyclic.self = cyclic;
          this.sdkClient = cyclic;
          return { output: 'ok' };
        }),
      };
      resolveProviderSpy.mockResolvedValue(resolvedProvider);

      const createEvalSpy = vi.spyOn(Eval, 'create');

      const testSuite = {
        prompts: ['test prompt'],
        providers: [],
        defaultTest: {
          options: {
            provider: {
              id: 'bedrock:anthropic.claude-3-haiku-20240307-v1:0',
              config: { region: 'us-east-1' },
            },
          },
        },
        tests: [{ vars: { x: 'y' } }],
        writeLatestResults: true,
      };

      await evaluate(testSuite);

      await (resolvedProvider.callApi as unknown as (...args: unknown[]) => Promise<unknown>)(
        'anything',
        {},
        {},
      );
      expect(resolvedProvider.sdkClient).toBeDefined();

      // Direct check on the actual production failure mode: the config object handed
      // to Eval.create is what drizzle JSON-serializes via the text-json column.
      const persistedConfig = createEvalSpy.mock.calls.at(-1)?.[0];
      expect(persistedConfig).toBeDefined();
      expect(() => JSON.stringify(persistedConfig)).not.toThrow();
      // The input itself must also be safe — library callers may persist or log it.
      expect(() => JSON.stringify(testSuite)).not.toThrow();

      const passedTestSuite = vi.mocked(doEvaluate).mock.calls.at(-1)?.[0];
      expect(passedTestSuite).toBeDefined();
      expect(
        (passedTestSuite!.defaultTest as { options: { provider: { id: () => string } } }).options
          .provider,
      ).toBe(resolvedProvider);
      expect(
        (
          passedTestSuite!.defaultTest as { options: { provider: { id: () => string } } }
        ).options.provider.id(),
      ).toBe('bedrock:resolved');

      createEvalSpy.mockRestore();
    });

    it('serializes live ApiProvider references before persisting the Eval config', async () => {
      const cyclicClient: Record<string, unknown> = {};
      cyclicClient.self = cyclicClient;
      const liveProvider = createMockProvider({
        id: 'live-provider',
        label: 'Live Provider',
        config: { region: 'us-east-1' },
      }) as ReturnType<typeof createMockProvider> & { sdkClient?: unknown };
      liveProvider.sdkClient = cyclicClient;

      loadApiProvidersSpy.mockResolvedValueOnce([liveProvider]);

      const createEvalSpy = vi.spyOn(Eval, 'create');

      const testSuite = {
        prompts: ['test prompt'],
        providers: [liveProvider],
        defaultTest: {
          provider: liveProvider,
          options: {
            provider: liveProvider,
          },
        },
        tests: [
          {
            options: {
              provider: liveProvider,
            },
            assert: [
              {
                type: 'llm-rubric' as const,
                value: 'looks good',
                provider: liveProvider,
              },
            ],
          },
        ],
        scenarios: [
          {
            config: [{}],
            tests: [
              {
                options: {
                  provider: liveProvider,
                },
              },
            ],
          },
        ],
        writeLatestResults: true,
      };

      await evaluate(testSuite);

      const persistedConfig = createEvalSpy.mock.calls.at(-1)?.[0] as {
        providers?: unknown;
        defaultTest?: {
          provider?: unknown;
          options?: { provider?: unknown };
        };
        tests?: Array<{
          options?: { provider?: unknown };
          assert?: Array<{ provider?: unknown }>;
        }>;
        scenarios?: Array<{ tests?: Array<{ options?: { provider?: unknown } }> }>;
      };
      const serializableProvider = {
        id: 'live-provider',
        label: 'Live Provider',
        config: { region: 'us-east-1' },
      };

      expect(() => JSON.stringify(persistedConfig)).not.toThrow();
      expect(persistedConfig.providers).toEqual([serializableProvider]);
      expect(persistedConfig.defaultTest?.provider).toEqual(serializableProvider);
      expect(persistedConfig.defaultTest?.options?.provider).toEqual(serializableProvider);
      expect(persistedConfig.tests?.[0].options?.provider).toEqual(serializableProvider);
      expect(persistedConfig.tests?.[0].assert?.[0].provider).toEqual(serializableProvider);
      expect(persistedConfig.scenarios?.[0].tests?.[0].options?.provider).toEqual(
        serializableProvider,
      );
      expect(JSON.stringify(persistedConfig)).not.toContain('sdkClient');

      createEvalSpy.mockRestore();
    });

    it('replaces function-valued transforms with "[inline function]" markers in the persisted config and warns', async () => {
      // Function transforms are first-class at runtime but not JSON-serializable.
      // When writeLatestResults is true they must not silently vanish from the
      // persisted config — replace with a named marker and surface a warning.
      const providerFn = () => Promise.resolve({ output: 'raw' });
      loadApiProvidersSpy.mockResolvedValueOnce([createMockProvider({ id: 'mock-provider' })]);

      function namedTransform(output: unknown) {
        return String(output).toUpperCase();
      }
      const anonymousTransform = (output: unknown) => output;
      const transformVarsFn = (vars: unknown) => vars as Record<string, unknown>;
      const contextTransformFn = () => 'context';

      const createEvalSpy = vi.spyOn(Eval, 'create');
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);

      const testSuite = {
        prompts: ['p'],
        providers: [providerFn],
        defaultTest: {
          options: { transform: namedTransform },
        },
        tests: [
          {
            vars: { q: 'x' },
            options: {
              transform: namedTransform,
              transformVars: transformVarsFn,
            },
            assert: [
              {
                type: 'contains' as const,
                value: 'x',
                transform: anonymousTransform,
                contextTransform: contextTransformFn,
              },
            ],
          },
        ],
        scenarios: [
          {
            config: [{}],
            tests: [{ options: { transform: namedTransform } }],
          },
        ],
        writeLatestResults: true,
      };

      await evaluate(testSuite);

      const persistedConfig = createEvalSpy.mock.calls.at(-1)?.[0] as {
        defaultTest?: { options?: { transform?: unknown } };
        tests?: Array<{
          options?: { transform?: unknown; transformVars?: unknown };
          assert?: Array<{ transform?: unknown; contextTransform?: unknown }>;
        }>;
        scenarios?: Array<{ tests?: Array<{ options?: { transform?: unknown } }> }>;
      };

      // Named functions get their name in the marker; anonymous ones get the
      // container-property name via JS function-name inference (here: "transform"
      // and "contextTransform" via property-assignment naming).
      expect(persistedConfig.defaultTest?.options?.transform).toBe(
        '[inline function]: namedTransform',
      );
      expect(persistedConfig.tests?.[0].options?.transform).toBe(
        '[inline function]: namedTransform',
      );
      expect(persistedConfig.tests?.[0].options?.transformVars).toBe(
        '[inline function]: transformVarsFn',
      );
      expect(typeof persistedConfig.tests?.[0].assert?.[0].transform).toBe('string');
      expect(persistedConfig.tests?.[0].assert?.[0].transform).toMatch(/^\[inline function\]/);
      expect(typeof persistedConfig.tests?.[0].assert?.[0].contextTransform).toBe('string');
      expect(persistedConfig.tests?.[0].assert?.[0].contextTransform).toMatch(
        /^\[inline function\]/,
      );
      expect(persistedConfig.scenarios?.[0].tests?.[0].options?.transform).toBe(
        '[inline function]: namedTransform',
      );

      // Every transform field must survive JSON round-trip (the regression we guard).
      const roundTripped = JSON.parse(JSON.stringify(persistedConfig)) as typeof persistedConfig;
      expect(roundTripped.tests?.[0].options?.transform).toBe('[inline function]: namedTransform');
      expect(roundTripped.tests?.[0].assert?.[0].transform).toMatch(/^\[inline function\]/);

      // Warning surfaces the serialization substitution. Assert on content, not
      // call count — a future refactor that splits this into multiple lines
      // should still satisfy the guarantee.
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[inline function]'));

      createEvalSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('does not warn or rewrite persisted config when no function transforms are present', async () => {
      loadApiProvidersSpy.mockResolvedValueOnce([createMockProvider({ id: 'mock-provider' })]);

      const createEvalSpy = vi.spyOn(Eval, 'create');
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);

      const testSuite = {
        prompts: ['p'],
        providers: ['mock-provider'],
        tests: [
          {
            vars: { q: 'x' },
            options: { transform: 'output.toUpperCase()' },
          },
        ],
        writeLatestResults: true,
      };

      await evaluate(testSuite);

      const persistedConfig = createEvalSpy.mock.calls.at(-1)?.[0] as {
        tests?: Array<{ options?: { transform?: unknown } }>;
      };
      expect(persistedConfig.tests?.[0].options?.transform).toBe('output.toUpperCase()');
      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('[inline function]'));

      createEvalSpy.mockRestore();
      warnSpy.mockRestore();
    });

    it('does not emit the serialization warning when writeLatestResults is false', async () => {
      loadApiProvidersSpy.mockResolvedValueOnce([createMockProvider({ id: 'mock-provider' })]);

      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);

      function fn(output: unknown) {
        return output;
      }

      await evaluate({
        prompts: ['p'],
        providers: ['mock-provider'],
        tests: [{ vars: { q: 'x' }, options: { transform: fn } }],
        // writeLatestResults omitted → no warning even though the function is present
      });

      expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('[inline function]'));

      warnSpy.mockRestore();
    });

    it('passes scenario-nested test cases through unchanged (provider resolution there is the evaluator runtime path, not evaluate())', async () => {
      // Pin current behavior: src/index.ts only resolves providers on
      // `constructedTestSuite.tests`, NOT on `scenarios[i].tests`. If a future change
      // adds scenario provider resolution at this layer, it must extend
      // `cloneTestForResolve` coverage to scenarios — otherwise #8687 recurs.
      const rawProviderConfig = {
        id: 'bedrock:anthropic.claude-3-haiku-20240307-v1:0',
        config: { region: 'us-east-1' },
      };
      const scenarioTest = { vars: { x: 'y' }, options: { provider: rawProviderConfig } };
      const testSuite = {
        prompts: ['test prompt'],
        providers: [],
        scenarios: [{ config: [{}], tests: [scenarioTest] }],
        tests: [{ vars: { z: 'w' } }],
      };

      await evaluate(testSuite);

      expect(scenarioTest.options.provider).toBe(rawProviderConfig);
      expect(() => JSON.stringify(testSuite)).not.toThrow();
    });
  });
});

describe('evaluate sharing functionality', () => {
  let loadApiProvidersSpy: ReturnType<typeof vi.spyOn>;
  let createShareableUrlMock: ReturnType<typeof vi.fn>;
  let isSharingEnabledMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(cache.withCacheEnabled).mockImplementation((_enabled, fn) => fn());

    // Set up spies for provider functions
    loadApiProvidersSpy = vi.spyOn(providers, 'loadApiProviders').mockResolvedValue([]);

    // Mock the share module
    const shareModule = await import('../src/share');
    createShareableUrlMock = vi
      .spyOn(shareModule, 'createShareableUrl')
      .mockResolvedValue(null) as unknown as ReturnType<typeof vi.fn>;
    isSharingEnabledMock = vi
      .spyOn(shareModule, 'isSharingEnabled')
      .mockReturnValue(false) as unknown as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    loadApiProvidersSpy.mockRestore();
    createShareableUrlMock.mockRestore();
    isSharingEnabledMock.mockRestore();
  });

  it('should create shareable URL when sharing is enabled', async () => {
    const mockUrl = 'https://app.promptfoo.dev/eval/test-123';
    isSharingEnabledMock.mockReturnValue(true);
    createShareableUrlMock.mockResolvedValue(mockUrl);

    const testSuite = {
      prompts: ['test'],
      providers: [],
      writeLatestResults: true,
      sharing: true,
    };

    const result = await evaluate(testSuite);

    expect(createShareableUrlMock).toHaveBeenCalledWith(expect.anything(), { silent: true });
    expect(result.shareableUrl).toBe(mockUrl);
    expect(result.shared).toBe(true);
  });

  it('should not share when writeLatestResults is false', async () => {
    isSharingEnabledMock.mockReturnValue(true);

    const testSuite = {
      prompts: ['test'],
      providers: [],
      writeLatestResults: false,
      sharing: true,
    };

    await evaluate(testSuite);

    expect(createShareableUrlMock).not.toHaveBeenCalled();
  });

  it('should not share when sharing is not enabled in config', async () => {
    const testSuite = {
      prompts: ['test'],
      providers: [],
      writeLatestResults: true,
      sharing: false,
    };

    await evaluate(testSuite);

    expect(createShareableUrlMock).not.toHaveBeenCalled();
  });

  it('should not share when sharing is undefined', async () => {
    const testSuite = {
      prompts: ['test'],
      providers: [],
      writeLatestResults: true,
    };

    await evaluate(testSuite);

    expect(createShareableUrlMock).not.toHaveBeenCalled();
  });

  it('should not call createShareableUrl when isSharingEnabled returns false', async () => {
    isSharingEnabledMock.mockReturnValue(false);

    const testSuite = {
      prompts: ['test'],
      providers: [],
      writeLatestResults: true,
      sharing: true,
    };

    await evaluate(testSuite);

    expect(isSharingEnabledMock).toHaveBeenCalled();
    expect(createShareableUrlMock).not.toHaveBeenCalled();
  });

  it('should handle sharing errors gracefully', async () => {
    isSharingEnabledMock.mockReturnValue(true);
    createShareableUrlMock.mockRejectedValue(new Error('Network error'));

    const testSuite = {
      prompts: ['test'],
      providers: [],
      writeLatestResults: true,
      sharing: true,
    };

    // Should not throw
    const result = await evaluate(testSuite);

    expect(result.shareableUrl).toBeUndefined();
    expect(result.shared).toBeFalsy();
  });

  it('should handle null URL from createShareableUrl', async () => {
    isSharingEnabledMock.mockReturnValue(true);
    createShareableUrlMock.mockResolvedValue(null);

    const testSuite = {
      prompts: ['test'],
      providers: [],
      writeLatestResults: true,
      sharing: true,
    };

    const result = await evaluate(testSuite);

    expect(result.shareableUrl).toBeUndefined();
    expect(result.shared).toBeFalsy();
  });

  it('should support sharing config object', async () => {
    const mockUrl = 'https://custom.server.com/eval/test-123';
    isSharingEnabledMock.mockReturnValue(true);
    createShareableUrlMock.mockResolvedValue(mockUrl);

    const testSuite = {
      prompts: ['test'],
      providers: [],
      writeLatestResults: true,
      sharing: {
        apiBaseUrl: 'https://custom.server.com/api',
        appBaseUrl: 'https://custom.server.com',
      },
    };

    const result = await evaluate(testSuite);

    expect(result.shareableUrl).toBe(mockUrl);
    expect(result.shared).toBe(true);
  });
});
