import glob from 'glob';
import { evaluate, generateVarCombinations, isAllowedPrompt } from '../src/evaluator';
import { runExtensionHook } from '../src/evaluatorHelpers';
import type { ApiProvider, Prompt, TestSuite } from '../src/types';

jest.mock('node-fetch', () => jest.fn());
jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  statSync: jest.fn(),
  readdirSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  promises: {
    readFile: jest.fn(),
  },
}));

jest.mock('../src/esm');
jest.mock('../src/database', () => ({
  getDb: jest.fn(),
}));
jest.mock('../src/logger');
jest.mock('../src/evaluatorHelpers', () => ({
  ...jest.requireActual('../src/evaluatorHelpers'),
  runExtensionHook: jest.fn(),
}));

const mockApiProvider: ApiProvider = {
  id: jest.fn().mockReturnValue('test-provider'),
  callApi: jest.fn().mockResolvedValue({
    output: 'Test output',
    tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
  }),
};

const mockGradingApiProviderPasses: ApiProvider = {
  id: jest.fn().mockReturnValue('test-grading-provider'),
  callApi: jest.fn().mockResolvedValue({
    output: JSON.stringify({ pass: true, reason: 'Test grading output' }),
    tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
  }),
};

const mockGradingApiProviderFails: ApiProvider = {
  id: jest.fn().mockReturnValue('test-grading-provider'),
  callApi: jest.fn().mockResolvedValue({
    output: JSON.stringify({ pass: false, reason: 'Grading failed reason' }),
    tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
  }),
};

function toPrompt(text: string): Prompt {
  return { raw: text, label: text };
}

