import { describe, expect, it } from 'vitest';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import { OpenAiResponsesProvider } from '../../../src/providers/openai/responses';

const sampling = { temperature: 0.4, top_p: 0.9, top_k: 10 };
const endpoint = { apiBaseUrl: 'https://gateway.example/v1', apiKey: 'test-key' };
const haiku = 'claude-haiku-5-5';

describe.each([
  { route: 'Chat Completions', Provider: OpenAiChatCompletionProvider },
  { route: 'Responses', Provider: OpenAiResponsesProvider },
])('$route Claude sampling parameters', ({ Provider }) => {
  it('omits the built-in default temperature on Haiku', async () => {
    const { body } = await new Provider(haiku, { config: endpoint }).getOpenAiBody('hi');
    expect(body).not.toHaveProperty('temperature');
  });

  it.each([
    [haiku, undefined],
    ['claude-opus-5-5', undefined],
    ['anthropic/claude-sonnet-5-5', undefined],
    ['anthropic/claude-opus-4.7', undefined],
    ['global.anthropic.claude-haiku-5-5', undefined],
    ['claude-haiku-5-5-20261015', undefined],
    ['us.anthropic.claude-opus-4-7-v1:0', undefined],
    ['gpt-4.1', haiku],
    ['ft:claude-haiku-5-5:org:label:id', undefined],
    ['ft:anthropic/claude-haiku-5-5:org:label:id', undefined],
  ] as const)('omits sampling for %s with model override %s', async (configured, override) => {
    const provider = new Provider(configured, {
      config: {
        ...endpoint,
        temperature: 0,
        top_p: 0.5,
        passthrough: { ...sampling, ...(override && { model: override }) },
      },
    });
    const { body } = await provider.getOpenAiBody('hi');
    expect(body.model).toBe(override ?? configured);
    for (const key of Object.keys(sampling)) {
      expect(body).not.toHaveProperty(key);
    }
  });

  it.each([
    ['gpt-4.1', undefined],
    ['claude-haiku-4-5', undefined],
    ['prod-claude-router-5', undefined],
    ['claude-tenant-proxy-claude-haiku-5-5', undefined],
    ['claude-haiku-5-5-internal-example', undefined],
    ['prod-claude-haiku-5-5-router', undefined],
    ['ft:gpt-4.1:org:claude-haiku-5-5:id', undefined],
    ['ft:gpt-4.1:org:anthropic/claude-haiku-5-5:id', undefined],
    [haiku, 'gpt-4.1'],
  ] as const)('keeps sampling for %s with model override %s', async (configured, override) => {
    const provider = new Provider(configured, {
      config: {
        ...endpoint,
        temperature: sampling.temperature,
        top_p: sampling.top_p,
        passthrough: { top_k: sampling.top_k, ...(override && { model: override }) },
      },
    });
    const { body } = await provider.getOpenAiBody('hi');
    expect(body).toMatchObject({ model: override ?? configured, ...sampling });
  });
});
