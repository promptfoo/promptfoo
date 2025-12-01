import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluate } from '../src/evaluator';
import Eval from '../src/models/eval';

import type { ApiProvider, TestSuite } from '../src/types/index';

// Create hoisted mock for transform
const mockTransform = vi.hoisted(() => vi.fn());

// Mock the transform function to track calls
vi.mock('../src/util/transform', () => ({
  transform: mockTransform,
  TransformInputType: {
    OUTPUT: 'output',
    VARS: 'vars',
  },
}));

// Mock assertions to prevent timeouts
vi.mock('../src/assertions', async () => {
  const actual = await vi.importActual('../src/assertions');
  return {
    ...(actual as any),
    runAssertions: vi.fn(() =>
      Promise.resolve({
        pass: true,
        score: 1,
        namedScores: {},
      }),
    ),
  };
});

// Mock cache to prevent file system operations
vi.mock('../src/cache', () => ({
  getCache: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    wrap: vi.fn((_key: any, fn: any) => fn()),
  })),
}));

// Mock logger to prevent console output during tests
vi.mock('../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock file operations
vi.mock('../src/util/file', () => ({
  readFileCached: vi.fn(() => Promise.resolve('')),
}));

// Mock evaluator helpers
vi.mock('../src/evaluatorHelpers', async () => {
  const actual = await vi.importActual('../src/evaluatorHelpers');
  return {
    ...(actual as any),
    runExtensionHook: vi.fn((...args: any[]) => args[2]),
  };
});

// Mock time utilities
vi.mock('../src/util/time', async () => {
  const actual = await vi.importActual('../src/util/time');
  return {
    ...(actual as any),
    sleep: vi.fn(() => Promise.resolve()),
  };
});

// Mock ESM
vi.mock('../src/esm', () => ({}));

describe('Transformation integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
