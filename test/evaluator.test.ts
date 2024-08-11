import { importModule } from '../src/esm';
import {
  evaluate,
  runExtensionHook,
} from '../src/evaluator';
import { renderPrompt } from '../src/evaluatorHelpers';
import { runPython } from '../src/python/pythonUtils';
import type { ApiProvider, TestSuite, Prompt } from '../src/types';

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

jest.mock('../src/python/pythonUtils', () => ({
  runPython: jest.fn(),
}));

jest.mock('../src/esm', () => ({
  importModule: jest.fn(),
}));

jest.mock('../src/database', () => ({
  getDb: jest.fn(),
}));
jest.mock('../src/logger');

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

describe('runExtensionHook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not run any extensions if none are provided', async () => {
    await runExtensionHook('beforeAll', { suite: {} as TestSuite });
    expect(runPython).not.toHaveBeenCalled();
    expect(importModule).not.toHaveBeenCalled();
  });

  it('should run a single Python extension', async () => {
    const mockSuite: TestSuite = { extensions: ['python:test_extension.py'] } as TestSuite;
    await runExtensionHook('beforeAll', { suite: mockSuite }, mockSuite.extensions);
    expect(runPython).toHaveBeenCalledTimes(1);
    expect(runPython).toHaveBeenCalledWith(
      expect.stringContaining('test_extension.py'),
      'extension_hook',
      ['beforeAll', { suite: mockSuite }],
    );
  });

  it('should run a single JavaScript extension', async () => {
    const mockExtensionFn = jest.fn();
    jest.mocked(importModule).mockResolvedValue(mockExtensionFn);

    const mockSuite: TestSuite = { extensions: ['file://test_extension.js'] } as TestSuite;
    await runExtensionHook('beforeAll', { suite: mockSuite }, mockSuite.extensions);

    expect(importModule).toHaveBeenCalledTimes(1);
    expect(importModule).toHaveBeenCalledWith(expect.stringContaining('test_extension.js'));
    expect(mockExtensionFn).toHaveBeenCalledWith('beforeAll', { suite: mockSuite });
  });

  it('should run multiple extensions of different types', async () => {
    const mockJsExtensionFn = jest.fn();
    jest.mocked(importModule).mockResolvedValue(mockJsExtensionFn);

    const mockSuite: TestSuite = {
      extensions: ['python:extension1.py', 'file://extension2.js'],
    } as TestSuite;
    await runExtensionHook('afterAll', { suite: mockSuite, results: {} }, mockSuite.extensions);

    expect(runPython).toHaveBeenCalledTimes(1);
    expect(runPython).toHaveBeenCalledWith(
      expect.stringContaining('extension1.py'),
      'extension_hook',
      ['afterAll', { suite: mockSuite, results: {} }],
    );

    expect(importModule).toHaveBeenCalledTimes(1);
    expect(importModule).toHaveBeenCalledWith(expect.stringContaining('extension2.js'));
    expect(mockJsExtensionFn).toHaveBeenCalledWith('afterAll', { suite: mockSuite, results: {} });
  });

  it('should handle JavaScript modules with default export', async () => {
    const mockDefaultExportFn = jest.fn();
    jest.mocked(importModule).mockResolvedValue({ default: mockDefaultExportFn });

    const mockSuite: TestSuite = { extensions: ['file://default_export.js'] } as TestSuite;
    await runExtensionHook('beforeEach', { test: {}, suite: mockSuite }, mockSuite.extensions);

    expect(importModule).toHaveBeenCalledTimes(1);
    expect(mockDefaultExportFn).toHaveBeenCalledWith('beforeEach', { test: {}, suite: mockSuite });
  });

  it('should throw an error for unsupported file formats', async () => {
    const mockSuite: TestSuite = { extensions: ['file://unsupported.txt'] } as TestSuite;

    await expect(
      runExtensionHook(
        'afterEach',
        { test: {}, result: {}, suite: mockSuite },
        mockSuite.extensions,
      ),
    ).rejects.toThrow('Unsupported extension file format: file://unsupported.txt');
  });

  it('should handle errors from extensions gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    jest.mocked(runPython).mockRejectedValueOnce(new Error('Python extension error'));
    jest.mocked(importModule).mockRejectedValueOnce(new Error('JavaScript extension error'));

    const mockSuite: TestSuite = {
      extensions: ['python:error.py', 'file://error.js'],
    } as TestSuite;

    await runExtensionHook(
      'afterEach',
      { test: {}, result: {}, suite: mockSuite },
      mockSuite.extensions,
    );

    expect(consoleSpy).toHaveBeenCalledTimes(2);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Python extension error'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('JavaScript extension error'));

    consoleSpy.mockRestore();
  });
});

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

  it('should load external js files in renderPrompt and execute the exported function', async () => {
    const mockJsFunction = jest.fn().mockResolvedValue('JS function output');
    jest.mocked(importModule).mockResolvedValue(mockJsFunction);

    const vars = {
      jsVar: 'file://test.js',
    };

    const result = await renderPrompt(
      { raw: 'Test prompt with {{ jsVar }}' },
      vars,
      undefined,
      mockApiProvider,
    );

    expect(importModule).toHaveBeenCalledWith(expect.stringContaining('test.js'));
    expect(mockJsFunction).toHaveBeenCalledWith('jsVar', expect.any(String), vars, mockApiProvider);
    expect(result).toBe('Test prompt with JS function output');
  });

  it('should handle errors from extensions gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    jest.mocked(runPython).mockRejectedValueOnce(new Error('Python extension error'));
    jest.mocked(importModule).mockRejectedValueOnce(new Error('JavaScript extension error'));

    const mockSuite: TestSuite = {
      extensions: ['python:error.py', 'file://error.js'],
    } as TestSuite;

    await runExtensionHook(
      'afterEach',
      { test: {}, result: {}, suite: mockSuite },
      mockSuite.extensions,
    );

    expect(consoleSpy).toHaveBeenCalledTimes(2);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Python extension error'));
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('JavaScript extension error'));

    consoleSpy.mockRestore();
  });
});
