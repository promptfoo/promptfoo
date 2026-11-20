import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { AlibabaChatCompletionProvider } from '../../src/providers/alibaba';
import { mockProcessEnv } from '../util/utils';

import type { OpenAiCompletionOptions } from '../../src/providers/openai/types';
import type { CallApiContextParams } from '../../src/types/index';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));

let restoreEnv: () => void;
beforeEach(() => {
  vi.resetAllMocks();
  restoreEnv = mockProcessEnv({
    DASHSCOPE_API_KEY: undefined,
    OPENAI_MAX_TOKENS: undefined,
    OPENAI_MAX_COMPLETION_TOKENS: undefined,
    OPENAI_TEMPERATURE: undefined,
  });
});
afterEach(() => restoreEnv());

function makeProvider(modelName: string, config: OpenAiCompletionOptions = {}) {
  return new AlibabaChatCompletionProvider(modelName, { config: { apiKey: 'fixture', ...config } });
}

function promptContext(config: OpenAiCompletionOptions): CallApiContextParams {
  return { vars: {}, prompt: { raw: 'Hello', label: 'fixture', config } };
}

describe('Alibaba Qwen4 request body', () => {
  it('omits the default max_tokens cap, which would also limit Qwen4 reasoning', async () => {
    const { body } = await makeProvider('qwen4-max').getOpenAiBody('Hello');

    expect(body).toMatchObject({ model: 'qwen4-max', temperature: 0 });
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('max_completion_tokens');
  });

  it('forwards reasoning_effort and max_completion_tokens', async () => {
    const { body } = await makeProvider('qwen4-max', {
      reasoning_effort: 'xhigh',
      max_completion_tokens: 8192,
    }).getOpenAiBody('Hello');

    expect(body).toMatchObject({ reasoning_effort: 'xhigh', max_completion_tokens: 8192 });
    expect(body).not.toHaveProperty('max_tokens');
  });

  it('keeps DashScope thinking fields and an explicit temperature', async () => {
    const { body } = await makeProvider('qwen4-max', {
      temperature: 0.7,
      passthrough: { enable_thinking: true, thinking_budget: 4096 },
    }).getOpenAiBody('Hello');

    expect(body).toMatchObject({ temperature: 0.7, enable_thinking: true, thinking_budget: 4096 });
  });

  it.each([
    [{ max_tokens: 4096 }, {}, 4096],
    [{ passthrough: { max_tokens: 2048 } }, {}, 2048],
    [{ max_tokens: 4096, passthrough: { max_completion_tokens: 900 } }, {}, 900],
    [{ max_completion_tokens: 8192 }, { max_tokens: 512 }, 512],
    [{ max_tokens: 8192 }, { passthrough: { max_completion_tokens: 256 } }, 256],
  ])(
    'sends explicit token limits as max_completion_tokens (%j, prompt %j)',
    async (config, promptConfig, expected) => {
      const { body } = await makeProvider('qwen4-max', config).getOpenAiBody(
        'Hello',
        promptContext(promptConfig),
      );

      expect(body.max_completion_tokens).toBe(expected);
      expect(body).not.toHaveProperty('max_tokens');
    },
  );

  it('uses OPENAI_MAX_COMPLETION_TOKENS but not OPENAI_MAX_TOKENS', async () => {
    restoreEnv();
    restoreEnv = mockProcessEnv({ OPENAI_MAX_TOKENS: '12', OPENAI_MAX_COMPLETION_TOKENS: '3000' });

    const { body } = await makeProvider('qwen4-max').getOpenAiBody('Hello');

    expect(body.max_completion_tokens).toBe(3000);
    expect(body).not.toHaveProperty('max_tokens');
  });

  it('applies Qwen4 rules when passthrough selects a Qwen4 model', async () => {
    const { body } = await makeProvider('qwen3.8-max', {
      reasoning_effort: 'low',
      passthrough: { model: 'qwen4-max' },
    }).getOpenAiBody('Hello');

    expect(body).toMatchObject({ model: 'qwen4-max', reasoning_effort: 'low', temperature: 0 });
    expect(body).not.toHaveProperty('max_tokens');
  });

  it('applies earlier Qwen rules when passthrough selects an earlier model', async () => {
    const { body } = await makeProvider('qwen4-max', {
      passthrough: { model: 'qwen3.8-max' },
    }).getOpenAiBody('Hello');

    expect(body).toMatchObject({ model: 'qwen3.8-max', max_tokens: 1024, temperature: 0 });
  });

  it('keeps the existing request defaults for earlier Qwen models', async () => {
    const { body } = await makeProvider('qwen3.8-max', {
      reasoning_effort: 'low',
    }).getOpenAiBody('Hello');

    expect(body).toMatchObject({ model: 'qwen3.8-max', max_tokens: 1024, temperature: 0 });
    expect(body).not.toHaveProperty('max_completion_tokens');
    expect(body).not.toHaveProperty('reasoning_effort');
  });
});

