import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as cache from '../../../src/cache';
import logger from '../../../src/logger';
import * as imageDatasetUtils from '../../../src/redteam/plugins/imageDatasetUtils';
import {
  VALID_CATEGORIES,
  VALID_SUBCATEGORIES,
  VLGuardDatasetManager,
  VLGuardPlugin,
} from '../../../src/redteam/plugins/vlguard';
import { createMockProvider } from '../../factories/provider';
import { createDeferred } from '../../util/utils';

vi.mock('../../../src/logger');
vi.mock('../../../src/cache');
vi.mock('../../../src/redteam/plugins/imageDatasetUtils', async () => ({
  ...(await vi.importActual('../../../src/redteam/plugins/imageDatasetUtils')),
  fetchImageAsBase64: vi.fn(),
}));

const mockProvider = createMockProvider();
const mockFetchWithCache = vi.mocked(cache.fetchWithCache);
const mockFetchImageAsBase64 = vi.mocked(imageDatasetUtils.fetchImageAsBase64);

beforeEach(() => {
  vi.resetAllMocks();
  VLGuardDatasetManager.clearCache();
});

function createMockDatasetServerResponse(rowCount: number) {
  return {
    rows: Array.from({ length: rowCount }, (_, i) => ({
      row_idx: i,
      row: { image: { src: `https://example.com/image${i}.jpg` } },
    })),
  };
}

// Unsafe records use legacy lowercase categories, which generation normalizes.
function createMockMetadataRecord(
  index = 1,
  category = 'deception',
  subcategory = 'disinformation',
) {
  return {
    id: `test_${index}`,
    image: `bad_ads/test${index}.png`,
    safe: false,
    harmful_category: category,
    harmful_subcategory: subcategory,
    'instr-resp': [{ instruction: `test question ${index}` }],
  };
}

function mockDataset(records: unknown[]) {
  mockFetchImageAsBase64.mockResolvedValue('data:image/jpeg;base64,test');
  mockFetchWithCache.mockImplementation(async (url: any) => {
    if (url.includes('.json') && url.includes('VLGuard')) {
      return { status: 200, data: records, cached: false } as any;
    }
    if (url.includes('datasets-server')) {
      return {
        status: 200,
        data: createMockDatasetServerResponse(records.length),
        cached: false,
      } as any;
    }
    return { status: 404, data: null, cached: false } as any;
  });
}

