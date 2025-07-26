import { fetchHuggingFaceDataset } from '../../../src/integrations/huggingfaceDatasets';
import {
  BeavertailsGrader,
  BeavertailsPlugin,
  fetchAllDatasets,
} from '../../../src/redteam/plugins/beavertails';

import type { TestCase } from '../../../src/types';

jest.mock('../../../src/integrations/huggingfaceDatasets');

describe('BeavertailsPlugin', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should set canGenerateRemote to false', () => {
    expect(BeavertailsPlugin.canGenerateRemote).toBe(false);
  });

  it('should generate custom number of test cases', async () => {
    const mockTestCases: TestCase[] = Array(20)
      .fill(null)
      .map((_, i) => ({
        vars: {
          prompt: `test prompt ${i}`,
          is_safe: false,
        },
      }));

    jest.mocked(fetchHuggingFaceDataset).mockResolvedValue(mockTestCases);

    const plugin = new BeavertailsPlugin({ id: 'test-provider' }, 'test purpose', 'prompt', {
      numTests: 5,
    });

    const result = await plugin.generateTests(5);

    expect(result).toHaveLength(5);
    expect(result[0].vars).toHaveProperty('prompt');
  });

  it('should generate all test cases with fullDataset option', async () => {
    const mockTestCases: TestCase[] = Array(50)
      .fill(null)
      .map((_, i) => ({
        vars: {
          prompt: `test prompt ${i}`,
          is_safe: false,
        },
      }));

    jest.mocked(fetchHuggingFaceDataset).mockResolvedValue(mockTestCases);

    const plugin = new BeavertailsPlugin({ id: 'test-provider' }, 'test purpose', 'prompt', {
      fullDataset: true,
    });

    const result = await plugin.generateTests(5); // n parameter should be ignored

    expect(result).toHaveLength(50); // Should return all test cases
  });

  it('should handle empty dataset gracefully', async () => {
    jest.mocked(fetchHuggingFaceDataset).mockResolvedValue([]);

    const plugin = new BeavertailsPlugin({ id: 'test-provider' }, 'test purpose', 'prompt', {});

    const result = await plugin.generateTests(5);

    expect(result).toEqual([]);
  });

  it('should handle dataset fetch errors', async () => {
    jest.mocked(fetchHuggingFaceDataset).mockRejectedValue(new Error('Network error'));

    const plugin = new BeavertailsPlugin({ id: 'test-provider' }, 'test purpose', 'prompt', {});

    const result = await plugin.generateTests(5);

    expect(result).toEqual([]);
  });
});

describe('BeavertailsGrader', () => {
  it('should have the correct plugin ID', () => {
    const grader = new BeavertailsGrader();
    expect(grader.id).toBe('promptfoo:redteam:beavertails');
    expect('promptfoo:redteam:beavertails').toBe('promptfoo:redteam:beavertails');
  });
});

describe('fetchAllDatasets', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should fetch and filter datasets correctly', async () => {
    const mockTestCases: TestCase[] = [
      {
        vars: {
          prompt: 'test prompt 1',
          is_safe: false,
        },
      },
      {
        vars: {
          prompt: 'test prompt 2',
          is_safe: true, // Should be filtered out
        },
      },
      {
        vars: {
          prompt: 'test prompt 3',
          is_safe: false,
        },
      },
    ];

    jest.mocked(fetchHuggingFaceDataset).mockResolvedValue(mockTestCases);

    const result = await fetchAllDatasets(2);

    expect(fetchHuggingFaceDataset).toHaveBeenCalledTimes(1);
    expect(fetchHuggingFaceDataset).toHaveBeenCalledWith(expect.any(String), 10); // 2 * 5 for filtering
    expect(result.length).toBeLessThanOrEqual(2);
    expect(result[0].vars).toHaveProperty('prompt');
    expect(result.every((test) => !test.vars.is_safe)).toBe(true);
  });

  it('should handle empty dataset', async () => {
    jest.mocked(fetchHuggingFaceDataset).mockResolvedValue([]);

    const result = await fetchAllDatasets(5);

    expect(result).toEqual([]);
  });

  it('should handle invalid test cases', async () => {
    const invalidTestCases = [
      {},
      { vars: null },
      { vars: { prompt: null } },
      null,
      undefined,
    ] as TestCase[];

    jest.mocked(fetchHuggingFaceDataset).mockResolvedValue(invalidTestCases);

    const result = await fetchAllDatasets(5);

    expect(result).toEqual([]);
  });

  it('should handle fetch errors', async () => {
    jest.mocked(fetchHuggingFaceDataset).mockRejectedValue(new Error('Fetch failed'));

    const result = await fetchAllDatasets(5);

    expect(result).toEqual([]);
  });

  it('should fetch all datasets when limit is undefined', async () => {
    const mockTestCases: TestCase[] = Array(100)
      .fill(null)
      .map((_, i) => ({
        vars: {
          prompt: `test prompt ${i}`,
          is_safe: false,
        },
      }));

    jest.mocked(fetchHuggingFaceDataset).mockResolvedValue(mockTestCases);

    const result = await fetchAllDatasets(undefined);

    expect(fetchHuggingFaceDataset).toHaveBeenCalledTimes(1);
    expect(fetchHuggingFaceDataset).toHaveBeenCalledWith(expect.any(String), undefined);
    expect(result).toHaveLength(100); // Should return all test cases
  });
});
