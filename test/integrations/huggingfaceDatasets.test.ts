import { fetchWithCache } from '../../src/cache';
import { getEnvString } from '../../src/envars';
import {
  fetchHuggingFaceDataset,
  parseDatasetPath,
} from '../../src/integrations/huggingfaceDatasets';

jest.mock('../../src/cache', () => ({
  fetchWithCache: jest.fn(),
}));

jest.mock('../../src/util/fetch/index.ts', () => ({
  fetchWithProxy: jest.fn(),
}));

jest.mock('../../src/envars', () => ({
  getEnvString: jest.fn().mockReturnValue(''),
  isCI: jest.fn().mockReturnValue(false),
}));

describe('huggingfaceDatasets', () => {
  beforeEach(() => {
    jest.mocked(getEnvString).mockReturnValue('');
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('parseDatasetPath', () => {
    it('should parse path with default parameters', () => {
      const result = parseDatasetPath('huggingface://datasets/owner/repo');
      expect(result).toEqual({
        owner: 'owner',
        repo: 'repo',
        queryParams: expect.any(URLSearchParams),
      });
      expect(result.queryParams.get('split')).toBe('test');
      expect(result.queryParams.get('config')).toBe('default');
    });

    it('should parse path with custom query parameters', () => {
      const result = parseDatasetPath(
        'huggingface://datasets/owner/repo?split=train&config=custom&limit=10',
      );
      expect(result).toEqual({
        owner: 'owner',
        repo: 'repo',
        queryParams: expect.any(URLSearchParams),
      });
      expect(result.queryParams.get('split')).toBe('train');
      expect(result.queryParams.get('config')).toBe('custom');
      expect(result.queryParams.get('limit')).toBe('10');
    });

    it('should override default parameters with user parameters', () => {
      const result = parseDatasetPath('huggingface://datasets/owner/repo?split=validation');
      expect(result.queryParams.get('split')).toBe('validation');
      expect(result.queryParams.get('config')).toBe('default');
    });
  });

  it('should fetch and parse dataset with default parameters', async () => {
    jest.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        num_rows_total: 2,
        features: [
          { name: 'act', type: { dtype: 'string', _type: 'Value' } },
          { name: 'prompt', type: { dtype: 'string', _type: 'Value' } },
        ],
        rows: [
          { row: { act: 'Linux Terminal', prompt: 'List all files' } },
          { row: { act: 'Math Tutor', prompt: 'Solve 2+2' } },
        ],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);

    const tests = await fetchHuggingFaceDataset('huggingface://datasets/test/dataset');

    expect(jest.mocked(fetchWithCache)).toHaveBeenCalledWith(
      'https://datasets-server.huggingface.co/rows?dataset=test%2Fdataset&split=test&config=default&offset=0&length=100',
      expect.objectContaining({
        headers: {},
      }),
    );

    expect(tests).toHaveLength(2);
    expect(tests[0].vars).toEqual({
      act: 'Linux Terminal',
      prompt: 'List all files',
    });
    expect(tests[1].vars).toEqual({
      act: 'Math Tutor',
      prompt: 'Solve 2+2',
    });

    // Check that disableVarExpansion is set for all test cases
    tests.forEach((test) => {
      expect(test.options).toEqual({
        disableVarExpansion: true,
      });
    });
  });

  it('should include auth token when HF_TOKEN is set', async () => {
    jest.mocked(getEnvString).mockImplementation((key) => {
      if (key === 'HF_TOKEN') {
        return 'test-token';
      }
      return '';
    });

    jest.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        num_rows_total: 1,
        features: [
          { name: 'question', type: { dtype: 'string', _type: 'Value' } },
          { name: 'answer', type: { dtype: 'string', _type: 'Value' } },
        ],
        rows: [{ row: { question: 'What is 2+2?', answer: '4' } }],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);

    await fetchHuggingFaceDataset('huggingface://datasets/test/dataset');

    expect(jest.mocked(fetchWithCache)).toHaveBeenCalledWith(
      'https://datasets-server.huggingface.co/rows?dataset=test%2Fdataset&split=test&config=default&offset=0&length=100',
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer test-token',
        },
      }),
    );
  });

  it('should fall back to HF_API_TOKEN when HF_TOKEN is empty', async () => {
    jest.mocked(getEnvString).mockImplementation((key) => {
      if (key === 'HF_TOKEN') {
        return '';
      }
      if (key === 'HF_API_TOKEN') {
        return 'api-token';
      }
      return '';
    });

    jest.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        num_rows_total: 1,
        features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
        rows: [{ row: { text: 'test' } }],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);

    await fetchHuggingFaceDataset('huggingface://datasets/test/dataset', 1);

    expect(jest.mocked(fetchWithCache)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer api-token',
        },
      }),
    );
  });

  it('should fall back to HUGGING_FACE_HUB_TOKEN when other tokens are empty', async () => {
    jest.mocked(getEnvString).mockImplementation((key) => {
      if (key === 'HF_TOKEN') {
        return '';
      }
      if (key === 'HF_API_TOKEN') {
        return '';
      }
      if (key === 'HUGGING_FACE_HUB_TOKEN') {
        return 'hub-token';
      }
      return '';
    });

    jest.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        num_rows_total: 1,
        features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
        rows: [{ row: { text: 'test' } }],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);

    await fetchHuggingFaceDataset('huggingface://datasets/test/dataset', 1);

    expect(jest.mocked(fetchWithCache)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: {
          Authorization: 'Bearer hub-token',
        },
      }),
    );
  });

  it('should handle custom query parameters', async () => {
    jest.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        num_rows_total: 1,
        features: [
          { name: 'question', type: { dtype: 'string', _type: 'Value' } },
          { name: 'answer', type: { dtype: 'string', _type: 'Value' } },
        ],
        rows: [{ row: { question: 'What is 2+2?', answer: '4' } }],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);

    await fetchHuggingFaceDataset('huggingface://datasets/test/dataset?split=train&config=custom');

    expect(jest.mocked(fetchWithCache)).toHaveBeenCalledWith(
      'https://datasets-server.huggingface.co/rows?dataset=test%2Fdataset&split=train&config=custom&offset=0&length=100',
      expect.objectContaining({
        headers: {},
      }),
    );
  });

  it('should handle pagination', async () => {
    jest.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        num_rows_total: 3,
        features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
        rows: [{ row: { text: 'First' } }, { row: { text: 'Second' } }],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);

    jest.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        num_rows_total: 3,
        features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
        rows: [{ row: { text: 'Third' } }],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);

    const tests = await fetchHuggingFaceDataset('huggingface://datasets/test/dataset');

    expect(jest.mocked(fetchWithCache)).toHaveBeenCalledTimes(2);
    expect(jest.mocked(fetchWithCache)).toHaveBeenNthCalledWith(
      1,
      'https://datasets-server.huggingface.co/rows?dataset=test%2Fdataset&split=test&config=default&offset=0&length=100',
      expect.objectContaining({
        headers: {},
      }),
    );
    // Note: Second call might have different length due to concurrent fetching and remaining calculation
    expect(jest.mocked(fetchWithCache)).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('dataset=test%2Fdataset&split=test&config=default&offset=2'),
      expect.objectContaining({
        headers: {},
      }),
    );

    expect(tests).toHaveLength(3);
    expect(tests.map((t) => t.vars?.text)).toEqual(['First', 'Second', 'Third']);

    // Check that disableVarExpansion is set for all test cases
    tests.forEach((test) => {
      expect(test.options).toEqual({
        disableVarExpansion: true,
      });
    });
  });

  it('should handle API errors by throwing', async () => {
    jest.mocked(fetchWithCache).mockResolvedValueOnce({
      data: null,
      cached: false,
      status: 404,
      statusText: 'Not Found',
    } as any);

    await expect(
      fetchHuggingFaceDataset('huggingface://datasets/nonexistent/dataset'),
    ).rejects.toThrow('[HF Dataset] Failed to fetch dataset: Not Found');
  });

  it('should short-circuit and return [] when limit is 0', async () => {
    const tests = await fetchHuggingFaceDataset('huggingface://datasets/test/dataset', 0);
    expect(jest.mocked(fetchWithCache)).not.toHaveBeenCalled();
    expect(tests).toEqual([]);
  });

  it('should respect user-specified limit parameter (single request optimization)', async () => {
    jest.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        num_rows_total: 5,
        features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
        rows: [{ row: { text: 'First' } }, { row: { text: 'Second' } }],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);

    const tests = await fetchHuggingFaceDataset('huggingface://datasets/test/dataset?limit=2');

    expect(jest.mocked(fetchWithCache)).toHaveBeenCalledWith(
      'https://datasets-server.huggingface.co/rows?dataset=test%2Fdataset&split=test&config=default&limit=2&offset=0&length=2',
      expect.objectContaining({
        headers: {},
      }),
    );

    expect(tests).toHaveLength(2);
    expect(tests.map((t) => t.vars?.text)).toEqual(['First', 'Second']);

    // Check that disableVarExpansion is set for all test cases
    tests.forEach((test) => {
      expect(test.options).toEqual({
        disableVarExpansion: true,
      });
    });
  });

  it('should handle limit larger than page size', async () => {
    jest.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        num_rows_total: 150,
        features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
        rows: Array(100)
          .fill(null)
          .map((_, i) => ({ row: { text: `Item ${i + 1}` } })),
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);

    jest.mocked(fetchWithCache).mockResolvedValueOnce({
      data: {
        num_rows_total: 150,
        features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
        rows: Array(20)
          .fill(null)
          .map((_, i) => ({ row: { text: `Item ${i + 101}` } })),
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    } as any);

    const tests = await fetchHuggingFaceDataset('huggingface://datasets/test/dataset?limit=120');

    expect(jest.mocked(fetchWithCache)).toHaveBeenCalledTimes(2);
    expect(jest.mocked(fetchWithCache)).toHaveBeenNthCalledWith(
      1,
      'https://datasets-server.huggingface.co/rows?dataset=test%2Fdataset&split=test&config=default&limit=120&offset=0&length=100',
      expect.objectContaining({
        headers: {},
      }),
    );
    expect(jest.mocked(fetchWithCache)).toHaveBeenNthCalledWith(
      2,
      'https://datasets-server.huggingface.co/rows?dataset=test%2Fdataset&split=test&config=default&limit=120&offset=100&length=20',
      expect.objectContaining({
        headers: {},
      }),
    );

    expect(tests).toHaveLength(120);
    expect(tests[119].vars?.text).toBe('Item 120');

    // Check that disableVarExpansion is set for all test cases
    tests.forEach((test) => {
      expect(test.options).toEqual({
        disableVarExpansion: true,
      });
    });
  });

  describe('performance optimizations', () => {
    it('should use single request optimization for small limits', async () => {
      jest.mocked(fetchWithCache).mockResolvedValueOnce({
        data: {
          num_rows_total: 1000,
          features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
          rows: Array(50)
            .fill(null)
            .map((_, i) => ({ row: { text: `Item ${i + 1}` } })),
        },
        cached: true,
        status: 200,
        statusText: 'OK',
      } as any);

      const tests = await fetchHuggingFaceDataset('huggingface://datasets/test/dataset', 50);

      // Should only make one request for limits <= 100
      expect(jest.mocked(fetchWithCache)).toHaveBeenCalledTimes(1);
      expect(tests).toHaveLength(50);
    });

    it('should throw error on page fetch failure', async () => {
      // First page succeeds
      jest.mocked(fetchWithCache).mockResolvedValueOnce({
        data: {
          num_rows_total: 300,
          features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
          rows: Array(100)
            .fill(null)
            .map((_, i) => ({ row: { text: `Item ${i + 1}` } })),
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      } as any);

      // Second page fails
      jest.mocked(fetchWithCache).mockResolvedValueOnce({
        data: null,
        cached: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as any);

      // Should throw error instead of returning partial results
      await expect(
        fetchHuggingFaceDataset('huggingface://datasets/test/dataset', 200),
      ).rejects.toThrow('[HF Dataset] Failed to fetch dataset: Internal Server Error');
    });

    it('should adapt page size based on row size', async () => {
      // Mock a dataset with large rows (>2KB each)
      const largeRow = { text: 'x'.repeat(3000) }; // ~3KB row

      jest.mocked(fetchWithCache).mockResolvedValueOnce({
        data: {
          num_rows_total: 200,
          features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
          rows: Array(100)
            .fill(null)
            .map(() => ({ row: largeRow })),
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      } as any);

      // Mock all subsequent potential concurrent requests to avoid undefined errors
      jest.mocked(fetchWithCache).mockResolvedValue({
        data: {
          num_rows_total: 200,
          features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
          rows: Array(25)
            .fill(null)
            .map((_, i) => ({ row: { text: `Item ${i + 101}` } })),
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      } as any);

      const tests = await fetchHuggingFaceDataset('huggingface://datasets/test/dataset', 125);

      // Should have made at least one request
      expect(jest.mocked(fetchWithCache)).toHaveBeenCalled();

      // First call should be normal page size
      expect(jest.mocked(fetchWithCache)).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('length=100'),
        expect.anything(),
      );

      expect(tests.length).toBeGreaterThan(0);
      expect(tests[0].vars?.text).toBe(largeRow.text);
    });

    it('should handle authentication tokens correctly', async () => {
      jest.mocked(getEnvString).mockImplementation((key) => {
        if (key === 'HF_TOKEN') {
          return 'test-token-123';
        }
        return '';
      });

      jest.mocked(fetchWithCache).mockResolvedValueOnce({
        data: {
          num_rows_total: 10,
          features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
          rows: [{ row: { text: 'Test' } }],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      } as any);

      await fetchHuggingFaceDataset('huggingface://datasets/test/dataset', 5);

      expect(jest.mocked(fetchWithCache)).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer test-token-123',
          },
        }),
      );
    });
  });
});
