import { describe, expect, it } from 'vitest';
import { AwsBedrockConverseProvider } from '../../../src/providers/bedrock/converse';
import { BEDROCK_MODEL, getHandlerForModel } from '../../../src/providers/bedrock/index';
import { calculateBedrockCost, getBedrockPricing } from '../../../src/providers/bedrock/pricing';
import { isRejectedPrefixedGrokId } from '../../../src/providers/bedrock/routing';
import { awsProviderFactories } from '../../../src/providers/families/aws';

const factory = awsProviderFactories.find((candidate) => candidate.test('bedrock:'))!;

describe('Bedrock Runtime model compatibility', () => {
  it.each(['us.xai.grok-4.7', 'global.xai.grok-4.7'])(
    'loads %s through Converse without selecting Mantle',
    async (model) => {
      expect(isRejectedPrefixedGrokId(model, false)).toBe(false);
      expect(isRejectedPrefixedGrokId(model, true)).toBe(true);
      const provider = await factory.create(
        `bedrock:converse:${model}`,
        { config: { region: 'us-east-1' } },
        {} as never,
      );
      expect(provider).toBeInstanceOf(AwsBedrockConverseProvider);
      expect(provider.id()).toBe(`bedrock:converse:${model}`);
    },
  );

  it.each(['', 'completion:', 'converse:', 'responses:', 'mantle:'])(
    'explains the required Grok 4.7 profile for the %s bare selector',
    async (selector) => {
      await expect(
        factory.create(`bedrock:${selector}xai.grok-4.7`, {}, {} as never),
      ).rejects.toThrow('bedrock:converse:us.xai.grok-4.7');
    },
  );

  it.each([
    'us.zai.glm-5.3',
    'global.zai.glm-5.3',
    'us.moonshotai.kimi-k3',
    'global.moonshotai.kimi-k3',
    'in.moonshotai.kimi-k3',
  ])('uses the OpenAI request and response contract for %s', async (model) => {
    const handler = getHandlerForModel(model);
    expect(handler).toBe(BEDROCK_MODEL.OPENAI_COMPAT);
    const config = { region: 'us-east-1', max_tokens: 256 };
    const params = await handler.params(config, 'Hello', [], model);
    expect(params).toMatchObject({
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 256,
    });
    expect(handler.output({}, { choices: [{ message: { content: 'READY' } }] })).toBe('READY');
  });

  it.each(['zai.glm-5.3', 'moonshotai.kimi-k3'])(
    'explains why the bare %s model cannot use on-demand InvokeModel',
    (model) => {
      expect(() => getHandlerForModel(model)).toThrow(`bedrock:us.${model}`);
    },
  );
});

describe('Bedrock Runtime pricing', () => {
  it.each([
    ['us.xai.grok-4.7', 2.2, 6.6, 0.55, 0],
    ['us.zai.glm-5.3', 1.848, 5.808, 0.3432, 2.31],
    ['global.zai.glm-5.3', 1.68, 5.28, 0.312, 2.1],
    ['global.xai.grok-4.7', 2, 6, 0.5, 0],
    ['us.moonshotai.kimi-k3', 3.3, 16.5, 0.33, 4.125],
    ['in.moonshotai.kimi-k3', 3.3, 16.5, 0.33, 4.125],
    ['global.moonshotai.kimi-k3', 3, 15, 0.3, 3.75],
  ] as const)('prices %s cache usage and service tiers', (model, input, output, read, write) => {
    for (const [type, multiplier] of [
      ['default', 1],
      ['priority', 1.75],
      ['flex', 0.5],
    ] as const) {
      const writes = write > 0 ? 100 : 0;
      const expected =
        ((800 * input + 500 * output + 200 * read + writes * write) / 1e6) * multiplier;
      expect(calculateBedrockCost(model, 800, 500, 200, writes, 'us-east-1', { type })).toBeCloseTo(
        expected,
        12,
      );
      expect(
        calculateBedrockCost(
          `arn:aws:bedrock:us-east-1:123456789012:inference-profile/${model}`,
          800,
          500,
          200,
          writes,
          'us-east-1',
          { type },
        ),
      ).toBeCloseTo(expected, 12);
    }
    expect(
      calculateBedrockCost(model, 800, 500, 200, 0, 'us-east-1', { type: 'reserved' }),
    ).toBeUndefined();
  });

  it('does not reuse GLM 5 pricing for a bare GLM 5.3 ID', () => {
    expect(getBedrockPricing('us.zai.glm-5.3', 'us-east-1')).toBeUndefined();
    expect(calculateBedrockCost('zai.glm-5.3', 800, 500)).toBeUndefined();
  });

  it('does not invent cache-write pricing for Grok 4.7', () => {
    expect(calculateBedrockCost('global.xai.grok-4.7', 800, 500, 200, 100)).toBeUndefined();
  });
});
