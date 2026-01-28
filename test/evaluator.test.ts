import { randomUUID } from 'crypto';
import fs from 'fs';

import { glob } from 'glob';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../src/cliState';
import { FILE_METADATA_KEY } from '../src/constants';
import {
  evaluate,
  formatVarsForDisplay,
  generateVarCombinations,
  isAllowedPrompt,
  runEval,
} from '../src/evaluator';
import { runExtensionHook } from '../src/evaluatorHelpers';
import logger from '../src/logger';
import { runDbMigrations } from '../src/migrate';
import Eval from '../src/models/eval';
import {
  type ApiProvider,
  type Prompt,
  ResultFailureReason,
  type TestSuite,
} from '../src/types/index';
import { processConfigFileReferences } from '../src/util/fileReference';
import { sleep } from '../src/util/time';
import { createEmptyTokenUsage } from '../src/util/tokenUsageUtils';

vi.mock('../src/util/transform', () => ({
  TransformInputType: {
    OUTPUT: 'output',
    VARS: 'vars',
  },
  // Provide a process shim for ESM compatibility in inline JavaScript code
  getProcessShim: vi.fn().mockReturnValue(process),
  transform: vi.fn().mockImplementation(async (code, input, context, _skipWrap, _inputType) => {
    if (typeof code === 'string' && code.includes('vars.transformed = true')) {
      return { ...input, transformed: true };
    }
    if (typeof code === 'string' && code.includes('vars.defaultTransform = true')) {
      return { ...input, defaultTransform: true };
    }
    // Handle the test transform cases
    if (typeof code === 'string') {
      // Handle simple concatenation transforms
      if (code === 'output + " postprocessed"') {
        return input + ' postprocessed';
      }
      // Handle JSON parsing transforms
      if (code === 'JSON.parse(output).value') {
        try {
          return JSON.parse(input).value;
        } catch {
          return input;
        }
      }
      // Handle template literal transforms
      if (code === '`Transformed: ${output}`') {
        return `Transformed: ${input}`;
      }
      if (code === '`ProviderTransformed: ${output}`') {
        return `ProviderTransformed: ${input}`;
      }
      if (code === '`Provider: ${output}`') {
        return `Provider: ${input}`;
      }
      if (code === '`Test: ${output}`') {
        return `Test: ${input}`;
      }
      if (code === '"testTransformed " + output') {
        return 'testTransformed ' + input;
      }
      if (code === '"defaultTestTransformed " + output') {
        return 'defaultTestTransformed ' + input;
      }
      // Handle transformVars cases
      if (code.includes('{ ...vars')) {
        if (code.includes('toUpperCase()')) {
          return { ...input, name: input.name.toUpperCase() };
        }
        if (code.includes('vars.age + 5')) {
          return { ...input, age: input.age + 5 };
        }
      }
      // Handle transformVars with return statement and context
      if (code.includes('return {') && code.includes('context.uuid')) {
        return {
          ...input,
          id: context?.uuid || 'mock-uuid',
          hasPrompt: Boolean(context?.prompt),
        };
      }
      // Handle transform with "Test: " prefix
      if (code === '"Test: " + output') {
        return 'Test: ' + input;
      }
      if (code === '"Provider: " + output') {
        return 'Provider: ' + input;
      }
      if (code === '"Transform: " + output') {
        return 'Transform: ' + input;
      }
      // Handle multiple transforms concatenation
      if (code === 'output + "-provider-test"') {
        return input + '-provider-test';
      }
      if (code === 'output + "-provider"') {
        return input + '-provider';
      }
      if (code === 'output + "-test"') {
        return input + '-test';
      }
      // Handle template literal transforms with backticks
      if (code === '`Transform: ${output}`') {
        return `Transform: ${input}`;
      }
      if (code === '`Postprocess: ${output}`') {
        return `Postprocess: ${input}`;
      }
      // Handle transformVars with test2UpperCase
      if (code.includes('test2UpperCase: vars.test2.toUpperCase()')) {
        return { ...input, test2UpperCase: input.test2.toUpperCase() };
      }
      // Handle metadata transforms
      if (code.includes('context?.metadata')) {
        if (code.includes('Output:') && context?.metadata) {
          return `Output: ${input}, Metadata: ${JSON.stringify(context.metadata)}`;
        }
        if (code.includes('Has metadata') && context?.metadata) {
          return `Has metadata: ${input}`;
        }
        if (code.includes('No metadata') && !context?.metadata) {
          return `No metadata: ${input}`;
        }
        if (
          code.includes('Empty metadata') &&
          context?.metadata &&
          Object.keys(context.metadata).length === 0
        ) {
          return `Empty metadata: ${input}`;
        }
        if (code.includes('All context') && context?.vars && context?.prompt && context?.metadata) {
          return `All context: ${input}`;
        }
        if (
          code.includes('Missing context') &&
          !(context?.vars && context?.prompt && context?.metadata)
        ) {
          return `Missing context: ${input}`;
        }
      }
    }
    return input;
  }),
}));

vi.mock('../src/util/fileReference', async () => {
  const actual = await vi.importActual<typeof import('../src/util/fileReference')>(
    '../src/util/fileReference',
  );
  return {
    ...actual,
    processConfigFileReferences: vi.fn().mockImplementation(async (config) => {
      if (
        typeof config === 'object' &&
        config !== null &&
        config.tests &&
        Array.isArray(config.tests)
      ) {
        const result = {
          ...config,
          tests: config.tests.map((test: any) => {
            return {
              ...test,
              vars:
                test.vars.var1 === 'file://test/fixtures/test_file.txt'
                  ? {
                      var1: '<h1>Sample Report</h1><p>This is a test report with some data for the year 2023.</p>',
                    }
                  : test.vars,
            };
          }),
        };
        return result;
      }
      return config;
    }),
  };
});

vi.mock('proxy-agent', () => ({
  ProxyAgent: vi.fn().mockImplementation(() => ({})),
}));
vi.mock('glob', () => {
  const globSync = vi.fn().mockImplementation((pattern) => {
    if (pattern.includes('test/fixtures/test_file.txt')) {
      return [pattern];
    }
    return [];
  });
  const hasMagic = vi.fn((pattern: string | string[]) => {
    const p = Array.isArray(pattern) ? pattern.join('') : pattern;
    return p.includes('*') || p.includes('?') || p.includes('[') || p.includes('{');
  });
  const glob = Object.assign(vi.fn(), { globSync, hasMagic, sync: globSync });
  return {
    default: { globSync, hasMagic },
    glob,
    globSync,
    hasMagic,
  };
});

vi.mock('../src/esm', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    importModule: vi.fn(),
  };
});

vi.mock('../src/evaluatorHelpers', async () => {
  const actual =
    await vi.importActual<typeof import('../src/evaluatorHelpers')>('../src/evaluatorHelpers');
  return {
    ...actual,
    runExtensionHook: vi.fn().mockImplementation((_extensions, _hookName, context) => context),
  };
});

vi.mock('../src/cliState', () => ({
  __esModule: true,
  default: {
    resume: false,
    basePath: '',
    webUI: false,
  },
}));

vi.mock('../src/models/prompt', () => ({
  generateIdFromPrompt: vi.fn((prompt) => `prompt-${prompt.label || 'default'}`),
}));

vi.mock('../src/util/time', async () => {
  const actual = await vi.importActual<typeof import('../src/util/time')>('../src/util/time');
  return {
    ...actual,
    sleep: vi.fn(),
  };
});

vi.mock('../src/util/fileExtensions', async () => {
  const actual = await vi.importActual<typeof import('../src/util/fileExtensions')>(
    '../src/util/fileExtensions',
  );
  return {
    ...actual,
    isImageFile: vi
      .fn()
      .mockImplementation((filePath) => filePath.endsWith('.jpg') || filePath.endsWith('.png')),
    isVideoFile: vi.fn().mockImplementation((filePath) => filePath.endsWith('.mp4')),
    isAudioFile: vi.fn().mockImplementation((filePath) => filePath.endsWith('.mp3')),
    isJavascriptFile: vi.fn().mockReturnValue(false),
  };
});

vi.mock('../src/util/functions/loadFunction', async () => {
  const actual = await vi.importActual<typeof import('../src/util/functions/loadFunction')>(
    '../src/util/functions/loadFunction',
  );
  return {
    ...actual,
    loadFunction: vi.fn().mockImplementation((options) => {
      if (options.filePath.includes('scoring')) {
        return Promise.resolve((_metrics: Record<string, number>) => ({
          pass: true,
          score: 0.75,
          reason: 'Custom scoring reason',
        }));
      }
      return Promise.resolve(() => {});
    }),
  };
});

const mockApiProvider: ApiProvider = {
  id: vi.fn().mockReturnValue('test-provider'),
  callApi: vi.fn().mockResolvedValue({
    output: 'Test output',
    tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
  }),
};

const mockApiProvider2: ApiProvider = {
  id: vi.fn().mockReturnValue('test-provider-2'),
  callApi: vi.fn().mockResolvedValue({
    output: 'Test output',
    tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
  }),
};

const mockReasoningApiProvider: ApiProvider = {
  id: vi.fn().mockReturnValue('test-reasoning-provider'),
  callApi: vi.fn().mockResolvedValue({
    output: 'Test output',
    tokenUsage: {
      total: 21,
      prompt: 9,
      completion: 12,
      cached: 0,
      numRequests: 1,
      completionDetails: { reasoning: 11, acceptedPrediction: 12, rejectedPrediction: 13 },
    },
  }),
};

const mockGradingApiProviderPasses: ApiProvider = {
  id: vi.fn().mockReturnValue('test-grading-provider'),
  callApi: vi.fn().mockResolvedValue({
    output: JSON.stringify({ pass: true, reason: 'Test grading output' }),
    tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
  }),
};

const mockGradingApiProviderFails: ApiProvider = {
  id: vi.fn().mockReturnValue('test-grading-provider'),
  callApi: vi.fn().mockResolvedValue({
    output: JSON.stringify({ pass: false, reason: 'Grading failed reason' }),
    tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
  }),
};

function toPrompt(text: string): Prompt {
  return { raw: text, label: text };
}