describe('VLGuardPlugin', () => {
  describe('constructor', () => {
    it('should initialize with default config', () => {
      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {});
      expect(plugin.id).toBe('promptfoo:redteam:vlguard');
    });

    it.each([
      [
        'categories',
        { categories: ['Deception', 'invalid-category'] as any },
        'Invalid categories: invalid-category',
      ],
      [
        'subcategories',
        { subcategories: ['Violence', 'invalid-subcategory'] as any },
        'Invalid subcategories: invalid-subcategory',
      ],
    ])('should validate %s in config', (_field, config, warning) => {
      new VLGuardPlugin(mockProvider, 'test purpose', 'image', config);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(warning));
    });
  });

  describe('getTemplate', () => {
    it('should return the inject variable', async () => {
      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'myImage', {});
      const template = await plugin.getTemplate();
      expect(template).toBe('myImage');
    });
  });

  describe('getAssertions', () => {
    it('should generate correct assertions', () => {
      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {});
      const assertions = (plugin as any).getAssertions('test prompt');

      expect(assertions).toEqual([
        {
          type: 'promptfoo:redteam:vlguard',
          metric: 'VLGuard',
        },
      ]);
    });
  });

  describe('constants', () => {
    it('should have valid categories including legacy formats', () => {
      expect(VALID_CATEGORIES).toContain('Privacy');
      expect(VALID_CATEGORIES).toContain('Risky Behavior');
      expect(VALID_CATEGORIES).toContain('Deception');
      expect(VALID_CATEGORIES).toContain('Hateful Speech');
      // Legacy formats
      expect(VALID_CATEGORIES).toContain('privacy');
      expect(VALID_CATEGORIES).toContain('risky behavior');
      expect(VALID_CATEGORIES).toContain('deception');
      expect(VALID_CATEGORIES).toContain('discrimination');
    });

    it('should have valid subcategories including legacy formats', () => {
      expect(VALID_SUBCATEGORIES).toContain('Personal data');
      expect(VALID_SUBCATEGORIES).toContain('Professional advice');
      expect(VALID_SUBCATEGORIES).toContain('Violence');
      expect(VALID_SUBCATEGORIES).toContain('Disinformation');
      // Legacy formats
      expect(VALID_SUBCATEGORIES).toContain('violence');
      expect(VALID_SUBCATEGORIES).toContain('disinformation');
      expect(VALID_SUBCATEGORIES).toContain('sex');
      expect(VALID_SUBCATEGORIES).toContain('other');
    });
  });

  describe('generateTests', () => {
    it('should generate test cases from dataset records', async () => {
      const mockMetadata = [
        createMockMetadataRecord(),
        createMockMetadataRecord(2, 'privacy', 'personal data'),
      ];

      mockDataset(mockMetadata);

      mockFetchImageAsBase64.mockImplementation(async function (url: string) {
        if (url.includes('image0')) {
          return 'data:image/jpeg;base64,test1';
        }
        if (url.includes('image1')) {
          return 'data:image/jpeg;base64,test2';
        }
        return null;
      });

      // Use single split to avoid duplicate records from both splits
      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', { split: 'train' });
      const tests = await plugin.generateTests(2);

      expect(tests).toHaveLength(2);

      // Find test cases by category (order may vary due to shuffling)
      const deceptionTest = tests.find((t) => t.metadata?.category === 'Deception');
      const privacyTest = tests.find((t) => t.metadata?.category === 'Privacy');

      expect(deceptionTest).toBeDefined();
      expect(deceptionTest?.metadata?.category).toBe('Deception');
      expect(deceptionTest?.metadata?.subcategory).toBe('Disinformation');
      expect(deceptionTest?.metadata?.safe).toBe(false);

      expect(privacyTest).toBeDefined();
      expect(privacyTest?.metadata?.category).toBe('Privacy');
      expect(privacyTest?.metadata?.subcategory).toBe('Personal data');
      expect(privacyTest?.metadata?.safe).toBe(false);
    });

    it('should filter by categories when configured', async () => {
      const mockMetadata = [
        createMockMetadataRecord(),
        createMockMetadataRecord(2, 'privacy', 'personal data'),
        createMockMetadataRecord(3, 'risky behavior', 'violence'),
      ];

      mockDataset(mockMetadata);

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {
        categories: ['Deception'] as any,
        split: 'train',
      });
      const tests = await plugin.generateTests(1);

      expect(tests).toHaveLength(1);
      expect(tests[0].metadata?.category).toBe('Deception');
    });

    it('should support legacy category names for backwards compatibility', async () => {
      const mockMetadata = [createMockMetadataRecord()];

      mockDataset(mockMetadata);

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {
        categories: ['deception'] as any, // Using legacy lowercase
        split: 'train',
      });
      const tests = await plugin.generateTests(1);

      expect(tests).toHaveLength(1);
      expect(tests[0].metadata?.category).toBe('Deception'); // Normalized to title case
    });

    it('should throw error when no records are found', async () => {
      mockDataset([]);

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', { split: 'train' });

      await expect(plugin.generateTests(5)).rejects.toThrow('Failed to generate tests');
    });

    it('should throw error when metadata fetch fails', async () => {
      mockFetchWithCache.mockImplementation(async function (url: any) {
        if (url.includes('.json') && url.includes('VLGuard')) {
          return { status: 401, statusText: 'Unauthorized', data: null, cached: false } as any;
        }
        return { status: 404, data: null, cached: false } as any;
      });

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', { split: 'train' });

      await expect(plugin.generateTests(5)).rejects.toThrow('Failed to generate tests');
    });

    it('should warn when fewer records are available than requested', async () => {
      const mockMetadata = [createMockMetadataRecord()];

      mockDataset(mockMetadata);

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', { split: 'train' });
      const tests = await plugin.generateTests(5);

      expect(tests).toHaveLength(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Requested 5 tests but only 1 records were found'),
      );
    });

    it('should handle records with failed image fetch', async () => {
      const mockMetadata = [
        createMockMetadataRecord(),
        createMockMetadataRecord(2, 'privacy', 'personal data'),
      ];

      mockDataset(mockMetadata);

      // First image fails, second succeeds
      mockFetchImageAsBase64.mockImplementation(async function (url: string) {
        if (url.includes('image0')) {
          return null;
        }
        if (url.includes('image1')) {
          return 'data:image/jpeg;base64,test2';
        }
        return null;
      });

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', { split: 'train' });
      const tests = await plugin.generateTests(2);

      // Should only include the record with successful image fetch
      expect(tests).toHaveLength(1);
      expect(tests[0].vars?.image).toBe('data:image/jpeg;base64,test2');
    });

    it('should distribute records evenly across categories', async () => {
      const mockMetadata = [
        {
          id: 'test_1',
          image: 'img1.png',
          safe: false,
          harmful_category: 'deception',
          harmful_subcategory: 'disinformation',
          'instr-resp': [{ instruction: 'q1' }],
        },
        {
          id: 'test_2',
          image: 'img2.png',
          safe: false,
          harmful_category: 'deception',
          harmful_subcategory: 'disinformation',
          'instr-resp': [{ instruction: 'q2' }],
        },
        {
          id: 'test_3',
          image: 'img3.png',
          safe: false,
          harmful_category: 'privacy',
          harmful_subcategory: 'personal data',
          'instr-resp': [{ instruction: 'q3' }],
        },
        {
          id: 'test_4',
          image: 'img4.png',
          safe: false,
          harmful_category: 'privacy',
          harmful_subcategory: 'personal data',
          'instr-resp': [{ instruction: 'q4' }],
        },
        {
          id: 'test_5',
          image: 'img5.png',
          safe: false,
          harmful_category: 'privacy',
          harmful_subcategory: 'personal data',
          'instr-resp': [{ instruction: 'q5' }],
        },
      ];

      mockDataset(mockMetadata);

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {
        categories: ['Deception', 'Privacy'] as any,
        split: 'train',
      });
      const tests = await plugin.generateTests(4);

      // Should return 4 tests (limited by request) with good distribution
      expect(tests.length).toBeLessThanOrEqual(5); // May get more if all available

      // Count categories
      const categories = tests.map((t) => t.metadata?.category);
      const deceptionCount = categories.filter((c) => c === 'Deception').length;
      const privacyCount = categories.filter((c) => c === 'Privacy').length;

      expect(deceptionCount).toBeGreaterThanOrEqual(1);
      expect(privacyCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Safe/Unsafe Filtering', () => {
    it('should filter out safe images by default (only include unsafe)', async () => {
      const mockMetadata = [
        {
          id: 'unsafe_1',
          image: 'img1.png',
          safe: false,
          harmful_category: 'deception',
          harmful_subcategory: 'disinformation',
          'instr-resp': [{ instruction: 'unsafe question 1' }],
        },
        {
          id: 'safe_1',
          image: 'img2.png',
          safe: true,
          harmful_category: 'deception',
          harmful_subcategory: 'disinformation',
          'instr-resp': [{ safe_instruction: 'safe question 1' }],
        },
        {
          id: 'unsafe_2',
          image: 'img3.png',
          safe: false,
          harmful_category: 'deception',
          harmful_subcategory: 'disinformation',
          'instr-resp': [{ instruction: 'unsafe question 2' }],
        },
      ];

      mockDataset(mockMetadata);

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', { split: 'train' });
      const tests = await plugin.generateTests(10);

      // Should only return unsafe images (default behavior)
      expect(tests).toHaveLength(2);
      expect(tests.every((t) => t.metadata?.safe === false)).toBe(true);
    });

    it('should include safe images when includeSafe is true', async () => {
      const mockMetadata = [
        {
          id: 'unsafe_1',
          image: 'img1.png',
          safe: false,
          harmful_category: 'deception',
          harmful_subcategory: 'disinformation',
          'instr-resp': [{ instruction: 'unsafe question', safe_instruction: 'unused safe query' }],
        },
        {
          id: 'safe_1',
          image: 'img2.png',
          safe: true,
          harmful_category: 'deception',
          harmful_subcategory: 'disinformation',
          'instr-resp': [{ safe_instruction: 'safe question', instruction: 'unused fallback' }],
        },
      ];

      mockDataset(mockMetadata);

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {
        includeSafe: true,
        split: 'train',
      });
      const tests = await plugin.generateTests(10);

      expect(tests).toHaveLength(2);
      expect(tests.some((t) => t.metadata?.safe === true)).toBe(true);
      expect(tests.some((t) => t.metadata?.safe === false)).toBe(true);
      expect(tests.map((t) => t.metadata?.question).sort()).toEqual([
        'safe question',
        'unsafe question',
      ]);
    });

    it('should only include safe images when includeSafe is true and includeUnsafe is false', async () => {
      const mockMetadata = [
        {
          id: 'unsafe_1',
          image: 'img1.png',
          safe: false,
          harmful_category: 'deception',
          harmful_subcategory: 'disinformation',
          'instr-resp': [{ instruction: 'unsafe question' }],
        },
        {
          id: 'safe_1',
          image: 'img2.png',
          safe: true,
          harmful_category: 'deception',
          harmful_subcategory: 'disinformation',
          'instr-resp': [{ safe_instruction: 'safe question' }],
        },
      ];

      mockDataset(mockMetadata);

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {
        includeSafe: true,
        includeUnsafe: false,
        split: 'train',
      });
      const tests = await plugin.generateTests(10);

      expect(tests).toHaveLength(1);
      expect(tests.every((t) => t.metadata?.safe === true)).toBe(true);
    });

    it('should handle mixed safe/unsafe with category filtering', async () => {
      const mockMetadata = [
        {
          id: 'unsafe_deception',
          image: 'img1.png',
          safe: false,
          harmful_category: 'deception',
          harmful_subcategory: 'disinformation',
          'instr-resp': [{ instruction: 'unsafe deception' }],
        },
        {
          id: 'safe_deception',
          image: 'img2.png',
          safe: true,
          harmful_category: 'deception',
          harmful_subcategory: 'disinformation',
          'instr-resp': [{ safe_instruction: 'safe deception' }],
        },
        {
          id: 'unsafe_privacy',
          image: 'img3.png',
          safe: false,
          harmful_category: 'privacy',
          harmful_subcategory: 'personal data',
          'instr-resp': [{ instruction: 'unsafe privacy' }],
        },
      ];

      mockDataset(mockMetadata);

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {
        categories: ['Deception'] as any,
        split: 'train',
      });
      const tests = await plugin.generateTests(10);

      // Should return only unsafe Deception images
      expect(tests).toHaveLength(1);
      expect(tests[0].metadata?.category).toBe('Deception');
      expect(tests[0].metadata?.safe).toBe(false);
    });
  });

  describe('Split Selection', () => {
    it.each(['train', 'test'] as const)(
      'keeps overlapping split loads and caches separate when %s finishes first',
      async (first) => {
        const splits = ['train', 'test'] as const;
        const started = { train: createDeferred<void>(), test: createDeferred<void>() };
        const release = { train: createDeferred<void>(), test: createDeferred<void>() };
        const images = {
          train: 'data:image/jpeg;base64,dHJhaW4=',
          test: 'data:image/jpeg;base64,dGVzdA==',
        };
        mockFetchWithCache.mockImplementation(async (url: any) => {
          const split = url.includes('train') ? 'train' : 'test';
          if (url.endsWith('.json')) {
            started[split].resolve();
            await release[split].promise;
            return {
              status: 200,
              data: [{ safe: false, 'instr-resp': [{ instruction: `${split} question` }] }],
              cached: false,
            } as any;
          }
          return {
            status: 200,
            data: {
              rows: [{ row_idx: 0, row: { image: { src: `https://example.com/${split}.jpg` } } }],
            },
            cached: false,
          } as any;
        });
        mockFetchImageAsBase64.mockImplementation(async (url) =>
          url.includes('train') ? images.train : images.test,
        );
        const plugins = splits.map(
          (split) => new VLGuardPlugin(mockProvider, 'test purpose', 'image', { split }),
        );
        const requests = plugins.map((plugin) => plugin.generateTests(1));
        const completed = Promise.allSettled(requests);
        await Promise.all(splits.map((split) => started[split].promise));
        release[first].resolve();
        await Promise.allSettled([requests[splits.indexOf(first)]]);
        release[first === 'train' ? 'test' : 'train'].resolve();
        expect(await completed).toMatchObject([{ status: 'fulfilled' }, { status: 'fulfilled' }]);

        for (const [index, split] of splits.entries()) {
          const tests = await requests[index];
          expect(tests).toMatchObject([
            {
              vars: { image: images[split] },
              metadata: { question: `${split} question` },
            },
          ]);
        }
        expect(await Promise.all(plugins.map((plugin) => plugin.generateTests(1)))).toEqual(
          await Promise.all(requests),
        );
        expect(mockFetchWithCache).toHaveBeenCalledTimes(4);
        expect(mockFetchImageAsBase64).toHaveBeenCalledTimes(2);
      },
    );

    it('should default to both splits for maximum coverage', async () => {
      const trainMetadata = [
        {
          id: 'train_1',
          image: 'img1.png',
          safe: false,
          harmful_category: 'deception',
          harmful_subcategory: 'disinformation',
          'instr-resp': [{ instruction: 'train question' }],
        },
      ];
      const testMetadata = [
        {
          id: 'test_1',
          image: 'img1.png',
          safe: false,
          harmful_category: 'privacy',
          harmful_subcategory: 'personal data',
          'instr-resp': [{ instruction: 'test question' }],
        },
      ];

      mockFetchWithCache.mockImplementation(async function (url: any) {
        // Should fetch from both train.json and test.json
        if (url.includes('train.json') && url.includes('VLGuard')) {
          return { status: 200, data: trainMetadata, cached: false } as any;
        }
        if (url.includes('test.json') && url.includes('VLGuard')) {
          return { status: 200, data: testMetadata, cached: false } as any;
        }
        if (url.includes('datasets-server')) {
          return { status: 200, data: createMockDatasetServerResponse(1), cached: false } as any;
        }
        return { status: 404, data: null, cached: false } as any;
      });

      mockFetchImageAsBase64.mockResolvedValue('data:image/jpeg;base64,test');

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {});
      const tests = await plugin.generateTests(2);

      // Should fetch from both splits
      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.stringContaining('train.json'),
        expect.any(Object),
      );
      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.stringContaining('test.json'),
        expect.any(Object),
      );
      // Should have records from both (may have duplicates filtered, but at least 1)
      expect(tests.length).toBeGreaterThanOrEqual(1);
    });

    it.each([
      ['train', 'test', 'deception', 'disinformation'],
      ['test', 'train', 'privacy', 'personal data'],
    ] as const)(
      'should use only %s split when configured',
      async (split, excludedSplit, category, subcategory) => {
        const mockMetadata = [
          {
            id: `${split}_1`,
            image: 'img1.png',
            safe: false,
            harmful_category: category,
            harmful_subcategory: subcategory,
            'instr-resp': [{ instruction: `${split} question` }],
          },
        ];
        mockFetchWithCache.mockImplementation(async function (url: any) {
          if (url.includes(`${split}.json`) && url.includes('VLGuard')) {
            return { status: 200, data: mockMetadata, cached: false } as any;
          }
          if (url.includes(`${excludedSplit}.json`)) {
            throw new Error(`Should not fetch ${excludedSplit}.json when split=${split}`);
          }
          if (url.includes('datasets-server') && url.includes(`split=${split}`)) {
            return { status: 200, data: createMockDatasetServerResponse(1), cached: false } as any;
          }
          return { status: 404, data: null, cached: false } as any;
        });
        mockFetchImageAsBase64.mockResolvedValue('data:image/jpeg;base64,test');
        const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', { split });
        const tests = await plugin.generateTests(1);
        expect(tests).toHaveLength(1);
        expect(mockFetchWithCache).toHaveBeenCalledWith(
          expect.stringContaining(`${split}.json`),
          expect.any(Object),
        );
      },
    );
  });
});
