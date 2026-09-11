import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import { OpenAiResponsesProvider } from '../../../src/providers/openai/responses';
import { mockProcessEnv } from '../../util/utils';

describe.each([
  { api: 'Chat', Provider: OpenAiChatCompletionProvider, tokenLimit: 'max_completion_tokens' },
  { api: 'Responses', Provider: OpenAiResponsesProvider, tokenLimit: 'max_output_tokens' },
])('Daybreak $api requests', ({ Provider, tokenLimit }) => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = mockProcessEnv({
      OPENAI_MAX_TOKENS: undefined,
      OPENAI_MAX_COMPLETION_TOKENS: undefined,
      OPENAI_TEMPERATURE: undefined,
      OPENAI_TOP_P: undefined,
    });
  });

  afterEach(() => {
    restoreEnv();
  });

  it.each([
    'gpt-daybreak-blue-latest',
    'gpt-daybreak-red-latest',
    'openai/gpt-daybreak-blue-latest',
    'openai/gpt-daybreak-red-latest',
  ])('preserves reasoning effort and omits incompatible defaults for %s', async (model) => {
    const { body } = await new Provider(model, {
      config: { reasoning_effort: 'high' },
    }).getOpenAiBody('Hello');

    expect(body.model).toBe(model);
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('max_completion_tokens');
    expect(body).not.toHaveProperty('max_output_tokens');
    if (Provider === OpenAiChatCompletionProvider) {
      expect(body.reasoning_effort).toBe('high');
    } else {
      expect(body.reasoning).toEqual({ effort: 'high' });
    }
  });

  it.each([
    'gpt-daybreak-blue-latest',
    'gpt-daybreak-red-latest',
  ])('respects explicit reasoning token limits and omits temperature for %s', async (model) => {
    const { body } = await new Provider(model, {
      config: { [tokenLimit]: 8192, max_tokens: 100, temperature: 0.7 },
    }).getOpenAiBody('Hello');

    expect(body[tokenLimit]).toBe(8192);
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('temperature');
  });

  it.each([
    'gpt-4.1',
    'gpt-daybreak-red-latest-custom',
    'custom-gpt-daybreak-blue-latest',
  ])('keeps standard-model defaults for %s', async (model) => {
    const { body } = await new Provider(model, {
      config: { reasoning_effort: 'high' },
    }).getOpenAiBody('Hello');

    expect(body.temperature).toBe(0);
    expect(
      body[Provider === OpenAiChatCompletionProvider ? 'max_tokens' : 'max_output_tokens'],
    ).toBe(1024);
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(body).not.toHaveProperty('reasoning');
  });
});