describe('evaluator', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset runExtensionHook to default implementation (other tests may have overridden it)
    vi.mocked(runExtensionHook).mockReset();
    vi.mocked(runExtensionHook).mockImplementation(
      async (_extensions, _hookName, context) => context,
    );
    // Reset cliState for each test to ensure clean state
    cliState.resume = false;
    cliState.basePath = '';
    cliState.webUI = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Reset cliState after each test
    cliState.resume = false;
    if (global.gc) {
      global.gc(); // Force garbage collection
    }
  });

  afterAll(() => {
    // Clear all module mocks to prevent any lingering state
    vi.restoreAllMocks();
    vi.resetModules();
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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(mockApiProvider.callApi).toHaveBeenCalledWith(
      'Test prompt value1 value2',
      expect.objectContaining({
        vars: { var1: 'value1', var2: 'value2' },
        test: testSuite.tests![0],
        prompt: expect.any(Object),
      }),
      undefined,
    );
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({
      total: 10,
      prompt: 5,
      completion: 5,
      cached: 0,
      numRequests: 1,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
      assertions: {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      },
    });
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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({
      total: 10,
      prompt: 5,
      completion: 5,
      cached: 0,
      numRequests: 1,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
      assertions: {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      },
    });
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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({
      total: 10,
      prompt: 5,
      completion: 5,
      cached: 0,
      numRequests: 1,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
      assertions: {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      },
    });
    expect(summary.results[0].prompt.raw).toBe('Test prompt value1 value2');
    expect(summary.results[0].prompt.label).toBe('Test prompt {{ var1.prop1 }} {{ var2 }}');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with vars from file', async () => {
    const originalReadFileSync = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((path) => {
      if (typeof path === 'string' && path.includes('test_file.txt')) {
        return '<h1>Sample Report</h1><p>This is a test report with some data for the year 2023.</p>';
      }
      return originalReadFileSync(path);
    });

    const evalHelpers = await import('../src/evaluatorHelpers');
    const originalRenderPrompt = evalHelpers.renderPrompt;

    const mockRenderPrompt = vi.spyOn(evalHelpers, 'renderPrompt');
    mockRenderPrompt.mockImplementation(async (prompt, vars) => {
      if (prompt.raw.includes('{{ var1 }}')) {
        return 'Test prompt <h1>Sample Report</h1><p>This is a test report with some data for the year 2023.</p>';
      }
      return originalRenderPrompt(prompt, vars);
    });

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ var1 }}')],
      tests: [
        {
          vars: { var1: 'file://test/fixtures/test_file.txt' },
        },
      ],
    };

    try {
      const processedTestSuite = await processConfigFileReferences(testSuite);
      const evalRecord = await Eval.create({}, processedTestSuite.prompts, { id: randomUUID() });
      await evaluate(processedTestSuite, evalRecord, {});
      const summary = await evalRecord.toEvaluateSummary();

      expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
      expect(mockApiProvider.callApi).toHaveBeenCalledWith(
        'Test prompt <h1>Sample Report</h1><p>This is a test report with some data for the year 2023.</p>',
        expect.anything(),
        undefined,
      );

      expect(summary.stats.successes).toBe(1);
      expect(summary.stats.failures).toBe(0);
      expect(summary.results[0].prompt.raw).toBe(
        'Test prompt <h1>Sample Report</h1><p>This is a test report with some data for the year 2023.</p>',
      );
      expect(summary.results[0].prompt.label).toBe('Test prompt {{ var1 }}');
      expect(summary.results[0].response?.output).toBe('Test output');
    } finally {
      mockRenderPrompt.mockRestore();
      fs.readFileSync = originalReadFileSync;
    }
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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({
      total: 10,
      prompt: 5,
      completion: 5,
      cached: 0,
      numRequests: 1,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
      assertions: {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      },
    });
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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(4);
    expect(summary.stats.successes).toBe(4);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({
      total: 40,
      prompt: 20,
      completion: 20,
      cached: 0,
      numRequests: 4,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
      assertions: {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      },
    });
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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);
    expect(summary.stats.successes).toBe(2);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({
      total: 20,
      prompt: 10,
      completion: 10,
      cached: 0,
      numRequests: 2,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
      assertions: {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      },
    });
    expect(summary.results[0].prompt.raw).toBe('Test prompt value1 value2');
    expect(summary.results[0].prompt.label).toBe('Test prompt {{ var1 }} {{ var2 }}');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate without tests', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({
      total: 10,
      prompt: 5,
      completion: 5,
      cached: 0,
      numRequests: 1,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
      assertions: {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      },
    });
    expect(summary.results[0].prompt.raw).toBe('Test prompt');
    expect(summary.results[0].prompt.label).toBe('Test prompt');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate without tests with multiple providers', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider, mockApiProvider, mockApiProvider],
      prompts: [toPrompt('Test prompt')],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(3);
    expect(summary.stats.successes).toBe(3);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({
      total: 30,
      prompt: 15,
      completion: 15,
      cached: 0,
      numRequests: 3,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
      assertions: {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      },
    });
    expect(summary.results[0].prompt.raw).toBe('Test prompt');
    expect(summary.results[0].prompt.label).toBe('Test prompt');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate for reasoning', async () => {
    const testSuite: TestSuite = {
      providers: [mockReasoningApiProvider],
      prompts: [toPrompt('Test prompt')],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockReasoningApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({
      total: 21,
      prompt: 9,
      completion: 12,
      cached: 0,
      numRequests: 1,
      completionDetails: {
        reasoning: 11,
        acceptedPrediction: 12,
        rejectedPrediction: 13,
      },
      assertions: {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      },
    });
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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe('Test output postprocessed');
  });

  it('evaluate with transform option - json provider', async () => {
    const mockApiJsonProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider-json'),
      callApi: vi.fn().mockResolvedValue({
        output: '{"output": "testing", "value": 123}',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiJsonProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe(123);
  });

  it('evaluate with provider transform', async () => {
    const mockApiProviderWithTransform: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider-transform'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Original output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();
    expect(summary).toEqual(
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

  it('evaluate with metadata passed to test transform', async () => {
    const mockApiProviderWithMetadata: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider-metadata'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        metadata: { responseTime: 123, modelVersion: 'v1.0' },
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProviderWithMetadata],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'equals',
              value: 'Output: Test output, Metadata: {"responseTime":123,"modelVersion":"v1.0"}',
            },
          ],
          options: {
            transform:
              'context?.metadata ? `Output: ${output}, Metadata: ${JSON.stringify(context.metadata)}` : output',
          },
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProviderWithMetadata.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe(
      'Output: Test output, Metadata: {"responseTime":123,"modelVersion":"v1.0"}',
    );
  });

  it('evaluate with metadata passed to test transform - no metadata case', async () => {
    const mockApiProviderNoMetadata: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider-no-metadata'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProviderNoMetadata],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'equals',
              value: 'No metadata: Test output',
            },
          ],
          options: {
            transform: 'context?.metadata ? `Has metadata: ${output}` : `No metadata: ${output}`',
          },
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProviderNoMetadata.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe('No metadata: Test output');
  });

  it('evaluate with metadata passed to test transform - empty metadata', async () => {
    const mockApiProviderEmptyMetadata: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider-empty-metadata'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        metadata: {},
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProviderEmptyMetadata],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'equals',
              value: 'Empty metadata: Test output',
            },
          ],
          options: {
            transform:
              '(context?.metadata && Object.keys(context.metadata).length === 0) ? `Empty metadata: ${output}` : output',
          },
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProviderEmptyMetadata.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe('Empty metadata: Test output');
  });

  it('evaluate with metadata preserved alongside other context properties', async () => {
    const mockApiProviderWithMetadata: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider-metadata-context'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        metadata: { modelInfo: 'gpt-4' },
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProviderWithMetadata],
      prompts: [toPrompt('Test {{ var }}')],
      tests: [
        {
          vars: { var: 'value' },
          assert: [
            {
              type: 'equals',
              value: 'All context: Test output',
            },
          ],
          options: {
            transform:
              '(Boolean(context?.vars) && Boolean(context?.prompt) && Boolean(context?.metadata)) ? `All context: ${output}` : `Missing context: ${output}`',
          },
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProviderWithMetadata.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe('All context: Test output');
  });

  it('evaluate with context in vars transform in defaultTest', async () => {
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Hello {{ name }}, your age is {{ age }}')],
      defaultTest: {
        options: {
          transformVars: `return {
              ...vars,
              // Test that context.uuid is available
              id: context.uuid,
              // Test that context.prompt is available but empty
              hasPrompt: Boolean(context.prompt)
            }`,
        },
      },
      tests: [
        {
          vars: {
            name: 'Alice',
            age: 25,
          },
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary).toEqual(
      expect.objectContaining({
        stats: expect.objectContaining({
          successes: 1,
          failures: 0,
        }),
        results: expect.arrayContaining([
          expect.objectContaining({
            vars: expect.objectContaining({
              id: expect.stringMatching(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
              ),
              hasPrompt: true,
            }),
          }),
        ]),
      }),
    );

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
  });

  it('evaluate with provider transform and test transform', async () => {
    const mockApiProviderWithTransform: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider-transform'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Original output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary).toEqual(
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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({
      total: 10,
      prompt: 5,
      completion: 5,
      cached: 0,
      numRequests: 1,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
      assertions: {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      },
    });
    expect(summary.results[0].prompt.raw).toBe('Test prompt 1');
    expect(summary.results[0].prompt.label).toBe('Test prompt 1');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with allowed prompts filtering', async () => {
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

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
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi
        .fn()
        .mockResolvedValueOnce({
          output: 'Hola mundo',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        })
        .mockResolvedValueOnce({
          output: 'Bonjour le monde',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);
    expect(summary.stats.successes).toBe(2);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe('Hola mundo');
    expect(summary.results[1].response?.output).toBe('Bonjour le monde');
  });

  it('evaluate with scenarios and multiple vars', async () => {
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi
        .fn()
        .mockResolvedValueOnce({
          output: 'Spanish Hola',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        })
        .mockResolvedValueOnce({
          output: 'Spanish Bonjour',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        })
        .mockResolvedValueOnce({
          output: 'French Hola',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        })
        .mockResolvedValueOnce({
          output: 'French Bonjour',
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

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
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Hello, World',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();
    expect(summary).toMatchObject({
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

    expect(summary.results[0].testCase.metadata).toEqual({
      defaultKey: 'defaultValue',
      configKey: 'configValue',
      testKey: 'testValue',
      conversationId: '__scenario_0__', // Auto-generated for scenario isolation
    });

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);
  });

  it('evaluator should correctly count named scores based on contributing assertions', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt for namedScoresCount')],
      tests: [
        {
          vars: { var1: 'value1' },
          assert: [
            {
              type: 'equals',
              value: 'Test output',
              metric: 'Accuracy',
            },
            {
              type: 'contains',
              value: 'Test',
              metric: 'Accuracy',
            },
            {
              type: 'javascript',
              value: 'output.length > 0',
              metric: 'Completeness',
            },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.results).toHaveLength(1);
    const result = summary.results[0];

    // Use toMatchObject pattern to avoid conditional expects
    expect(evalRecord.prompts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: result.provider.id,
          metrics: expect.objectContaining({
            namedScoresCount: expect.objectContaining({
              Accuracy: 2,
              Completeness: 1,
            }),
          }),
        }),
      ]),
    );
  });

  it('evaluator should correctly count named scores with template metric variables', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt for template metrics')],
      tests: [
        {
          vars: { metricCategory: 'Accuracy' },
          assert: [
            {
              type: 'equals',
              value: 'Test output',
              metric: '{{metricCategory}}',
            },
            {
              type: 'contains',
              value: 'Test',
              metric: '{{metricCategory}}',
            },
          ],
        },
        {
          vars: { metricCategory: 'Accuracy' },
          assert: [
            {
              type: 'javascript',
              value: 'output.length > 0',
              metric: '{{metricCategory}}',
            },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(evalRecord.prompts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metrics: expect.objectContaining({
            namedScores: expect.objectContaining({
              Accuracy: expect.any(Number),
            }),
            namedScoresCount: expect.objectContaining({
              Accuracy: 3, // 2 assertions in first test + 1 in second
            }),
          }),
        }),
      ]),
    );
  });

  it('evaluator should handle mixed static and template metrics correctly', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test mixed metrics')],
      tests: [
        {
          vars: { category: 'Dynamic' },
          assert: [
            {
              type: 'equals',
              value: 'Test output',
              metric: '{{category}}',
            },
            {
              type: 'contains',
              value: 'Test',
              metric: 'Static',
            },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(evalRecord.prompts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metrics: expect.objectContaining({
            namedScoresCount: expect.objectContaining({
              Dynamic: 1,
              Static: 1,
            }),
          }),
        }),
      ]),
    );
  });

  it('evaluator should calculate derived metrics with __count variable for averages', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt for derived metrics')],
      tests: [
        {
          vars: { errorValue: 0.1 },
          assert: [
            {
              type: 'javascript',
              value: 'context.vars.errorValue',
              metric: 'APE',
            },
          ],
        },
        {
          vars: { errorValue: 0.2 },
          assert: [
            {
              type: 'javascript',
              value: 'context.vars.errorValue',
              metric: 'APE',
            },
          ],
        },
        {
          vars: { errorValue: 0.3 },
          assert: [
            {
              type: 'javascript',
              value: 'context.vars.errorValue',
              metric: 'APE',
            },
          ],
        },
      ],
      derivedMetrics: [
        {
          name: 'APE_sum',
          value: 'APE', // Should be 0.1 + 0.2 + 0.3 = 0.6
        },
        {
          name: 'MAPE',
          value: 'APE / __count', // Should be 0.6 / 3 = 0.2
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    const metrics = evalRecord.prompts[0]?.metrics;
    expect(metrics).toBeDefined();
    expect(metrics!.namedScores.APE).toBeCloseTo(0.6, 10);
    expect(metrics!.namedScores.APE_sum).toBeCloseTo(0.6, 10);
    expect(metrics!.namedScores.MAPE).toBeCloseTo(0.2, 10);
  });

  it('evaluator should pass __count to JavaScript function derived metrics', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt for function derived metrics')],
      tests: [
        {
          vars: { score: 10 },
          assert: [{ type: 'javascript', value: 'context.vars.score', metric: 'Score' }],
        },
        {
          vars: { score: 20 },
          assert: [{ type: 'javascript', value: 'context.vars.score', metric: 'Score' }],
        },
      ],
      derivedMetrics: [
        {
          name: 'AverageScore',
          value: (namedScores: Record<string, number>) => {
            // __count should be available in namedScores
            const count = namedScores.__count || 1;
            return namedScores.Score / count;
          },
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(evalRecord.prompts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metrics: expect.objectContaining({
            namedScores: expect.objectContaining({
              Score: 30, // 10 + 20
              AverageScore: 15, // 30 / 2
            }),
          }),
        }),
      ]),
    );
  });

  it('evaluator should calculate __count per-prompt with multiple prompts', async () => {
    // With 2 prompts and 3 tests, each prompt should have __count = 3 (not 6)
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('First prompt'), toPrompt('Second prompt')],
      tests: [
        {
          vars: { errorValue: 0.1 },
          assert: [{ type: 'javascript', value: 'context.vars.errorValue', metric: 'APE' }],
        },
        {
          vars: { errorValue: 0.2 },
          assert: [{ type: 'javascript', value: 'context.vars.errorValue', metric: 'APE' }],
        },
        {
          vars: { errorValue: 0.3 },
          assert: [{ type: 'javascript', value: 'context.vars.errorValue', metric: 'APE' }],
        },
      ],
      derivedMetrics: [
        {
          name: 'MAPE',
          value: 'APE / __count', // Should be 0.6 / 3 = 0.2 for each prompt
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    // Both prompts should have the same MAPE since they each get 3 test evaluations
    const metrics0 = evalRecord.prompts[0]?.metrics;
    const metrics1 = evalRecord.prompts[1]?.metrics;
    expect(metrics0).toBeDefined();
    expect(metrics1).toBeDefined();
    expect(metrics0!.namedScores.APE).toBeCloseTo(0.6, 10);
    expect(metrics0!.namedScores.MAPE).toBeCloseTo(0.2, 10); // 0.6 / 3, not 0.6 / 6
    expect(metrics1!.namedScores.APE).toBeCloseTo(0.6, 10);
    expect(metrics1!.namedScores.MAPE).toBeCloseTo(0.2, 10); // 0.6 / 3, not 0.6 / 6
  });

  it('evaluator should calculate __count per-prompt with multiple providers', async () => {
    // With 1 prompt and 2 providers, there are 2 prompt entries (one per provider).
    // Each prompt entry gets 2 test evaluations, so __count = 2 for each.
    const mockProvider1: ApiProvider = {
      id: () => 'provider1',
      callApi: async () => ({ output: 'response1' }),
    };
    const mockProvider2: ApiProvider = {
      id: () => 'provider2',
      callApi: async () => ({ output: 'response2' }),
    };
    const testSuite: TestSuite = {
      providers: [mockProvider1, mockProvider2],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          vars: { errorValue: 0.1 },
          assert: [{ type: 'javascript', value: 'context.vars.errorValue', metric: 'APE' }],
        },
        {
          vars: { errorValue: 0.2 },
          assert: [{ type: 'javascript', value: 'context.vars.errorValue', metric: 'APE' }],
        },
      ],
      derivedMetrics: [
        {
          name: 'MAPE',
          value: 'APE / __count', // 0.3 / 2 = 0.15 for each provider's prompt
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    // With 2 providers, there are 2 prompt entries (one per provider)
    expect(evalRecord.prompts).toHaveLength(2);

    // Each prompt entry has its own metrics from its 2 test evaluations
    const metrics0 = evalRecord.prompts[0]?.metrics;
    const metrics1 = evalRecord.prompts[1]?.metrics;
    expect(metrics0).toBeDefined();
    expect(metrics1).toBeDefined();
    // Each provider's prompt gets APE = 0.3 (0.1 + 0.2)
    expect(metrics0!.namedScores.APE).toBeCloseTo(0.3, 10);
    expect(metrics1!.namedScores.APE).toBeCloseTo(0.3, 10);
    // __count = 2 (tests per provider), so MAPE = 0.3 / 2 = 0.15
    expect(metrics0!.namedScores.MAPE).toBeCloseTo(0.15, 10);
    expect(metrics1!.namedScores.MAPE).toBeCloseTo(0.15, 10);
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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const results = await evalRecord.getResults();
    expect(results[0].testCase.metadata).toEqual({
      defaultKey: 'defaultValue',
      testKey: 'testValue',
    });
  });

  it('merges response metadata with test metadata', async () => {
    const mockProviderWithMetadata: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider-with-metadata'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        metadata: { responseKey: 'responseValue' },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockProviderWithMetadata],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          metadata: { testKey: 'testValue' },
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const results = await evalRecord.getResults();

    // Check that both test metadata and response metadata are present in the result
    expect(results[0].metadata).toEqual({
      testKey: 'testValue',
      responseKey: 'responseValue',
      [FILE_METADATA_KEY]: {},
    });
  });

  it('evaluate with _conversation variable', async () => {
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockImplementation((prompt) =>
        Promise.resolve({
          output: prompt,
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        }),
      ),
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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

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
      callApi: vi.fn().mockResolvedValue({
        output: 'Labeled Provider Output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const mockUnlabeledProvider: ApiProvider = {
      id: () => 'unlabeled-provider-id',
      callApi: vi.fn().mockResolvedValue({
        output: 'Unlabeled Provider Output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();
    expect(summary).toMatchObject({
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
    });
    expect(evalRecord.prompts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'Labeled Provider',
        }),
        expect.objectContaining({
          provider: 'unlabeled-provider-id',
        }),
      ]),
    );

    expect(mockLabeledProvider.callApi).toHaveBeenCalledTimes(1);
    expect(mockUnlabeledProvider.callApi).toHaveBeenCalledTimes(1);
  });

  it('evaluate with test-level providers filter', async () => {
    const mockProvider1: ApiProvider = {
      id: () => 'provider-1',
      label: 'fast-model',
      callApi: vi.fn().mockResolvedValue({
        output: 'Fast Output',
        tokenUsage: { total: 5, prompt: 2, completion: 3, cached: 0, numRequests: 1 },
      }),
    };

    const mockProvider2: ApiProvider = {
      id: () => 'provider-2',
      label: 'smart-model',
      callApi: vi.fn().mockResolvedValue({
        output: 'Smart Output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockProvider1, mockProvider2],
      prompts: [{ raw: 'Test prompt', label: 'prompt1' }],
      tests: [
        {
          description: 'fast test',
          vars: { input: 'simple' },
          providers: ['fast-model'], // Only run on fast-model
        },
        {
          description: 'smart test',
          vars: { input: 'complex' },
          providers: ['smart-model'], // Only run on smart-model
        },
        {
          description: 'all providers test',
          vars: { input: 'general' },
          // No providers filter - runs on both
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    // 1 test on fast-model + 1 test on smart-model + 2 tests (1 on each provider) = 4 total
    expect(summary.stats.successes).toBe(4);
    expect(mockProvider1.callApi).toHaveBeenCalledTimes(2); // fast test + all providers test
    expect(mockProvider2.callApi).toHaveBeenCalledTimes(2); // smart test + all providers test
  });

  it('evaluate with test-level providers filter using wildcard', async () => {
    const openaiProvider: ApiProvider = {
      id: () => 'openai:gpt-4',
      callApi: vi.fn().mockResolvedValue({
        output: 'OpenAI Output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const anthropicProvider: ApiProvider = {
      id: () => 'anthropic:claude-3',
      callApi: vi.fn().mockResolvedValue({
        output: 'Anthropic Output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [openaiProvider, anthropicProvider],
      prompts: [{ raw: 'Test prompt', label: 'prompt1' }],
      tests: [
        {
          vars: { input: 'test' },
          providers: ['openai:*'], // Wildcard - only run on openai providers
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(1);
    expect(openaiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(anthropicProvider.callApi).toHaveBeenCalledTimes(0);
  });

  it('evaluate inherits providers filter from defaultTest', async () => {
    const provider1: ApiProvider = {
      id: () => 'provider-1',
      label: 'default-provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'Output 1',
        tokenUsage: { total: 5, prompt: 2, completion: 3, cached: 0, numRequests: 1 },
      }),
    };

    const provider2: ApiProvider = {
      id: () => 'provider-2',
      label: 'other-provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'Output 2',
        tokenUsage: { total: 5, prompt: 2, completion: 3, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [provider1, provider2],
      prompts: [{ raw: 'Test prompt', label: 'prompt1' }],
      defaultTest: {
        providers: ['default-provider'], // Default to only default-provider
      },
      tests: [
        {
          vars: { input: 'test1' },
          // Inherits providers filter from defaultTest
        },
        {
          vars: { input: 'test2' },
          providers: ['other-provider'], // Override defaultTest
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(2);
    expect(provider1.callApi).toHaveBeenCalledTimes(1); // test1 only
    expect(provider2.callApi).toHaveBeenCalledTimes(1); // test2 only
  });

  it('evaluate with empty providers array blocks all providers', async () => {
    const mockProvider: ApiProvider = {
      id: () => 'test-provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'Output',
        tokenUsage: { total: 5, prompt: 2, completion: 3, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockProvider],
      prompts: [{ raw: 'Test prompt', label: 'prompt1' }],
      tests: [
        {
          vars: { input: 'test' },
          providers: [], // Empty array = block all
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(0);
    expect(mockProvider.callApi).toHaveBeenCalledTimes(0);
  });

  it('evaluate with providers filter and providerPromptMap combined', async () => {
    const provider1: ApiProvider = {
      id: () => 'provider-1',
      label: 'provider-one',
      callApi: vi.fn().mockResolvedValue({
        output: 'Output 1',
        tokenUsage: { total: 5, prompt: 2, completion: 3, cached: 0, numRequests: 1 },
      }),
    };

    const provider2: ApiProvider = {
      id: () => 'provider-2',
      label: 'provider-two',
      callApi: vi.fn().mockResolvedValue({
        output: 'Output 2',
        tokenUsage: { total: 5, prompt: 2, completion: 3, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [provider1, provider2],
      prompts: [
        { raw: 'Prompt A', label: 'prompt-a' },
        { raw: 'Prompt B', label: 'prompt-b' },
      ],
      providerPromptMap: {
        'provider-one': ['prompt-a'], // provider-one only runs prompt-a
        'provider-two': ['prompt-b'], // provider-two only runs prompt-b
      },
      tests: [
        {
          vars: { input: 'test' },
          providers: ['provider-one'], // Only run on provider-one
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    // providers filter limits to provider-one
    // providerPromptMap limits provider-one to prompt-a
    // Result: 1 test case (provider-one + prompt-a)
    expect(summary.stats.successes).toBe(1);
    expect(provider1.callApi).toHaveBeenCalledTimes(1);
    expect(provider2.callApi).toHaveBeenCalledTimes(0);
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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe('Test output postprocessed');
  });

  it('evaluate with multiple transforms', async () => {
    const mockApiProviderWithTransform: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider-transform'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Original output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProviderWithTransform.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].response?.output).toBe('Test: Provider: Original output');
  });

  it('evaluate with provider transform and test postprocess (deprecated)', async () => {
    const mockApiProviderWithTransform: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider-transform'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Original output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();
    expect(summary).toMatchObject({
      stats: expect.objectContaining({
        successes: 1,
        failures: 0,
      }),
    });
    expect(summary.results[0].response?.output).toBe('Postprocess: Provider: Original output');

    expect(mockApiProviderWithTransform.callApi).toHaveBeenCalledTimes(1);
  });

  it('evaluate with provider transform, test transform, and test postprocess (deprecated)', async () => {
    const mockApiProviderWithTransform: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider-transform'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Original output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();
    expect(summary).toMatchObject({
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
    });
    expect(mockApiProviderWithTransform.callApi).toHaveBeenCalledTimes(1);
  });

  it('evaluate with no output', async () => {
    const mockApiProviderNoOutput: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider-no-output'),
      callApi: vi.fn().mockResolvedValue({
        output: null,
        tokenUsage: { total: 5, prompt: 5, completion: 0, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProviderNoOutput],
      prompts: [toPrompt('Test prompt')],
      tests: [],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(0);
    expect(summary.stats.failures).toBe(1);
    expect(summary.results[0].error).toBe('No output');
    expect(summary.results[0].success).toBe(false);
    expect(summary.results[0].score).toBe(0);
    expect(mockApiProviderNoOutput.callApi).toHaveBeenCalledTimes(1);
  });

  it('evaluate with false output', async () => {
    const mockApiProviderNoOutput: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider-no-output'),
      callApi: vi.fn().mockResolvedValue({
        output: false,
        tokenUsage: { total: 5, prompt: 5, completion: 0, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProviderNoOutput],
      prompts: [toPrompt('Test prompt')],
      tests: [],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].success).toBe(true);
    expect(summary.results[0].score).toBe(1);
    expect(mockApiProviderNoOutput.callApi).toHaveBeenCalledTimes(1);
  });

  it('should apply max-score to overall pass/fail and stats', async () => {
    const maxScoreProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('max-score-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'hello world',
        tokenUsage: { total: 1, prompt: 1, completion: 0, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [maxScoreProvider],
      prompts: [toPrompt('Prompt A'), toPrompt('Prompt B')],
      tests: [
        {
          assert: [{ type: 'contains', value: 'hello' }, { type: 'max-score' }],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();
    const results = summary.results
      .filter((result) => result.testIdx === 0)
      .sort((a, b) => a.promptIdx - b.promptIdx);

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[1].failureReason).toBe(ResultFailureReason.ASSERT);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(1);
    expect(summary.stats.errors).toBe(0);
  });

  it('should apply select-best to overall pass/fail and stats', async () => {
    // Mock matchesSelectBest to return deterministic results (first wins, second loses)
    const matchers = await import('../src/matchers');
    const matchesSelectBestSpy = vi.spyOn(matchers, 'matchesSelectBest').mockResolvedValue([
      { pass: true, score: 1, reason: 'Selected as best' },
      { pass: false, score: 0, reason: 'Not selected' },
    ]);

    try {
      const selectBestProvider: ApiProvider = {
        id: vi.fn().mockReturnValue('select-best-provider'),
        callApi: vi.fn().mockResolvedValue({
          output: 'hello world',
          tokenUsage: { total: 1, prompt: 1, completion: 0, cached: 0, numRequests: 1 },
        }),
      };

      const testSuite: TestSuite = {
        providers: [selectBestProvider],
        prompts: [toPrompt('Prompt A'), toPrompt('Prompt B')],
        tests: [
          {
            assert: [
              { type: 'contains', value: 'hello' },
              { type: 'select-best', value: 'choose the best one' },
            ],
          },
        ],
      };

      const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
      await evaluate(testSuite, evalRecord, {});
      const summary = await evalRecord.toEvaluateSummary();
      const results = summary.results
        .filter((result) => result.testIdx === 0)
        .sort((a, b) => a.promptIdx - b.promptIdx);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].failureReason).toBe(ResultFailureReason.ASSERT);
      expect(summary.stats.successes).toBe(1);
      expect(summary.stats.failures).toBe(1);
      expect(summary.stats.errors).toBe(0);
    } finally {
      matchesSelectBestSpy.mockRestore();
    }
  });

  it('should apply prompt config to provider call', async () => {
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test response',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
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
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

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
                schema: {
                  type: 'object',
                  properties: { final_answer: { type: 'string' } },
                  required: ['final_answer'],
                  additionalProperties: false,
                },
                strict: true,
              },
            },
          },
        }),
      }),
      undefined,
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

    const mockedRunExtensionHook = vi.mocked(runExtensionHook);
    mockedRunExtensionHook.mockClear();
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

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
        prompts: expect.arrayContaining([
          expect.objectContaining({
            raw: 'Test prompt {{ var1 }}',
            metrics: expect.objectContaining({
              assertPassCount: 1,
              assertFailCount: 0,
            }),
          }),
          expect.objectContaining({
            raw: 'Test prompt {{ var1 }}',
            metrics: expect.objectContaining({
              assertPassCount: 1,
              assertFailCount: 0,
            }),
          }),
        ]),
        results: expect.any(Array),
        suite: testSuite,
      }),
    );
  });

  it('should handle multiple providers', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider, mockApiProvider2],
      prompts: [toPrompt('Test prompt')],
      tests: [],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(2);
    expect(summary.stats.failures).toBe(0);
    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(mockApiProvider2.callApi).toHaveBeenCalledTimes(1);
  });

  it('merges defaultTest.vars before applying transformVars', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ test1 }} {{ test2 }} {{ test2UpperCase }}')],
      defaultTest: {
        vars: {
          test2: 'bar',
        },
        options: {
          transformVars: `
            return {
              ...vars,
              test2UpperCase: vars.test2.toUpperCase()
            };
          `,
        },
      },
      tests: [
        {
          vars: {
            test1: 'foo',
          },
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);

    // Check that vars were merged correctly and transform was applied
    expect(summary.results[0].vars).toEqual({
      test1: 'foo',
      test2: 'bar',
      test2UpperCase: 'BAR',
    });

    // Verify the prompt was rendered with all variables
    expect(summary.results[0].prompt.raw).toBe('Test prompt foo bar BAR');
  });

  it('should maintain separate conversation histories based on metadata.conversationId', async () => {
    const mockApiProvider = {
      id: () => 'test-provider',
      callApi: vi.fn().mockImplementation((_prompt) => ({
        output: 'Test output',
      })),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [
        {
          raw: '{% for completion in _conversation %}User: {{ completion.input }}\nAssistant: {{ completion.output }}\n{% endfor %}User: {{ question }}',
          label: 'Conversation test',
        },
      ],
      tests: [
        // First conversation
        {
          vars: { question: 'Question 1A' },
          metadata: { conversationId: 'conversation1' },
        },
        {
          vars: { question: 'Question 1B' },
          metadata: { conversationId: 'conversation1' },
        },
        // Second conversation
        {
          vars: { question: 'Question 2A' },
          metadata: { conversationId: 'conversation2' },
        },
        {
          vars: { question: 'Question 2B' },
          metadata: { conversationId: 'conversation2' },
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    // Check that the API was called with the correct prompts
    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(4);

    // First conversation, first question
    expect(mockApiProvider.callApi).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('User: Question 1A'),
      expect.anything(),
      undefined,
    );

    // First conversation, second question (should include history)
    expect(mockApiProvider.callApi).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('User: Question 1A\nAssistant: Test output\nUser: Question 1B'),
      expect.anything(),
      undefined,
    );

    // Second conversation, first question (should NOT include first conversation)
    expect(mockApiProvider.callApi).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('User: Question 2A'),
      expect.anything(),
      undefined,
    );

    // Second conversation, second question (should only include second conversation history)
    expect(mockApiProvider.callApi).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('User: Question 2A\nAssistant: Test output\nUser: Question 2B'),
      expect.anything(),
      undefined,
    );
  });

  it('should maintain separate conversation histories between scenarios without explicit conversationId', async () => {
    // This test verifies the fix for GitHub issue #384:
    // Scenarios should have isolated _conversation state by default
    const mockApiProvider = {
      id: () => 'test-provider',
      callApi: vi.fn().mockImplementation((_prompt) => ({
        output: 'Test output',
      })),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [
        {
          raw: '{% for completion in _conversation %}Previous: {{ completion.input }} -> {{ completion.output }}\n{% endfor %}Current: {{ question }}',
          label: 'Conversation test',
        },
      ],
      scenarios: [
        {
          // First scenario - conversation about books
          config: [{}],
          tests: [
            { vars: { question: 'Recommend a sci-fi book' } },
            { vars: { question: 'Tell me more about it' } },
          ],
        },
        {
          // Second scenario - conversation about recipes
          // Should NOT include history from first scenario
          config: [{}],
          tests: [
            { vars: { question: 'Suggest a pasta recipe' } },
            { vars: { question: 'How long does it take?' } },
          ],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(4);

    // First scenario, first question - no history
    const firstCall = mockApiProvider.callApi.mock.calls[0][0];
    expect(firstCall).toContain('Current: Recommend a sci-fi book');
    expect(firstCall).not.toContain('Previous:');

    // First scenario, second question - should have first scenario's history
    const secondCall = mockApiProvider.callApi.mock.calls[1][0];
    expect(secondCall).toContain('Previous: ');
    expect(secondCall).toContain('Recommend a sci-fi book');
    expect(secondCall).toContain('Current: Tell me more about it');

    // Second scenario, first question - should NOT have first scenario's history
    // This is the key assertion that verifies the fix for issue #384
    const thirdCall = mockApiProvider.callApi.mock.calls[2][0];
    expect(thirdCall).toContain('Current: Suggest a pasta recipe');
    expect(thirdCall).not.toContain('Previous:');
    expect(thirdCall).not.toContain('sci-fi');
    expect(thirdCall).not.toContain('Recommend');

    // Second scenario, second question - should only have second scenario's history
    const fourthCall = mockApiProvider.callApi.mock.calls[3][0];
    expect(fourthCall).toContain('Previous: ');
    expect(fourthCall).toContain('Suggest a pasta recipe');
    expect(fourthCall).toContain('Current: How long does it take?');
    expect(fourthCall).not.toContain('sci-fi');
  });

  it('should allow scenarios to share conversation history with explicit conversationId', async () => {
    // This test verifies that users can still explicitly share conversations across scenarios
    const mockApiProvider = {
      id: () => 'test-provider',
      callApi: vi.fn().mockImplementation((_prompt) => ({
        output: 'Test output',
      })),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [
        {
          raw: '{% for completion in _conversation %}Previous: {{ completion.input }}\n{% endfor %}Current: {{ question }}',
          label: 'Conversation test',
        },
      ],
      scenarios: [
        {
          config: [{}],
          tests: [
            {
              vars: { question: 'Question from scenario 1' },
              metadata: { conversationId: 'shared-conversation' },
            },
          ],
        },
        {
          config: [{}],
          tests: [
            {
              vars: { question: 'Question from scenario 2' },
              metadata: { conversationId: 'shared-conversation' },
            },
          ],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);

    // First scenario - no history
    const firstCall = mockApiProvider.callApi.mock.calls[0][0];
    expect(firstCall).not.toContain('Previous:');

    // Second scenario - SHOULD have first scenario's history because they share conversationId
    const secondCall = mockApiProvider.callApi.mock.calls[1][0];
    expect(secondCall).toContain('Previous: ');
    expect(secondCall).toContain('Question from scenario 1');
  });

  it('evaluates with provider delay', async () => {
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      delay: 100,
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(sleep).toHaveBeenCalledWith(100);
    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
  });

  it('evaluates with no provider delay', async () => {
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(mockApiProvider.delay).toBe(0);
    expect(sleep).not.toHaveBeenCalled();
    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
  });

  it('skips delay for cached responses', async () => {
    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      delay: 100,
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        cached: true,
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(sleep).not.toHaveBeenCalled();
    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
  });

  it('handles circular references when logging errors during result saving', async () => {
    // Create a circular reference object that would cause JSON.stringify to fail
    type CircularType = { prop: string; self?: CircularType };
    const circularObj: CircularType = { prop: 'value' };
    circularObj.self = circularObj;

    const mockApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    // Mock Eval.prototype.addResult to throw an error
    const mockAddResult = vi.fn().mockRejectedValue(new Error('Mock save error'));
    const originalAddResult = Eval.prototype.addResult;
    Eval.prototype.addResult = mockAddResult;

    // Create a test suite that will generate a result with a circular reference
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          vars: { circular: circularObj },
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    const errorSpy = vi.spyOn(logger, 'error');
    await evaluate(testSuite, evalRecord, {});
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error saving result: Error: Mock save error'),
    );
    Eval.prototype.addResult = originalAddResult;
    errorSpy.mockRestore();
  });

  it('evaluate with assertScoringFunction', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assertScoringFunction: 'file://path/to/scoring.js:customScore',
          assert: [
            {
              type: 'equals',
              value: 'Test output',
              metric: 'accuracy',
            },
            {
              type: 'contains',
              value: 'output',
              metric: 'relevance',
            },
          ],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.results[0].score).toBe(0.75);
  });

  it('evaluate with provider error response', async () => {
    const mockApiProviderWithError: ApiProvider = {
      id: vi.fn().mockReturnValue('test-provider-error'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Some output',
        error: 'API error occurred',
        tokenUsage: { total: 5, prompt: 5, completion: 0, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      providers: [mockApiProviderWithError],
      prompts: [toPrompt('Test prompt')],
      tests: [],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary).toEqual(
      expect.objectContaining({
        stats: expect.objectContaining({
          successes: 0,
          errors: 1,
          failures: 0,
        }),
        results: expect.arrayContaining([
          expect.objectContaining({
            error: 'API error occurred',
            failureReason: ResultFailureReason.ERROR,
            success: false,
            score: 0,
          }),
        ]),
      }),
    );
    expect(mockApiProviderWithError.callApi).toHaveBeenCalledTimes(1);
  });

  it('should handle evaluation timeout', async () => {
    const mockAddResult = vi.fn().mockResolvedValue(undefined);
    let longTimer: NodeJS.Timeout | null = null;

    const slowApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('slow-provider'),
      callApi: vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          longTimer = setTimeout(() => {
            resolve({
              output: 'Slow response',
              tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
            });
          }, 5000);
        });
      }),
      cleanup: vi.fn(),
    };

    const mockEval = {
      id: 'mock-eval-id',
      results: [],
      prompts: [],
      persisted: false,
      config: {},
      addResult: mockAddResult,
      addPrompts: vi.fn().mockResolvedValue(undefined),
      fetchResultsByTestIdx: vi.fn().mockResolvedValue([]),
      getResults: vi.fn().mockResolvedValue([]),
      toEvaluateSummary: vi.fn().mockResolvedValue({
        results: [],
        prompts: [],
        stats: {
          successes: 0,
          failures: 0,
          errors: 1,
          tokenUsage: createEmptyTokenUsage(),
        },
      }),
      save: vi.fn().mockResolvedValue(undefined),
      setVars: vi.fn().mockResolvedValue(undefined),
      setDurationMs: vi.fn(),
    };

    const testSuite: TestSuite = {
      providers: [slowApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };

    try {
      const evalPromise = evaluate(testSuite, mockEval as unknown as Eval, { timeoutMs: 100 });
      await evalPromise;

      expect(slowApiProvider.callApi).toHaveBeenCalledWith(
        'Test prompt',
        expect.anything(),
        expect.objectContaining({
          abortSignal: expect.any(AbortSignal),
        }),
      );

      expect(mockAddResult).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('Evaluation timed out after 100ms'),
          success: false,
          failureReason: ResultFailureReason.ERROR,
        }),
      );

      expect(slowApiProvider.cleanup).toHaveBeenCalledWith();
    } finally {
      if (longTimer) {
        clearTimeout(longTimer);
      }
    }
  });

  it('should honor external abortSignal when timeoutMs is set', async () => {
    const mockAddResult = vi.fn().mockResolvedValue(undefined);
    let longTimer: NodeJS.Timeout | null = null;
    let abortTimer: NodeJS.Timeout | null = null;
    const abortController = new AbortController();

    const slowApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('slow-provider'),
      callApi: vi.fn().mockImplementation((_, __, opts) => {
        return new Promise((resolve, reject) => {
          longTimer = setTimeout(() => {
            resolve({
              output: 'Slow response',
              tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
            });
          }, 200);

          abortTimer = setTimeout(() => {
            abortController.abort();
          }, 10);

          opts?.abortSignal?.addEventListener('abort', () => {
            if (longTimer) {
              clearTimeout(longTimer);
            }
            if (abortTimer) {
              clearTimeout(abortTimer);
            }
            reject(new Error('aborted'));
          });
        });
      }),
      cleanup: vi.fn(),
    };

    const mockEval = {
      id: 'mock-eval-id',
      results: [],
      prompts: [],
      persisted: false,
      config: {},
      addResult: mockAddResult,
      addPrompts: vi.fn().mockResolvedValue(undefined),
      fetchResultsByTestIdx: vi.fn().mockResolvedValue([]),
      getResults: vi.fn().mockResolvedValue([]),
      toEvaluateSummary: vi.fn().mockResolvedValue({
        results: [],
        prompts: [],
        stats: {
          successes: 0,
          failures: 0,
          errors: 1,
          tokenUsage: createEmptyTokenUsage(),
        },
      }),
      save: vi.fn().mockResolvedValue(undefined),
      setVars: vi.fn().mockResolvedValue(undefined),
      setDurationMs: vi.fn(),
    };

    const testSuite: TestSuite = {
      providers: [slowApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}],
    };

    try {
      await evaluate(testSuite, mockEval as unknown as Eval, {
        timeoutMs: 1000,
        abortSignal: abortController.signal,
      });

      expect(mockAddResult).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('aborted'),
          success: false,
          failureReason: ResultFailureReason.ERROR,
        }),
      );
    } finally {
      if (longTimer) {
        clearTimeout(longTimer);
      }
      if (abortTimer) {
        clearTimeout(abortTimer);
      }
    }
  });

  it('should abort when exceeding maxEvalTimeMs', async () => {
    const mockAddResult = vi.fn().mockResolvedValue(undefined);
    let longTimer: NodeJS.Timeout | null = null;

    const slowApiProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('slow-provider'),
      callApi: vi.fn().mockImplementation((_, __, opts) => {
        return new Promise((resolve, reject) => {
          longTimer = setTimeout(() => {
            resolve({
              output: 'Slow response',
              tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 1 },
            });
          }, 1000);

          opts?.abortSignal?.addEventListener('abort', () => {
            if (longTimer) {
              clearTimeout(longTimer);
            }
            reject(new Error('aborted'));
          });
        });
      }),
      cleanup: vi.fn(),
    };

    const mockEval = {
      id: 'mock-eval-id',
      results: [],
      prompts: [],
      persisted: false,
      config: {},
      addResult: mockAddResult,
      addPrompts: vi.fn().mockResolvedValue(undefined),
      fetchResultsByTestIdx: vi.fn().mockResolvedValue([]),
      getResults: vi.fn().mockResolvedValue([]),
      toEvaluateSummary: vi.fn().mockResolvedValue({
        results: [],
        prompts: [],
        stats: {
          successes: 0,
          failures: 0,
          errors: 2,
          tokenUsage: createEmptyTokenUsage(),
        },
      }),
      save: vi.fn().mockResolvedValue(undefined),
      setVars: vi.fn().mockResolvedValue(undefined),
      setDurationMs: vi.fn(),
    };

    const testSuite: TestSuite = {
      providers: [slowApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [{}, {}],
    };

    try {
      const evalPromise = evaluate(testSuite, mockEval as unknown as Eval, { maxEvalTimeMs: 100 });
      await evalPromise;

      expect(mockAddResult).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('aborted'),
          success: false,
          failureReason: ResultFailureReason.ERROR,
        }),
      );
    } finally {
      if (longTimer) {
        clearTimeout(longTimer);
      }
    }
  });

  it('should accumulate token usage correctly', async () => {
    const mockOptions = {
      delay: 0,
      testIdx: 0,
      promptIdx: 0,
      repeatIndex: 0,
      isRedteam: false,
    };

    const results = await runEval({
      ...mockOptions,
      provider: mockApiProvider,
      prompt: { raw: 'Test prompt', label: 'test-label' },
      test: {
        assert: [
          {
            type: 'llm-rubric',
            value: 'Test output',
          },
        ],
        options: { provider: mockGradingApiProviderPasses },
      },
      conversations: {},
      registers: {},
    });

    expect(results[0].tokenUsage).toEqual({
      total: 10, // Only provider tokens, NOT assertion tokens
      prompt: 5, // Only provider tokens
      completion: 5, // Only provider tokens
      cached: 0,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
      numRequests: 1, // Only provider requests
      assertions: {
        total: 10, // Assertion tokens tracked separately
        prompt: 5,
        completion: 5,
        cached: 0,
        numRequests: 1, // Assertion requests tracked separately
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      },
    });
  });

  it('forces cache busting for repeat iterations', async () => {
    const contexts: Array<Record<string, any> | undefined> = [];
    const provider: ApiProvider = {
      id: () => 'mock-provider',
      callApi: vi
        .fn()
        .mockImplementation(async (_prompt: string, context?: Record<string, any>) => {
          contexts.push(context);
          return {
            output: 'result',
            tokenUsage: createEmptyTokenUsage(),
          };
        }),
    };

    const baseOptions = {
      provider,
      prompt: { raw: 'Test prompt', label: 'test-label' } as Prompt,
      delay: 0,
      nunjucksFilters: undefined,
      evaluateOptions: {},
      testIdx: 0,
      promptIdx: 0,
      conversations: {},
      registers: {},
      isRedteam: false,
    };

    await runEval({
      ...baseOptions,
      test: { assert: [] },
      repeatIndex: 0,
    });

    expect(contexts[0]?.bustCache).toBeFalsy();

    contexts.length = 0;

    await runEval({
      ...baseOptions,
      test: { assert: [] },
      repeatIndex: 1,
    });

    expect(contexts[0]?.bustCache).toBe(true);
  });

  it('should NOT include assertion tokens in main token totals', async () => {
    // Mock provider that returns fixed token usage
    const providerWithTokens: ApiProvider = {
      id: vi.fn().mockReturnValue('provider-with-tokens'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test response',
        tokenUsage: {
          total: 100,
          prompt: 60,
          completion: 40,
          cached: 10,
          numRequests: 1,
        },
      }),
    };

    // Mock grading provider that also returns token usage
    const gradingProviderWithTokens: ApiProvider = {
      id: vi.fn().mockReturnValue('grading-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: JSON.stringify({
          pass: true,
          score: 1,
          reason: 'Test passed',
        }),
        tokenUsage: {
          total: 50,
          prompt: 30,
          completion: 20,
          cached: 5,
          numRequests: 1,
        },
      }),
    };

    const testSuite: TestSuite = {
      providers: [providerWithTokens],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          assert: [
            {
              type: 'llm-rubric',
              value: 'Output should be valid',
              provider: gradingProviderWithTokens,
            },
          ],
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    // Verify main totals only include provider tokens, NOT assertion tokens
    expect(summary.stats.tokenUsage).toEqual({
      total: 100, // Only provider tokens
      prompt: 60,
      completion: 40,
      cached: 10,
      numRequests: 1,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
      assertions: {
        total: 50, // Assertion tokens tracked separately
        prompt: 30,
        completion: 20,
        cached: 5,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      },
    });

    // Also verify at the result level - the result should pass
    const result = summary.results[0];
    expect(result).toHaveProperty('success', true);
    expect(result).toHaveProperty('score', 1);

    // The main verification is at the stats level (already done above)
    // Individual results may not always have tokenUsage populated in the summary
  });

  it('should include sessionId in metadata for afterEach hook', async () => {
    const mockApiProvider = {
      id: () => 'test-provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        sessionId: 'test-session-123',
      }),
    };

    const mockExtension = 'file://test-extension.js';
    let capturedContext: any;

    const mockedRunExtensionHook = vi.mocked(runExtensionHook);
    mockedRunExtensionHook.mockImplementation(async (_extensions, hookName, context) => {
      if (hookName === 'afterEach') {
        capturedContext = context;
      }
      return context;
    });

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          vars: { var1: 'value1' },
        },
      ],
      extensions: [mockExtension],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(capturedContext).toBeDefined();
    expect(capturedContext.result.metadata.sessionId).toBe('test-session-123');
  });

  it('should use sessionId from vars if not in response', async () => {
    const mockApiProvider = {
      id: () => 'test-provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        // No sessionId in response
      }),
    };

    const mockExtension = 'file://test-extension.js';
    let capturedContext: any;

    const mockedRunExtensionHook = vi.mocked(runExtensionHook);
    mockedRunExtensionHook.mockImplementation(async (_extensions, hookName, context) => {
      if (hookName === 'afterEach') {
        capturedContext = context;
      }
      return context;
    });

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          vars: { var1: 'value1', sessionId: 'vars-session-456' },
        },
      ],
      extensions: [mockExtension],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(capturedContext).toBeDefined();
    expect(capturedContext.result.metadata.sessionId).toBe('vars-session-456');
  });

  it('should prioritize response sessionId over vars sessionId', async () => {
    const mockApiProvider = {
      id: () => 'test-provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        sessionId: 'response-session-priority',
      }),
    };

    const mockExtension = 'file://test-extension.js';
    let capturedContext: any;

    const mockedRunExtensionHook = vi.mocked(runExtensionHook);
    mockedRunExtensionHook.mockImplementation(async (_extensions, hookName, context) => {
      if (hookName === 'afterEach') {
        capturedContext = context;
      }
      return context;
    });

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          vars: { var1: 'value1', sessionId: 'vars-session-ignored' },
        },
      ],
      extensions: [mockExtension],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(capturedContext).toBeDefined();
    expect(capturedContext.result.metadata.sessionId).toBe('response-session-priority');
    expect(capturedContext.result.metadata.sessionId).not.toBe('vars-session-ignored');
  });

  it('should include sessionIds array from test metadata for iterative providers', async () => {
    const mockApiProvider = {
      id: () => 'test-provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
      }),
    };

    const mockExtension = 'file://test-extension.js';
    let capturedContext: any;

    const mockedRunExtensionHook = vi.mocked(runExtensionHook);
    mockedRunExtensionHook.mockImplementation(async (_extensions, hookName, context) => {
      if (hookName === 'afterEach') {
        capturedContext = context;
      }
      return context;
    });

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          vars: { var1: 'value1' },
          metadata: {
            sessionIds: ['iter-session-1', 'iter-session-2', 'iter-session-3'],
          },
        },
      ],
      extensions: [mockExtension],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(capturedContext).toBeDefined();
    expect(capturedContext.result.metadata.sessionIds).toEqual([
      'iter-session-1',
      'iter-session-2',
      'iter-session-3',
    ]);
    expect(capturedContext.result.metadata.sessionId).toBeUndefined();
  });

  it('should handle empty sessionIds array', async () => {
    const mockApiProvider = {
      id: () => 'test-provider',
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
      }),
    };

    const mockExtension = 'file://test-extension.js';
    let capturedContext: any;

    const mockedRunExtensionHook = vi.mocked(runExtensionHook);
    mockedRunExtensionHook.mockImplementation(async (_extensions, hookName, context) => {
      if (hookName === 'afterEach') {
        capturedContext = context;
      }
      return context;
    });

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          vars: { var1: 'value1' },
          metadata: {
            sessionIds: [],
          },
        },
      ],
      extensions: [mockExtension],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(capturedContext).toBeDefined();
    expect(capturedContext.result.metadata.sessionIds).toEqual([]);
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
    vi.spyOn(glob, 'globSync').mockReturnValue(['greeting1.txt', 'greeting2.txt']);
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

  it('should return true if allowedPrompts includes a wildcard prefix', () => {
    expect(isAllowedPrompt(prompt2, ['group1:*'])).toBe(true);
  });

  it('should return false if a wildcard prefix does not match the prompt label', () => {
    expect(isAllowedPrompt(prompt3, ['group1:*'])).toBe(false);
  });

  it('should return false if allowedPrompts does not include the prompt label or any matching start label with a colon', () => {
    expect(isAllowedPrompt(prompt3, ['group1', 'prompt2'])).toBe(false);
  });

  it('should return false if allowedPrompts is an empty array', () => {
    expect(isAllowedPrompt(prompt1, [])).toBe(false);
  });
});

