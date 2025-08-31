import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { evaluate } from '../src/evaluator';
import Eval from '../src/models/eval';

import type { ApiProvider, TestSuite } from '../src/types';

// Mock the transform function to track calls
jest.mock('../src/util/transform', () => ({
  transform: jest.fn(),
  TransformInputType: {
    OUTPUT: 'output',
    VARS: 'vars',
  },
}));

// Mock assertions to prevent timeouts
jest.mock('../src/assertions', () => ({
  runAssertions: jest.fn(() =>
    Promise.resolve({
      pass: true,
      score: 1,
      namedScores: {},
    }),
  ),
}));

// Mock cache to prevent file system operations
jest.mock('../src/cache', () => ({
  getCache: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    wrap: jest.fn((key: any, fn: any) => fn()),
  })),
}));

// Mock logger to prevent console output during tests
jest.mock('../src/logger', () => ({
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock file operations
jest.mock('../src/util/file', () => ({
  readFileCached: jest.fn(() => Promise.resolve('')),
}));

// Mock evaluator helpers
jest.mock('../src/evaluatorHelpers', () => {
  const actual = jest.requireActual('../src/evaluatorHelpers');
  return {
    ...(actual as any),
    runExtensionHook: jest.fn((...args: any[]) => args[2]),
  };
});

// Mock time utilities
jest.mock('../src/util/time', () => {
  const actual = jest.requireActual('../src/util/time');
  return {
    ...(actual as any),
    sleep: jest.fn(() => Promise.resolve()),
  };
});

// Mock ESM
jest.mock('../src/esm', () => ({}));

const mockTransform = (jest.requireMock('../src/util/transform') as any)
  .transform as jest.MockedFunction<typeof import('../src/util/transform').transform>;

describe('Transformation integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.skip('should apply test.options.transform and assert.contextTransform from provider output', async () => {
    // Track the transformation sequence
    const transformCalls: { expression: string; input: any }[] = [];

    mockTransform.mockImplementation(async (expression, input) => {
      transformCalls.push({ expression, input });

      if (expression === 'output.toUpperCase()') {
        // Provider transform
        return 'PROVIDER TRANSFORMED';
      } else if (expression === 'output + " - test transformed"') {
        // Test transform - should receive provider output
        return input + ' - test transformed';
      } else if (expression === 'output.split(" ")[0]') {
        // Context transform - should also receive provider output
        return String(input).split(' ')[0];
      }
      return input;
    });

    const testSuite: TestSuite = {
      prompts: [{ raw: 'Test prompt', label: 'Test' }],
      providers: [
        {
          id: () => 'mock-provider',
          callApi: async () => ({
            output: 'original output',
            tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1 },
          }),
          transform: 'output.toUpperCase()',
        } as ApiProvider,
      ],
      tests: [
        {
          vars: {
            query: 'test query',
            context: 'test context',
          },
          assert: [
            {
              type: 'equals',
              value: 'PROVIDER TRANSFORMED - test transformed',
            },
            {
              type: 'context-faithfulness',
              contextTransform: 'output.split(" ")[0]',
            },
          ],
          options: {
            transform: 'output + " - test transformed"',
          },
        },
      ],
    };

    const evalRecord = new Eval({});
    const results = await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });

    // Check that both test transform and context transform received provider output
    const testTransformCall = transformCalls.find(
      (c) => c.expression === 'output + " - test transformed"',
    );
    const contextTransformCall = transformCalls.find(
      (c) => c.expression === 'output.split(" ")[0]',
    );

    expect(testTransformCall?.input).toBe('PROVIDER TRANSFORMED');
    expect(contextTransformCall?.input).toBe('PROVIDER TRANSFORMED');

    // The final output should have the test transform applied
    expect(results.results[0].response?.output).toBe('PROVIDER TRANSFORMED - test transformed');

    // Context transform should have extracted first word from provider output
    expect(contextTransformCall?.input).toBe('PROVIDER TRANSFORMED');
  });

  it.skip('should handle multiple context transforms', async () => {
    const transformCalls: { expression: string; input: any; timestamp: number }[] = [];

    mockTransform.mockImplementation(async (expression, input) => {
      transformCalls.push({ expression, input, timestamp: Date.now() });

      if (expression === 'JSON.stringify({provider: output})') {
        // Provider transform
        return JSON.stringify({ provider: input });
      } else if (expression === 'JSON.parse(output).provider.toLowerCase()') {
        // Test transform
        const parsed = typeof input === 'string' ? JSON.parse(input) : input;
        return parsed.provider.toLowerCase();
      } else if (expression.startsWith('JSON.parse(output)')) {
        // Context transforms - all should receive provider output
        if (typeof input === 'string') {
          JSON.parse(input); // Validate that input is valid JSON
        }
        if (expression.includes('context1')) {
          return 'context1 from provider';
        }
        if (expression.includes('context2')) {
          return 'context2 from provider';
        }
        if (expression.includes('context3')) {
          return 'context3 from provider';
        }
      }
      return input;
    });

    const testSuite: TestSuite = {
      prompts: [{ raw: 'Test prompt', label: 'Test' }],
      providers: [
        {
          id: () => 'mock-provider',
          callApi: async () => ({
            output: 'ORIGINAL',
            tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1 },
          }),
          transform: 'JSON.stringify({provider: output})',
        } as ApiProvider,
      ],
      tests: [
        {
          vars: {
            query: 'test query',
          },
          assert: [
            {
              type: 'context-faithfulness',
              contextTransform: 'JSON.parse(output).context1',
            },
            {
              type: 'context-recall',
              contextTransform: 'JSON.parse(output).context2',
            },
            {
              type: 'context-relevance',
              contextTransform: 'JSON.parse(output).context3',
            },
          ],
          options: {
            transform: 'JSON.parse(output).provider.toLowerCase()',
          },
        },
      ],
    };

    const evalRecord = new Eval({});
    await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });

    // All context transforms should receive the same provider-transformed output
    const contextTransforms = transformCalls.filter(
      (c) =>
        c.expression.includes('context1') ||
        c.expression.includes('context2') ||
        c.expression.includes('context3'),
    );

    // All should have received the JSON stringified provider output
    contextTransforms.forEach((call) => {
      expect(call.input).toBe('{"provider":"ORIGINAL"}');
    });

    // Test transform should also receive provider output
    const testTransform = transformCalls.find((c) => c.expression.includes('toLowerCase'));
    expect(testTransform?.input).toBe('{"provider":"ORIGINAL"}');
  });

  it('should work correctly with only provider transform', async () => {
    mockTransform.mockImplementation(async (expression, input) => {
      if (expression === 'output.trim().toUpperCase()') {
        return String(input).trim().toUpperCase();
      }
      return input;
    });

    const testSuite: TestSuite = {
      prompts: [{ raw: 'Test prompt', label: 'Test' }],
      providers: [
        {
          id: () => 'mock-provider',
          callApi: async () => ({
            output: '  spaced output  ',
            tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1 },
          }),
          transform: 'output.trim().toUpperCase()',
        } as ApiProvider,
      ],
      tests: [
        {
          assert: [
            {
              type: 'equals',
              value: 'SPACED OUTPUT',
            },
          ],
        },
      ],
    };

    const evalRecord = new Eval({});
    const results = await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });
    expect(results.results[0].response?.output).toBe('SPACED OUTPUT');
  });

  it.skip('should maintain backwards compatibility when contextTransform is used without test transform', async () => {
    const transformCalls: { expression: string; input: any }[] = [];

    mockTransform.mockImplementation(async (expression, input) => {
      transformCalls.push({ expression, input });

      if (expression === 'output.metadata') {
        // Should receive provider output directly when no test transform
        return { extracted: 'metadata' };
      }
      return input;
    });

    const testSuite: TestSuite = {
      prompts: [{ raw: 'Test prompt', label: 'Test' }],
      providers: [
        {
          id: () => 'mock-provider',
          callApi: async () => ({
            output: { data: 'test', metadata: { extracted: 'metadata' } },
            tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1 },
          }),
        } as ApiProvider,
      ],
      tests: [
        {
          vars: { query: 'test' },
          assert: [
            {
              type: 'context-faithfulness',
              contextTransform: 'output.metadata',
            },
          ],
        },
      ],
    };

    const evalRecord = new Eval({});
    await evaluate(testSuite, evalRecord, { maxConcurrency: 1 });

    const contextTransformCall = transformCalls.find(
      (call) => call.expression === 'output.metadata',
    );

    // Should receive the raw provider output
    expect(contextTransformCall?.input).toEqual({
      data: 'test',
      metadata: { extracted: 'metadata' },
    });
  });
});
