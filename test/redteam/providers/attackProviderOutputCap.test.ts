import { afterEach, describe, expect, it } from 'vitest';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import { OpenAiResponsesProvider } from '../../../src/providers/openai/responses';
import { DEFAULT_REDTEAM_PROVIDER_MAX_TOKENS } from '../../../src/redteam/providers/constants';
import {
  redteamProviderManager,
  resetRedteamProviderLoader,
  setRedteamProviderLoader,
} from '../../../src/redteam/providers/shared';
import { mockProcessEnv } from '../../util/utils';

describe('redteam attack provider output caps', () => {
  afterEach(() => {
    redteamProviderManager.clearProvider();
    resetRedteamProviderLoader();
  });

  it('caps the actual OpenAI chat request body for attack calls', async () => {
    const provider = new OpenAiChatCompletionProvider('gpt-4.1', { config: {} });
    const restoreLoader = setRedteamProviderLoader(async () => [provider]);

    try {
      const loaded = await redteamProviderManager.getProvider({
        provider: 'openai:chat:gpt-4.1',
        purpose: 'attack',
      });
      const { body } = await (loaded as OpenAiChatCompletionProvider).getOpenAiBody('hello');

      expect(body.max_tokens).toBe(DEFAULT_REDTEAM_PROVIDER_MAX_TOKENS);
      expect(body).not.toHaveProperty('max_completion_tokens');
    } finally {
      restoreLoader();
    }
  });

  it('caps the actual OpenAI Responses request body with max_output_tokens', async () => {
    const provider = new OpenAiResponsesProvider('gpt-5.5', { config: {} });
    const restoreLoader = setRedteamProviderLoader(async () => [provider]);

    try {
      const loaded = await redteamProviderManager.getProvider({
        provider: 'openai:responses:gpt-5.5',
        purpose: 'attack',
      });
      const { body } = await (loaded as OpenAiResponsesProvider).getOpenAiBody('hello');

      expect(body.max_output_tokens).toBe(DEFAULT_REDTEAM_PROVIDER_MAX_TOKENS);
      expect(body).not.toHaveProperty('max_tokens');
    } finally {
      restoreLoader();
    }
  });

  it('preserves a larger batch-generation budget from OPENAI_MAX_TOKENS', async () => {
    const restoreEnv = mockProcessEnv({ OPENAI_MAX_TOKENS: '32768' });
    const provider = new OpenAiChatCompletionProvider('gpt-4.1', { config: {} });
    const restoreLoader = setRedteamProviderLoader(async () => [provider]);

    try {
      const loaded = await redteamProviderManager.getProvider({
        provider: 'openai:chat:gpt-4.1',
      });
      const { body } = await (loaded as OpenAiChatCompletionProvider).getOpenAiBody('hello');

      expect(body.max_tokens).toBe(32768);
    } finally {
      restoreLoader();
      restoreEnv();
    }
  });
});