describe('runEval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockProvider: ApiProvider = {
    id: vi.fn().mockReturnValue('test-provider'),
    callApi: vi.fn().mockResolvedValue({
      output: 'Test output',
      tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
    }),
  };

  const defaultOptions = {
    delay: 0,
    testIdx: 0,
    promptIdx: 0,
    repeatIndex: 0,
    isRedteam: false,
  };

  it('should handle basic prompt evaluation', async () => {
    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'Test prompt', label: 'test-label' },
      test: {},
      conversations: {},
      registers: {},
    });
    const result = results[0];
    expect(result.success).toBe(true);
    expect(result.response?.output).toBe('Test output');
    expect(result.prompt.label).toBe('test-label');
    expect(mockProvider.callApi).toHaveBeenCalledWith('Test prompt', expect.anything(), undefined);
  });

  it('should handle conversation history', async () => {
    const conversations = {} as Record<string, any>;

    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'Hello {{_conversation[0].output}}', label: 'test-label' },
      test: {},
      conversations,
      registers: {},
    });
    const result = results[0];
    expect(result.success).toBe(true);
    expect(conversations).toHaveProperty('test-provider:undefined');
    expect(conversations['test-provider:undefined']).toHaveLength(1);
    expect(conversations['test-provider:undefined'][0]).toEqual({
      prompt: 'Hello ',
      input: 'Hello ',
      output: 'Test output',
    });
  });

  it('should handle conversation with custom ID', async () => {
    const conversations = {};

    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'Hello {{_conversation[0].output}}', label: 'test-label', id: 'custom-id' },
      test: { metadata: { conversationId: 'conv1' } },
      conversations,
      registers: {},
    });
    const result = results[0];
    expect(result.success).toBe(true);
    expect(conversations).toHaveProperty('test-provider:custom-id:conv1');
  });

  it('should include sessionId from response in result metadata', async () => {
    const conversations: Record<string, any[]> = {};

    const providerWithSession: ApiProvider = {
      id: vi.fn().mockReturnValue('session-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        sessionId: 'response-session-123',
        metadata: { existing: 'value' },
        tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 },
      }),
    };

    const results = await runEval({
      ...defaultOptions,
      provider: providerWithSession,
      prompt: { raw: 'Test prompt', label: 'session-label' },
      test: { vars: {} },
      conversations,
      registers: {},
    });

    const [result] = results;
    expect(result?.metadata).toMatchObject({
      sessionId: 'response-session-123',
      existing: 'value',
    });
  });

  it('should include sessionId from vars in result metadata when response lacks sessionId', async () => {
    const conversations: Record<string, any[]> = {};

    const providerWithoutSession: ApiProvider = {
      id: vi.fn().mockReturnValue('vars-session-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 },
      }),
    };

    const results = await runEval({
      ...defaultOptions,
      provider: providerWithoutSession,
      prompt: { raw: 'Test prompt', label: 'vars-session-label' },
      test: { vars: { sessionId: 'vars-session-456' } },
      conversations,
      registers: {},
    });

    const [result] = results;

    expect(result.metadata).toMatchObject({ sessionId: 'vars-session-456' });
  });

  it('should include sessionId from response metadata when top-level sessionId is absent', async () => {
    const conversations: Record<string, any[]> = {};

    const providerWithMetadataSession: ApiProvider = {
      id: vi.fn().mockReturnValue('metadata-session-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        metadata: { sessionId: 'metadata-session-789', existing: 'keep-me' },
        tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 },
      }),
    };

    const [result] = await runEval({
      ...defaultOptions,
      provider: providerWithMetadataSession,
      prompt: { raw: 'Test prompt', label: 'metadata-session-label' },
      test: { vars: {} },
      conversations,
      registers: {},
    });

    expect(result.metadata).toMatchObject({
      sessionId: 'metadata-session-789',
      existing: 'keep-me',
    });
  });

  it('should prioritize response metadata sessionId over vars sessionId', async () => {
    const conversations: Record<string, any[]> = {};

    const providerWithMetadataSession: ApiProvider = {
      id: vi.fn().mockReturnValue('metadata-session-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        metadata: { sessionId: 'metadata-session-priority' },
        tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 },
      }),
    };

    const [result] = await runEval({
      ...defaultOptions,
      provider: providerWithMetadataSession,
      prompt: { raw: 'Test prompt', label: 'metadata-session-label' },
      test: { vars: { sessionId: 'vars-session-ignored' } },
      conversations,
      registers: {},
    });

    expect(result.metadata).toMatchObject({ sessionId: 'metadata-session-priority' });
  });

  it('should include sessionIds from response metadata without adding sessionId fallback', async () => {
    const conversations: Record<string, any[]> = {};

    const providerWithSessionIds: ApiProvider = {
      id: vi.fn().mockReturnValue('metadata-session-ids-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        metadata: { sessionIds: ['session-a', 'session-b'] },
        tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 },
      }),
    };

    const [result] = await runEval({
      ...defaultOptions,
      provider: providerWithSessionIds,
      prompt: { raw: 'Test prompt', label: 'metadata-session-ids-label' },
      test: { vars: {} },
      conversations,
      registers: {},
    });

    expect(result.metadata).toMatchObject({ sessionIds: ['session-a', 'session-b'] });
    expect(result.metadata).not.toHaveProperty('sessionId');
  });

  it('should include sessionId from test metadata when provider omits session details', async () => {
    const conversations: Record<string, any[]> = {};

    const [result] = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'Test prompt', label: 'test-metadata-session-label' },
      test: { metadata: { sessionId: 'test-metadata-session' } },
      conversations,
      registers: {},
    });

    expect(result?.metadata).toMatchObject({ sessionId: 'test-metadata-session' });
  });

  it('should preserve provider error context and plugin metadata on failure', async () => {
    const apiError: any = new Error('Request failed with status code 400');
    apiError.response = {
      status: 400,
      statusText: 'Bad Request',
      data: 'Invalid payload',
    };

    const failingProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('failing-provider'),
      label: 'Azure GPT 5',
      callApi: vi.fn().mockRejectedValue(apiError),
    };

    const [result] = await runEval({
      ...defaultOptions,
      provider: failingProvider,
      prompt: { raw: 'Test prompt', label: 'error-label' },
      test: { metadata: { pluginId: 'plugin-123', strategyId: 'basic' } },
      conversations: {},
      registers: {},
      isRedteam: true,
    });

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe(ResultFailureReason.ERROR);
    expect(result.metadata?.errorContext).toMatchObject({
      providerId: 'failing-provider',
      providerLabel: 'Azure GPT 5',
      status: 400,
      statusText: 'Bad Request',
    });
    expect(result.metadata?.errorContext?.responseSnippet).toContain('Invalid payload');
    expect(result.metadata?.pluginId).toBe('plugin-123');
    expect(result.metadata?.strategyId).toBe('basic');
    expect(result.error).toContain('Request failed with status code 400');
  });

  it('should handle registers', async () => {
    const registers = { savedValue: 'stored data' };

    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'Using {{savedValue}}', label: 'test-label' },
      test: {},
      conversations: {},
      registers,
    });
    const result = results[0];
    expect(result.success).toBe(true);
    expect(mockProvider.callApi).toHaveBeenCalledWith(
      'Using stored data',
      expect.anything(),
      undefined,
    );
  });

  it('should store output in register when specified', async () => {
    const registers = {};

    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'Test prompt', label: 'test-label' },
      test: { options: { storeOutputAs: 'myOutput' } },
      conversations: {},
      registers,
    });
    const result = results[0];
    expect(result.success).toBe(true);
    expect(registers).toHaveProperty('myOutput', 'Test output');
  });

  it('should handle provider errors', async () => {
    const errorProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('error-provider'),
      callApi: vi.fn().mockRejectedValue(new Error('API Error')),
    };

    // Define defaultOptions locally for this test
    const defaultOptions = {
      delay: 0,
      testIdx: 0,
      promptIdx: 0,
      repeatIndex: 0,
      isRedteam: false,
    };

    const results = await runEval({
      ...defaultOptions,
      provider: errorProvider,
      prompt: { raw: 'Test prompt', label: 'test-label' },
      test: {},
      conversations: {},
      registers: {},
    });
    const result = results[0];
    expect(result.success).toBe(false);
    expect(result.error).toContain('API Error');
    expect(result.failureReason).toBe(ResultFailureReason.ERROR);
  });

  it('should handle null output differently for red team tests', async () => {
    const nullOutputProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('null-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: null,
        tokenUsage: { total: 5, prompt: 5, completion: 0, cached: 0, numRequests: 1 },
      }),
    };

    // Regular test
    const regularResults = await runEval({
      ...defaultOptions,
      provider: nullOutputProvider,
      prompt: { raw: 'Test prompt', label: 'test-label' },
      test: {},
      conversations: {},
      registers: {},
      isRedteam: false,
    });

    expect(regularResults[0].success).toBe(false);
    expect(regularResults[0].error).toBe('No output');

    // Red team test
    const redTeamResults = await runEval({
      ...defaultOptions,
      provider: nullOutputProvider,
      prompt: { raw: 'Test prompt', label: 'test-label' },
      test: {},
      conversations: {},
      registers: {},
      isRedteam: true,
    });

    expect(redTeamResults[0].success).toBe(true);
    expect(redTeamResults[0].error).toBeUndefined();
  });

  it('should apply transforms in correct order', async () => {
    const providerWithTransform: ApiProvider = {
      id: vi.fn().mockReturnValue('transform-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'original',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
      transform: 'output + "-provider"',
    };

    const results = await runEval({
      ...defaultOptions,
      provider: providerWithTransform,
      prompt: { raw: 'Test prompt', label: 'test-label' },
      test: {
        options: { transform: 'output + "-test"' },
      },
      conversations: {},
      registers: {},
    });

    expect(results[0].success).toBe(true);
    expect(results[0].response?.output).toBe('original-provider-test');
  });

  it('should accumulate token usage correctly', async () => {
    const results = await runEval({
      ...defaultOptions,

      provider: mockProvider,
      prompt: { raw: 'Test prompt', label: 'test-label' },
      test: {
        assert: [
          {
            type: 'llm-rubric',
            value: 'Test output',
          },
        ],
        options: { provider: mockGradingApiProviderPasses },
      },
      conversations: {},
      registers: {},
    });

    expect(results[0].tokenUsage).toEqual({
      total: 10, // Only provider tokens, NOT assertion tokens
      prompt: 5, // Only provider tokens
      completion: 5, // Only provider tokens
      cached: 0,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
      },
      numRequests: 1, // Only provider requests
      assertions: {
        total: 10, // Assertion tokens tracked separately
        prompt: 5,
        completion: 5,
        cached: 0,
        numRequests: 1, // Assertion requests tracked separately
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      },
    });
  });

  it('should skip rendering redteam inject variable to prevent nunjucks errors on template syntax', async () => {
    // This tests the fix for Discord issue where redteam prompts containing {{purpose | trim}}
    // caused "TypeError: Cannot read properties of undefined (reading 'replace')"
    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'User said: {{prompt}}', label: 'test-label' },
      test: {
        vars: {
          // This contains template syntax that would fail if rendered (purpose is undefined)
          prompt:
            'Based on your role as "{{purpose | trim}}", provide a response to a typical request.',
        },
      },
      testSuite: {
        providers: [],
        prompts: [],
        redteam: {
          injectVar: 'prompt',
        },
      } as unknown as TestSuite,
      conversations: {},
      registers: {},
      isRedteam: true,
    });

    expect(results[0].success).toBe(true);
    // The inject var should be preserved as-is, not rendered
    expect(results[0].prompt.raw).toContain('{{purpose | trim}}');
  });

  it('should use default injectVar "prompt" when not explicitly set in redteam config', async () => {
    // Tests the fallback to default 'prompt' injectVar when redteam config exists but injectVar is undefined
    const results = await runEval({
      ...defaultOptions,
      provider: mockProvider,
      prompt: { raw: 'User said: {{prompt}}', label: 'test-label' },
      test: {
        vars: {
          prompt:
            'Based on your role as "{{purpose | trim}}", provide a response to a typical request.',
        },
      },
      testSuite: {
        providers: [],
        prompts: [],
        redteam: {
          // injectVar NOT set - should fall back to 'prompt'
        },
      } as unknown as TestSuite,
      conversations: {},
      registers: {},
      isRedteam: true,
    });

    expect(results[0].success).toBe(true);
    // Should still skip rendering the default 'prompt' var
    expect(results[0].prompt.raw).toContain('{{purpose | trim}}');
  });

  describe('latencyMs handling', () => {
    it('should use provider-supplied latencyMs when available', async () => {
      const providerWithLatency: ApiProvider = {
        id: vi.fn().mockReturnValue('latency-provider'),
        callApi: vi.fn().mockResolvedValue({
          output: 'Test output',
          latencyMs: 5000,
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        }),
      };

      const results = await runEval({
        ...defaultOptions,
        provider: providerWithLatency,
        prompt: { raw: 'Test prompt', label: 'test-label' },
        test: {},
        conversations: {},
        registers: {},
      });

      expect(results[0].latencyMs).toBe(5000);
    });

    it('should use provider-supplied latencyMs for cached responses', async () => {
      const cachedProvider: ApiProvider = {
        id: vi.fn().mockReturnValue('cached-provider'),
        callApi: vi.fn().mockResolvedValue({
          output: 'Cached output',
          cached: true,
          latencyMs: 3500,
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        }),
      };

      const results = await runEval({
        ...defaultOptions,
        provider: cachedProvider,
        prompt: { raw: 'Test prompt', label: 'test-label' },
        test: {},
        conversations: {},
        registers: {},
      });

      expect(results[0].latencyMs).toBe(3500);
      expect(results[0].response?.cached).toBe(true);
    });

    it('should fall back to measured latency when provider does not supply latencyMs', async () => {
      const providerWithoutLatency: ApiProvider = {
        id: vi.fn().mockReturnValue('no-latency-provider'),
        callApi: vi.fn().mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return {
            output: 'Test output',
            tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
          };
        }),
      };

      const results = await runEval({
        ...defaultOptions,
        provider: providerWithoutLatency,
        prompt: { raw: 'Test prompt', label: 'test-label' },
        test: {},
        conversations: {},
        registers: {},
      });

      // Should have measured latency (>= 45ms accounting for timer precision)
      expect(results[0].latencyMs).toBeGreaterThanOrEqual(45);
    });

    it('should respect provider latencyMs of 0', async () => {
      const providerWithZeroLatency: ApiProvider = {
        id: vi.fn().mockReturnValue('zero-latency-provider'),
        callApi: vi.fn().mockResolvedValue({
          output: 'Test output',
          latencyMs: 0,
          tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
        }),
      };

      const results = await runEval({
        ...defaultOptions,
        provider: providerWithZeroLatency,
        prompt: { raw: 'Test prompt', label: 'test-label' },
        test: {},
        conversations: {},
        registers: {},
      });

      expect(results[0].latencyMs).toBe(0);
    });
  });
});

