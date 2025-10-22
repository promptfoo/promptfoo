import { fetchHuggingFaceDataset } from '../../../src/integrations/huggingfaceDatasets';
import {
  BeavertailsGrader,
  BeavertailsPlugin,
  fetchAllDatasets,
  VALID_SUBCATEGORIES,
} from '../../../src/redteam/plugins/beavertails';

import type { TestCase } from '../../../src/types';

jest.mock('../../../src/integrations/huggingfaceDatasets');

describe('BeavertailsPlugin', () => {
  it('should set canGenerateRemote to false', () => {
    expect(BeavertailsPlugin.canGenerateRemote).toBe(false);
  });

  it('should have valid subcategories constant', () => {
    expect(VALID_SUBCATEGORIES).toHaveLength(14);
    expect(VALID_SUBCATEGORIES).toContain('animal_abuse');
    expect(VALID_SUBCATEGORIES).toContain('self_harm');
    expect(VALID_SUBCATEGORIES).toContain('privacy_violation');
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
          category: 'animal_abuse',
        },
      },
      {
        vars: {
          prompt: 'test prompt 2',
          is_safe: true, // Should be filtered out
          category: 'self_harm',
        },
      },
      {
        vars: {
          prompt: 'test prompt 3',
          is_safe: false,
          category: 'privacy_violation',
        },
      },
    ];

    jest.mocked(fetchHuggingFaceDataset).mockResolvedValue(mockTestCases);

    const result = await fetchAllDatasets(2);

    expect(fetchHuggingFaceDataset).toHaveBeenCalledTimes(1);
    expect(result.length).toBeLessThanOrEqual(2);
    expect(result[0].vars).toHaveProperty('prompt');
    expect(result[0].vars).toHaveProperty('category');
    expect(result.every((test) => !test.vars.is_safe)).toBe(true);
  });

  it('should filter by subcategory when config is provided', async () => {
    const mockTestCases: TestCase[] = [
      {
        vars: {
          prompt: 'test prompt 1',
          is_safe: false,
          category: 'animal_abuse',
        },
      },
      {
        vars: {
          prompt: 'test prompt 2',
          is_safe: false,
          category: 'self_harm',
        },
      },
      {
        vars: {
          prompt: 'test prompt 3',
          is_safe: false,
          category: 'privacy_violation',
        },
      },
      {
        vars: {
          prompt: 'test prompt 4',
          is_safe: false,
          category: 'self_harm',
        },
      },
    ];

    jest.mocked(fetchHuggingFaceDataset).mockResolvedValue(mockTestCases);

    const result = await fetchAllDatasets(10, { subcategories: ['self_harm'] });

    expect(result.length).toBe(2);
    expect(result.every((test) => test.vars.category === 'self_harm')).toBe(true);
  });

  it('should filter by multiple subcategories when config is provided', async () => {
    const mockTestCases: TestCase[] = [
      {
        vars: {
          prompt: 'test prompt 1',
          is_safe: false,
          category: 'animal_abuse',
        },
      },
      {
        vars: {
          prompt: 'test prompt 2',
          is_safe: false,
          category: 'self_harm',
        },
      },
      {
        vars: {
          prompt: 'test prompt 3',
          is_safe: false,
          category: 'privacy_violation',
        },
      },
      {
        vars: {
          prompt: 'test prompt 4',
          is_safe: false,
          category: 'child_abuse',
        },
      },
    ];

    jest.mocked(fetchHuggingFaceDataset).mockResolvedValue(mockTestCases);

    const result = await fetchAllDatasets(10, {
      subcategories: ['self_harm', 'privacy_violation'],
    });

    expect(result.length).toBe(2);
    expect(
      result.every(
        (test) => test.vars.category === 'self_harm' || test.vars.category === 'privacy_violation',
      ),
    ).toBe(true);
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
