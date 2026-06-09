import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearCache, disableCache } from '../../../src/cache';
import {
  BedrockAnthropicMessagesProvider,
  createBedrockAnthropicMessagesProvider,
  getBedrockAnthropicBaseUrl,
  isBedrockAnthropicMessagesModel,
} from '../../../src/providers/bedrock/anthropicMessages';
import { mockProcessEnv } from '../../util/utils';
import type Anthropic from '@anthropic-ai/sdk';

describe('Bedrock Anthropic Messages provider', () => {
  let restoreEnv: (() => void) | undefined;

  afterEach(async () => {
    restoreEnv?.();
    restoreEnv = undefined;
    await clearCache();
  });

  it('recognizes only the Anthropic models served by the Bedrock Messages endpoint', () => {
    expect(isBedrockAnthropicMessagesModel('anthropic.claude-fable-5')).toBe(true);
    expect(isBedrockAnthropicMessagesModel('anthropic.claude-mythos-5')).toBe(true);
    expect(isBedrockAnthropicMessagesModel('anthropic.claude-mythos-preview')).toBe(false);
    expect(isBedrockAnthropicMessagesModel('anthropic.claude-opus-4-8')).toBe(false);
  });

  it('builds and validates the regional Anthropic endpoint', () => {
    expect(getBedrockAnthropicBaseUrl('us-east-1')).toBe(
      'https://bedrock-mantle.us-east-1.api.aws/anthropic',
    );
    expect(() => getBedrockAnthropicBaseUrl('evil.example/x')).toThrow(/Invalid AWS region/);
  });

  it('requires a Bedrock API key', () => {
    restoreEnv = mockProcessEnv({ AWS_BEARER_TOKEN_BEDROCK: undefined });
    expect(() =>
      createBedrockAnthropicMessagesProvider('anthropic.claude-fable-5', {
        config: { region: 'us-east-1' },
      }),
    ).toThrow(/AWS_BEARER_TOKEN_BEDROCK/);
  });

  it('restricts Mythos to us-east-1', () => {
    expect(() =>
      createBedrockAnthropicMessagesProvider('anthropic.claude-mythos-5', {
        config: { region: 'us-west-2', apiKey: 'bedrock-key' },
      }),
    ).toThrow(/only available in us-east-1/);
  });

  it('restricts Fable Messages requests to its two in-region endpoints', () => {
    expect(() =>
      createBedrockAnthropicMessagesProvider('anthropic.claude-fable-5', {
        config: { region: 'us-west-2', apiKey: 'bedrock-key' },
      }),
    ).toThrow(/only in us-east-1 and eu-north-1/);
  });

  it('uses promptfoo env overrides for the key and region', () => {
    restoreEnv = mockProcessEnv({
      AWS_BEARER_TOKEN_BEDROCK: undefined,
      AWS_BEDROCK_REGION: undefined,
      AWS_REGION: undefined,
      AWS_DEFAULT_REGION: undefined,
    });
    const provider = createBedrockAnthropicMessagesProvider('anthropic.claude-fable-5', {
      env: { AWS_BEARER_TOKEN_BEDROCK: 'override-key', AWS_REGION: 'eu-north-1' },
    });

    expect(provider).toBeInstanceOf(BedrockAnthropicMessagesProvider);
    expect(provider.apiKey).toBe('override-key');
    expect(provider.anthropic.apiKey).toBeNull();
    expect(provider.anthropic.authToken).toBe('override-key');
    expect(provider.getApiBaseUrl()).toBe('https://bedrock-mantle.eu-north-1.api.aws/anthropic');
  });

  it.each([
    'anthropic.claude-fable-5',
    'anthropic.claude-mythos-5',
  ])('sends %s while reusing Anthropic compatibility and billing logic', async (bedrockModel) => {
    disableCache();
    const provider = createBedrockAnthropicMessagesProvider(bedrockModel, {
      id: `bedrock:${bedrockModel}`,
      config: {
        region: 'us-east-1',
        apiKey: 'bedrock-key',
        max_tokens: 4096,
        temperature: 0.5,
        top_p: 0.9,
        top_k: 40,
        thinking: { type: 'disabled' },
      },
    });
    const response = {
      content: [{ type: 'text', text: 'ok' }],
      model: bedrockModel,
      id: 'msg-1',
      role: 'assistant',
      stop_reason: 'end_turn',
      stop_details: null,
      stop_sequence: null,
      type: 'message',
      usage: { input_tokens: 5, output_tokens: 1 },
    } as Anthropic.Messages.Message;
    const createSpy = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue(response);

    const result = await provider.callApi('hello');

    const params = createSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(provider.id()).toBe(`bedrock:${bedrockModel}`);
    expect(params.model).toBe(bedrockModel);
    expect(params).not.toHaveProperty('temperature');
    expect(params).not.toHaveProperty('top_p');
    expect(params).not.toHaveProperty('top_k');
    expect(params).not.toHaveProperty('thinking');
    expect(result.output).toBe('ok');
    expect(result.cost).toBeCloseTo(0.00011, 8);
  });
});