describe('evaluator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('evaluate with vars', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ var1 }} {{ var2 }}')],
      tests: [
        {
          vars: { var1: 'value1', var2: 'value2' },
        },
      ],
    };

    const summary = await evaluate(testSuite, {});

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5, cached: 0 });
    expect(summary.results[0].prompt.raw).toBe('Test prompt value1 value2');
    expect(summary.results[0].prompt.label).toBe('Test prompt {{ var1 }} {{ var2 }}');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with vars - no escaping', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ var1 }} {{ var2 }}')],
      tests: [
        {
          vars: { var1: '1 < 2', var2: 'he said "hello world"...' },
        },
      ],
    };

    const summary = await evaluate(testSuite, {});

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5, cached: 0 });
    expect(summary.results[0].prompt.raw).toBe('Test prompt 1 < 2 he said "hello world"...');
    expect(summary.results[0].prompt.label).toBe('Test prompt {{ var1 }} {{ var2 }}');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with vars as object', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ var1.prop1 }} {{ var2 }}')],
      tests: [
        {
          vars: { var1: { prop1: 'value1' }, var2: 'value2' },
        },
      ],
    };

    const summary = await evaluate(testSuite, {});

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5, cached: 0 });
    expect(summary.results[0].prompt.raw).toBe('Test prompt value1 value2');
    expect(summary.results[0].prompt.label).toBe('Test prompt {{ var1.prop1 }} {{ var2 }}');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with named prompt', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [{ raw: 'Test prompt {{ var1 }} {{ var2 }}', label: 'test display name' }],
      tests: [
        {
          vars: { var1: 'value1', var2: 'value2' },
        },
      ],
    };

    const summary = await evaluate(testSuite, {});

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5, cached: 0 });
    expect(summary.results[0].prompt.raw).toBe('Test prompt value1 value2');
    expect(summary.results[0].prompt.label).toBe('test display name');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with multiple vars', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ var1 }} {{ var2 }}')],
      tests: [
        {
          vars: { var1: ['value1', 'value3'], var2: ['value2', 'value4'] },
        },
      ],
    };

    const summary = await evaluate(testSuite, {});

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(4);
    expect(summary.stats.successes).toBe(4);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({ total: 40, prompt: 20, completion: 20, cached: 0 });
    expect(summary.results[0].prompt.raw).toBe('Test prompt value1 value2');
    expect(summary.results[0].prompt.label).toBe('Test prompt {{ var1 }} {{ var2 }}');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with multiple providers', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider, mockApiProvider],
      prompts: [toPrompt('Test prompt {{ var1 }} {{ var2 }}')],
      tests: [
        {
          vars: { var1: 'value1', var2: 'value2' },
        },
      ],
    };

    const summary = await evaluate(testSuite, {});

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);
    expect(summary.stats.successes).toBe(2);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({ total: 20, prompt: 10, completion: 10, cached: 0 });
    expect(summary.results[0].prompt.raw).toBe('Test prompt value1 value2');
    expect(summary.results[0].prompt.label).toBe('Test prompt {{ var1 }} {{ var2 }}');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate without tests', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
    };

    const summary = await evaluate(testSuite, {});

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5, cached: 0 });
    expect(summary.results[0].prompt.raw).toBe('Test prompt');
    expect(summary.results[0].prompt.label).toBe('Test prompt');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate without tests with multiple providers', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider, mockApiProvider, mockApiProvider],
      prompts: [toPrompt('Test prompt')],
    };

    const summary = await evaluate(testSuite, {});

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(3);
    expect(summary.stats.successes).toBe(3);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({ total: 30, prompt: 15, completion: 15, cached: 0 });
    expect(summary.results[0].prompt.raw).toBe('Test prompt');
    expect(summary.results[0].prompt.label).toBe('Test prompt');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with expected value matching output', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'equals',
              value: 'Test output',
            },
          ],
        },
      ],
    };

    const summary = await evaluate(testSuite, {});

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].success).toBe(true);
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with expected value not matching output', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'equals',
              value: 'Different output',
            },
          ],
        },
      ],
    };

    const summary = await evaluate(testSuite, {});

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(0);
    expect(summary.stats.failures).toBe(1);
    expect(summary.results[0].success).toBe(false);
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with fn: expected value', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'javascript',
              value: 'output === "Test output";',
            },
          ],
        },
      ],
    };

    const summary = await evaluate(testSuite, {});

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].success).toBe(true);
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with fn: expected value not matching output', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'javascript',
              value: 'output === "Different output";',
            },
          ],
        },
      ],
    };

    const summary = await evaluate(testSuite, {});

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(0);
    expect(summary.stats.failures).toBe(1);
    expect(summary.results[0].success).toBe(false);
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with grading expected value', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'llm-rubric',
              value: 'output is a test output',
            },
          ],
        },
      ],
      defaultTest: {
        options: {
          provider: mockGradingApiProviderPasses,
        },
      },
    };

    const summary = await evaluate(testSuite, {});

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].success).toBe(true);
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with grading expected value does not pass', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'llm-rubric',
              value: 'output is a test output',
            },
          ],
        },
      ],
      defaultTest: {
        options: {
          provider: mockGradingApiProviderFails,
        },
      },
    };

    const summary = await evaluate(testSuite, {});

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(0);
    expect(summary.stats.failures).toBe(1);
    expect(summary.results[0].success).toBe(false);
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with transform option - default test', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      defaultTest: {
        options: {
          transform: 'output + " postprocessed"',
        },
      },
    };

    const summary = await evaluate(testSuite, {});

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe('Test output postprocessed');
  });

  it('evaluate with transform option - single test', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'equals',
              value: 'Test output postprocessed',
            },
          ],
          options: {
            transform: 'output + " postprocessed"',
          },
        },
      ],
    };

    const summary = await evaluate(testSuite, {});

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe('Test output postprocessed');
  });

  it('evaluate with transform option - json provider', async () => {
    const mockApiJsonProvider: ApiProvider = {
      id: jest.fn().mockReturnValue('test-provider-json'),
      callApi: jest.fn().mockResolvedValue({
        output: '{"output": "testing", "value": 123}',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiJsonProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'equals',
              value: '123',
            },
          ],
          options: {
            transform: `JSON.parse(output).value`,
          },
        },
      ],
    };

    const summary = await evaluate(testSuite, {});

    expect(mockApiJsonProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe(123);
  });

  it('evaluate with provider transform', async () => {
    const mockApiProviderWithTransform: ApiProvider = {
      id: jest.fn().mockReturnValue('test-provider-transform'),
      callApi: jest.fn().mockResolvedValue({
        output: 'Original output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
      }),
      transform: '`Transformed: ${output}`',
    };

    const testSuite: TestSuite = {
      providers: [mockApiProviderWithTransform],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'equals',
              value: 'Transformed: Original output',
            },
          ],
          options: {}, // No test transform, relying on provider's transform
        },
      ],
    };

    const summary = await evaluate(testSuite, {});

    expect(mockApiProviderWithTransform.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe('Transformed: Original output');
  });

  it('evaluate with vars transform', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Hello {{ name }}, your age is {{ age }}')],
      tests: [
        {
          vars: { name: 'Alice', age: 30 },
        },
        {
          vars: { name: 'Bob', age: 25 },
          options: {
            transformVars: '{ ...vars, age: vars.age + 5 }',
          },
        },
      ],
      defaultTest: {
        options: {
          transformVars: '{ ...vars, name: vars.name.toUpperCase() }',
        },
      },
    };

    await expect(evaluate(testSuite, {})).resolves.toEqual(
      expect.objectContaining({
        stats: expect.objectContaining({
          successes: 2,
          failures: 0,
        }),
        results: expect.arrayContaining([
          expect.objectContaining({
            prompt: expect.objectContaining({
              raw: 'Hello ALICE, your age is 30',
              label: 'Hello {{ name }}, your age is {{ age }}',
            }),
            response: expect.objectContaining({
              output: 'Test output',
            }),
          }),
          expect.objectContaining({
            // NOTE: test overrides defaultTest transform. Bob not BOB
            prompt: expect.objectContaining({
              raw: 'Hello Bob, your age is 30',
            }),
            response: expect.objectContaining({
              output: 'Test output',
            }),
            vars: {
              name: 'Bob',
              age: 30,
            },
          }),
        ]),
      }),
    );

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);
  });

  it('evaluate with provider transform and test transform', async () => {
    const mockApiProviderWithTransform: ApiProvider = {
      id: jest.fn().mockReturnValue('test-provider-transform'),
      callApi: jest.fn().mockResolvedValue({
        output: 'Original output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
      }),
      transform: '`ProviderTransformed: ${output}`',
    };

    const testSuite: TestSuite = {
      providers: [mockApiProviderWithTransform],
      prompts: [toPrompt('Test prompt')],
      defaultTest: {
        options: {
          // overridden by the test transform
          transform: '"defaultTestTransformed " + output',
        },
      },
      tests: [
        {
          assert: [
            {
              type: 'equals',
              // Order of transforms: 1. Provider transform 2. Test transform (or defaultTest transform, if test transform unset)
              value: 'testTransformed ProviderTransformed: Original output',
            },
          ],
          // This transform overrides the defaultTest transform
          options: { transform: '"testTransformed " + output' },
        },
      ],
    };

    await expect(evaluate(testSuite, {})).resolves.toEqual(
      expect.objectContaining({
        stats: expect.objectContaining({
          successes: 1,
          failures: 0,
        }),
        results: expect.arrayContaining([
          expect.objectContaining({
            response: expect.objectContaining({
              output: 'testTransformed ProviderTransformed: Original output',
            }),
          }),
        ]),
      }),
    );

    expect(mockApiProviderWithTransform.callApi).toHaveBeenCalledTimes(1);
  });

  it('evaluate with providerPromptMap', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt 1'), toPrompt('Test prompt 2')],
      providerPromptMap: {
        'test-provider': ['Test prompt 1'],
      },
      tests: [
        {
          vars: { var1: 'value1', var2: 'value2' },
        },
      ],
    };

    const summary = await evaluate(testSuite, {});

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5, cached: 0 });
    expect(summary.results[0].prompt.raw).toBe('Test prompt 1');
    expect(summary.results[0].prompt.label).toBe('Test prompt 1');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with allowed prompts filtering', async () => {
    const mockApiProvider: ApiProvider = {
      id: jest.fn().mockReturnValue('test-provider'),
      callApi: jest.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [
        { raw: 'Test prompt 1', label: 'prompt1' },
        { raw: 'Test prompt 2', label: 'prompt2' },
        { raw: 'Test prompt 3', label: 'group1:prompt3' },
      ],
      providerPromptMap: {
        'test-provider': ['prompt1', 'group1'],
      },
      tests: [
        {
          vars: { var1: 'value1', var2: 'value2' },
        },
      ],
    };

    const summary = await evaluate(testSuite, {});

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({
      stats: {
        successes: 2,
        failures: 0,
      },
      results: [{ prompt: { label: 'prompt1' } }, { prompt: { label: 'group1:prompt3' } }],
    });
  });

  it('evaluate with scenarios', async () => {
    const mockApiProvider: ApiProvider = {
      id: jest.fn().mockReturnValue('test-provider'),
      callApi: jest
        .fn()
        .mockResolvedValueOnce({
          output: 'Hola mundo',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
        })
        .mockResolvedValueOnce({
          output: 'Bonjour le monde',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
        }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ language }}')],
      scenarios: [
        {
          config: [
            {
              vars: {
                language: 'Spanish',
                expectedHelloWorld: 'Hola mundo',
              },
            },
            {
              vars: {
                language: 'French',
                expectedHelloWorld: 'Bonjour le monde',
              },
            },
          ],
          tests: [
            {
              assert: [
                {
                  type: 'equals',
                  value: '{{expectedHelloWorld}}',
                },
              ],
            },
          ],
        },
      ],
    };

    const summary = await evaluate(testSuite, {});

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);
    expect(summary.stats.successes).toBe(2);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe('Hola mundo');
    expect(summary.results[1].response?.output).toBe('Bonjour le monde');
  });

  it('evaluate with scenarios and multiple vars', async () => {
    const mockApiProvider: ApiProvider = {
      id: jest.fn().mockReturnValue('test-provider'),
      callApi: jest
        .fn()
        .mockResolvedValueOnce({
          output: 'Spanish Hola',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
        })
        .mockResolvedValueOnce({
          output: 'Spanish Bonjour',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
        })
        .mockResolvedValueOnce({
          output: 'French Hola',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
        })
        .mockResolvedValueOnce({
          output: 'French Bonjour',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
        }),
    };
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ language }} {{ greeting }}')],
      scenarios: [
        {
          config: [
            {
              vars: {
                language: ['Spanish', 'French'],
                greeting: ['Hola', 'Bonjour'],
              },
            },
          ],
          tests: [
            {
              assert: [
                {
                  type: 'equals',
                  value: '{{language}} {{greeting}}',
                },
              ],
            },
          ],
        },
      ],
    };

    const summary = await evaluate(testSuite, {});

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(4);
    expect(summary.stats.successes).toBe(4);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe('Spanish Hola');
    expect(summary.results[1].response?.output).toBe('Spanish Bonjour');
    expect(summary.results[2].response?.output).toBe('French Hola');
    expect(summary.results[3].response?.output).toBe('French Bonjour');
  });

  it('evaluate with scenarios and defaultTest', async () => {
    const mockApiProvider: ApiProvider = {
      id: jest.fn().mockReturnValue('test-provider'),
      callApi: jest.fn().mockResolvedValue({
        output: 'Hello, World',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      defaultTest: {
        metadata: { defaultKey: 'defaultValue' },
        assert: [
          {
            type: 'starts-with',
            value: 'Hello',
          },
        ],
      },
      scenarios: [
        {
          config: [{ metadata: { configKey: 'configValue' } }],
          tests: [{ metadata: { testKey: 'testValue' } }],
        },
        {
          config: [
            {
              assert: [
                {
                  type: 'contains',
                  value: ',',
                },
              ],
            },
          ],
          tests: [
            {
              assert: [
                {
                  type: 'icontains',
                  value: 'world',
                },
              ],
            },
          ],
        },
      ],
    };

    const result = await evaluate(testSuite, {});

    expect(result).toMatchObject({
      stats: {
        successes: 2,
        failures: 0,
      },
      results: expect.arrayContaining([
        expect.objectContaining({
          gradingResult: expect.objectContaining({
            componentResults: expect.arrayContaining([expect.anything()]),
          }),
        }),
        expect.objectContaining({
          gradingResult: expect.objectContaining({
            componentResults: expect.arrayContaining([
              expect.anything(),
              expect.anything(),
              expect.anything(),
            ]),
          }),
        }),
      ]),
    });

    expect(result.table.body[0].test.metadata).toEqual({
      defaultKey: 'defaultValue',
      configKey: 'configValue',
      testKey: 'testValue',
    });

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);
  });

  it('merges metadata correctly for regular tests', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      defaultTest: {
        metadata: { defaultKey: 'defaultValue' },
      },
      tests: [
        {
          metadata: { testKey: 'testValue' },
        },
      ],
    };

    const summary = await evaluate(testSuite, {});

    expect(summary.table.body[0].test.metadata).toEqual({
      defaultKey: 'defaultValue',
      testKey: 'testValue',
    });
  });

  it('evaluate with _conversation variable', async () => {
    const mockApiProvider: ApiProvider = {
      id: jest.fn().mockReturnValue('test-provider'),
      callApi: jest.fn().mockImplementation((prompt) => {
        return Promise.resolve({
          output: prompt,
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
        });
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('{{ var1 }} {{ _conversation[0].output }}')],
      tests: [
        {
          vars: { var1: 'First run' },
        },
        {
          vars: { var1: 'Second run' },
        },
      ],
    };

    const summary = await evaluate(testSuite, {});

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);
    expect(summary.stats.successes).toBe(2);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe('First run ');
    expect(summary.results[1].response?.output).toBe('Second run First run ');
  });

  it('evaluate with labeled and unlabeled providers and providerPromptMap', async () => {
    const mockLabeledProvider: ApiProvider = {
      id: () => 'labeled-provider-id',
      label: 'Labeled Provider',
      callApi: jest.fn().mockResolvedValue({
        output: 'Labeled Provider Output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
      }),
    };

    const mockUnlabeledProvider: ApiProvider = {
      id: () => 'unlabeled-provider-id',
      callApi: jest.fn().mockResolvedValue({
        output: 'Unlabeled Provider Output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockLabeledProvider, mockUnlabeledProvider],
      prompts: [
        {
          raw: 'Prompt 1',
          label: 'prompt1',
        },
        {
          raw: 'Prompt 2',
          label: 'prompt2',
        },
      ],
      providerPromptMap: {
        'Labeled Provider': ['prompt1'],
        'unlabeled-provider-id': ['prompt2'],
      },
    };

    await expect(evaluate(testSuite, {})).resolves.toEqual(
      expect.objectContaining({
        stats: expect.objectContaining({
          successes: 2,
          failures: 0,
        }),
        results: [
          expect.objectContaining({
            provider: expect.objectContaining({
              id: 'labeled-provider-id',
              label: 'Labeled Provider',
            }),
            response: expect.objectContaining({
              output: 'Labeled Provider Output',
            }),
          }),
          expect.objectContaining({
            provider: expect.objectContaining({
              id: 'unlabeled-provider-id',
              label: undefined,
            }),
            response: expect.objectContaining({
              output: 'Unlabeled Provider Output',
            }),
          }),
        ],
        table: expect.objectContaining({
          head: expect.objectContaining({
            prompts: [
              expect.objectContaining({
                provider: 'Labeled Provider',
              }),
              expect.objectContaining({
                provider: 'unlabeled-provider-id',
              }),
            ],
          }),
        }),
      }),
    );

    expect(mockLabeledProvider.callApi).toHaveBeenCalledTimes(1);
    expect(mockUnlabeledProvider.callApi).toHaveBeenCalledTimes(1);
  });

  it('should use the options from the test if they exist', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          vars: { var1: 'value1', var2: 'value2' },
          options: {
            transform: 'output + " postprocessed"',
          },
        },
      ],
    };

    const summary = await evaluate(testSuite, {});

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe('Test output postprocessed');
  });

  it('evaluate with multiple transforms', async () => {
    const mockApiProviderWithTransform: ApiProvider = {
      id: jest.fn().mockReturnValue('test-provider-transform'),
      callApi: jest.fn().mockResolvedValue({
        output: 'Original output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
      }),
      transform: '`Provider: ${output}`',
    };

    const testSuite: TestSuite = {
      providers: [mockApiProviderWithTransform],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'equals',
              value: 'Test: Provider: Original output',
            },
          ],
          options: {
            transform: '`Test: ${output}`',
          },
        },
      ],
    };

    const summary = await evaluate(testSuite, {});

    expect(mockApiProviderWithTransform.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe('Test: Provider: Original output');
  });

  it('evaluate with provider transform and test postprocess (deprecated)', async () => {
    const mockApiProviderWithTransform: ApiProvider = {
      id: jest.fn().mockReturnValue('test-provider-transform'),
      callApi: jest.fn().mockResolvedValue({
        output: 'Original output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
      }),
      transform: '`Provider: ${output}`',
    };

    const testSuite: TestSuite = {
      providers: [mockApiProviderWithTransform],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'equals',
              value: 'Postprocess: Provider: Original output',
            },
          ],
          options: {
            postprocess: '`Postprocess: ${output}`',
          },
        },
      ],
    };

    await expect(evaluate(testSuite, {})).resolves.toEqual(
      expect.objectContaining({
        stats: expect.objectContaining({
          successes: 1,
          failures: 0,
        }),
        results: expect.arrayContaining([
          expect.objectContaining({
            response: expect.objectContaining({
              output: 'Postprocess: Provider: Original output',
            }),
          }),
        ]),
      }),
    );
    expect(mockApiProviderWithTransform.callApi).toHaveBeenCalledTimes(1);
  });

  it('evaluate with provider transform, test transform, and test postprocess (deprecated)', async () => {
    const mockApiProviderWithTransform: ApiProvider = {
      id: jest.fn().mockReturnValue('test-provider-transform'),
      callApi: jest.fn().mockResolvedValue({
        output: 'Original output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
      }),
      transform: '`Provider: ${output}`',
    };

    const testSuite: TestSuite = {
      providers: [mockApiProviderWithTransform],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'equals',
              value: 'Transform: Provider: Original output',
            },
          ],
          options: {
            transform: '`Transform: ${output}`',
            postprocess: '`Postprocess: ${output}`', // This should be ignored
          },
        },
      ],
    };
    await expect(evaluate(testSuite, {})).resolves.toEqual(
      expect.objectContaining({
        stats: expect.objectContaining({
          successes: 1,
          failures: 0,
        }),
        results: expect.arrayContaining([
          expect.objectContaining({
            response: expect.objectContaining({
              output: 'Transform: Provider: Original output',
            }),
          }),
        ]),
      }),
    );
    expect(mockApiProviderWithTransform.callApi).toHaveBeenCalledTimes(1);
  });

  it('evaluate with no output', async () => {
    const mockApiProviderNoOutput: ApiProvider = {
      id: jest.fn().mockReturnValue('test-provider-no-output'),
      callApi: jest.fn().mockResolvedValue({
        output: null,
        tokenUsage: { total: 5, prompt: 5, completion: 0, cached: 0 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProviderNoOutput],
      prompts: [toPrompt('Test prompt')],
      tests: [],
    };

    const summary = await evaluate(testSuite, {});

    expect(summary.stats.successes).toBe(0);
    expect(summary.stats.failures).toBe(1);
    expect(summary.results[0].error).toBe('No output');
    expect(summary.results[0].success).toBe(false);
    expect(summary.results[0].score).toBe(0);
    expect(mockApiProviderNoOutput.callApi).toHaveBeenCalledTimes(1);
  });

  it('evaluate with false output', async () => {
    const mockApiProviderNoOutput: ApiProvider = {
      id: jest.fn().mockReturnValue('test-provider-no-output'),
      callApi: jest.fn().mockResolvedValue({
        output: false,
        tokenUsage: { total: 5, prompt: 5, completion: 0, cached: 0 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProviderNoOutput],
      prompts: [toPrompt('Test prompt')],
      tests: [],
    };

    const summary = await evaluate(testSuite, {});

    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].success).toBe(true);
    expect(summary.results[0].score).toBe(1);
    expect(mockApiProviderNoOutput.callApi).toHaveBeenCalledTimes(1);
  });

  it('should apply prompt config to provider call', async () => {
    const mockApiProvider: ApiProvider = {
      id: jest.fn().mockReturnValue('test-provider'),
      callApi: jest.fn().mockResolvedValue({
        output: 'Test response',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [
        {
          raw: 'You are a helpful math tutor. Solve {{problem}}',
          label: 'Math problem',
          config: {
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'math_response',
                strict: true,
                schema: {
                  type: 'object',
                  properties: {
                    final_answer: { type: 'string' },
                  },
                  required: ['final_answer'],
                  additionalProperties: false,
                },
              },
            },
          },
        },
      ],
      tests: [{ vars: { problem: '8x + 31 = 2' } }],
    };

    const summary = await evaluate(testSuite, {});

    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(mockApiProvider.callApi).toHaveBeenCalledWith(
      'You are a helpful math tutor. Solve 8x + 31 = 2',
      expect.objectContaining({
        prompt: expect.objectContaining({
          config: {
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'math_response',
                strict: true,
                schema: {
                  type: 'object',
                  properties: {
                    final_answer: { type: 'string' },
                  },
                  required: ['final_answer'],
                  additionalProperties: false,
                },
              },
            },
          },
        }),
      }),
      expect.anything(),
    );
  });

  it('should call runExtensionHook with correct parameters at appropriate times', async () => {
    const mockExtension = 'file:./path/to/extension.js:extensionFunction';
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ var1 }}')],
      tests: [
        {
          vars: { var1: 'value1' },
          assert: [{ type: 'equals', value: 'Test output' }],
        },
      ],
      extensions: [mockExtension],
    };

    const mockedRunExtensionHook = jest.mocked(runExtensionHook);
    mockedRunExtensionHook.mockClear();

    await evaluate(testSuite, {});

    // Check if runExtensionHook was called 4 times (beforeAll, beforeEach, afterEach, afterAll)
    expect(mockedRunExtensionHook).toHaveBeenCalledTimes(4);

    // Check beforeAll call
    expect(mockedRunExtensionHook).toHaveBeenNthCalledWith(
      1,
      [mockExtension],
      'beforeAll',
      expect.objectContaining({ suite: testSuite }),
    );

    // Check beforeEach call
    expect(mockedRunExtensionHook).toHaveBeenNthCalledWith(
      2,
      [mockExtension],
      'beforeEach',
      expect.objectContaining({
        test: expect.objectContaining({
          vars: { var1: 'value1' },
          assert: [{ type: 'equals', value: 'Test output' }],
        }),
      }),
    );

    // Check afterEach call
    expect(mockedRunExtensionHook).toHaveBeenNthCalledWith(
      3,
      [mockExtension],
      'afterEach',
      expect.objectContaining({
        test: expect.objectContaining({
          vars: { var1: 'value1' },
          assert: [{ type: 'equals', value: 'Test output' }],
        }),
        result: expect.objectContaining({
          success: true,
          score: 1,
          response: expect.objectContaining({
            output: 'Test output',
          }),
        }),
      }),
    );

    // Check afterAll call
    expect(mockedRunExtensionHook).toHaveBeenNthCalledWith(
      4,
      [mockExtension],
      'afterAll',
      expect.objectContaining({
        results: expect.arrayContaining([
          expect.objectContaining({
            success: true,
            score: 1,
            response: expect.objectContaining({
              output: 'Test output',
            }),
          }),
        ]),
        suite: testSuite,
      }),
    );
  });
});

