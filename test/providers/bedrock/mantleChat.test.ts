import { afterEach, describe, expect, it } from 'vitest';
import {
  BedrockMantleChatProvider,
  createBedrockMantleChatProvider,
  getBedrockMantleChatBaseUrl,
} from '../../../src/providers/bedrock/mantleChat';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import { mockProcessEnv } from '../../util/utils';

describe('bedrock mantle Chat Completions provider', () => {
  let restoreEnv: (() => void) | undefined;

  afterEach(() => {
    restoreEnv?.();
    restoreEnv = undefined;
  });

  describe('getBedrockMantleChatBaseUrl', () => {
    it('builds the bare /v1 mantle endpoint (not /openai/v1)', () => {
      expect(getBedrockMantleChatBaseUrl('us-east-1')).toBe(
        'https://bedrock-mantle.us-east-1.api.aws/v1',
      );
      expect(getBedrockMantleChatBaseUrl('us-west-2')).toBe(
        'https://bedrock-mantle.us-west-2.api.aws/v1',
      );
    });

    it('rejects a malformed region', () => {
      expect(() => getBedrockMantleChatBaseUrl('evil.com/x')).toThrow(/Invalid AWS region/);
    });
  });

  describe('createBedrockMantleChatProvider', () => {
    it('throws a helpful error when no Bedrock API key is configured', () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined });
      expect(() => createBedrockMantleChatProvider('zai.glm-4.6', {})).toThrow(
        /AWS_BEARER_TOKEN_BEDROCK/,
      );
    });

    it('targets the mantle /v1 endpoint for the configured region with config.apiKey', () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined });
      const provider = createBedrockMantleChatProvider('deepseek.v3.1', {
        config: { region: 'us-west-2', apiKey: 'bedrock-key' },
      });
      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect((provider.config as any).apiBaseUrl).toBe(
        'https://bedrock-mantle.us-west-2.api.aws/v1',
      );
      expect((provider.config as any).apiKey).toBe('bedrock-key');
    });

    it('falls back to AWS_BEARER_TOKEN_BEDROCK and the default region', () => {
      restoreEnv = mockProcessEnv({
        AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key',
        AWS_BEDROCK_REGION: undefined,
        AWS_REGION: undefined,
        AWS_DEFAULT_REGION: undefined,
      });
      const provider = createBedrockMantleChatProvider('google.gemma-4-31b', {});
      expect((provider.config as any).apiBaseUrl).toBe(
        'https://bedrock-mantle.us-east-1.api.aws/v1',
      );
      expect((provider.config as any).apiKey).toBe('env-bedrock-key');
    });

    it('treats an unresolved {{env.*}} apiKey template as missing', () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined });
      expect(() =>
        createBedrockMantleChatProvider('zai.glm-4.6', {
          config: { apiKey: '{{env.AWS_BEARER_TOKEN_BEDROCK}}' },
        }),
      ).toThrow(/AWS_BEARER_TOKEN_BEDROCK/);
    });

    it('pins the mantle endpoint even when OPENAI_API_HOST is set', () => {
      restoreEnv = mockProcessEnv({
        AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key',
        OPENAI_API_HOST: 'unrelated.example.com',
      });
      const provider = createBedrockMantleChatProvider('zai.glm-4.6', {
        config: { region: 'us-west-2' },
      });
      // Base getApiUrl() would prefer OPENAI_API_HOST; the subclass must override that so the
      // Bedrock bearer token is never sent to the wrong host.
      expect(provider.getApiUrl()).toBe('https://bedrock-mantle.us-west-2.api.aws/v1');
    });

    it('sends the real model id and posts to <base>/chat/completions', async () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key' });
      const provider = createBedrockMantleChatProvider('deepseek.v3.1', {
        config: { region: 'us-west-2' },
      }) as BedrockMantleChatProvider;
      const { body } = await (provider as any).getOpenAiBody('hello');
      expect(body.model).toBe('deepseek.v3.1');
      expect(`${provider.getApiUrl()}/chat/completions`).toBe(
        'https://bedrock-mantle.us-west-2.api.aws/v1/chat/completions',
      );
    });
  });
});
