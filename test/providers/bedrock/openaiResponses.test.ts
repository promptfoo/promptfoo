import { afterEach, describe, expect, it } from 'vitest';
import {
  BedrockGrokResponsesProvider,
  BedrockOpenAiResponsesProvider,
  createBedrockOpenAiResponsesProvider,
  getBedrockMantleBaseUrl,
  isBedrockGrokModel,
  isBedrockMantleResponsesModel,
  isBedrockOpenAiResponsesModel,
} from '../../../src/providers/bedrock/openaiResponses';
import { calculateOpenAIUsageCost } from '../../../src/providers/openai/billing';
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

    it('rejects region/geo-prefixed frontier ids (AWS offers only the bare ids)', () => {
      // AWS's GPT-5.5 / GPT-5.4 model cards mark Geo and Global inference IDs as "Not
      // supported", so a prefixed id is not a real Bedrock model — it must not be routed to the
      // mantle endpoint; it falls through to a clear error instead.
      expect(isBedrockOpenAiResponsesModel('us.openai.gpt-5.5')).toBe(false);
      expect(isBedrockOpenAiResponsesModel('eu.openai.gpt-5.4')).toBe(false);
      expect(isBedrockOpenAiResponsesModel('global.openai.gpt-5.5')).toBe(false);
      // ...and region-prefixed gpt-oss is likewise not a Responses model.
      expect(isBedrockOpenAiResponsesModel('us.openai.gpt-oss-120b')).toBe(false);
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

    it('accepts non-standard but well-formed AWS region shapes', () => {
      expect(getBedrockMantleBaseUrl('us-gov-west-1')).toBe(
        'https://bedrock-mantle.us-gov-west-1.api.aws/openai/v1',
      );
      expect(getBedrockMantleBaseUrl('ap-southeast-4')).toBe(
        'https://bedrock-mantle.ap-southeast-4.api.aws/openai/v1',
      );
    });

    it('rejects a malformed region instead of building a bogus host (defense-in-depth)', () => {
      // A value like `evil.com/x` would otherwise yield host `bedrock-mantle.evil.com`.
      expect(() => getBedrockMantleBaseUrl('evil.com/x')).toThrow(/Invalid AWS region/);
      expect(() => getBedrockMantleBaseUrl('us_east_2')).toThrow(/Invalid AWS region/);
      expect(() => getBedrockMantleBaseUrl('')).toThrow(/Invalid AWS region/);
    });
  });

  describe('createBedrockOpenAiResponsesProvider', () => {
    it('throws a helpful error when no Bedrock API key is configured', () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined });
      expect(() => createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {})).toThrow(
        /AWS_BEARER_TOKEN_BEDROCK/,
      );
    });

    it('treats an unresolved {{env.*}} apiKey template as missing (helpful error)', () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined });
      // Simulates the env var being unset: the template literal must NOT be sent as a bearer
      // token (which would 401); the user should get the actionable missing-key error.
      expect(() =>
        createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
          config: { apiKey: '{{env.AWS_BEARER_TOKEN_BEDROCK}}' },
        }),
      ).toThrow(/AWS_BEARER_TOKEN_BEDROCK/);
    });

    it('falls back to the env var when apiKey is an unresolved template but the env is set', () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'real-key' });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: '{{env.AWS_BEARER_TOKEN_BEDROCK}}' },
      });
      expect((provider.config as any).apiKey).toBe('real-key');
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

    it('strips the openai. prefix for billing so OpenAI cost rates apply', () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key' });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {});
      // getBillingModelName is protected; the Bedrock id must resolve to the OpenAI
      // billing key so cost is computed (Bedrock mirrors OpenAI first-party rates).
      expect((provider as any).getBillingModelName({})).toBe('gpt-5.5');
    });

    it.each([
      'openai.gpt-5.5',
      'openai.gpt-5.4',
    ])('computes a finite, non-zero cost end-to-end for %s via the OpenAI billing tables', (modelId) => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key' });
      const provider = createBedrockOpenAiResponsesProvider(modelId, {});
      const billingModelName = (provider as any).getBillingModelName({});
      // The stripped id must actually resolve in the OpenAI cost map, not just be a string.
      const cost = calculateOpenAIUsageCost(
        billingModelName,
        {},
        {
          input_tokens: 1000,
          output_tokens: 500,
        },
      );
      expect(cost).toBeGreaterThan(0);
      expect(Number.isFinite(cost)).toBe(true);
    });

    it('detects the prefixed frontier id as a GPT-5 / reasoning model', () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key' });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {});
      // Without prefix-stripping these would be false (the id starts with "openai.").
      expect((provider as any).isGPT5Model()).toBe(true);
      expect((provider as any).isReasoningModel()).toBe(true);
      expect((provider as any).supportsTemperature()).toBe(false);
    });

    it('sends GPT-5 controls in the request body and preserves the openai. model id', async () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key' });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { reasoning_effort: 'high', verbosity: 'low' } as any,
      });

      const { body } = await (provider as any).getOpenAiBody('hello');

      // Real Bedrock model id is sent to the mantle endpoint...
      expect(body.model).toBe('openai.gpt-5.5');
      // ...while GPT-5 capability detection applies: reasoning effort + verbosity are sent,
      // and no temperature default leaks in (reasoning models don't support it).
      expect(body.reasoning).toEqual({ effort: 'high' });
      expect(body.text?.verbosity).toBe('low');
      expect(body.temperature).toBeUndefined();
    });

    it('honors AWS_BEARER_TOKEN_BEDROCK and AWS_REGION supplied via promptfoo env overrides', () => {
      restoreEnv = mockProcessEnv({
        AWS_BEARER_TOKEN_BEDROCK: undefined,
        AWS_BEDROCK_REGION: undefined,
        AWS_REGION: undefined,
        AWS_DEFAULT_REGION: undefined,
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.4', {
        env: { AWS_BEARER_TOKEN_BEDROCK: 'override-key', AWS_REGION: 'us-west-2' } as any,
      });
      expect((provider.config as any).apiKey).toBe('override-key');
      expect((provider.config as any).apiBaseUrl).toBe(
        'https://bedrock-mantle.us-west-2.api.aws/openai/v1',
      );
    });

    it('pins the mantle endpoint even when OPENAI_API_HOST is set', () => {
      restoreEnv = mockProcessEnv({
        AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key',
        OPENAI_API_HOST: 'unrelated.example.com',
      });
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { region: 'us-east-2' },
      });
      // Base getApiUrl() would prefer OPENAI_API_HOST; the subclass must override that.
      expect(provider.getApiUrl()).toBe('https://bedrock-mantle.us-east-2.api.aws/openai/v1');
    });

    it('falls back to the base OpenAI URL when constructed directly without apiBaseUrl', () => {
      // The factory always sets config.apiBaseUrl, so the `|| super.getApiUrl()` fallback in the
      // override is only reachable by a direct caller. Exercise it: with no apiBaseUrl, getApiUrl()
      // must delegate to the base provider (never the mantle endpoint).
      restoreEnv = mockProcessEnv({
        OPENAI_API_HOST: undefined,
        OPENAI_BASE_URL: undefined,
        OPENAI_API_BASE_URL: undefined,
      });
      const direct = new BedrockOpenAiResponsesProvider('openai.gpt-5.5', {
        config: { apiKey: 'k' },
      });
      expect(direct.getApiUrl()).not.toContain('bedrock-mantle');
      expect(direct.getApiUrl()).toBe(
        new OpenAiResponsesProvider('gpt-5.5', { config: { apiKey: 'k' } }).getApiUrl(),
      );
    });
  });

  describe('xAI Grok (mantle Responses)', () => {
    it('classifies xai. ids', () => {
      expect(isBedrockGrokModel('xai.grok-4.3')).toBe(true);
      expect(isBedrockGrokModel('openai.gpt-5.5')).toBe(false);
      expect(isBedrockGrokModel('anthropic.claude-opus-4-8')).toBe(false);
    });

    it('isBedrockMantleResponsesModel covers both frontier OpenAI and Grok', () => {
      expect(isBedrockMantleResponsesModel('openai.gpt-5.5')).toBe(true);
      expect(isBedrockMantleResponsesModel('xai.grok-4.3')).toBe(true);
      // gpt-oss (InvokeModel) and ordinary InvokeModel families are not mantle Responses models.
      expect(isBedrockMantleResponsesModel('openai.gpt-oss-120b-1:0')).toBe(false);
      expect(isBedrockMantleResponsesModel('zai.glm-5')).toBe(false);
    });

    it('builds a Grok provider on the us-west-2 mantle endpoint by default', () => {
      restoreEnv = mockProcessEnv({
        AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key',
        AWS_BEDROCK_REGION: undefined,
        AWS_REGION: undefined,
        AWS_DEFAULT_REGION: undefined,
      });
      const provider = createBedrockOpenAiResponsesProvider('xai.grok-4.3', {});
      expect(provider).toBeInstanceOf(BedrockGrokResponsesProvider);
      expect((provider.config as any).apiBaseUrl).toBe(
        'https://bedrock-mantle.us-west-2.api.aws/openai/v1',
      );
      expect((provider.config as any).apiKey).toBe('env-bedrock-key');
    });

    it('reuses the missing-key error path', () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined });
      expect(() => createBedrockOpenAiResponsesProvider('xai.grok-4.3', {})).toThrow(
        /AWS_BEARER_TOKEN_BEDROCK/,
      );
    });

    it('treats Grok as a reasoning model but does NOT mark it GPT-5', () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key' });
      const provider = createBedrockOpenAiResponsesProvider('xai.grok-4.3', {});
      // Capability/billing name strips the xai. prefix.
      expect((provider as any).getCapabilityModelName()).toBe('grok-4.3');
      expect((provider as any).isReasoningModel()).toBe(true);
      expect((provider as any).isGPT5Model()).toBe(false);
      // Reasoning-model coupling => no temperature (Grok's Responses API rejects it).
      expect((provider as any).supportsTemperature()).toBe(false);
    });

    it('forwards reasoning effort, sends the real xai. model id, and omits temperature', async () => {
      restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: 'env-bedrock-key' });
      const provider = createBedrockOpenAiResponsesProvider('xai.grok-4.3', {
        config: { reasoning_effort: 'high', temperature: 0 } as any,
      });
      const { body } = await (provider as any).getOpenAiBody('What is 17*23?');
      expect(body.model).toBe('xai.grok-4.3');
      expect(body.reasoning).toEqual({ effort: 'high' });
      // Grok's Responses API rejects temperature; promptfoo must not send it even if configured.
      expect(body.temperature).toBeUndefined();
      // No GPT-5 verbosity for Grok.
      expect(body.text?.verbosity).toBeUndefined();
    });
  });
});
