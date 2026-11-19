import './setup';

import { expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { A2AProvider } from '../../src/providers/a2a';
import { AzureRealtimeProvider } from '../../src/providers/azure/realtime';
import { OpenAiRealtimeProvider } from '../../src/providers/openai/realtime';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

describeEvaluator('Bayes@N native provider sessions', () => {
  it.each(['conversation', 0])(
    'rejects default Azure Realtime conversation reuse with ID %j',
    async (conversationId) => {
      const provider = new AzureRealtimeProvider('gpt-realtime', { id: 'realtime-alias' });
      const call = vi.spyOn(provider, 'callApi').mockResolvedValue({ output: 'answer' });
      await expect(
        evaluate(
          {
            providers: [provider],
            prompts: [toPrompt('question')],
            tests: [{ metadata: { conversationId } }],
          },
          new Eval({}),
          { bayesAtN: true, repeat: 2, cache: false },
        ),
      ).rejects.toThrow('shared provider sessions');
      expect(call).not.toHaveBeenCalled();
    },
  );

  it('allows a prompt to disable the Azure Realtime conversation', async () => {
    const provider = new AzureRealtimeProvider('gpt-realtime', {
      config: { maintainContext: true },
    });
    const call = vi.spyOn(provider, 'callApi').mockResolvedValue({ output: 'answer' });
    const record = new Eval({});
    await evaluate(
      {
        providers: [provider],
        prompts: [{ ...toPrompt('question'), config: { maintainContext: false } }],
        tests: [{ metadata: { conversationId: 'conversation' } }],
      },
      record,
      { bayesAtN: true, repeat: 2, cache: false },
    );
    expect(call).toHaveBeenCalledTimes(2);
    expect((await record.getRepeatStability())?.bayesAtN?.[0].mean).toBe(3 / 4);
  });

  it.each([
    { sessionId: 'conversation', message: undefined },
    {
      sessionId: '',
      message: { contextId: '{% if prompt == "question" %}conversation{% endif %}' },
    },
    { sessionId: '', message: { taskId: 'previous-task' } },
  ])('rejects an A2A continuation before any provider call: %j', async ({ sessionId, message }) => {
    const provider = new A2AProvider('a2a:https://example.test', {
      id: 'a2a-alias',
      config: { message },
    });
    const call = vi.spyOn(provider, 'callApi').mockResolvedValue({ output: 'answer' });
    await expect(
      evaluate(
        {
          providers: [provider],
          prompts: [toPrompt('{{question}}')],
          tests: [{ vars: { question: 'question', sessionId } }],
        },
        new Eval({}),
        { bayesAtN: true, repeat: 2, cache: false },
      ),
    ).rejects.toThrow('shared provider sessions');
    expect(call).not.toHaveBeenCalled();
  });

  it.each(['', 0])('allows an A2A call without a session ID: %j', async (sessionId) => {
    const provider = new A2AProvider('a2a:https://example.test');
    const call = vi.spyOn(provider, 'callApi').mockResolvedValue({ output: 'answer' });
    const record = new Eval({});
    await evaluate(
      {
        providers: [provider],
        prompts: [toPrompt('question')],
        tests: [{ vars: { sessionId } }],
      },
      record,
      { bayesAtN: true, repeat: 2, cache: false },
    );
    expect(call).toHaveBeenCalledTimes(2);
    expect((await record.getRepeatStability())?.bayesAtN?.[0].mean).toBe(3 / 4);
  });

  it('completes ten stateless OpenAI Realtime trials at concurrency four', async () => {
    const provider = new OpenAiRealtimeProvider('gpt-realtime', {
      config: { apiKey: 'test-key' },
    });
    const direct = vi.spyOn(provider, 'directWebSocketRequest').mockResolvedValue({
      output: 'answer',
      cached: false,
      tokenUsage: { prompt: 1, completion: 1, total: 2 },
      metadata: {},
    });
    const persistent = vi.spyOn(provider, 'persistentWebSocketRequest');
    const functionCallHandler = async () => 'tool result';
    const record = new Eval({});
    await evaluate(
      {
        providers: [provider],
        prompts: [{ ...toPrompt('question'), config: { functionCallHandler } }],
        tests: [{}],
      },
      record,
      { bayesAtN: true, repeat: 10, maxConcurrency: 4, cache: false },
    );
    expect(direct).toHaveBeenCalledTimes(10);
    expect(direct.mock.calls.map(([, , handler]) => handler)).toEqual(
      Array(10).fill(functionCallHandler),
    );
    expect(persistent).not.toHaveBeenCalled();
    expect(provider.config.maintainContext).toBe(true);
    expect(provider.config.functionCallHandler).toBeUndefined();
    expect((await record.getRepeatStability())?.bayesAtN?.[0].mean).toBe(11 / 12);
  });
});
