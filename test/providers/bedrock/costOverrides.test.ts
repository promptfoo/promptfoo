import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCache, isCacheEnabled } from '../../../src/cache';
import { AwsBedrockConverseProvider } from '../../../src/providers/bedrock/converse';
import { AwsBedrockCompletionProvider } from '../../../src/providers/bedrock/index';

vi.mock('../../../src/cache');

const rates = { inputCost: 0.01, outputCost: 0.02 };
const usage = {
  inputTokens: 10,
  outputTokens: 20,
  cacheReadInputTokens: 20,
  cacheWriteInputTokens: 5,
};
const model = 'us.anthropic.claude-sonnet-4-6';

beforeEach(() => {
  vi.mocked(isCacheEnabled).mockReturnValue(false);
  vi.mocked(getCache).mockResolvedValue({ get: vi.fn(), set: vi.fn() } as never);
});
afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe('Bedrock cost override integration', () => {
  it('prices uncached and cached InvokeModel tokens without double counting displayed input', async () => {
    const provider = new AwsBedrockCompletionProvider(model, { config: rates });
    const body = Buffer.from(
      JSON.stringify({
        content: [{ type: 'text', text: 'Hello' }],
        usage: {
          input_tokens: 10,
          output_tokens: 20,
          cache_read_input_tokens: 20,
          cache_creation_input_tokens: 5,
        },
      }),
    );
    const invokeModel = vi.fn().mockResolvedValue({
      body: Object.assign(body, { transformToString: () => body.toString() }),
    });
    vi.spyOn(provider, 'getBedrockInstance').mockResolvedValue({
      invokeModel,
      config: {},
    } as never);

    const result = await provider.callApi('Say hello');
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('Hello');
    expect(result.cost).toBeCloseTo(0.5825);
    expect(result.tokenUsage?.prompt).toBe(35);
  });

  it.each([
    ['amazon.nova-pro-v1:0', undefined],
    ['amazon.nova-2-lite-v1:0', undefined],
    ['arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/profile-id', 'nova'],
    ['arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/profile-id', 'nova2'],
  ] as const)(
    'reports all Nova input tokens and prices cache counters separately for %s',
    async (modelName, inferenceModelType) => {
      const provider = new AwsBedrockCompletionProvider(modelName, {
        config: { ...rates, inferenceModelType },
      });
      const body = Buffer.from(
        JSON.stringify({
          output: { message: { role: 'assistant', content: [{ text: 'Hello' }] } },
          usage: {
            inputTokens: 10,
            outputTokens: 20,
            totalTokens: 55,
            cacheReadInputTokenCount: 20,
            cacheWriteInputTokenCount: 5,
          },
        }),
      );
      vi.spyOn(provider, 'getBedrockInstance').mockResolvedValue({
        invokeModel: vi.fn().mockResolvedValue({
          body: Object.assign(body, { transformToString: () => body.toString() }),
        }),
        config: {},
      } as never);

      const result = await provider.callApi('Say hello');
      expect(result.error).toBeUndefined();
      expect(result.output).toBe('Hello');
      expect(result.cost).toBeCloseTo(0.55);
      expect(result.tokenUsage).toMatchObject({ prompt: 35, completion: 20, total: 55 });
      expect(result.tokenUsage?.completionDetails).toEqual({
        cacheReadInputTokens: 20,
        cacheCreationInputTokens: 5,
      });
    },
  );

  it('keeps response-cache hits free of fresh InvokeModel charges', async () => {
    const provider = new AwsBedrockCompletionProvider(model, { config: rates });
    vi.mocked(isCacheEnabled).mockReturnValue(true);
    vi.mocked(getCache).mockResolvedValue({
      get: vi
        .fn()
        .mockResolvedValue(JSON.stringify({ content: [{ type: 'text', text: 'Cached hello' }] })),
    } as never);
    const getInstance = vi.spyOn(provider, 'getBedrockInstance');
    const result = await provider.callApi('Say hello');
    expect(result.cached).toBe(true);
    expect(result.cost).toBeUndefined();
    expect(result.tokenUsage?.numRequests).toBe(0);
    expect(getInstance).not.toHaveBeenCalled();
  });

  it.each([false, true])('applies rates to Converse streaming=%s', async (streaming) => {
    const provider = new AwsBedrockConverseProvider(model, { config: { ...rates, streaming } });
    const send = vi.fn().mockResolvedValue(
      streaming
        ? {
            stream: (async function* () {
              yield { contentBlockDelta: { delta: { text: 'Hello' } } };
              yield { metadata: { usage } };
            })(),
          }
        : {
            output: { message: { role: 'assistant', content: [{ text: 'Hello' }] } },
            usage,
          },
    );
    vi.spyOn(provider, 'getBedrockInstance').mockResolvedValue({ send } as never);
    const result = streaming
      ? await provider.callApiStreaming('Say hello')
      : await provider.callApi('Say hello');
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('Hello');
    expect(result.cost).toBeCloseTo(0.5825);
  });
});