describe('formatVarsForDisplay', () => {
  it('should return empty string for empty or undefined vars', () => {
    expect(formatVarsForDisplay({}, 50)).toBe('');
    expect(formatVarsForDisplay(undefined, 50)).toBe('');
    expect(formatVarsForDisplay(null as any, 50)).toBe('');
  });

  it('should format simple variables correctly', () => {
    const vars = { name: 'John', age: 25, city: 'NYC' };
    const result = formatVarsForDisplay(vars, 50);

    expect(result).toBe('name=John age=25 city=NYC');
  });

  it('should handle different variable types', () => {
    const vars = {
      string: 'hello',
      number: 42,
      boolean: true,
      nullValue: null,
      undefinedValue: undefined,
      object: { nested: 'value' },
      array: [1, 2, 3],
    };

    const result = formatVarsForDisplay(vars, 200);

    expect(result).toContain('string=hello');
    expect(result).toContain('number=42');
    expect(result).toContain('boolean=true');
    expect(result).toContain('nullValue=null');
    expect(result).toContain('undefinedValue=undefined');
    expect(result).toContain('object=[object Object]');
    expect(result).toContain('array=1,2,3');
  });

  it('should truncate individual values to prevent memory issues', () => {
    const bigValue = 'x'.repeat(200);
    const vars = { bigVar: bigValue };

    const result = formatVarsForDisplay(vars, 200);

    // Should truncate the value to 100 chars
    expect(result).toBe(`bigVar=${'x'.repeat(100)}`);
    expect(result.length).toBeLessThanOrEqual(200);
  });

  it('should handle extremely large vars without crashing', () => {
    // This would have caused RangeError before the fix
    const megaString = 'x'.repeat(500 * 1024); // 500KB string (reduced from 5MB to prevent SIGSEGV on macOS/Node24)
    const vars = {
      mega1: megaString,
      mega2: megaString,
      small: 'normal',
    };

    expect(() => formatVarsForDisplay(vars, 50)).not.toThrow();

    const result = formatVarsForDisplay(vars, 50);
    expect(typeof result).toBe('string');
    expect(result.length).toBeLessThanOrEqual(50);
  });

  it('should truncate final result to maxLength', () => {
    const vars = {
      var1: 'value1',
      var2: 'value2',
      var3: 'value3',
      var4: 'value4',
    };

    const result = formatVarsForDisplay(vars, 20);

    expect(result.length).toBeLessThanOrEqual(20);
    expect(result).toBe('var1=value1 var2=val');
  });

  it('should replace newlines with spaces', () => {
    const vars = {
      multiline: 'line1\nline2\nline3',
    };

    const result = formatVarsForDisplay(vars, 100);

    expect(result).toBe('multiline=line1 line2 line3');
    expect(result).not.toContain('\n');
  });

  it('should return fallback message on any error', () => {
    // Create a problematic object that might throw during String() conversion
    const problematicVars = {
      badProp: {
        toString() {
          throw new Error('Cannot convert to string');
        },
      },
    };

    const result = formatVarsForDisplay(problematicVars, 50);

    expect(result).toBe('[vars unavailable]');
  });

  it('should handle multiple variables with space distribution', () => {
    const vars = {
      a: 'short',
      b: 'medium_value',
      c: 'a_very_long_value_that_exceeds_normal_length',
    };

    const result = formatVarsForDisplay(vars, 30);

    expect(result.length).toBeLessThanOrEqual(30);
    expect(result).toContain('a=short');
    // Should fit as much as possible within the limit
  });
});