describe('generateVarCombinations', () => {
  it('should generate combinations for simple variables', () => {
    const vars = { language: 'English', greeting: 'Hello' };
    const expected = [{ language: 'English', greeting: 'Hello' }];
    expect(generateVarCombinations(vars)).toEqual(expected);
  });

  it('should generate combinations for array variables', () => {
    const vars = { language: ['English', 'French'], greeting: 'Hello' };
    const expected = [
      { language: 'English', greeting: 'Hello' },
      { language: 'French', greeting: 'Hello' },
    ];
    expect(generateVarCombinations(vars)).toEqual(expected);
  });

  it('should handle file paths and expand them into combinations', () => {
    const vars = { language: 'English', greeting: 'file:///path/to/greetings/*.txt' };
    jest.spyOn(glob, 'globSync').mockReturnValue(['greeting1.txt', 'greeting2.txt']);
    const expected = [
      { language: 'English', greeting: 'file://greeting1.txt' },
      { language: 'English', greeting: 'file://greeting2.txt' },
    ];
    expect(generateVarCombinations(vars)).toEqual(expected);
  });

  it('should correctly handle nested array variables', () => {
    const vars = {
      options: [
        ['opt1', 'opt2'],
        ['opt3', 'opt4'],
      ],
    };
    const expected = [
      {
        options: [
          ['opt1', 'opt2'],
          ['opt3', 'opt4'],
        ],
      },
    ];
    expect(generateVarCombinations(vars)).toEqual(expected);
  });

  it('should return an empty array for empty input', () => {
    const vars = {};
    const expected = [{}];
    expect(generateVarCombinations(vars)).toEqual(expected);
  });
});

describe('isAllowedPrompt', () => {
  const prompt1: Prompt = {
    label: 'prompt1',
    raw: '',
  };
  const prompt2: Prompt = {
    label: 'group1:prompt2',
    raw: '',
  };
  const prompt3: Prompt = {
    label: 'group2:prompt3',
    raw: '',
  };

  it('should return true if allowedPrompts is undefined', () => {
    expect(isAllowedPrompt(prompt1, undefined)).toBe(true);
  });

  it('should return true if allowedPrompts includes the prompt label', () => {
    expect(isAllowedPrompt(prompt1, ['prompt1', 'prompt2'])).toBe(true);
  });

  it('should return true if allowedPrompts includes a label that matches the start of the prompt label followed by a colon', () => {
    expect(isAllowedPrompt(prompt2, ['group1'])).toBe(true);
  });

  it('should return false if allowedPrompts does not include the prompt label or any matching start label with a colon', () => {
    expect(isAllowedPrompt(prompt3, ['group1', 'prompt2'])).toBe(false);
  });

  // TODO: What should the expected behavior of this test be?
  it('should return false if allowedPrompts is an empty array', () => {
    expect(isAllowedPrompt(prompt1, [])).toBe(false);
  });
});
