import './setup';

import { randomUUID } from 'crypto';

import { expect, it, vi } from 'vitest';
import { FILE_METADATA_KEY } from '../../src/constants';
import { evaluate } from '../../src/evaluator';
import { runExtensionHook } from '../../src/evaluatorHelpers';
import Eval from '../../src/models/eval';
import { type ApiProvider, type TestSuite } from '../../src/types/index';
import { mockApiProvider, toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

describeEvaluator('evaluator metadata', () => {
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
});