describe('evaluator defaultTest merging', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset runExtensionHook to default implementation (other tests may have overridden it)
    vi.mocked(runExtensionHook).mockReset();
    vi.mocked(runExtensionHook).mockImplementation(
      async (_extensions, _hookName, context) => context,
    );
  });

  it('should merge defaultTest.options.provider with test case options', async () => {
    const mockProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('mock-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      prompts: [toPrompt('Test prompt {{text}}')],
      providers: [mockProvider],
      tests: [
        {
          vars: { text: 'Hello world' },
          assert: [
            {
              type: 'equals',
              value: 'Test output',
            },
          ],
        },
      ],
      defaultTest: {
        options: {
          provider: {
            embedding: {
              id: 'bedrock:embeddings:amazon.titan-embed-text-v2:0',
              config: {
                region: 'us-east-1',
              },
            },
          },
        },
      },
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    // The evaluator should have processed the tests and merged defaultTest options
    expect(summary.results).toBeDefined();
    expect(summary.results.length).toBeGreaterThan(0);

    // Check that the test case has the merged options from defaultTest
    const processedTest = summary.results[0].testCase;
    expect(processedTest?.options?.provider).toEqual({
      embedding: {
        id: 'bedrock:embeddings:amazon.titan-embed-text-v2:0',
        config: {
          region: 'us-east-1',
        },
      },
    });
  });

  it('should allow test case options to override defaultTest options', async () => {
    const mockProvider: ApiProvider = {
      id: vi.fn().mockReturnValue('mock-provider'),
      callApi: vi.fn().mockResolvedValue({
        output: 'Test output',
        tokenUsage: { total: 10, prompt: 5, completion: 5, cached: 0, numRequests: 1 },
      }),
    };

    const testSuite: TestSuite = {
      prompts: [toPrompt('Test prompt {{text}}')],
      providers: [mockProvider],
      tests: [
        {
          vars: { text: 'Hello world' },
          options: {
            provider: 'openai:gpt-4',
          },
          assert: [
            {
              type: 'llm-rubric',
              value: 'Output is correct',
            },
          ],
        },
      ],
      defaultTest: {
        options: {
          provider: 'openai:gpt-3.5-turbo',
          transform: 'output.toUpperCase()',
        },
      },
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    // Check that the test case options override defaultTest options
    const processedTest = summary.results[0].testCase;
    expect(processedTest?.options?.provider).toBe('openai:gpt-4');
    // But other defaultTest options should still be merged
    expect(processedTest?.options?.transform).toBe('output.toUpperCase()');
  });
});

