import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calculateAnthropicCost,
  claudeThinkingConsumesTokens,
  normalizeClaudeThinkingConfig,
} from '../../../src/providers/anthropic/util';
import {
  BedrockAnthropicMessagesProvider,
  createBedrockAnthropicMessagesProvider,
} from '../../../src/providers/bedrock/anthropicMessages';
import { BEDROCK_MODEL, getHandlerForModel } from '../../../src/providers/bedrock/index';
import {
  calculateBedrockCost,
  calculateBedrockInvokeModelCost,
} from '../../../src/providers/bedrock/pricing';
import { awsProviderFactories } from '../../../src/providers/families/aws';

afterEach(() => vi.restoreAllMocks());

const factory = awsProviderFactories.find((candidate) => candidate.test('bedrock:'))!;

describe('Claude 5.5 on Bedrock', () => {
  it.each([
    ...['haiku', 'opus'].flatMap((family) =>
      ['us', 'eu', 'au', 'jp', 'global'].map((geo) => `${geo}.anthropic.claude-${family}-5-5`),
    ),
    ...['us', 'eu', 'au', 'global'].map((geo) => `${geo}.anthropic.claude-sonnet-5-5`),
  ])('uses Runtime Messages for %s', async (model) => {
    const provider = await factory.create(
      `bedrock:messages:${model}`,
      { config: { region: 'us-east-1', apiKey: 'fixture-token' } },
      {} as never,
    );
    expect(provider).toBeInstanceOf(BedrockAnthropicMessagesProvider);
    expect((provider as BedrockAnthropicMessagesProvider).getApiBaseUrl()).toBe(
      'https://bedrock-runtime.us-east-1.amazonaws.com/anthropic',
    );
  });

  it.each(
    ['opus', 'sonnet'].flatMap((family) =>
      ['us-gov-east-1', 'us-gov-west-1'].map((region) => ({ family, region })),
    ),
  )('routes GovCloud $family Messages to Runtime in $region', async ({ family, region }) => {
    const model = `us-gov.anthropic.claude-${family}-5-5`;
    const provider = await factory.create(
      `bedrock:messages:${model}`,
      { config: { region } },
      {} as never,
    );
    expect(provider).toBeInstanceOf(BedrockAnthropicMessagesProvider);
    expect((provider as BedrockAnthropicMessagesProvider).getApiBaseUrl()).toBe(
      `https://bedrock-runtime.${region}.amazonaws.com/anthropic`,
    );
    for (const selector of [
      model,
      `arn:aws-us-gov:bedrock:${region}:123456789012:inference-profile/${model}`,
      `arn:aws-us-gov:bedrock:${region}::foundation-model/anthropic.claude-${family}-5-5`,
    ]) {
      expect(getHandlerForModel(selector, { inferenceModelType: 'claude' })).toBe(
        BEDROCK_MODEL.CLAUDE_MESSAGES,
      );
      const params = await BEDROCK_MODEL.CLAUDE_MESSAGES.params({}, 'Hello', [], selector);
      expect(params).not.toHaveProperty('temperature');
      expect(claudeThinkingConsumesTokens(selector, undefined)).toBe(true);
    }
  });

  it.each(['opus', 'sonnet'])('uses only GovCloud West Mantle for bare %s5.5', async (family) => {
    const model = `anthropic.claude-${family}-5-5`;
    await expect(
      factory.create(
        `bedrock:messages:${model}`,
        { config: { region: 'us-gov-east-1' } },
        {} as never,
      ),
    ).rejects.toThrow(`bedrock:messages:us-gov.${model}`);
    const west = await factory.create(
      `bedrock:messages:${model}`,
      { config: { region: 'us-gov-west-1' } },
      {} as never,
    );
    expect((west as BedrockAnthropicMessagesProvider).getApiBaseUrl()).toBe(
      'https://bedrock-mantle.us-gov-west-1.api.aws/anthropic',
    );
    const proxy = await factory.create(
      `bedrock:messages:${model}`,
      { config: { region: 'us-gov-east-1', apiBaseUrl: 'https://proxy.example/anthropic' } },
      {} as never,
    );
    expect((proxy as BedrockAnthropicMessagesProvider).getApiBaseUrl()).toBe(
      'https://proxy.example/anthropic',
    );
  });

  it.each(['haiku', 'sonnet'])(
    'requires GovCloud West for bare %s 5.5 Messages',
    async (family) => {
      const id = `bedrock:messages:anthropic.claude-${family}-5-5`;
      await expect(
        factory.create(id, { config: { region: 'us-east-1' } }, {} as never),
      ).rejects.toThrow('us-gov-west-1');
      const provider = await factory.create(
        id,
        { config: { region: 'us-gov-west-1' } },
        {} as never,
      );
      expect((provider as BedrockAnthropicMessagesProvider).getApiBaseUrl()).toBe(
        'https://bedrock-mantle.us-gov-west-1.api.aws/anthropic',
      );
    },
  );

  it('retains Mantle Messages for bare Opus 5.5', async () => {
    const provider = await factory.create(
      'bedrock:messages:anthropic.claude-opus-5-5',
      { config: { region: 'us-east-1' } },
      {} as never,
    );
    expect((provider as BedrockAnthropicMessagesProvider).getApiBaseUrl()).toBe(
      'https://bedrock-mantle.us-east-1.api.aws/anthropic',
    );
  });

  it('gives Haiku 5.5 thinking headroom and normalizes effort-capped disabled thinking', async () => {
    const model = 'us.anthropic.claude-haiku-5-5';
    expect(claudeThinkingConsumesTokens(model, undefined)).toBe(true);
    expect(normalizeClaudeThinkingConfig(model, { type: 'disabled' }, 'max')).toBeUndefined();
    expect(normalizeClaudeThinkingConfig(model, { type: 'disabled' }, 'high')).toEqual({
      type: 'disabled',
    });
    const params = await BEDROCK_MODEL.CLAUDE_MESSAGES.params({}, 'Hello', [], model);
    expect(params.max_tokens).toBe(2048);
    expect(params).not.toHaveProperty('temperature');
  });
});

