import { beforeEach, describe, expect, it, MockedFunction, vi } from 'vitest';
import * as cache from '../../../src/cache';
import logger from '../../../src/logger';
import * as imageDatasetUtils from '../../../src/redteam/plugins/imageDatasetUtils';
import {
  VALID_CATEGORIES,
  VALID_SUBCATEGORIES,
  VLGuardDatasetManager,
  VLGuardGrader,
  VLGuardPlugin,
} from '../../../src/redteam/plugins/vlguard';

import type { ApiProvider, AtomicTestCase } from '../../../src/types/index';

vi.mock('../../../src/logger');
vi.mock('../../../src/cache');
vi.mock('../../../src/redteam/plugins/imageDatasetUtils', async () => ({
  ...(await vi.importActual('../../../src/redteam/plugins/imageDatasetUtils')),
  fetchImageAsBase64: vi.fn(),
}));

describe('VLGuardPlugin', () => {
  const mockProvider: ApiProvider = {
    id: () => 'test-provider',
    callApi: async () => ({ output: 'test', tokenUsage: { total: 10, prompt: 5, completion: 5 } }),
  };

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {});
      expect(plugin.id).toBe('promptfoo:redteam:vlguard');
    });

    it('should validate categories in config', () => {
      const config = {
        categories: ['Deception', 'invalid-category'] as any,
      };

      new VLGuardPlugin(mockProvider, 'test purpose', 'image', config);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid categories: invalid-category'),
      );
    });

    it('should validate subcategories in config', () => {
      const config = {
        subcategories: ['Violence', 'invalid-subcategory'] as any,
      };

      new VLGuardPlugin(mockProvider, 'test purpose', 'image', config);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid subcategories: invalid-subcategory'),
      );
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
    const mockFetchWithCache = cache.fetchWithCache as MockedFunction<typeof cache.fetchWithCache>;
    const mockFetchImageAsBase64 = imageDatasetUtils.fetchImageAsBase64 as MockedFunction<
      typeof imageDatasetUtils.fetchImageAsBase64
    >;

    // Helper to create mock metadata records
    const createMockMetadata = (records: any[]) => records;

    // Helper to create mock datasets-server response
    const createMockDatasetServerResponse = (rowCount: number) => ({
      rows: Array.from({ length: rowCount }, (_, i) => ({
        row_idx: i,
        row: { image: { src: `https://example.com/image${i}.jpg` } },
      })),
    });

    beforeEach(() => {
      vi.clearAllMocks();
      VLGuardDatasetManager.clearCache();
    });

    it('should generate test cases from dataset records', async () => {
      const mockMetadata = createMockMetadata([
        {
          id: 'test_1',
          image: 'bad_ads/test1.png',
          safe: false,
          harmful_category: 'deception',
          harmful_subcategory: 'disinformation',
          'instr-resp': [{ instruction: 'test question 1' }],
        },
        {
          id: 'test_2',
          image: 'bad_ads/test2.png',
          safe: false,
          harmful_category: 'privacy',
          harmful_subcategory: 'personal data',
          'instr-resp': [{ instruction: 'test question 2' }],
        },
      ]);

      mockFetchWithCache.mockImplementation(async function (url: any) {
        if (url.includes('.json') && url.includes('VLGuard')) {
          return { status: 200, data: mockMetadata, cached: false } as any;
        }
        if (url.includes('datasets-server')) {
          return { status: 200, data: createMockDatasetServerResponse(2), cached: false } as any;
        }
        return { status: 404, data: null, cached: false } as any;
      });

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
      const mockMetadata = createMockMetadata([
        {
          id: 'test_1',
          image: 'bad_ads/test1.png',
          safe: false,
          harmful_category: 'deception',
          harmful_subcategory: 'disinformation',
          'instr-resp': [{ instruction: 'test question 1' }],
        },
        {
          id: 'test_2',
          image: 'bad_ads/test2.png',
          safe: false,
          harmful_category: 'privacy',
          harmful_subcategory: 'personal data',
          'instr-resp': [{ instruction: 'test question 2' }],
        },
        {
          id: 'test_3',
          image: 'bad_ads/test3.png',
          safe: false,
          harmful_category: 'risky behavior',
          harmful_subcategory: 'violence',
          'instr-resp': [{ instruction: 'test question 3' }],
        },
      ]);

      mockFetchWithCache.mockImplementation(async function (url: any) {
        if (url.includes('.json') && url.includes('VLGuard')) {
          return { status: 200, data: mockMetadata, cached: false } as any;
        }
        if (url.includes('datasets-server')) {
          return { status: 200, data: createMockDatasetServerResponse(3), cached: false } as any;
        }
        return { status: 404, data: null, cached: false } as any;
      });

      mockFetchImageAsBase64.mockResolvedValue('data:image/jpeg;base64,test');

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {
        categories: ['Deception'] as any,
        split: 'train',
      });
      const tests = await plugin.generateTests(1);

      expect(tests).toHaveLength(1);
      expect(tests[0].metadata?.category).toBe('Deception');
    });

    it('should support legacy category names for backwards compatibility', async () => {
      const mockMetadata = createMockMetadata([
        {
          id: 'test_1',
          image: 'bad_ads/test1.png',
          safe: false,
          harmful_category: 'deception', // lowercase
          harmful_subcategory: 'disinformation',
          'instr-resp': [{ instruction: 'test question 1' }],
        },
      ]);

      mockFetchWithCache.mockImplementation(async function (url: any) {
        if (url.includes('.json') && url.includes('VLGuard')) {
          return { status: 200, data: mockMetadata, cached: false } as any;
        }
        if (url.includes('datasets-server')) {
          return { status: 200, data: createMockDatasetServerResponse(1), cached: false } as any;
        }
        return { status: 404, data: null, cached: false } as any;
      });

      mockFetchImageAsBase64.mockResolvedValue('data:image/jpeg;base64,test');

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {
        categories: ['deception'] as any, // Using legacy lowercase
        split: 'train',
      });
      const tests = await plugin.generateTests(1);

      expect(tests).toHaveLength(1);
      expect(tests[0].metadata?.category).toBe('Deception'); // Normalized to title case
    });

    it('should return empty array when no records are found', async () => {
      mockFetchWithCache.mockImplementation(async function (url: any) {
        if (url.includes('.json') && url.includes('VLGuard')) {
          return { status: 200, data: [], cached: false } as any;
        }
        if (url.includes('datasets-server')) {
          return { status: 200, data: { rows: [] }, cached: false } as any;
        }
        return { status: 404, data: null, cached: false } as any;
      });

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', { split: 'train' });

      // Should return empty array instead of throwing (graceful degradation)
      const result = await plugin.generateTests(5);
      expect(result).toEqual([]);
    });

    it('should return empty array when metadata fetch fails', async () => {
      mockFetchWithCache.mockImplementation(async function (url: any) {
        if (url.includes('.json') && url.includes('VLGuard')) {
          return { status: 401, statusText: 'Unauthorized', data: null, cached: false } as any;
        }
        return { status: 404, data: null, cached: false } as any;
      });

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', { split: 'train' });

      // Should return empty array instead of throwing (graceful degradation)
      const result = await plugin.generateTests(5);
      expect(result).toEqual([]);
    });

    it('should show helpful error message for gated dataset 401/403 errors', async () => {
      mockFetchWithCache.mockImplementation(async function (url: any) {
        if (url.includes('.json') && url.includes('VLGuard')) {
          return { status: 401, statusText: 'Unauthorized', data: null, cached: false } as any;
        }
        return { status: 404, data: null, cached: false } as any;
      });

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', { split: 'train' });
      await plugin.generateTests(5);

      // Should log warning with helpful message about gated dataset access (using warn consistently)
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('VLGuard dataset requires access approval'),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('https://huggingface.co/datasets/ys-zong/VLGuard'),
      );
    });

    it('should show helpful error message for gated dataset 403 errors on image fetch', async () => {
      const mockMetadata = createMockMetadata([
        {
          id: 'test_1',
          image: 'bad_ads/test1.png',
          safe: false,
          harmful_category: 'deception',
          harmful_subcategory: 'disinformation',
          'instr-resp': [{ instruction: 'test question 1' }],
        },
      ]);

      mockFetchWithCache.mockImplementation(async function (url: any) {
        if (url.includes('.json') && url.includes('VLGuard')) {
          return { status: 200, data: mockMetadata, cached: false } as any;
        }
        if (url.includes('datasets-server')) {
          return { status: 403, statusText: 'Forbidden', data: null, cached: false } as any;
        }
        return { status: 404, data: null, cached: false } as any;
      });

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', { split: 'train' });
      await plugin.generateTests(5);

      // Should log warning with helpful message about gated dataset access
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('VLGuard dataset requires access approval'),
      );
    });

    it('should warn when fewer records are available than requested', async () => {
      const mockMetadata = createMockMetadata([
        {
          id: 'test_1',
          image: 'bad_ads/test1.png',
          safe: false,
          harmful_category: 'deception',
          harmful_subcategory: 'disinformation',
          'instr-resp': [{ instruction: 'test question 1' }],
        },
      ]);

      mockFetchWithCache.mockImplementation(async function (url: any) {
        if (url.includes('.json') && url.includes('VLGuard')) {
          return { status: 200, data: mockMetadata, cached: false } as any;
        }
        if (url.includes('datasets-server')) {
          return { status: 200, data: createMockDatasetServerResponse(1), cached: false } as any;
        }
        return { status: 404, data: null, cached: false } as any;
      });

      mockFetchImageAsBase64.mockResolvedValue('data:image/jpeg;base64,test');

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', { split: 'train' });
      const tests = await plugin.generateTests(5);

      expect(tests).toHaveLength(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Requested 5 tests but only 1 records were found'),
      );
    });

    it('should handle records with failed image fetch', async () => {
      const mockMetadata = createMockMetadata([
        {
          id: 'test_1',
          image: 'bad_ads/test1.png',
          safe: false,
          harmful_category: 'deception',
          harmful_subcategory: 'disinformation',
          'instr-resp': [{ instruction: 'test question 1' }],
        },
        {
          id: 'test_2',
          image: 'bad_ads/test2.png',
          safe: false,
          harmful_category: 'privacy',
          harmful_subcategory: 'personal data',
          'instr-resp': [{ instruction: 'test question 2' }],
        },
      ]);

      mockFetchWithCache.mockImplementation(async function (url: any) {
        if (url.includes('.json') && url.includes('VLGuard')) {
          return { status: 200, data: mockMetadata, cached: false } as any;
        }
        if (url.includes('datasets-server')) {
          return { status: 200, data: createMockDatasetServerResponse(2), cached: false } as any;
        }
        return { status: 404, data: null, cached: false } as any;
      });

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
      const mockMetadata = createMockMetadata([
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
      ]);

      mockFetchWithCache.mockImplementation(async function (url: any) {
        if (url.includes('.json') && url.includes('VLGuard')) {
          return { status: 200, data: mockMetadata, cached: false } as any;
        }
        if (url.includes('datasets-server')) {
          return { status: 200, data: createMockDatasetServerResponse(5), cached: false } as any;
        }
        return { status: 404, data: null, cached: false } as any;
      });

      mockFetchImageAsBase64.mockResolvedValue('data:image/jpeg;base64,test');

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
    const mockFetchWithCache = cache.fetchWithCache as MockedFunction<typeof cache.fetchWithCache>;
    const mockFetchImageAsBase64 = imageDatasetUtils.fetchImageAsBase64 as MockedFunction<
      typeof imageDatasetUtils.fetchImageAsBase64
    >;

    const createMockDatasetServerResponse = (rowCount: number) => ({
      rows: Array.from({ length: rowCount }, (_, i) => ({
        row_idx: i,
        row: { image: { src: `https://example.com/image${i}.jpg` } },
      })),
    });

    beforeEach(() => {
      vi.clearAllMocks();
      VLGuardDatasetManager.clearCache();
    });

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

      mockFetchWithCache.mockImplementation(async function (url: any) {
        if (url.includes('.json') && url.includes('VLGuard')) {
          return { status: 200, data: mockMetadata, cached: false } as any;
        }
        if (url.includes('datasets-server')) {
          return { status: 200, data: createMockDatasetServerResponse(3), cached: false } as any;
        }
        return { status: 404, data: null, cached: false } as any;
      });

      mockFetchImageAsBase64.mockResolvedValue('data:image/jpeg;base64,test');

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

      mockFetchWithCache.mockImplementation(async function (url: any) {
        if (url.includes('.json') && url.includes('VLGuard')) {
          return { status: 200, data: mockMetadata, cached: false } as any;
        }
        if (url.includes('datasets-server')) {
          return { status: 200, data: createMockDatasetServerResponse(2), cached: false } as any;
        }
        return { status: 404, data: null, cached: false } as any;
      });

      mockFetchImageAsBase64.mockResolvedValue('data:image/jpeg;base64,test');

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {
        includeSafe: true,
        split: 'train',
      });
      const tests = await plugin.generateTests(10);

      expect(tests).toHaveLength(2);
      expect(tests.some((t) => t.metadata?.safe === true)).toBe(true);
      expect(tests.some((t) => t.metadata?.safe === false)).toBe(true);
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

      mockFetchWithCache.mockImplementation(async function (url: any) {
        if (url.includes('.json') && url.includes('VLGuard')) {
          return { status: 200, data: mockMetadata, cached: false } as any;
        }
        if (url.includes('datasets-server')) {
          return { status: 200, data: createMockDatasetServerResponse(2), cached: false } as any;
        }
        return { status: 404, data: null, cached: false } as any;
      });

      mockFetchImageAsBase64.mockResolvedValue('data:image/jpeg;base64,test');

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

      mockFetchWithCache.mockImplementation(async function (url: any) {
        if (url.includes('.json') && url.includes('VLGuard')) {
          return { status: 200, data: mockMetadata, cached: false } as any;
        }
        if (url.includes('datasets-server')) {
          return { status: 200, data: createMockDatasetServerResponse(3), cached: false } as any;
        }
        return { status: 404, data: null, cached: false } as any;
      });

      mockFetchImageAsBase64.mockResolvedValue('data:image/jpeg;base64,test');

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
    const mockFetchWithCache = cache.fetchWithCache as MockedFunction<typeof cache.fetchWithCache>;
    const mockFetchImageAsBase64 = imageDatasetUtils.fetchImageAsBase64 as MockedFunction<
      typeof imageDatasetUtils.fetchImageAsBase64
    >;

    const createMockDatasetServerResponse = (rowCount: number) => ({
      rows: Array.from({ length: rowCount }, (_, i) => ({
        row_idx: i,
        row: { image: { src: `https://example.com/image${i}.jpg` } },
      })),
    });

    beforeEach(() => {
      vi.clearAllMocks();
      VLGuardDatasetManager.clearCache();
    });

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

    it('should use only train split when configured', async () => {
      const mockMetadata = [
        {
          id: 'train_1',
          image: 'img1.png',
          safe: false,
          harmful_category: 'deception',
          harmful_subcategory: 'disinformation',
          'instr-resp': [{ instruction: 'train question' }],
        },
      ];

      mockFetchWithCache.mockImplementation(async function (url: any) {
        if (url.includes('train.json') && url.includes('VLGuard')) {
          return { status: 200, data: mockMetadata, cached: false } as any;
        }
        if (url.includes('test.json')) {
          throw new Error('Should not fetch test.json when split=train');
        }
        if (url.includes('datasets-server') && url.includes('split=train')) {
          return { status: 200, data: createMockDatasetServerResponse(1), cached: false } as any;
        }
        return { status: 404, data: null, cached: false } as any;
      });

      mockFetchImageAsBase64.mockResolvedValue('data:image/jpeg;base64,test');

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {
        split: 'train',
      });
      const tests = await plugin.generateTests(1);

      expect(tests).toHaveLength(1);
      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.stringContaining('train.json'),
        expect.any(Object),
      );
    });

    it('should use only test split when configured', async () => {
      const mockMetadata = [
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
        if (url.includes('test.json') && url.includes('VLGuard')) {
          return { status: 200, data: mockMetadata, cached: false } as any;
        }
        if (url.includes('train.json')) {
          throw new Error('Should not fetch train.json when split=test');
        }
        if (url.includes('datasets-server') && url.includes('split=test')) {
          return { status: 200, data: createMockDatasetServerResponse(1), cached: false } as any;
        }
        return { status: 404, data: null, cached: false } as any;
      });

      mockFetchImageAsBase64.mockResolvedValue('data:image/jpeg;base64,test');

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {
        split: 'test',
      });
      const tests = await plugin.generateTests(1);

      expect(tests).toHaveLength(1);
      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.stringContaining('test.json'),
        expect.any(Object),
      );
    });
  });
});

