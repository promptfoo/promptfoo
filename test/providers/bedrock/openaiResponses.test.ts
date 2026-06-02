import { afterEach, describe, expect, it } from 'vitest';
import {
  createBedrockOpenAiResponsesProvider,
  getBedrockMantleBaseUrl,
  isBedrockOpenAiResponsesModel,
} from '../../../src/providers/bedrock/openaiResponses';
import { OpenAiResponsesProvider } from '../../../src/providers/openai/responses';
import { mockProcessEnv } from '../../util/utils';

describe('bedrock openaiResponses helper', () => {
  let restoreEnv: (() => void) | undefined;

  afterEach(() => {
    restoreEnv?.();
    restoreEnv = undefined;
  });

  describe('isBedrockOpenAiResponsesModel', () => {
    it('treats frontier gpt-5.x ids as Responses models', () => {
      expect(isBedrockOpenAiResponsesModel('openai.gpt-5.5')).toBe(true);
      expect(isBedrockOpenAiResponsesModel('openai.gpt-5.4')).toBe(true);
    });

    it('excludes open-weight gpt-oss ids (served via InvokeModel)', () => {
      expect(isBedrockOpenAiResponsesModel('openai.gpt-oss-120b-1:0')).toBe(false);
      expect(isBedrockOpenAiResponsesModel('openai.gpt-oss-safeguard-20b')).toBe(false);
    });

    it('excludes non-openai ids', () => {
      expect(isBedrockOpenAiResponsesModel('anthropic.claude-opus-4-8')).toBe(false);
      expect(isBedrockOpenAiResponsesModel('qwen.qwen3-32b-v1:0')).toBe(false);
    });
  });

  describe('getBedrockMantleBaseUrl', () => {
    it('builds the regional mantle endpoint', () => {
      expect(getBedrockMantleBaseUrl('us-east-2')).toBe(
        'https://bedrock-mantle.us-east-2.api.aws/openai/v1',
      );
      expect(getBedrockMantleBaseUrl('us-west-2')).toBe(
        'https://bedrock-mantle.us-west-2.api.aws/openai/v1',
      );
    });
  });

  describe('createBedrockOpenAiResponsesProvider', () => {
    it('throws a helpful error when no Bedrock API key is configured', () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined });
      expect(() => createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {})).toThrow(
        /AWS_BEARER_TOKEN_BEDROCK/,
      );
    });

    it('targets the mantle endpoint for the configured region with config.apiKey', () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { region: 'us-west-2', apiKey: 'bedrock-key' },
      });
      expect(provider).toBeInstanceOf(OpenAiResponsesProvider);
      expect((provider.config as any).apiBaseUrl).toBe(
        'https://bedrock-mantle.us-west-2.api.aws/openai/v1',
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
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {});
      expect((provider.config as any).apiBaseUrl).toBe(
        'https://bedrock-mantle.us-east-2.api.aws/openai/v1',
      );
      expect((provider.config as any).apiKey).toBe('env-bedrock-key');
    });

    it('respects an explicit apiBaseUrl override', () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key' });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiBaseUrl: 'https://example.test/openai/v1' },
      });
      expect((provider.config as any).apiBaseUrl).toBe('https://example.test/openai/v1');
    });
  });
});