describe('Evaluator with external defaultTest', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset runExtensionHook to default implementation (other tests may have overridden it)
    vi.mocked(runExtensionHook).mockReset();
    vi.mocked(runExtensionHook).mockImplementation(
      async (_extensions, _hookName, context) => context,
    );
  });

  it('should handle string defaultTest gracefully', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [{ raw: 'Test prompt {{var}}', label: 'test' }],
      tests: [{ vars: { var: 'value' } }],
      defaultTest: 'file://path/to/defaultTest.yaml' as any, // String should have been resolved before reaching evaluator
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    // Should handle gracefully even if string wasn't resolved
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].vars).toEqual({ var: 'value' });
  });

  it('should apply object defaultTest properties correctly', async () => {
    const defaultTest = {
      assert: [{ type: 'equals' as const, value: 'expected' }],
      vars: { defaultVar: 'defaultValue' },
      options: { provider: 'test-provider' },
      metadata: { suite: 'test-suite' },
      threshold: 0.8,
    };

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [{ raw: 'Test prompt', label: 'test' }],
      tests: [
        { vars: { testVar: 'testValue' } },
        {
          vars: { testVar: 'override' },
          assert: [{ type: 'contains' as const, value: 'exp' }],
          threshold: 0.9,
        },
      ],
      defaultTest,
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    // First test should inherit all defaultTest properties
    const firstResult = summary.results[0] as any;
    expect(firstResult.testCase.assert).toEqual(defaultTest.assert);
    expect(firstResult.testCase.vars).toEqual({
      defaultVar: 'defaultValue',
      testVar: 'testValue',
    });
    expect(firstResult.testCase.threshold).toBe(0.8);
    expect(firstResult.testCase.metadata).toEqual({ suite: 'test-suite' });

    // Second test should merge/override appropriately
    const secondResult = summary.results[1] as any;
    expect(secondResult.testCase.assert).toEqual([
      ...defaultTest.assert,
      { type: 'contains' as const, value: 'exp' },
    ]);
    expect(secondResult.testCase.threshold).toBe(0.9); // Override
  });

  it('should handle invariant check for defaultTest.assert array', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [{ raw: 'Test prompt', label: 'test' }],
      tests: [{ vars: { var: 'value' } }],
      defaultTest: {
        assert: 'not-an-array' as any, // Invalid type
      },
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    // Should throw or handle gracefully
    await expect(evaluate(testSuite, evalRecord, {})).rejects.toThrow(
      'defaultTest.assert is not an array in test case #1',
    );
  });

  it('should correctly merge defaultTest with test case when defaultTest is object', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [{ raw: 'Test {{var}}', label: 'test' }],
      tests: [
        {
          vars: { var: 'test1' },
          options: { transformVars: 'vars.transformed = true; return vars;' },
        },
      ],
      defaultTest: {
        vars: { defaultVar: 'default' },
        options: {
          provider: 'default-provider',
          transformVars: 'vars.defaultTransform = true; return vars;',
        },
        assert: [{ type: 'not-equals' as const, value: '' }],
      },
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    // Test case transformVars should override defaultTest transformVars
    const result = summary.results[0] as any;
    expect(result.testCase.options?.transformVars).toBe('vars.transformed = true; return vars;');
    // But other options should be merged
    expect(result.testCase.options?.provider).toBe('default-provider');
  });

  it('should preserve metrics from existing prompts when resuming evaluation', async () => {
    // Store original resume state and ensure it's false
    const originalResume = cliState.resume;
    cliState.resume = false;

    try {
      // Create a test suite with 2 prompts and 1 test
      const testSuite: TestSuite = {
        providers: [mockApiProvider],
        prompts: [
          { raw: 'Test prompt 1', label: 'test1' },
          { raw: 'Test prompt 2', label: 'test2' },
        ],
        tests: [{ vars: { var: 'value1' } }],
      };

      // Create initial eval record
      const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

      // Simulate that the eval was already partially completed with some metrics
      const initialMetrics1 = {
        score: 10,
        testPassCount: 1,
        testFailCount: 0,
        testErrorCount: 0,
        assertPassCount: 1,
        assertFailCount: 0,
        totalLatencyMs: 100,
        tokenUsage: createEmptyTokenUsage(),
        namedScores: {},
        namedScoresCount: {},
        cost: 0.001,
      };

      const initialMetrics2 = {
        score: 5,
        testPassCount: 0,
        testFailCount: 1,
        testErrorCount: 0,
        assertPassCount: 0,
        assertFailCount: 1,
        totalLatencyMs: 150,
        tokenUsage: createEmptyTokenUsage(),
        namedScores: {},
        namedScoresCount: {},
        cost: 0.002,
      };

      evalRecord.prompts = [
        {
          raw: 'Test prompt 1',
          label: 'test1',
          id: 'prompt-test1',
          provider: 'test-provider',
          metrics: { ...initialMetrics1 },
        },
        {
          raw: 'Test prompt 2',
          label: 'test2',
          id: 'prompt-test2',
          provider: 'test-provider',
          metrics: { ...initialMetrics2 },
        },
      ];
      evalRecord.persisted = true;

      // Enable resume mode
      cliState.resume = true;

      // Run evaluation with resume - this will run the test on both prompts
      await evaluate(testSuite, evalRecord, {});

      // Verify the prompts still exist and have the right IDs
      expect(evalRecord.prompts).toHaveLength(2);
      expect(evalRecord.prompts[0].id).toBe('prompt-test1');
      expect(evalRecord.prompts[1].id).toBe('prompt-test2');

      // Check that the prompts have preserved metrics
      // When resuming, the metrics should be accumulated with the initial values
      // The key test is that metrics are not reset to 0

      // For prompt 1 which had testPassCount=1 initially
      expect(evalRecord.prompts[0].metrics?.testPassCount).toBeGreaterThanOrEqual(1);

      // For prompt 2, at least verify metrics exist and aren't completely reset
      expect(evalRecord.prompts[1].metrics).toBeDefined();

      // The combined pass/fail count should be greater than 0, showing metrics weren't reset
      const prompt2TotalTests =
        (evalRecord.prompts[1].metrics?.testPassCount || 0) +
        (evalRecord.prompts[1].metrics?.testFailCount || 0);
      expect(prompt2TotalTests).toBeGreaterThan(0);
    } finally {
      // Always restore original state
      cliState.resume = originalResume;
    }
  });
});

