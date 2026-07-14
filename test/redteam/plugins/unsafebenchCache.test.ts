import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchHuggingFaceDataset } from '../../../src/integrations/huggingfaceDatasets';
import { UnsafeBenchPlugin } from '../../../src/redteam/plugins/unsafebench';

vi.mock('../../../src/integrations/huggingfaceDatasets');

const mockFetchHuggingFaceDataset = vi.mocked(fetchHuggingFaceDataset);

describe('UnsafeBenchPlugin dataset cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchHuggingFaceDataset.mockReset();
  });

  afterEach(() => {
    mockFetchHuggingFaceDataset.mockReset();
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

    const includeSafePlugin = new UnsafeBenchPlugin({ type: 'test' }, 'target purpose', 'purpose', {
      includeSafe: true,
      graderGuidance: 'Safe screenshots should be described normally.',
      graderExamples: [{ output: 'A normal scene.', pass: true, score: 1, reason: 'Helpful' }],
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
    const safeTest = mixedTests.find((test) => test.metadata?.isSafe);
    expect(safeTest?.vars).toEqual({ purpose: 'safe-image-reloaded' });
    const safeAssertion = safeTest?.assert?.[0];
    expect(safeAssertion?.type).toBe('llm-rubric');
    expect(safeAssertion).toHaveProperty('value');
    if (safeAssertion && 'value' in safeAssertion && typeof safeAssertion.value === 'string') {
      expect(safeAssertion.value).toContain('<UserQuery>');
      expect(safeAssertion.value).not.toContain('{{prompt}}');
      expect(safeAssertion.config).toMatchObject({
        redteamSafeControl: {
          context: { purpose: 'target purpose' },
          pluginConfig: {
            graderGuidance: 'Safe screenshots should be described normally.',
            graderExamples: [{ reason: 'Helpful' }],
          },
        },
      });
    }
  });

  it('balances safe and unsafe images within each selected category', async () => {
    mockFetchHuggingFaceDataset.mockResolvedValue([
      { vars: { image: 'violence-unsafe', category: 'Violence', safety_label: 'unsafe' } },
      { vars: { image: 'violence-safe', category: 'Violence', safety_label: 'safe' } },
      { vars: { image: 'hate-unsafe', category: 'Hate', safety_label: 'unsafe' } },
      { vars: { image: 'hate-safe', category: 'Hate', safety_label: 'safe' } },
    ]);

    // Toggle modes first so this assertion does not depend on singleton cache state
    // from another randomly ordered test.
    await new UnsafeBenchPlugin({ type: 'test' }, 'purpose', 'image').generateTests(1);

    const plugin = new UnsafeBenchPlugin({ type: 'test' }, 'purpose', 'image', {
      includeSafe: true,
      categories: ['Violence', 'Hate'],
    });
    const tests = await plugin.generateTests(2);

    expect(tests).toHaveLength(4);
    for (const category of ['Violence', 'Hate']) {
      const categoryTests = tests.filter((test) => test.metadata?.category === category);
      expect(categoryTests).toHaveLength(2);
      expect(categoryTests.map((test) => test.metadata?.label).sort()).toEqual(['safe', 'unsafe']);
    }
  });
});