describe('Claude 5.5 cost accounting', () => {
  it.each(['haiku', 'sonnet', 'opus'])(
    'does not infer %s5.5 GovCloud rates from commercial prices',
    (family) => {
      const model = `anthropic.claude-${family}-5-5`;
      for (const [selector, region] of [
        [`us-gov.${model}`, undefined],
        [`us-gov.${model}`, 'us-east-1'],
        [
          `arn:aws-us-gov:bedrock:us-gov-west-1:123456789012:inference-profile/us-gov.${model}`,
          undefined,
        ],
        [`arn:aws-us-gov:bedrock:us-gov-east-1::foundation-model/${model}`, undefined],
        [model, 'us-gov-west-1'],
        [model, 'us-gov-east-1'],
      ]) {
        expect(calculateBedrockCost(selector!, 100, 10, 20, 30, region)).toBeUndefined();
        expect(calculateBedrockInvokeModelCost(selector!, 100, 10, 20, 30, region)).toBeUndefined();
      }
      expect(calculateBedrockCost(model, 100, 10, 20, 30, 'us-east-1')).toBeGreaterThan(0);
    },
  );

  it.each(['opus', 'sonnet'])(
    'keeps GovCloud %s5.5 Messages pricing unknown unless explicitly configured',
    async (family) => {
      for (const model of [
        `anthropic.claude-${family}-5-5`,
        `us-gov.anthropic.claude-${family}-5-5`,
      ]) {
        const provider = createBedrockAnthropicMessagesProvider(model, {
          config: { region: 'us-gov-west-1', apiKey: 'fixture-key' },
        });
        vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
          id: 'fixture',
          type: 'message',
          role: 'assistant',
          model,
          content: [{ type: 'text', text: 'READY' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 10 },
        } as never);
        for (const [pricing, expected] of [
          [{}, undefined],
          [{ inputCost: 1 }, undefined],
          [{ outputCost: 2 }, undefined],
          [{ cost: 0 }, 0],
          [{ cost: 0.1 }, 11],
          [{ inputCost: 0, outputCost: 0 }, 0],
          [{ inputCost: 0.1, outputCost: 0.2 }, 12],
        ] as const) {
          const response = await provider.callApi('pricing', {
            vars: {},
            prompt: { raw: 'pricing', label: 'pricing', config: pricing },
          });
          expect(response.error).toBeUndefined();
          expect(response.cost).toBe(expected);
        }
      }
    },
  );

  it('preserves published GovCloud Opus4.8 pricing', () => {
    expect(calculateBedrockCost('anthropic.claude-opus-4-8', 1e6, 1e6, 0, 0, 'us-gov-west-1')).toBe(
      36,
    );
  });

  it.each(['global', 'us'])(
    'prices Haiku short/long context and cache totals on %s profiles',
    (geo) => {
      const model = `${geo}.anthropic.claude-haiku-5-5`;
      const multiplier = geo === 'global' ? 1 : 1.1;
      for (const prompt of [99_000, 99_001]) {
        const rate = prompt === 99_000 ? 0.1 : 0.5;
        const expected = ((prompt * rate + 1000 * rate * 0.1 + 100 * rate * 5) / 1e6) * multiplier;
        expect(calculateAnthropicCost(model, {}, prompt, 100, 1000)).toBeCloseTo(expected, 12);
        expect(calculateBedrockCost(model, prompt, 100, 1000)).toBeCloseTo(expected, 12);
        expect(calculateBedrockInvokeModelCost(model, prompt, 100, 1000)).toBeCloseTo(expected, 12);
      }
    },
  );

  it('applies Haiku long-context prices to 5-minute and 1-hour cache writes', () => {
    const model = 'global.anthropic.claude-haiku-5-5';
    const expected = (98_001 * 0.5 + 1000 * 0.625 + 1000 * 1 + 100 * 2.5) / 1e6;
    expect(calculateAnthropicCost(model, {}, 98_001, 100, 0, 2000, 1000)).toBeCloseTo(expected, 12);
    expect(
      calculateBedrockCost(model, 98_001, 100, 0, 2000, 'us-east-1', undefined, 1000),
    ).toBeCloseTo(expected, 12);
    expect(calculateAnthropicCost(model, { cost: 0 }, 98_001, 100, 0, 2000, 1000)).toBe(0);
  });

  it('uses the reduced Sonnet 5.5 cache-read rate without changing Sonnet 5', () => {
    expect(calculateBedrockCost('global.anthropic.claude-sonnet-5-5', 0, 0, 1e6)).toBeCloseTo(0.1);
    expect(calculateAnthropicCost('global.anthropic.claude-sonnet-5-5', {}, 0, 0, 1e6)).toBeCloseTo(
      0.1,
    );
    expect(calculateAnthropicCost('claude-sonnet-5', {}, 0, 0, 1e6)).toBeCloseTo(0.2);
  });
});
