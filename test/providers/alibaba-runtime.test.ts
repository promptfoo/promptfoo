import { describe, expect, it, vi } from 'vitest';
import { AlibabaChatCompletionProvider } from '../../src/providers/alibaba';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('AlibabaChatCompletionProvider request shaping', () => {
  it.each([
    'kimi-k2.7-code',
    'kimi/kimi-k3',
    'kimi/kimi-k2.7-code-highspeed',
    'MiniMax-M2.5',
    'MiniMax/MiniMax-M3',
  ])('omits injected sampling and token defaults for fixed-sampling model %s', async (modelName) => {
    const provider = new AlibabaChatCompletionProvider(modelName, {});
    const { body } = await provider.getOpenAiBody('Hello');

    expect(body.temperature).toBeUndefined();
    expect(body.top_p).toBeUndefined();
    expect(body.presence_penalty).toBeUndefined();
    expect(body.frequency_penalty).toBeUndefined();
    expect(body.max_tokens).toBeUndefined();
    expect(body.max_completion_tokens).toBeUndefined();
  });

  it('does not leak OpenAI sampling environment defaults into fixed-sampling requests', async () => {
    const restore = mockProcessEnv({
      OPENAI_TOP_P: '0.5',
      OPENAI_PRESENCE_PENALTY: '0.7',
      OPENAI_FREQUENCY_PENALTY: '0.9',
    });

    try {
      const provider = new AlibabaChatCompletionProvider('MiniMax/MiniMax-M3', {});
      const { body } = await provider.getOpenAiBody('Hello');

      expect(body.top_p).toBeUndefined();
      expect(body.presence_penalty).toBeUndefined();
      expect(body.frequency_penalty).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('maps an explicit max_tokens to max_completion_tokens for fixed-sampling requests', async () => {
    const provider = new AlibabaChatCompletionProvider('kimi/kimi-k3', {
      config: { temperature: 1, max_tokens: 4096 },
    });
    const { body } = await provider.getOpenAiBody('Hello');

    expect(body.temperature).toBe(1);
    expect(body.max_tokens).toBeUndefined();
    expect(body.max_completion_tokens).toBe(4096);
  });

  it('prefers a prompt-level token limit over either provider-level alias', async () => {
    const provider = new AlibabaChatCompletionProvider('MiniMax/MiniMax-M3', {
      config: { max_completion_tokens: 4096 },
    });
    const { body } = await provider.getOpenAiBody('Hello', {
      prompt: { raw: 'Hello', label: 'test', config: { max_tokens: 2048 } },
      vars: {},
    });

    expect(body.max_tokens).toBeUndefined();
    expect(body.max_completion_tokens).toBe(2048);
  });

  it.each([
    'kimi/kimi-k3',
    'deepseek-v4-pro',
    'vanchin/deepseek-v4-pro',
    'glm-5.2',
    'ZHIPU/GLM-5.2',
    'stepfun/step-3.7-flash',
  ])('forwards reasoning effort for %s', async (modelName) => {
    const provider = new AlibabaChatCompletionProvider(modelName, {
      config: { reasoning_effort: 'high' },
    });
    const { body } = await provider.getOpenAiBody('Hello');

    expect(body.reasoning_effort).toBe('high');
  });

  it('leaves normal Qwen request defaults unchanged', async () => {
    const provider = new AlibabaChatCompletionProvider('qwen3.7-plus', {});
    const { body } = await provider.getOpenAiBody('Hello');

    expect(body.temperature).toBe(0);
    expect(body.max_tokens).toBe(1024);
  });
});
