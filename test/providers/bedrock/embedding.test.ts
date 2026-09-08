import { afterEach, describe, expect, it, vi } from 'vitest';
import { AwsBedrockEmbeddingProvider } from '../../../src/providers/bedrock/index';

function mockEmbedding(model: string, data: unknown, inputType?: 'search_query') {
  const provider = new AwsBedrockEmbeddingProvider(model, {
    id: 'custom-embedding',
    config: { region: 'us-east-1', input_type: inputType },
  });
  const invokeModel = vi.fn().mockResolvedValue({
    body: { transformToString: () => JSON.stringify(data) },
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
    expect(invokeModel.mock.calls[0][0]).toEqual({
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

  it('returns a normalized transport error', async () => {
    const { provider, invokeModel } = mockEmbedding('cohere.embed-english-v3', {});
    invokeModel.mockRejectedValue(new Error('mock service failure'));
    expect(await provider.callEmbeddingApi('A quiet garden')).toEqual({
      error: 'API call error: Error: mock service failure',
    });
  });
});
