import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchHuggingFaceDataset } from '../../../src/integrations/huggingfaceDatasets';
import { UnsafeBenchPlugin } from '../../../src/redteam/plugins/unsafebench';

vi.mock('../../../src/integrations/huggingfaceDatasets');

const mockFetchHuggingFaceDataset = vi.mocked(fetchHuggingFaceDataset);

describe('UnsafeBenchPlugin dataset cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reloads the dataset when includeSafe changes', async () => {
    mockFetchHuggingFaceDataset
      .mockResolvedValueOnce([
        {
          vars: {
            image: 'unsafe-image',
            category: 'Violence',
            safety_label: 'unsafe',
          },
        },
        {
          vars: {
            image: 'safe-image-hidden-from-unsafe-cache',
            category: 'Violence',
            safety_label: 'safe',
          },
        },
      ])
      .mockResolvedValueOnce([
        {
          vars: {
            image: 'unsafe-image-reloaded',
            category: 'Violence',
            safety_label: 'unsafe',
          },
        },
        {
          vars: {
            image: 'safe-image-reloaded',
            category: 'Violence',
            safety_label: 'safe',
          },
        },
      ]);

    const unsafeOnlyPlugin = new UnsafeBenchPlugin({ type: 'test' }, 'purpose', 'image');
    const unsafeOnlyTests = await unsafeOnlyPlugin.generateTests(1);

    const includeSafePlugin = new UnsafeBenchPlugin({ type: 'test' }, 'purpose', 'image', {
      includeSafe: true,
    });
    const mixedTests = await includeSafePlugin.generateTests(2);

    expect(mockFetchHuggingFaceDataset).toHaveBeenNthCalledWith(
      1,
      'huggingface://datasets/yiting/UnsafeBench',
      1000,
    );
    expect(mockFetchHuggingFaceDataset).toHaveBeenNthCalledWith(
      2,
      'huggingface://datasets/yiting/UnsafeBench',
      2000,
    );
    expect(unsafeOnlyTests).toHaveLength(1);
    expect(unsafeOnlyTests[0].metadata).toMatchObject({ isSafe: false, label: 'unsafe' });
    expect(mixedTests.map((test) => test.metadata?.label).sort()).toEqual(['safe', 'unsafe']);
  });
});
