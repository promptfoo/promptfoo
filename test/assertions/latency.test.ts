import { runAssertion } from '../../src/assertions';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import type { AtomicTestCase, GradingResult } from '../../src/types';

// Mock setup similar to index.test.ts
jest.mock('../../src/redteam/remoteGeneration', () => ({
  shouldGenerateRemote: jest.fn().mockReturnValue(false),
}));

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('node:module', () => {
  const mockRequire: NodeJS.Require = {
    resolve: jest.fn() as unknown as NodeJS.RequireResolve,
  } as unknown as NodeJS.Require;
  return {
    createRequire: jest.fn().mockReturnValue(mockRequire),
  };
});

jest.mock('../../src/fetch', () => {
  const actual = jest.requireActual('../../src/fetch');
  return {
    ...actual,
    fetchWithRetries: jest.fn(actual.fetchWithRetries),
  };
});

jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  promises: {
    readFile: jest.fn(),
  },
}));

jest.mock('../../src/esm');
jest.mock('../../src/database', () => ({
  getDb: jest.fn(),
}));

jest.mock('path', () => ({
  ...jest.requireActual('path'),
  resolve: jest.fn(jest.requireActual('path').resolve),
  extname: jest.fn(jest.requireActual('path').extname),
}));

jest.mock('../../src/cliState', () => ({
  basePath: '/base/path',
}));

jest.mock('../../src/matchers', () => {
  const actual = jest.requireActual('../../src/matchers');
  return {
    ...actual,
    matchesContextRelevance: jest
      .fn()
      .mockResolvedValue({ pass: true, score: 1, reason: 'Mocked reason' }),
    matchesContextFaithfulness: jest
      .fn()
      .mockResolvedValue({ pass: true, score: 1, reason: 'Mocked reason' }),
  };
});

describe('Latency assertion', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should pass when the latency assertion passes', async () => {
    const output = 'Expected output';

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
    const providerResponse = { output };
    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider,
      assertion: {
        type: 'latency',
        threshold: 100,
      },
      latencyMs: 50,
      test: {} as AtomicTestCase,
      providerResponse,
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the latency assertion fails', async () => {
    const output = 'Expected output';

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
    const providerResponse = { output };
    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider,
      assertion: {
        type: 'latency',
        threshold: 100,
      },
      latencyMs: 1000,
      test: {} as AtomicTestCase,
      providerResponse,
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Latency 1000ms is greater than threshold 100ms',
    });
  });

  it('should throw an error when grading result is missing latencyMs', async () => {
    const output = 'Expected output';

    await expect(
      runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion: {
          type: 'latency',
          threshold: 100,
        },
        test: {} as AtomicTestCase,
        providerResponse: { output },
      }),
    ).rejects.toThrow(
      'Latency assertion does not support cached results. Rerun the eval with --no-cache',
    );
  });

  it('should pass when the latency is 0ms', async () => {
    const output = 'Expected output';

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
    const providerResponse = { output };
    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider,
      assertion: {
        type: 'latency',
        threshold: 100,
      },
      latencyMs: 0,
      test: {} as AtomicTestCase,
      providerResponse,
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should throw an error when threshold is not provided', async () => {
    const output = 'Expected output';

    await expect(
      runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion: {
          type: 'latency',
        },
        latencyMs: 50,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      }),
    ).rejects.toThrow('Latency assertion must have a threshold in milliseconds');
  });

  it('should handle latency equal to threshold', async () => {
    const output = 'Expected output';

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
    const providerResponse = { output };
    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider,
      assertion: {
        type: 'latency',
        threshold: 100,
      },
      latencyMs: 100,
      test: {} as AtomicTestCase,
      providerResponse,
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });
});
