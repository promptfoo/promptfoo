import { fetchWithProxy } from '../../src/fetch';
import { fetchHuggingFaceDataset } from '../../src/integrations/huggingfaceDatasets';

jest.mock('../../src/fetch', () => ({
  fetchWithProxy: jest.fn(),
}));

describe('huggingfaceDatasets', () => {
  beforeEach(() => {
    jest.mocked(fetchWithProxy).mockClear();
  });

  it('should fetch and parse dataset with default parameters', async () => {
    // Mock API response
    jest.mocked(fetchWithProxy).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        num_rows_total: 2,
        features: [
          { name: 'act', type: { dtype: 'string', _type: 'Value' } },
          { name: 'prompt', type: { dtype: 'string', _type: 'Value' } },
        ],
        rows: [
          { row: { act: 'Linux Terminal', prompt: 'List all files' } },
          { row: { act: 'Math Tutor', prompt: 'Solve 2+2' } },
        ],
      }),
    } as any);

    const tests = await fetchHuggingFaceDataset('huggingface://datasets/test/dataset');

    // Verify the fetch call
    expect(jest.mocked(fetchWithProxy)).toHaveBeenCalledWith(
      expect.stringContaining('https://datasets-server.huggingface.co/rows'),
    );
    expect(jest.mocked(fetchWithProxy)).toHaveBeenCalledWith(expect.stringContaining('split=test'));
    expect(jest.mocked(fetchWithProxy)).toHaveBeenCalledWith(
      expect.stringContaining('config=default'),
    );

    // Verify the parsed results
    expect(tests).toHaveLength(2);
    expect(tests[0].vars).toEqual({
      act: 'Linux Terminal',
      prompt: 'List all files',
    });
    expect(tests[1].vars).toEqual({
      act: 'Math Tutor',
      prompt: 'Solve 2+2',
    });
  });

  it('should handle custom query parameters', async () => {
    jest.mocked(fetchWithProxy).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        num_rows_total: 1,
        features: [
          { name: 'question', type: { dtype: 'string', _type: 'Value' } },
          { name: 'answer', type: { dtype: 'string', _type: 'Value' } },
        ],
        rows: [{ row: { question: 'What is 2+2?', answer: '4' } }],
      }),
    } as any);

    await fetchHuggingFaceDataset('huggingface://datasets/test/dataset?split=train&config=custom');

    // Verify custom parameters were used
    expect(jest.mocked(fetchWithProxy)).toHaveBeenCalledWith(
      expect.stringContaining('split=train'),
    );
    expect(jest.mocked(fetchWithProxy)).toHaveBeenCalledWith(
      expect.stringContaining('config=custom'),
    );
  });

  it('should handle pagination', async () => {
    // First page response
    jest.mocked(fetchWithProxy).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        num_rows_total: 3,
        features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
        rows: [{ row: { text: 'First' } }, { row: { text: 'Second' } }],
      }),
    } as any);

    // Second page response
    jest.mocked(fetchWithProxy).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        num_rows_total: 3,
        features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
        rows: [{ row: { text: 'Third' } }],
      }),
    } as any);

    const tests = await fetchHuggingFaceDataset('huggingface://datasets/test/dataset');

    // Verify pagination
    expect(jest.mocked(fetchWithProxy)).toHaveBeenCalledTimes(2);
    expect(jest.mocked(fetchWithProxy)).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('length=100'),
    );
    expect(jest.mocked(fetchWithProxy)).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('length=100'),
    );

    // Verify all results were combined
    expect(tests).toHaveLength(3);
    expect(tests.map((t) => t.vars?.text)).toEqual(['First', 'Second', 'Third']);
  });

  it('should handle API errors', async () => {
    jest.mocked(fetchWithProxy).mockResolvedValueOnce({
      ok: false,
      statusText: 'Not Found',
    } as any);

    await expect(
      fetchHuggingFaceDataset('huggingface://datasets/nonexistent/dataset'),
    ).rejects.toThrow('[Huggingface Dataset] Failed to fetch dataset: Not Found');
  });

  it('should respect user-specified limit parameter', async () => {
    // Mock response with more data than the limit
    jest.mocked(fetchWithProxy).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        num_rows_total: 5,
        features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
        rows: [{ row: { text: 'First' } }, { row: { text: 'Second' } }, { row: { text: 'Third' } }],
      }),
    } as any);

    const tests = await fetchHuggingFaceDataset('huggingface://datasets/test/dataset?limit=2');

    // Verify the request includes the correct length parameter
    expect(jest.mocked(fetchWithProxy)).toHaveBeenCalledTimes(1);
    expect(jest.mocked(fetchWithProxy)).toHaveBeenCalledWith(expect.stringContaining('length=2'));

    // Verify only limited number of results are returned
    expect(tests).toHaveLength(2);
    expect(tests.map((t) => t.vars?.text)).toEqual(['First', 'Second']);
  });

  it('should handle limit larger than page size', async () => {
    // First page response
    jest.mocked(fetchWithProxy).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        num_rows_total: 150,
        features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
        rows: Array(100)
          .fill(null)
          .map((_, i) => ({ row: { text: `Item ${i + 1}` } })),
      }),
    } as any);

    // Second page response
    jest.mocked(fetchWithProxy).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        num_rows_total: 150,
        features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
        rows: Array(20)
          .fill(null)
          .map((_, i) => ({ row: { text: `Item ${i + 101}` } })),
      }),
    } as any);

    const tests = await fetchHuggingFaceDataset('huggingface://datasets/test/dataset?limit=120');

    // Verify pagination with limit
    expect(jest.mocked(fetchWithProxy)).toHaveBeenCalledTimes(2);
    expect(jest.mocked(fetchWithProxy)).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('length=100'),
    );
    expect(jest.mocked(fetchWithProxy)).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('length=20'),
    );

    // Verify we got exactly the number of results specified by limit
    expect(tests).toHaveLength(120);
    expect(tests[119].vars?.text).toBe('Item 120');
  });
});