describe('defaultTest normalization for extensions', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset runExtensionHook to default implementation (other tests may have overridden it)
    vi.mocked(runExtensionHook).mockReset();
    vi.mocked(runExtensionHook).mockImplementation(
      async (_extensions, _hookName, context) => context,
    );
  });

  it('should initialize defaultTest when undefined and extensions are present', async () => {
    const mockExtension = 'file://test-extension.js';
    let capturedSuite: TestSuite | undefined;

    const mockedRunExtensionHook = vi.mocked(runExtensionHook);
    mockedRunExtensionHook.mockImplementation(async (_extensions, hookName, context) => {
      if (hookName === 'beforeAll') {
        capturedSuite = (context as { suite: TestSuite }).suite;
      }
      return context;
    });

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [{ raw: 'Test prompt', label: 'test' }],
      tests: [{ vars: { var: 'value' } }],
      extensions: [mockExtension],
      // No defaultTest defined
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(capturedSuite).toBeDefined();
    expect(capturedSuite!.defaultTest).toBeDefined();
    expect(capturedSuite!.defaultTest).toEqual({ assert: [] });
  });

  it('should initialize defaultTest.assert when defaultTest exists but assert is undefined', async () => {
    const mockExtension = 'file://test-extension.js';
    let capturedSuite: TestSuite | undefined;

    const mockedRunExtensionHook = vi.mocked(runExtensionHook);
    mockedRunExtensionHook.mockImplementation(async (_extensions, hookName, context) => {
      if (hookName === 'beforeAll') {
        capturedSuite = (context as { suite: TestSuite }).suite;
      }
      return context;
    });

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [{ raw: 'Test prompt', label: 'test' }],
      tests: [{ vars: { var: 'value' } }],
      extensions: [mockExtension],
      defaultTest: {
        vars: { defaultVar: 'defaultValue' },
        // No assert defined
      },
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(capturedSuite).toBeDefined();
    expect(capturedSuite!.defaultTest).toBeDefined();
    const defaultTest = capturedSuite!.defaultTest as Record<string, unknown>;
    expect(defaultTest.vars).toEqual({ defaultVar: 'defaultValue' });
    expect(defaultTest.assert).toEqual([]);
  });

  it('should preserve existing defaultTest.assert when extensions are present', async () => {
    const mockExtension = 'file://test-extension.js';
    let capturedSuite: TestSuite | undefined;

    const mockedRunExtensionHook = vi.mocked(runExtensionHook);
    mockedRunExtensionHook.mockImplementation(async (_extensions, hookName, context) => {
      if (hookName === 'beforeAll') {
        capturedSuite = (context as { suite: TestSuite }).suite;
      }
      return context;
    });

    const existingAssertions = [
      { type: 'contains' as const, value: 'expected' },
      { type: 'not-contains' as const, value: 'unexpected' },
    ];

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [{ raw: 'Test prompt', label: 'test' }],
      tests: [{ vars: { var: 'value' } }],
      extensions: [mockExtension],
      defaultTest: {
        assert: existingAssertions,
      },
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    expect(capturedSuite).toBeDefined();
    const defaultTest = capturedSuite!.defaultTest as Record<string, unknown>;
    expect(defaultTest.assert).toBe(existingAssertions); // Same reference
    expect(defaultTest.assert).toHaveLength(2);
  });

  it('should not modify defaultTest when no extensions are present', async () => {
    const mockedRunExtensionHook = vi.mocked(runExtensionHook);
    mockedRunExtensionHook.mockClear();

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [{ raw: 'Test prompt', label: 'test' }],
      tests: [{ vars: { var: 'value' } }],
      // No extensions
      // No defaultTest
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    // runExtensionHook should still be called (with empty/undefined extensions)
    // but the beforeAll hook call should receive the original suite without normalization
    const beforeAllCall = mockedRunExtensionHook.mock.calls.find((call) => call[1] === 'beforeAll');
    expect(beforeAllCall).toBeDefined();
    // When no extensions, defaultTest should remain undefined (not normalized)
    // Note: The normalization only happens when extensions?.length is truthy
  });

  it('should allow extensions to push to defaultTest.assert safely', async () => {
    const mockExtension = 'file://test-extension.js';

    const mockedRunExtensionHook = vi.mocked(runExtensionHook);
    mockedRunExtensionHook.mockImplementation(async (_extensions, hookName, context) => {
      if (hookName === 'beforeAll') {
        // Simulate what an extension would do - push to assert array
        // This should work because defaultTest.assert is guaranteed to be an array
        const suite = (context as { suite: TestSuite }).suite;
        const defaultTest = suite.defaultTest as Exclude<typeof suite.defaultTest, string>;
        defaultTest!.assert!.push({ type: 'is-json' as const });
      }
      return context;
    });

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [{ raw: 'Test prompt', label: 'test' }],
      tests: [{ vars: { var: 'value' } }],
      extensions: [mockExtension],
      // No defaultTest - will be initialized by evaluator
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});

    // The assertion added by the extension should be present in the results
    const summary = await evalRecord.toEvaluateSummary();
    expect(summary.results[0].testCase.assert).toContainEqual({ type: 'is-json' });
  });
});
