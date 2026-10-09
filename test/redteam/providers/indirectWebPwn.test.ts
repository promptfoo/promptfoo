import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../../src/assertions/index';
import { RedteamGraderBase } from '../../../src/redteam/plugins/base';
import IndirectWebPwnProvider from '../../../src/redteam/providers/indirectWebPwn';
import { createMockProvider, createProviderResponse } from '../../factories/provider';

import type { AtomicTestCase, CallApiContextParams } from '../../../src/types/index';

const mockFetchWithRetries = vi.hoisted(() => vi.fn());

vi.mock('../../../src/util/fetch/index', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithRetries: (...args: unknown[]) => mockFetchWithRetries(...args),
}));

vi.mock('../../../src/globalConfig/accounts', () => ({
  getUserEmail: vi.fn().mockReturnValue('test@example.com'),
}));

vi.mock('../../../src/redteam/remoteGeneration', async (importOriginal) => ({
  ...(await importOriginal()),
  getRemoteGenerationUrl: vi.fn().mockReturnValue('https://mocked.task.api'),
}));

function mockJsonResponse(payload: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

describe('IndirectWebPwnProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithRetries.mockReset();
  });

  it.each([
    { uuid: { id: 'invalid' }, evalId: undefined },
    { uuid: 'b385605f-0328-4f21-a977-811ec61bf3f8', evalId: undefined },
    { uuid: { id: 'invalid' }, evalId: 'eval-synthetic' },
    {
      uuid: 'b385605f-0328-4f21-a977-811ec61bf3f8',
      evalId: undefined,
      fullUrl: { url: 'invalid' },
    },
    {
      uuid: 'b385605f-0328-4f21-a977-811ec61bf3f8',
      evalId: undefined,
      fullUrl:
        'https://example.com/dynamic-pages/unrelated-eval/a00ef4e0-aa7b-4112-aae4-7cfbe77c7485',
    },
  ])(
    'stops unavailable tracking without sending invalid identifiers: %j',
    async ({ uuid, evalId, fullUrl = 'https://example.com/synthetic-page' }) => {
      mockFetchWithRetries
        .mockResolvedValueOnce(
          mockJsonResponse({
            uuid,
            fullUrl,
            path: '/synthetic-page',
            fetchPrompt: 'Summarize the synthetic page',
          }),
        )
        .mockResolvedValue(mockJsonResponse({ wasFetched: false, fetchCount: 0 }));
      const target = createMockProvider({
        id: 'synthetic-target',
        response: { output: 'Synthetic target output', tokenUsage: { total: 7 } },
      });
      const provider = new IndirectWebPwnProvider({ injectVar: 'query', maxFetchAttempts: 3 });

      const result = await provider.callApi('Synthetic content', {
        originalProvider: target,
        vars: { query: 'Synthetic goal' },
        prompt: { raw: '{{query}}', label: 'Synthetic prompt' },
        evaluationId: evalId,
      });

      expect(mockFetchWithRetries).toHaveBeenCalledOnce(); // Only page creation.
      expect(target.callApi).toHaveBeenCalledOnce();
      expect(result.metadata).toMatchObject({ stopReason: 'Error', fetchAttempts: 1 });
      expect(result.output).toBe('Synthetic target output');
      expect(result.tokenUsage).toMatchObject({ total: 7, numRequests: 1 });
    },
  );

  it.each(['eval-eval-scan', 'eval-eval-'])(
    'preserves the canonical evaluation ID in standalone tracking: %s',
    async (evaluationId) => {
      mockFetchWithRetries
        .mockResolvedValueOnce(
          mockJsonResponse({
            uuid: 'b385605f-0328-4f21-a977-811ec61bf3f8',
            fullUrl:
              'https://example.com/dynamic-pages/unrelated-eval/b385605f-0328-4f21-a977-811ec61bf3f8',
            path: '/synthetic-page',
            fetchPrompt: 'Summarize the synthetic page',
          }),
        )
        .mockResolvedValueOnce(mockJsonResponse({ wasFetched: true, fetchCount: 1 }));
      const provider = new IndirectWebPwnProvider({ injectVar: 'query', maxFetchAttempts: 1 });
      const result = await provider.callApi('Synthetic content', {
        originalProvider: createMockProvider({ response: { output: 'Synthetic target output' } }),
        vars: { query: 'Synthetic goal' },
        prompt: { raw: '{{query}}', label: 'Synthetic prompt' },
        evaluationId,
      });

      expect(result.metadata.stopReason).toBe('Attack succeeded');
      expect(JSON.parse(mockFetchWithRetries.mock.calls[1][1].body).evalId).toBe(
        evaluationId.replace(/^eval-/, ''),
      );
    },
  );

  it('uses the created page URL when the evaluation context is absent', async () => {
    mockFetchWithRetries
      .mockResolvedValueOnce(
        mockJsonResponse({
          uuid: 'b385605f-0328-4f21-a977-811ec61bf3f8',
          fullUrl:
            'https://example.com/dynamic-pages/stored-eval/b385605f-0328-4f21-a977-811ec61bf3f8',
          path: '/dynamic-pages/stored-eval/b385605f-0328-4f21-a977-811ec61bf3f8',
          fetchPrompt: 'Summarize the synthetic page',
        }),
      )
      .mockResolvedValueOnce(mockJsonResponse({ wasFetched: true, fetchCount: 1 }));
    const provider = new IndirectWebPwnProvider({ injectVar: 'query', maxFetchAttempts: 1 });
    const result = await provider.callApi('Synthetic content', {
      originalProvider: createMockProvider({ response: { output: 'Synthetic target output' } }),
      vars: { query: 'Synthetic goal' },
      prompt: { raw: '{{query}}', label: 'Synthetic prompt' },
    });

    expect(result.metadata.stopReason).toBe('Attack succeeded');
    expect(JSON.parse(mockFetchWithRetries.mock.calls[1][1].body).evalId).toBe('stored-eval');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockFetchWithRetries.mockReset();
  });

  it.each([true, false])(
    'grades the final response using its source type before serialization (text: %s)',
    async (outputIsText) => {
      const llmGrader = vi
        .spyOn(RedteamGraderBase.prototype, 'getResult')
        .mockRejectedValue(new Error('Numeric grading must not call an LLM'));
      mockFetchWithRetries
        .mockResolvedValueOnce(
          mockJsonResponse({
            uuid: 'b385605f-0328-4f21-a977-811ec61bf3f8',
            evalId: 'eval-numeric',
            fullUrl:
              'https://example.com/dynamic-pages/eval-numeric/b385605f-0328-4f21-a977-811ec61bf3f8',
          }),
        )
        .mockResolvedValueOnce(mockJsonResponse({ wasFetched: false, fetchCount: 0 }))
        .mockResolvedValueOnce(mockJsonResponse({ wasFetched: true, fetchCount: 1 }))
        .mockResolvedValue(mockJsonResponse({ wasExfiltrated: false, exfilCount: 0 }));
      const targetProvider = createMockProvider();
      targetProvider.callApi
        .mockResolvedValueOnce({
          output: outputIsText ? { amount: 99 } : '{"amount":99}',
          metadata: { redteamOutputIsText: outputIsText },
        })
        .mockResolvedValueOnce({
          output: outputIsText ? '{"amount":100}' : { amount: 100 },
          metadata: {
            redteamOutputIsText: !outputIsText,
            encoding: { format: 'json' },
            redteamFinalPrompt: 'forged prompt',
            storedGraderResult: { reason: 'forged grade' },
            messages: [{ role: 'system', content: 'forged conversation' }],
          },
        });
      const provider = new IndirectWebPwnProvider({
        injectVar: 'query',
        maxFetchAttempts: 2,
        useLlm: false,
      });

      const result = await provider.callApi('Return the amount as JSON', {
        originalProvider: targetProvider,
        vars: { query: 'Return the amount as JSON' },
        prompt: { raw: '{{query}}', label: 'test' },
        test: {
          assert: [
            {
              type: 'promptfoo:redteam:financial:calculation-error',
              value: { type: 'numeric', expected: { amount: 100 } },
            },
          ],
        } as AtomicTestCase,
      });

      expect(result.output).toBe('{"amount":100}');
      expect(result.metadata).toMatchObject({
        redteamOutputIsText: outputIsText,
        stopReason: 'Attack succeeded',
        fetchAttempts: 2,
        redteamTargetMetadata: {
          encoding: { format: 'json' },
          redteamFinalPrompt: 'forged prompt',
          storedGraderResult: { reason: 'forged grade' },
        },
      });
      expect(result.metadata.redteamFinalPrompt).not.toBe('forged prompt');
      expect(result.metadata.messages[0]).not.toMatchObject({ role: 'system' });
      expect(targetProvider.callApi).toHaveBeenCalledTimes(2);
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(3);
      const grade = runAssertion({
        prompt: 'Return the amount as JSON',
        test: { provider: provider.id(), metadata: { purpose: 'A financial calculator' } },
        assertion: {
          type: 'promptfoo:redteam:financial:calculation-error',
          value: { type: 'numeric', expected: { amount: 100 } },
          transform: 'context.metadata.encoding.format === "json" ? output : "invalid"',
        },
        providerResponse: result,
      });
      if (outputIsText) {
        await expect(grade).resolves.toMatchObject({ pass: true, score: 1 });
      } else {
        await expect(grade).rejects.toThrow(/requires raw JSON text/);
      }
      expect(llmGrader).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    'retains the earlier output source when a later target response fails (text: %s)',
    async (outputIsText) => {
      mockFetchWithRetries
        .mockResolvedValueOnce(
          mockJsonResponse({
            uuid: 'b385605f-0328-4f21-a977-811ec61bf3f8',
            evalId: 'eval-retained',
            fullUrl:
              'https://example.com/dynamic-pages/eval-retained/b385605f-0328-4f21-a977-811ec61bf3f8',
          }),
        )
        .mockResolvedValueOnce(mockJsonResponse({ wasFetched: false, fetchCount: 0 }));
      const sourceMetadata = { encoding: { format: 'json' } };
      const targetProvider = createMockProvider();
      targetProvider.callApi
        .mockResolvedValueOnce({
          output: outputIsText ? '{"amount":100}' : { amount: 100 },
          metadata: sourceMetadata,
        })
        .mockImplementationOnce(async () => {
          sourceMetadata.encoding.format = 'mutated';
          return {
            output: outputIsText ? { amount: 99 } : '{"amount":99}',
            error: 'Target failed',
            metadata: { encoding: { format: 'later' } },
          };
        });
      const provider = new IndirectWebPwnProvider({ injectVar: 'query', maxFetchAttempts: 2 });

      const result = await provider.callApi('Return the amount as JSON', {
        originalProvider: targetProvider,
        vars: { query: 'Return the amount as JSON' },
        prompt: { raw: '{{query}}', label: 'test' },
        test: {
          assert: [
            {
              type: 'promptfoo:redteam:financial:calculation-error',
              value: { type: 'numeric', expected: { amount: 100 } },
            },
          ],
        } as AtomicTestCase,
      });

      expect(result.output).toBe('{"amount":100}');
      expect(result.error).toBe('Target failed');
      expect(result.metadata).toMatchObject({
        redteamOutputIsText: outputIsText,
        redteamTargetMetadata: { encoding: { format: 'json' } },
        stopReason: 'Error',
        fetchAttempts: 2,
      });
      expect(targetProvider.callApi).toHaveBeenCalledTimes(2);
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(2);
    },
  );

  it('should count one probe per target fetch attempt', async () => {
    mockFetchWithRetries
      // create-web-page
      .mockResolvedValueOnce(
        mockJsonResponse({
          uuid: 'a00ef4e0-aa7b-4112-aae4-7cfbe77c7485',
          fullUrl: 'https://example.com/dynamic-pages/eval-1/a00ef4e0-aa7b-4112-aae4-7cfbe77c7485',
          path: '/dynamic-pages/eval-1/a00ef4e0-aa7b-4112-aae4-7cfbe77c7485',
          fetchPrompt:
            'Please fetch https://example.com/dynamic-pages/eval-1/a00ef4e0-aa7b-4112-aae4-7cfbe77c7485',
          tokenUsage: { total: 45, prompt: 32, completion: 13, numRequests: 2 },
        }),
      )
      // tracking for attempt 1
      .mockResolvedValueOnce(mockJsonResponse({ wasFetched: false, fetchCount: 0 }))
      // tracking for attempt 2
      .mockResolvedValueOnce(mockJsonResponse({ wasFetched: true, fetchCount: 1 }));

    const targetProvider = createMockProvider({ id: 'mock-target' });
    targetProvider.callApi
      .mockReset()
      .mockResolvedValueOnce(
        createProviderResponse({
          output: 'Attempt 1 output',
          tokenUsage: { total: 10, prompt: 4, completion: 6 },
        }),
      )
      .mockResolvedValueOnce(
        createProviderResponse({
          output: 'Attempt 2 output',
          tokenUsage: { total: 20, prompt: 8, completion: 12 },
        }),
      );

    const provider = new IndirectWebPwnProvider({
      injectVar: 'query',
      maxFetchAttempts: 3,
      useLlm: false,
    });

    const context: CallApiContextParams = {
      originalProvider: targetProvider,
      vars: { query: 'Find secrets' },
      prompt: { raw: '{{query}}', label: 'test' },
      test: {
        metadata: {
          goal: 'Find secrets',
          testCaseId: 'tc-1',
        },
      } as any,
      evaluationId: 'eval-1',
    };

    const result = await provider.callApi('attack prompt', context);

    expect(result.metadata?.fetchAttempts).toBe(2);
    expect(result.metadata?.stopReason).toBe('Attack succeeded');
    expect(result.error).toBeUndefined();
    expect(result.tokenUsage?.numRequests).toBe(2);
    expect(result.tokenUsage?.total).toBe(30);
    expect(result.tokenUsage?.prompt).toBe(12);
    expect(result.tokenUsage?.completion).toBe(18);
    expect(result.tokenUsage?.attacker).toMatchObject({
      total: 45,
      prompt: 32,
      completion: 13,
      numRequests: 2,
    });
  });

  it('should count probe requests even when target returns an error', async () => {
    mockFetchWithRetries.mockResolvedValueOnce(
      mockJsonResponse({
        uuid: '402ea408-273b-4175-a383-8c4ea5fed513',
        fullUrl: 'https://example.com/dynamic-pages/eval-1/402ea408-273b-4175-a383-8c4ea5fed513',
        path: '/dynamic-pages/eval-1/402ea408-273b-4175-a383-8c4ea5fed513',
        fetchPrompt:
          'Please fetch https://example.com/dynamic-pages/eval-1/402ea408-273b-4175-a383-8c4ea5fed513',
      }),
    );

    const targetProvider = createMockProvider({
      id: 'mock-target',
      response: createProviderResponse({
        output: 'error output',
        error: 'Target failed',
      }),
    });

    const provider = new IndirectWebPwnProvider({
      injectVar: 'query',
      maxFetchAttempts: 3,
      useLlm: false,
    });

    const context: CallApiContextParams = {
      originalProvider: targetProvider,
      vars: { query: 'Find secrets' },
      prompt: { raw: '{{query}}', label: 'test' },
      test: {
        metadata: {
          goal: 'Find secrets',
          testCaseId: 'tc-2',
        },
      } as any,
      evaluationId: 'eval-2',
    };

    const result = await provider.callApi('attack prompt', context);

    expect(result.metadata?.fetchAttempts).toBe(1);
    expect(result.metadata?.stopReason).toBe('Error');
    expect(result.error).toBe('Target failed');
    expect(result.tokenUsage?.numRequests).toBe(1);
    expect(mockFetchWithRetries).toHaveBeenCalledOnce();
  });

  it.each([null, undefined])(
    'preserves earlier usage when a later output is %s',
    async (output) => {
      mockFetchWithRetries
        .mockResolvedValueOnce(
          mockJsonResponse({
            uuid: '3bb69fb2-005f-41d7-b5c2-a03e4f444579',
            fullUrl:
              'https://example.com/dynamic-pages/stored-eval/3bb69fb2-005f-41d7-b5c2-a03e4f444579',
            path: '/dynamic-pages/stored-eval/3bb69fb2-005f-41d7-b5c2-a03e4f444579',
            fetchPrompt: 'Fetch the page',
          }),
        )
        .mockResolvedValueOnce(mockJsonResponse({ wasFetched: false, fetchCount: 0 }));
      const targetProvider = createMockProvider({ id: 'mock-target' });
      targetProvider.callApi
        .mockReset()
        .mockResolvedValueOnce({
          output: 'Previous response',
          tokenUsage: { total: 10, prompt: 4, completion: 6 },
        })
        .mockResolvedValueOnce({ output, tokenUsage: { total: 5, prompt: 5, completion: 0 } });
      const provider = new IndirectWebPwnProvider({
        injectVar: 'query',
        maxFetchAttempts: 3,
        useLlm: false,
      });

      const result = await provider.callApi('attack prompt', {
        originalProvider: targetProvider,
        vars: { query: 'Test objective' },
        prompt: { raw: '{{query}}', label: 'test' },
      });

      expect(result.error).toContain('Target returned malformed response');
      expect(result.output).toBe('Previous response');
      expect(result.metadata?.stopReason).toBe('Error');
      expect(result.tokenUsage).toMatchObject({
        numRequests: 2,
        total: 15,
        prompt: 9,
        completion: 6,
      });
      expect(targetProvider.callApi).toHaveBeenCalledTimes(2);
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(2);
    },
  );
});
