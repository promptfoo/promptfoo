import { fetchHuggingFaceDataset } from '../../../src/integrations/huggingfaceDatasets';
import { fetchAllDatasets } from '../../../src/redteam/plugins/beavertails';
import type { TestCase } from '../../../src/types';

jest.mock('../../../src/integrations/huggingfaceDatasets');

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
});
