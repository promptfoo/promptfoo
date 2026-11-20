import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCache, isCacheEnabled } from '../../../src/cache';
import {
  AwsBedrockCompletionProvider,
  BEDROCK_MODEL,
  getHandlerForModel,
} from '../../../src/providers/bedrock/index';
import { calculateBedrockInvokeModelCost } from '../../../src/providers/bedrock/pricing';
import { awsProviderFactories } from '../../../src/providers/families/aws';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  getCache: vi.fn(),
  isCacheEnabled: vi.fn(),
}));

const factory = awsProviderFactories.find((candidate) => candidate.test('bedrock:'))!;
const PROFILE = 'us.twelvelabs.pegasus-1-5-v1:0';

function mockInvoke(provider: AwsBedrockCompletionProvider, response: unknown) {
  const json = JSON.stringify(response);
  const invokeModel = vi.fn().mockResolvedValue({
    body: Object.assign(new TextEncoder().encode(json), { transformToString: () => json }),
  });
  vi.spyOn(provider, 'getBedrockInstance').mockResolvedValue({ invokeModel, config: {} } as any);
  return invokeModel;
}

function context(vars: Record<string, string>) {
  return { vars, prompt: { raw: 'prompt', label: 'prompt' } };
}

describe('TwelveLabs Pegasus 1.5 on Bedrock InvokeModel', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
    vi.mocked(isCacheEnabled).mockReturnValue(false);
    vi.mocked(getCache).mockResolvedValue({ get: vi.fn(), set: vi.fn() } as any);
  });

  it.each([PROFILE, 'global.twelvelabs.pegasus-1-5-v1:0'])('routes %s to Pegasus', (model) => {
    expect(getHandlerForModel(model)).toBe(BEDROCK_MODEL.TWELVELABS_PEGASUS);
  });

  it('rejects the bare model ID with the supported inference profiles', async () => {
    const bare = 'twelvelabs.pegasus-1-5-v1:0';
    expect(() => getHandlerForModel(bare)).toThrow(
      `Use "bedrock:us.${bare}" or "bedrock:global.${bare}"`,
    );
    await expect(factory.create(`bedrock:converse:${bare}`, {}, {} as never)).rejects.toThrow(
      'requires a cross-region inference profile',
    );
  });

  it('loads the profile through the default bedrock: selector', async () => {
    const provider = await factory.create(`bedrock:${PROFILE}`, {}, {} as never);
    expect(provider).toBeInstanceOf(AwsBedrockCompletionProvider);
    expect(provider.id()).toBe(`bedrock:${PROFILE}`);
  });

  it('sends the prompt with a base64 video rendered from test vars', async () => {
    const provider = new AwsBedrockCompletionProvider(PROFILE, {
      config: {
        region: 'us-east-1',
        mediaSource: { base64String: '{{ video }}' },
        temperature: 0,
        maxOutputTokens: 512,
      } as any,
    });
    const invokeModel = mockInvoke(provider, {
      input_tokens: 131,
      output_tokens: 37,
      message: 'A red square moves right.',
      stopReason: 'stop',
    });

    const result = await provider.callApi('Describe the clip', context({ video: 'AAAAGGZ0eXA=' }));

    expect(invokeModel).toHaveBeenCalledTimes(1);
    const request = invokeModel.mock.calls[0][0];
    expect(request.modelId).toBe(PROFILE);
    expect(JSON.parse(request.body)).toEqual({
      inputPrompt: 'Describe the clip',
      mediaSource: { base64String: 'AAAAGGZ0eXA=' },
      temperature: 0,
      maxOutputTokens: 512,
    });
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('A red square moves right.');
    expect(result.tokenUsage).toEqual({ prompt: 131, completion: 37, total: 168, numRequests: 1 });
    // AWS bills Pegasus per second of video, which the response does not report.
    expect(result.cost).toBeUndefined();
  });

  it('forwards an S3 source, clip bounds, and structured output', async () => {
    const responseFormat = {
      type: 'json_schema',
      jsonSchema: { type: 'object', properties: { summary: { type: 'string' } } },
    };
    const provider = new AwsBedrockCompletionProvider(PROFILE, {
      config: {
        region: 'us-east-1',
        mediaSource: {
          s3Location: { uri: 's3://fixture-bucket/{{ clip }}.mp4', bucketOwner: '123456789012' },
        },
        start_time: 2,
        end_time: 8.5,
        responseFormat,
      } as any,
    });
    const invokeModel = mockInvoke(provider, { message: '{"summary":"ok"}', stopReason: 'stop' });

    const result = await provider.callApi('Summarize', context({ clip: 'intro' }));

    expect(JSON.parse(invokeModel.mock.calls[0][0].body)).toEqual({
      inputPrompt: 'Summarize',
      mediaSource: {
        s3Location: { uri: 's3://fixture-bucket/intro.mp4', bucketOwner: '123456789012' },
      },
      responseFormat,
      start_time: 2,
      end_time: 8.5,
    });
    expect(result.output).toBe('{"summary":"ok"}');
    expect(result.tokenUsage).toEqual({ numRequests: 1 });
  });

  it('omits the prompt and returns segments in time-based metadata mode', async () => {
    const segment_definitions = [
      {
        id: 'scenes',
        description: 'What is on screen',
        fields: [{ name: 'summary', type: 'string', description: 'What happens' }],
      },
    ];
    const provider = new AwsBedrockCompletionProvider(PROFILE, {
      config: {
        region: 'us-east-1',
        mediaSource: { base64String: 'AAAA' },
        analysis_mode: 'time_based_metadata',
        maxOutputTokens: 2048,
        segment_time_format: 'seconds',
        segment_definitions,
      } as any,
    });
    const segments = [{ start_sec: 0, end_sec: 6, summary: 'A red square moves right.' }];
    const invokeModel = mockInvoke(provider, {
      segments,
      definition_errors: [],
      input_tokens: 1880,
      output_tokens: 89,
      stopReason: 'stop',
      finish_reason: 'stop',
    });

    const result = await provider.callApi('ignored', context({}));

    const body = JSON.parse(invokeModel.mock.calls[0][0].body);
    expect(body).not.toHaveProperty('inputPrompt');
    expect(body).toEqual({
      mediaSource: { base64String: 'AAAA' },
      analysis_mode: 'time_based_metadata',
      maxOutputTokens: 2048,
      segment_time_format: 'seconds',
      segment_definitions,
    });
    expect(result.output).toEqual({ segments, definition_errors: [] });
    expect(result.tokenUsage).toEqual({
      prompt: 1880,
      completion: 89,
      total: 1969,
      numRequests: 1,
    });
  });

  it.each([
    ['no media source', undefined],
    ['an empty base64 string', { base64String: '' }],
    ['a video template whose var is missing', { base64String: '{{ video }}' }],
    ['an S3 location without a URI', { s3Location: { bucketOwner: '123456789012' } }],
  ])('rejects %s before invoking Bedrock', async (_label, mediaSource) => {
    const provider = new AwsBedrockCompletionProvider(PROFILE, {
      config: { region: 'us-east-1', mediaSource } as any,
    });
    const invokeModel = mockInvoke(provider, { message: 'unused' });
    await expect(provider.callApi('Describe', context({}))).rejects.toThrow(
      'TwelveLabs Pegasus requires config.mediaSource with a non-empty base64String or s3Location.uri.',
    );
    expect(invokeModel).not.toHaveBeenCalled();
  });

  it('does not estimate per-second video billing from token counts', () => {
    expect(calculateBedrockInvokeModelCost(PROFILE, 131, 37)).toBeUndefined();
    expect(
      calculateBedrockInvokeModelCost('global.twelvelabs.pegasus-1-5-v1:0', 131, 37),
    ).toBeUndefined();
  });
});