describe('VLGuardGrader', () => {
  const grader = new VLGuardGrader();

  describe('id', () => {
    it('should have correct plugin ID', () => {
      expect(grader.id).toBe('promptfoo:redteam:vlguard');
    });
  });

  describe('getRubricForTest', () => {
    it('should generate rubric for deception category', () => {
      const test: AtomicTestCase = {
        metadata: {
          category: 'Deception',
          subcategory: 'Disinformation',
        },
      } as AtomicTestCase;

      const rubric = grader.getRubricForTest(test);

      expect(rubric).toContain('category: Deception');
      expect(rubric).toContain('subcategory: Disinformation');
      expect(rubric).toContain('Do not spread false information');
    });

    it('should generate rubric for violence subcategory', () => {
      const test: AtomicTestCase = {
        metadata: {
          category: 'Risky Behavior',
          subcategory: 'Violence',
        },
      } as AtomicTestCase;

      const rubric = grader.getRubricForTest(test);

      expect(rubric).toContain('Avoid detailed descriptions of violence');
    });

    it('should use default guidance for unknown categories', () => {
      const test: AtomicTestCase = {
        metadata: {
          category: 'unknown',
          subcategory: 'unknown',
        },
      } as AtomicTestCase;

      const rubric = grader.getRubricForTest(test);

      expect(rubric).toContain('Decline to engage with harmful material');
    });

    it('should handle missing metadata', () => {
      const test: AtomicTestCase = {} as AtomicTestCase;

      const rubric = grader.getRubricForTest(test);

      expect(rubric).toContain('category: unknown');
      expect(rubric).toContain('subcategory: unknown');
    });
  });

  describe('GUIDANCE', () => {
    it('should have guidance for all main categories', () => {
      const grader = new VLGuardGrader();
      expect((grader as any).guidance).toHaveProperty('Deception');
      expect((grader as any).guidance).toHaveProperty('Risky Behavior');
      expect((grader as any).guidance).toHaveProperty('Privacy');
      expect((grader as any).guidance).toHaveProperty('Hateful Speech');
    });

    it('should have guidance for key subcategories', () => {
      const grader = new VLGuardGrader();
      expect((grader as any).guidance).toHaveProperty('Violence');
      expect((grader as any).guidance).toHaveProperty('Disinformation');
      expect((grader as any).guidance).toHaveProperty('Professional advice');
    });

    it('should have default guidance', () => {
      const grader = new VLGuardGrader();
      expect((grader as any).guidance).toHaveProperty('default');
    });
  });
});
