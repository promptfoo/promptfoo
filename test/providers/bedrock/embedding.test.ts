import { BedrockRuntime } from '@aws-sdk/client-bedrock-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import logger from '../../../src/logger';
import { AwsBedrockEmbeddingProvider } from '../../../src/providers/bedrock/index';

function mockEmbedding(model: string, data: unknown, inputType?: 'search_query') {
  const provider = new AwsBedrockEmbeddingProvider(model, {
    id: 'custom-embedding',
    config: { region: 'us-east-1', input_type: inputType },
  });
  const invokeModel = vi.fn().mockResolvedValue({
    body: { transformToString: vi.fn().mockReturnValueOnce(JSON.stringify(data)) },
  });
  vi.spyOn(provider, 'getBedrockInstance').mockResolvedValue({ invokeModel } as any);
  return { provider, invokeModel };
}

describe('AwsBedrockEmbeddingProvider wire contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it.each([
    ['cohere.embed-english-v3', { embeddings: [[0.1, 0.2]] }],
    ['cohere.embed-v4:0', { embeddings: [[0.1, 0.2]] }],
    ['cohere.embed-v4:0', { embeddings: { float: [[0.1, 0.2]] } }],
  ])('sends required Cohere input_type and normalizes %s vectors', async (model, data) => {
    const { provider, invokeModel } = mockEmbedding(model, data);
    expect(await provider.callEmbeddingApi('A quiet garden')).toEqual({ embedding: [0.1, 0.2] });
    expect(provider.id()).toBe('custom-embedding');
    expect(invokeModel).toHaveBeenCalledWith({
      modelId: model,
      accept: 'application/json',
      contentType: 'application/json',
      body: JSON.stringify({ texts: ['A quiet garden'], input_type: 'search_document' }),
    });
  });

  it('preserves an explicit retrieval query input type', async () => {
    const { provider, invokeModel } = mockEmbedding(
      'cohere.embed-english-v3',
      { embeddings: [[0.1]] },
      'search_query',
    );
    await provider.callEmbeddingApi('Where is the garden?');
    expect(JSON.parse(invokeModel.mock.calls[0][0].body)).toEqual({
      texts: ['Where is the garden?'],
      input_type: 'search_query',
    });
  });

  it('keeps Titan requests and flat vectors unchanged', async () => {
    const { provider, invokeModel } = mockEmbedding('amazon.titan-embed-text-v2:0', {
      embedding: [0.1, 0.2],
    });
    expect(await provider.callEmbeddingApi('A quiet garden')).toEqual({ embedding: [0.1, 0.2] });
    expect(JSON.parse(invokeModel.mock.calls[0][0].body)).toEqual({ inputText: 'A quiet garden' });
  });

  const text = 'A quiet garden';
  const vector = [0.1, 0.2];
  it.each([
    {
      model: 'amazon.nova-2-multimodal-embeddings-v1:0',
      expectedBody: {
        taskType: 'SINGLE_EMBEDDING',
        singleEmbeddingParams: {
          embeddingPurpose: 'TEXT_RETRIEVAL',
          embeddingDimension: 256,
          text: { value: text, truncationMode: 'END' },
        },
      },
      reply: { embeddings: [{ embeddingType: 'TEXT', embedding: vector }] },
    },
    {
      model: 'us.twelvelabs.marengo-embed-3-0-v1:0',
      expectedBody: { inputType: 'text', text: { inputText: text } },
      reply: { data: [{ embedding: vector }] },
    },
  ])(
    'serializes and decodes $model through the Bedrock SDK',
    async ({ model, expectedBody, reply }) => {
      const handle = vi.fn(async (_request: { body?: unknown }) => ({
        response: {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: new TextEncoder().encode(JSON.stringify(reply)),
        },
      }));
      const client = new BedrockRuntime({
        region: 'us-east-1',
        credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
        requestHandler: { handle },
      });
      const provider = new AwsBedrockEmbeddingProvider(model, {
        config: {
          embeddingPurpose: 'TEXT_RETRIEVAL',
          embeddingDimension: 256,
          truncationMode: 'END',
        },
      });
      vi.spyOn(provider, 'getBedrockInstance').mockResolvedValue(client);
      try {
        expect(await provider.callEmbeddingApi(text)).toEqual({ embedding: vector });
        expect(handle).toHaveBeenCalledTimes(1);
        expect(JSON.parse(String(handle.mock.calls[0][0].body))).toEqual(expectedBody);
      } finally {
        client.destroy();
      }
    },
  );

  it('defaults Nova to generic indexing without truncation', async () => {
    const { provider, invokeModel } = mockEmbedding('amazon.nova-2-multimodal-embeddings-v1:0', {
      embeddings: [{ embeddingType: 'TEXT', embedding: [0.1] }],
    });
    await provider.callEmbeddingApi('A quiet garden');
    expect(JSON.parse(invokeModel.mock.calls[0][0].body)).toEqual({
      taskType: 'SINGLE_EMBEDDING',
      singleEmbeddingParams: {
        embeddingPurpose: 'GENERIC_INDEX',
        embeddingDimension: 3072,
        text: { value: 'A quiet garden', truncationMode: 'NONE' },
      },
    });
  });

  it('accepts the documented Marengo single-object response', async () => {
    const { provider } = mockEmbedding('twelvelabs.marengo-embed-3-0-v1:0', {
      data: { embedding: [0.1] },
    });
    expect(await provider.callEmbeddingApi('A quiet garden')).toEqual({ embedding: [0.1] });
  });

  it('matches the exact model ID in a system profile ARN', async () => {
    const model =
      'arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.twelvelabs.marengo-embed-3-0-v1:0';
    const { provider, invokeModel } = mockEmbedding(model, { data: { embedding: vector } });
    expect(await provider.callEmbeddingApi(text)).toEqual({ embedding: vector });
    expect(invokeModel.mock.calls[0][0].modelId).toBe(model);
    expect(JSON.parse(invokeModel.mock.calls[0][0].body)).toEqual({
      inputType: 'text',
      text: { inputText: text },
    });
  });

  it('keeps unknown embedding IDs on the existing generic route', async () => {
    const { provider, invokeModel } = mockEmbedding('twelvelabs.marengo-embed-3-0-v1:01', {
      embedding: vector,
    });
    expect(await provider.callEmbeddingApi(text)).toEqual({ embedding: vector });
    expect(JSON.parse(invokeModel.mock.calls[0][0].body)).toEqual({ inputText: text });
  });

  it.each([
    [
      'amazon.nova-2-multimodal-embeddings-v1:0',
      { embeddings: [{ embedding: [0.1] }, { embedding: [0.2] }] },
    ],
    ['amazon.nova-2-multimodal-embeddings-v1:0', { embeddings: [{ embedding: ['invalid'] }] }],
    ['twelvelabs.marengo-embed-3-0-v1:0', { data: [{ embedding: [0.1] }, { embedding: [0.2] }] }],
    ['twelvelabs.marengo-embed-3-0-v1:0', { data: [{ embedding: [null] }] }],
  ])('rejects ambiguous or malformed model-specific vectors for %s', async (model, data) => {
    const { provider } = mockEmbedding(model, data);
    expect(await provider.callEmbeddingApi('A quiet garden')).toEqual({
      error: expect.stringContaining('No valid embedding found'),
    });
  });

  it('forwards cancellation for Nova embeddings', async () => {
    const { provider, invokeModel } = mockEmbedding('amazon.nova-2-multimodal-embeddings-v1:0', {});
    const controller = new AbortController();
    const reason = new Error('cancelled');
    invokeModel.mockImplementation(() => {
      controller.abort(reason);
      throw reason;
    });
    await expect(
      provider.callEmbeddingApi('A quiet garden', undefined, { abortSignal: controller.signal }),
    ).rejects.toThrow('cancelled');
    expect(invokeModel).toHaveBeenCalledWith(expect.any(Object), {
      abortSignal: controller.signal,
    });
  });

  it.each([
    {},
    { embeddings: [] },
    { embeddings: [['invalid']] },
    { embedding: [null] },
    { embeddings: [[0.1], [0.2]] },
    { embeddings: { float: [[0.1], [0.2]] } },
    { embeddings: { int8: [[1, 2]] } },
  ])('returns a normalized error for malformed vectors %j', async (data) => {
    const { provider } = mockEmbedding('cohere.embed-english-v3', data);
    expect(await provider.callEmbeddingApi('A quiet garden')).toEqual({
      error: expect.stringContaining('No valid embedding found'),
    });
  });

  it('keeps input text and raw response data out of diagnostics', async () => {
    const secret = 'synthetic-private-text';
    const debug = vi.spyOn(logger, 'debug').mockImplementation(() => {});
    const { provider } = mockEmbedding('amazon.nova-2-multimodal-embeddings-v1:0', {
      embeddings: [{ embedding: vector }],
      echoed: secret,
    });
    expect(await provider.callEmbeddingApi(secret)).toEqual({ embedding: vector });
    expect(JSON.stringify(debug.mock.calls)).not.toContain(secret);
    const malformed = mockEmbedding('twelvelabs.marengo-embed-3-0-v1:0', { echoed: secret });
    expect(await malformed.provider.callEmbeddingApi(secret)).toEqual({
      error: 'API response error: No valid embedding found in AWS Bedrock API response',
    });
  });

  it('reports unreadable responses without copying their contents into errors', async () => {
    const { provider, invokeModel } = mockEmbedding('test-model', {});
    invokeModel.mockResolvedValue({ body: { transformToString: () => 'not JSON: sensitive' } });
    expect(await provider.callEmbeddingApi(text)).toEqual({
      error: 'API response error: Could not decode AWS Bedrock embedding response as JSON',
    });
  });

  it('returns a normalized transport error', async () => {
    const { provider, invokeModel } = mockEmbedding('cohere.embed-english-v3', {});
    invokeModel.mockRejectedValue(new Error('mock service failure'));
    expect(await provider.callEmbeddingApi('A quiet garden')).toEqual({
      error: 'API call error: Error: mock service failure',
    });
  });
});
