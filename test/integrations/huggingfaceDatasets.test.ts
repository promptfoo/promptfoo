import fs from 'fs';
import os from 'os';
import path from 'path';
import { fetchWithProxy } from '../../src/fetch';
import { fetchHuggingFaceDataset } from '../../src/integrations/huggingfaceDatasets';

jest.mock('../../src/fetch', () => ({
  fetchWithProxy: jest.fn(),
}));

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  unlinkSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

const createMockDb = (data: any[] = []) => {
  const mockDb = {
    pragma: jest.fn(),
    exec: jest.fn(),
    prepare: jest.fn((sql) => {
      if (sql.includes('COUNT(*)')) {
        return {
          get: jest.fn(() => ({ count: data.length })),
        };
      }
      if (sql.includes('SELECT')) {
        return {
          all: jest.fn(() => data.map((row) => ({ ...row }))),
          get: jest.fn(() => data[0]),
        };
      }
      return {
        run: jest.fn(),
        all: jest.fn(() => data),
        get: jest.fn(() => ({ count: data.length })),
      };
    }),
    transaction: jest.fn((fn) => {
      fn();
      return () => {};
    }),
    close: jest.fn(),
  };
  return mockDb;
};

describe('huggingfaceDatasets', () => {
  const mockDbPath = path.join(os.tmpdir(), 'promptfoo-dataset-test.sqlite');
  const mockDbDir = path.dirname(mockDbPath);

  beforeEach(() => {
    jest.resetModules();
    jest.mocked(fetchWithProxy).mockClear();
    jest.mocked(fs.existsSync).mockImplementation((p) => {
      if (p === mockDbDir) {
        return true;
      }
      return false;
    });
    jest.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    jest.mocked(fs.unlinkSync).mockClear();
  });

  afterEach(() => {
    try {
      if (fs.existsSync(mockDbPath)) {
        fs.unlinkSync(mockDbPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    jest.resetModules();
  });

  it('should fetch and parse dataset with default parameters', async () => {
    const mockData = [
      { act: 'Linux Terminal', prompt: 'List all files' },
      { act: 'Math Tutor', prompt: 'Solve 2+2' },
    ];

    const mockResponse = {
      ok: true,
      json: async () => ({
        num_rows_total: mockData.length,
        features: [
          { name: 'act', type: { dtype: 'string', _type: 'Value' } },
          { name: 'prompt', type: { dtype: 'string', _type: 'Value' } },
        ],
        rows: mockData.map((row) => ({ row })),
      }),
    };

    jest.mocked(fetchWithProxy).mockResolvedValueOnce(mockResponse as any);
    const mockDb = createMockDb([]);
    mockDb.prepare.mockImplementation((sql) => ({
      run: jest.fn(),
      all: jest.fn(() => mockData),
      get: jest.fn(() => ({ count: mockData.length })),
    }));
    jest.doMock('better-sqlite3', () => jest.fn(() => mockDb));

    const tests = await fetchHuggingFaceDataset('huggingface://datasets/test/dataset');

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
    const mockData = [
      { question: 'What is 2+2?', answer: '4' },
      { question: 'What is 3+3?', answer: '6' },
    ];

    const mockResponse = {
      ok: true,
      json: async () => ({
        num_rows_total: mockData.length,
        features: [
          { name: 'question', type: { dtype: 'string', _type: 'Value' } },
          { name: 'answer', type: { dtype: 'string', _type: 'Value' } },
        ],
        rows: mockData.map((row) => ({ row })),
      }),
    };

    jest.mocked(fetchWithProxy).mockResolvedValueOnce(mockResponse as any);
    const mockDb = createMockDb([]);
    mockDb.prepare.mockImplementation((sql) => ({
      run: jest.fn(),
      all: jest.fn(() => mockData),
      get: jest.fn(() => ({ count: mockData.length })),
    }));
    jest.doMock('better-sqlite3', () => jest.fn(() => mockDb));

    await fetchHuggingFaceDataset('huggingface://datasets/test/dataset?split=train&config=custom');

    expect(jest.mocked(fetchWithProxy)).toHaveBeenCalledWith(
      expect.stringContaining('split=train'),
      expect.any(Object),
    );
    expect(jest.mocked(fetchWithProxy)).toHaveBeenCalledWith(
      expect.stringContaining('config=custom'),
      expect.any(Object),
    );
  });

  it('should handle pagination', async () => {
    const mockData = Array(120)
      .fill(null)
      .map((_, i) => ({ text: `Item ${i + 1}` }));

    const firstPage = {
      ok: true,
      json: async () => ({
        num_rows_total: 150,
        features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
        rows: mockData.slice(0, 100).map((row) => ({ row })),
      }),
    };

    const secondPage = {
      ok: true,
      json: async () => ({
        num_rows_total: 150,
        features: [{ name: 'text', type: { dtype: 'string', _type: 'Value' } }],
        rows: mockData.slice(100, 120).map((row) => ({ row })),
      }),
    };

    // Clear previous mocks and set up new ones
    jest.mocked(fetchWithProxy).mockReset();
    jest
      .mocked(fetchWithProxy)
      .mockResolvedValueOnce(firstPage as any)
      .mockResolvedValueOnce(secondPage as any);

    jest.doMock('better-sqlite3', () => jest.fn(() => createMockDb(mockData)));

    const tests = await fetchHuggingFaceDataset('huggingface://datasets/test/dataset?limit=120');

    expect(jest.mocked(fetchWithProxy)).toHaveBeenCalledTimes(2);
    expect(jest.mocked(fetchWithProxy)).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('offset=0'),
      expect.any(Object),
    );
    expect(jest.mocked(fetchWithProxy)).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('offset=100'),
      expect.any(Object),
    );

    expect(tests).toHaveLength(120);
    expect(tests[119].vars?.text).toBe('Item 120');
  });

  it('should handle empty rows array', async () => {
    jest.mocked(fetchWithProxy).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers(),
      text: async () => 'Dataset not found',
    } as any);

    const mockDb = {
      prepare: jest.fn().mockReturnValue({
        run: jest.fn(),
        all: jest.fn().mockReturnValue([]),
        get: jest.fn(),
      }),
      close: jest.fn(),
      exec: jest.fn(),
      pragma: jest.fn(),
      transaction: jest.fn().mockImplementation((fn) => fn),
    };

    jest.doMock('better-sqlite3', () => jest.fn(() => mockDb));

    await expect(fetchHuggingFaceDataset('huggingface://datasets/test/dataset')).rejects.toThrow(
      '[Huggingface Dataset] Failed to fetch dataset',
    );
  });
});
