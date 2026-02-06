import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as cache from '../src/cache';
import { evaluate as doEvaluate } from '../src/evaluator';
import * as index from '../src/index';
import { evaluate } from '../src/index';
import Eval from '../src/models/eval';
import { readProviderPromptMap } from '../src/prompts/index';
import * as providers from '../src/providers/index';
import * as fileUtils from '../src/util/file';
import { writeMultipleOutputs, writeOutput } from '../src/util/index';

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
    'assertions',
    'cache',
    'evaluate',
    'generateTable',
    'generation',
    'guardrails',
    'isApiProvider',
    'isGradingResult',
    'isProviderOptions',
    'isResultFailureReason',
    'loadApiProvider',
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
    'EvalResultsFilterMode',
    'EvaluateOptionsSchema',
    'GradingConfigSchema',
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
      generation: index.generation,
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
  let loadApiProvidersSpy: ReturnType<typeof vi.spyOn>;
  let loadApiProviderSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up spies for provider functions
    loadApiProvidersSpy = vi.spyOn(providers, 'loadApiProviders').mockResolvedValue([]);
    loadApiProviderSpy = vi.spyOn(providers, 'loadApiProvider').mockResolvedValue({
      id: () => 'mock-provider',
      callApi: vi.fn() as any,
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
    const createEvalSpy = vi.spyOn(Eval, 'create');

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
        callApi: vi.fn(),
      };
      const mockProvider2 = {
        id: () => 'provider-2',
        callApi: vi.fn(),
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
        callApi: vi.fn(),
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
        callApi: vi.fn(),
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
        callApi: vi.fn(),
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
          callApi: vi.fn(),
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
          callApi: vi.fn(),
        };

        const mockGevalProvider = {
          id: () => 'litellm:gemini-pro',
          callApi: vi.fn(),
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
          callApi: vi.fn(),
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
          callApi: vi.fn(),
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

describe('evaluate with external defaultTest', () => {
  let loadApiProvidersSpy: ReturnType<typeof vi.spyOn>;
  let loadApiProviderSpy: ReturnType<typeof vi.spyOn>;
  let maybeLoadFromExternalFileSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Set up spies for provider functions
    loadApiProvidersSpy = vi.spyOn(providers, 'loadApiProviders').mockResolvedValue([]);
    loadApiProviderSpy = vi.spyOn(providers, 'loadApiProvider').mockResolvedValue({
      id: () => 'mock-provider',
      callApi: vi.fn() as any,
    });

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

    const mockApiProvider = {
      id: () => 'mock-provider',
      callApi: vi.fn().mockResolvedValue({ output: 'test output' }),
    };

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

    const mockApiProvider = {
      id: () => 'mock-provider',
      callApi: vi.fn().mockResolvedValue({ output: 'test output' }),
    };

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
    const mockApiProvider = {
      id: () => 'mock-provider',
      callApi: vi.fn().mockResolvedValue({ output: 'test output' }),
    };

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
    const mockApiProvider = {
      id: () => 'mock-provider',
      callApi: vi.fn().mockResolvedValue({ output: 'test output' }),
    };

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
      mockApiProvider = {
        id: () => 'mock-api-provider',
        callApi: vi.fn().mockResolvedValue({ output: 'mock response' }),
      };

      mockCustomProvider = {
        id: () => 'custom-validator',
        callApi: vi.fn().mockResolvedValue({ output: 'custom validation response' }),
      };

      // Mock resolveProvider to track calls and return mock providers
      resolveProviderSpy = vi
        .spyOn(providers, 'resolveProvider')
        .mockImplementation(async (provider) => {
          if (typeof provider === 'string') {
            return { id: () => provider, callApi: vi.fn() };
          }
          if (typeof provider === 'object' && 'id' in provider && typeof provider.id === 'string') {
            // This is a ProviderOptions object
            return { id: () => provider.id as string, callApi: vi.fn() };
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
});

describe('evaluate sharing functionality', () => {
  let loadApiProvidersSpy: ReturnType<typeof vi.spyOn>;
  let createShareableUrlMock: ReturnType<typeof vi.fn>;
  let isSharingEnabledMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

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
