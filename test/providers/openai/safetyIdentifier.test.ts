import { describe, expect, it } from 'vitest';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import { OpenAiResponsesProvider } from '../../../src/providers/openai/responses';

describe.each([
  { name: 'Chat Completions', Provider: OpenAiChatCompletionProvider },
  { name: 'Responses', Provider: OpenAiResponsesProvider },
])('$name safety identifiers', ({ Provider }) => {
  it.each([
    { name: 'configured', config: { safety_identifier: 'user-123' }, expected: 'user-123' },
    { name: 'unset', config: {}, expected: undefined },
    {
      name: 'prompt override',
      config: { safety_identifier: 'provider-user' },
      promptConfig: { safety_identifier: 'prompt-user' },
      expected: 'prompt-user',
    },
    {
      name: 'passthrough override',
      config: {
        safety_identifier: 'provider-user',
        passthrough: { safety_identifier: 'passthrough-user' },
      },
      expected: 'passthrough-user',
    },
  ])('sends the $name safety identifier', async ({ config, promptConfig, expected }) => {
    const provider = new Provider('gpt-4.1-mini', { config });
    const { body } = await provider.getOpenAiBody('Test prompt', {
      vars: {},
      prompt: { raw: 'Test prompt', label: 'Test prompt', config: promptConfig },
    });

    if (expected === undefined) {
      expect(body).not.toHaveProperty('safety_identifier');
    } else {
      expect(body.safety_identifier).toBe(expected);
    }
  });
});
