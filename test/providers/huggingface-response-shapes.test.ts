import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import {
  HuggingfaceFeatureExtractionProvider,
  HuggingfaceTextClassificationProvider,
} from '../../src/providers/huggingface';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));
beforeEach(() => vi.mocked(fetchWithCache).mockReset());
afterEach(() => vi.restoreAllMocks());
function reply(data: unknown) {
  vi.mocked(fetchWithCache).mockResolvedValue({
    data,
    cached: false,
    status: 200,
    statusText: 'OK',
    headers: {},
  });
}

describe('Hugging Face task response compatibility', () => {
  const classification = new HuggingfaceTextClassificationProvider('fixture/classifier');
  const embedding = new HuggingfaceFeatureExtractionProvider('fixture/embedder');
  const scores = [
    { label: 'positive', score: 0.9 },
    { label: 'negative', score: 0.1 },
  ];

  it.each(
    [scores, [scores]].map((data) => [data]),
  )('normalizes current and legacy classification shapes: %j', async (data) => {
    reply(data);
    expect(await classification.callClassificationApi('A pleasant day')).toEqual({
      classification: { positive: 0.9, negative: 0.1 },
    });
  });

  it.each(
    [[0.1, 0.2], [[0.1, 0.2]]].map((data) => [data]),
  )('normalizes a single embedding vector: %j', async (data) => {
    reply(data);
    expect(await embedding.callEmbeddingApi('A pleasant day')).toEqual({ embedding: [0.1, 0.2] });
  });

  it.each(
    [null, [], [{ label: 'positive', score: '0.9' }], [[scores, scores]]].map((data) => [data]),
  )('rejects malformed classifications: %j', async (data) => {
    reply(data);
    expect((await classification.callClassificationApi('Hello')).error).toContain(
      'Malformed response',
    );
  });

  it.each(
    [
      null,
      [],
      [
        [1, 2],
        [3, 4],
      ],
      ['invalid'],
      [Number.NaN],
      [[]],
    ].map((data) => [data]),
  )('rejects malformed or ambiguous embeddings: %j', async (data) => {
    reply(data);
    expect((await embedding.callEmbeddingApi('Hello')).error).toContain('Malformed response');
  });

  it('preserves vendor errors for both task APIs', async () => {
    reply({ error: 'Fixture model unavailable' });
    expect((await classification.callClassificationApi('Hello')).error).toContain(
      'Fixture model unavailable',
    );
    expect((await embedding.callEmbeddingApi('Hello')).error).toContain(
      'Fixture model unavailable',
    );
  });
});
