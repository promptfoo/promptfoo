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
import {
  AwsBedrockCompletionProvider,
  BEDROCK_MODEL,
  type BedrockClaudeMessagesCompletionOptions,
  getHandlerForModel,
} from '../../../src/providers/bedrock/index';
import {
  calculateBedrockCost,
  calculateBedrockInvokeModelCost,
} from '../../../src/providers/bedrock/pricing';
import { awsProviderFactories } from '../../../src/providers/families/aws';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/cache')>()),
  isCacheEnabled: () => false,
}));

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
    ['haiku', 'opus', 'sonnet'].flatMap((family) =>
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

  it.each(['haiku', 'opus', 'sonnet'])(
    'uses only GovCloud West Mantle for bare %s5.5',
    async (family) => {
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
    },
  );

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

  it.each([
    'anthropic.claude-opus-4-5-20251101-v1:0',
    'us.anthropic.claude-opus-4-5-20251101-v1:0',
    'arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.anthropic.claude-opus-4-5-20251101-v1:0',
    'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-opus-4-5-20251101-v1:0',
  ])('opts known Opus 4.5 effort into the required Bedrock beta (%s)', async (model) => {
    const params = await BEDROCK_MODEL.CLAUDE_MESSAGES.params(
      { effort: 'medium' },
      'hello',
      [],
      model,
    );
    expect(params.output_config).toEqual({ effort: 'medium' });
    expect(params.anthropic_beta).toEqual(['effort-2025-11-24']);
    const defaults = await BEDROCK_MODEL.CLAUDE_MESSAGES.params({}, 'hello', [], model);
    expect(defaults).not.toHaveProperty('anthropic_beta');
  });

  it.each([
    'us.anthropic.claude-opus-4-6-v1',
    'us.anthropic.claude-haiku-5-5',
    'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/claude-opus-4-5',
  ])('does not guess the Opus 4.5 effort beta for %s', async (model) => {
    const params = await BEDROCK_MODEL.CLAUDE_MESSAGES.params(
      { effort: 'medium' },
      'hello',
      [],
      model,
    );
    expect(params).not.toHaveProperty('anthropic_beta');
  });

  it('preserves explicit beta flags and allows opaque profile opt-in without mutating config', async () => {
    const config: BedrockClaudeMessagesCompletionOptions = {
      effort: 'low',
      anthropic_beta: ['custom-beta', 'effort-2025-11-24'],
    };
    for (const model of [
      'us.anthropic.claude-opus-4-5-20251101-v1:0',
      'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/opaque',
    ]) {
      const params = await BEDROCK_MODEL.CLAUDE_MESSAGES.params(config, 'hello', [], model);
      expect(params.anthropic_beta).toEqual(config.anthropic_beta);
      expect(params.anthropic_beta).not.toBe(config.anthropic_beta);
    }
    expect(config.anthropic_beta).toEqual(['custom-beta', 'effort-2025-11-24']);
  });

  it.each(['low', 'medium', 'high', 'xhigh', 'max'] as const)(
    'forwards native Haiku effort %s and normalizes disabled thinking before token defaults',
    async (effort) => {
      const responseJson = JSON.stringify({
        content: [{ type: 'text', text: 'READY' }],
        usage: { input_tokens: 1, output_tokens: 1 },
      });
      const body = Object.assign(new TextEncoder().encode(responseJson), {
        transformToString: () => responseJson,
      });
      const invokeModel = vi.fn().mockResolvedValue({ body });
      const config: BedrockClaudeMessagesCompletionOptions = {
        region: 'us-east-1',
        effort,
        thinking: { type: 'disabled' },
      };
      const provider = new AwsBedrockCompletionProvider('us.anthropic.claude-haiku-5-5', {
        config,
      });
      vi.spyOn(provider, 'getBedrockInstance').mockResolvedValue({ invokeModel } as never);
      expect((await provider.callApi('hello')).output).toBe('READY');
      const request = JSON.parse(invokeModel.mock.calls[0][0].body);
      expect(request.output_config).toEqual({ effort });
      expect(request.anthropic_version).toBe('bedrock-2023-05-31');
      expect(request).not.toHaveProperty('temperature');
      if (effort === 'xhigh' || effort === 'max') {
        expect(request).not.toHaveProperty('thinking');
        expect(request.max_tokens).toBe(2048);
      } else {
        expect(request.thinking).toEqual({ type: 'disabled' });
        expect(request.max_tokens).toBe(1024);
      }
    },
  );

  it('honors prompt effort overrides and preserves an explicit token limit', async () => {
    const responseJson = JSON.stringify({
      content: [{ type: 'text', text: 'READY' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const body = Object.assign(new TextEncoder().encode(responseJson), {
      transformToString: () => responseJson,
    });
    const invokeModel = vi.fn().mockResolvedValue({ body });
    const config: BedrockClaudeMessagesCompletionOptions = {
      region: 'us-east-1',
      effort: 'low',
      thinking: { type: 'disabled' },
      max_tokens: 512,
    };
    const provider = new AwsBedrockCompletionProvider('us.anthropic.claude-haiku-5-5', { config });
    vi.spyOn(provider, 'getBedrockInstance').mockResolvedValue({ invokeModel } as never);
    expect(
      (
        await provider.callApi('hello', {
          vars: {},
          prompt: { raw: 'hello', label: 'override', config: { effort: 'max' } },
        })
      ).error,
    ).toBeUndefined();
    const request = JSON.parse(invokeModel.mock.calls[0][0].body);
    expect(request.output_config).toEqual({ effort: 'max' });
    expect(request.max_tokens).toBe(512);
    expect(request).not.toHaveProperty('thinking');
  });

  it('omits unconfigured effort and normalizes unsupported Haiku manual thinking', async () => {
    const normal = await BEDROCK_MODEL.CLAUDE_MESSAGES.params(
      {},
      'Hello',
      [],
      'us.anthropic.claude-haiku-5-5',
    );
    expect(normal).not.toHaveProperty('output_config');
    expect(normal.max_tokens).toBe(2048);
    const manual = await BEDROCK_MODEL.CLAUDE_MESSAGES.params(
      { thinking: { type: 'enabled', budget_tokens: 8192 }, effort: 'max' } as never,
      'Hello',
      [],
      'us.anthropic.claude-haiku-5-5',
    );
    expect(manual.output_config).toEqual({ effort: 'max' });
    expect(manual.thinking).toEqual({ type: 'adaptive' });
    expect(manual.max_tokens).toBe(2048);
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
  it.each([
    ['haiku', 0.12, 0.6, 0.1],
    ['sonnet', 2.4, 12, 0.05],
    ['opus', 4.8, 24, 0.05],
  ] as const)('uses published GovCloud rates for %s 5.5', (family, input, output, cacheRead) => {
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
      const expected = ((100 + 20 * cacheRead + 30 * 1.25) * input + 10 * output) / 1e6;
      expect(calculateBedrockCost(selector!, 100, 10, 20, 30, region)).toBeCloseTo(expected, 12);
      expect(calculateBedrockInvokeModelCost(selector!, 100, 10, 20, 30, region)).toBeCloseTo(
        expected,
        12,
      );
    }
    expect(calculateBedrockCost(model, 100, 10, 20, 30, 'us-east-1')).toBeGreaterThan(0);
  });

  it.each([
    ['haiku', 0.12, 0.6],
    ['sonnet', 2.4, 12],
    ['opus', 4.8, 24],
  ] as const)(
    'uses GovCloud %s 5.5 rates in Messages and honors overrides',
    async (family, input, output) => {
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
          [{}, (100 * input + 10 * output) / 1e6],
          [{ inputCost: 1 }, 100 + (10 * output) / 1e6],
          [{ outputCost: 2 }, 20 + (100 * input) / 1e6],
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
          expect(response.cost).toBeCloseTo(expected, 12);
        }
      }
    },
  );

  it.each([
    [99_900, 0.12, 0.6],
    [99_901, 0.6, 3],
  ])(
    'selects the GovCloud Haiku long-context tier at %s uncached tokens',
    (prompt, input, output) => {
      expect(
        calculateBedrockCost('us-gov.anthropic.claude-haiku-5-5', prompt, 10, 100),
      ).toBeCloseTo(((prompt + 100 * 0.1) * input + 10 * output) / 1e6, 12);
    },
  );

  it.each([
    ['anthropic.claude-opus-4-8', 36],
    ['anthropic.claude-opus-5', 36],
    ['anthropic.claude-sonnet-5', 14.4],
  ] as const)('uses the published GovCloud rate for %s', (model, expected) => {
    expect(calculateBedrockCost(model, 1e6, 1e6, 0, 0, 'us-gov-west-1')).toBeCloseTo(expected);
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
    expect(calculateBedrockCost('global.anthropic.claude-sonnet-5', 0, 0, 1e6)).toBeCloseTo(0.2);
  });
});