describe('Alibaba-hosted models whose max_tokens includes reasoning', () => {
  const sharedLimitModels = [
    'deepseek-v4.1-flash',
    'deepseek-v4-pro',
    'deepseek-v4-pro-0813',
    'deepseek-v4-flash-0731',
    'glm-5.3',
    'glm-5.2',
  ];

  it.each(sharedLimitModels)('omits the default max_tokens cap for %s', async (modelName) => {
    const { body } = await makeProvider(modelName).getOpenAiBody('Hello');

    expect(body).toMatchObject({ model: modelName, temperature: 0 });
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('max_completion_tokens');
  });

  it.each(sharedLimitModels)(
    'forwards reasoning_effort and sends max_tokens as max_completion_tokens for %s',
    async (modelName) => {
      const { body } = await makeProvider(modelName, {
        reasoning_effort: 'high',
        max_tokens: 4096,
      }).getOpenAiBody('Hello');

      expect(body).toMatchObject({ reasoning_effort: 'high', max_completion_tokens: 4096 });
      expect(body).not.toHaveProperty('max_tokens');
    },
  );

  it('keeps glm-5.2 max_tokens as the answer limit when thinking_budget is set', async () => {
    const { body } = await makeProvider('glm-5.2', {
      max_tokens: 8192,
      passthrough: { thinking_budget: 2048 },
    }).getOpenAiBody('Hello', promptContext({ max_tokens: 1500 }));

    expect(body).toMatchObject({ thinking_budget: 2048, max_tokens: 1500 });
    expect(body).not.toHaveProperty('max_completion_tokens');
  });

  it('forwards glm-5.2 max_completion_tokens alongside thinking_budget', async () => {
    const { body } = await makeProvider('glm-5.2', {
      max_completion_tokens: 6000,
      passthrough: { thinking_budget: 2048 },
    }).getOpenAiBody('Hello');

    expect(body).toMatchObject({ thinking_budget: 2048, max_completion_tokens: 6000 });
    expect(body).not.toHaveProperty('max_tokens');
  });

  it.each(['kimi-k3.1-pro', 'MiniMax-M2.5', 'ZHIPU/GLM-5.3'])(
    'keeps the existing request defaults for %s',
    async (modelName) => {
      const { body } = await makeProvider(modelName).getOpenAiBody('Hello');

      expect(body).toMatchObject({ model: modelName, max_tokens: 1024, temperature: 0 });
    },
  );
});

describe('Alibaba Qwen4 responses', () => {
  it('returns reasoning, answer, token usage and configured cost', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        id: 'chatcmpl-fixture',
        object: 'chat.completion',
        model: 'qwen4-max',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              reasoning_content: 'The user asks for the capital of France.',
              content: 'Paris.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 1234,
          completion_tokens: 1700,
          total_tokens: 2934,
          prompt_tokens_details: { cached_tokens: 1000, text_tokens: 1234 },
          completion_tokens_details: { reasoning_tokens: 1500, text_tokens: 1700 },
        },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const result = await makeProvider('qwen4-max', {
      inputCost: 1.5 / 1e6,
      outputCost: 4.5 / 1e6,
    }).callApi('What is the capital of France?');

    expect(result.error).toBeUndefined();
    expect(result.output).toBe('Thinking: The user asks for the capital of France.\n\nParis.');
    expect(result.tokenUsage).toMatchObject({
      prompt: 1234,
      completion: 1700,
      total: 2934,
      completionDetails: { reasoning: 1500, cacheReadInputTokens: 1000 },
    });
    expect(result.cost).toBeCloseTo((1234 * 1.5 + 1700 * 4.5) / 1e6, 12);

    const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(url).toBe('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions');
    const sentBody = JSON.parse(String((request as RequestInit).body));
    expect(sentBody).toMatchObject({ model: 'qwen4-max', temperature: 0 });
    expect(sentBody).not.toHaveProperty('max_tokens');
  });

  it('surfaces DashScope errors without a cost', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        error: {
          message: 'Setting both reasoning_effort and thinking_budget is not supported.',
          type: 'invalid_request_error',
          code: 'invalid_parameter_error',
        },
      },
      cached: false,
      status: 400,
      statusText: 'Bad Request',
    });

    const result = await makeProvider('qwen4-max', {
      reasoning_effort: 'high',
      passthrough: { thinking_budget: 4096 },
    }).callApi('Hello');

    expect(result.error).toContain('400 Bad Request');
    expect(result.error).toContain('reasoning_effort and thinking_budget');
    expect(result.cost).toBeUndefined();
  });
});
