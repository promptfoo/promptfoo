import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluate } from '../src/evaluator';
import Eval from '../src/models/eval';

import type { ApiProvider, TestSuite } from '../src/types/index';

// Create hoisted mock for transform
const mockTransform = vi.hoisted(() => vi.fn());
const mockRunAssertions = vi.hoisted(() => vi.fn());

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
    runAssertions: mockRunAssertions,
  };
});

// Mock cache to prevent file system operations
vi.mock('../src/cache', () => ({
  getCache: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    wrap: vi.fn((_key: any, fn: any) => fn()),
  })),
  withCacheNamespace: vi.fn(async (_namespace: string | undefined, fn: () => Promise<unknown>) =>
    fn(),
  ),
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
    mockTransform.mockReset();
    mockRunAssertions.mockReset();
    mockRunAssertions.mockResolvedValue({
      pass: true,
      score: 1,
      namedScores: {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes provider-transformed output to test transforms and context assertions', async () => {
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

    // Check that the test transform received provider output.
    const testTransformCall = transformCalls.find(
      (c) => c.expression === 'output + " - test transformed"',
    );

    expect(testTransformCall?.input).toBe('PROVIDER TRANSFORMED');
    expect(results.results[0].response?.output).toBe('PROVIDER TRANSFORMED - test transformed');

    expect(mockRunAssertions).toHaveBeenCalledWith(
      expect.objectContaining({
        providerResponse: expect.objectContaining({
          output: 'PROVIDER TRANSFORMED - test transformed',
          providerTransformedOutput: 'PROVIDER TRANSFORMED',
        }),
      }),
    );
  });

  it('passes provider-transformed output through with multiple context assertions', async () => {
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

    const testTransform = transformCalls.find((c) => c.expression.includes('toLowerCase'));
    expect(testTransform?.input).toBe('{"provider":"ORIGINAL"}');

    expect(mockRunAssertions).toHaveBeenCalledWith(
      expect.objectContaining({
        providerResponse: expect.objectContaining({
          output: 'original',
          providerTransformedOutput: '{"provider":"ORIGINAL"}',
        }),
        test: expect.objectContaining({
          assert: [
            expect.objectContaining({ contextTransform: 'JSON.parse(output).context1' }),
            expect.objectContaining({ contextTransform: 'JSON.parse(output).context2' }),
            expect.objectContaining({ contextTransform: 'JSON.parse(output).context3' }),
          ],
        }),
      }),
    );
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

  it('passes raw provider output to context assertions when no transforms are configured', async () => {
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

    expect(mockRunAssertions).toHaveBeenCalledWith(
      expect.objectContaining({
        providerResponse: expect.objectContaining({
          output: {
            data: 'test',
            metadata: { extracted: 'metadata' },
          },
          providerTransformedOutput: {
            data: 'test',
            metadata: { extracted: 'metadata' },
          },
        }),
        test: expect.objectContaining({
          assert: [expect.objectContaining({ contextTransform: 'output.metadata' })],
        }),
      }),
    );
  });
});
