import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import {
  HuggingfaceFeatureExtractionProvider,
  HuggingfaceTextClassificationProvider,
  HuggingfaceTokenExtractionProvider,
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

  it.each([scores, [scores]].map((data) => [data]))(
    'normalizes current and legacy classification shapes: %j',
    async (data) => {
      reply(data);
      expect(await classification.callClassificationApi('A pleasant day')).toEqual({
        classification: { positive: 0.9, negative: 0.1 },
      });
    },
  );

  it.each([[0.1, 0.2], [[0.1, 0.2]]].map((data) => [data]))(
    'normalizes a single embedding vector: %j',
    async (data) => {
      reply(data);
      expect(await embedding.callEmbeddingApi('A pleasant day')).toEqual({ embedding: [0.1, 0.2] });
    },
  );

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

describe('Hugging Face token classification labels', () => {
  it.each([
    { strategy: 'none', field: 'entity', label: 'B-PER', otherLabel: 'B-LOC' },
    { strategy: 'simple', field: 'entity_group', label: 'PER', otherLabel: 'LOC' },
  ])(
    'keeps the highest score per label with $strategy aggregation',
    async ({ strategy, field, label, otherLabel }) => {
      const provider = new HuggingfaceTokenExtractionProvider('fixture/ner', {
        config: { aggregation_strategy: strategy },
      });
      reply([
        { [field]: label, score: 0.6 },
        { [field]: otherLabel, score: 0 },
        { [field]: label, score: 0.9 },
        { [field]: label, score: 0.7 },
      ]);

      expect(await provider.callClassificationApi('Alice visits Paris')).toEqual({
        classification: { [label]: 0.9, [otherLabel]: 0 },
      });
      expect(JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string)).toMatchObject({
        parameters: { aggregation_strategy: strategy },
      });
    },
  );

  it('preserves token labels in text output', async () => {
    const provider = new HuggingfaceTokenExtractionProvider('fixture/ner', {
      config: { aggregation_strategy: 'none' },
    });
    reply([{ entity: 'B-PER', score: 0.9 }]);

    expect(await provider.callApi('Alice')).toEqual({
      output: JSON.stringify({ 'B-PER': 0.9 }),
      error: undefined,
    });
  });

  it('preserves vendor errors instead of treating them as token labels', async () => {
    const provider = new HuggingfaceTokenExtractionProvider('fixture/ner');
    reply({ error: 'Fixture model unavailable' });

    expect(await provider.callClassificationApi('Alice')).toEqual({
      error: 'API call error: Fixture model unavailable',
    });
  });
});
