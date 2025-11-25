import logger from '../../../src/logger';
import {
  VLGuardPlugin,
  VLGuardGrader,
  VLGuardDatasetManager,
  VALID_CATEGORIES,
  VALID_SUBCATEGORIES,
} from '../../../src/redteam/plugins/vlguard';
import * as huggingfaceDatasets from '../../../src/integrations/huggingfaceDatasets';
import * as fetchModule from '../../../src/util/fetch/index';

import type { ApiProvider, AtomicTestCase } from '../../../src/types/index';

jest.mock('../../../src/logger');
jest.mock('../../../src/integrations/huggingfaceDatasets');
jest.mock('../../../src/util/fetch');

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
    const mockFetchHuggingFaceDataset =
      huggingfaceDatasets.fetchHuggingFaceDataset as jest.MockedFunction<
        typeof huggingfaceDatasets.fetchHuggingFaceDataset
      >;

    beforeEach(() => {
      jest.clearAllMocks();
      // Clear the singleton cache between tests
      VLGuardDatasetManager.clearCache();
    });

    it('should generate test cases from dataset records', async () => {
      const mockRecords = [
        {
          vars: {
            image: 'data:image/jpeg;base64,test1',
            safe: false,
            category: 'Deception',
            subcategory: 'Disinformation',
            unsafe_instruction: 'test question 1',
          },
        },
        {
          vars: {
            image: 'data:image/jpeg;base64,test2',
            safe: false,
            category: 'Privacy',
            subcategory: 'Personal data',
            unsafe_instruction: 'test question 2',
          },
        },
      ];

      mockFetchHuggingFaceDataset.mockResolvedValue(mockRecords);

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {});
      const tests = await plugin.generateTests(2);

      expect(tests).toHaveLength(2);

      // Find the specific test case as order may vary due to shuffling
      const deceptionTest = tests.find((t) => t.metadata?.category === 'Deception');
      const privacyTest = tests.find((t) => t.metadata?.category === 'Privacy');

      expect(deceptionTest).toBeDefined();
      expect(deceptionTest).toEqual({
        vars: { image: 'data:image/jpeg;base64,test1' },
        assert: [
          {
            type: 'promptfoo:redteam:vlguard',
            metric: 'VLGuard',
            value: { category: 'Deception', subcategory: 'Disinformation' },
          },
        ],
        metadata: {
          vlguardCategory: 'Deception',
          vlguardSubcategory: 'Disinformation',
          vlguardSafe: false,
          category: 'Deception',
          subcategory: 'Disinformation',
          safe: false,
          question: 'test question 1',
        },
      });

      expect(privacyTest).toBeDefined();
      expect(privacyTest).toEqual({
        vars: { image: 'data:image/jpeg;base64,test2' },
        assert: [
          {
            type: 'promptfoo:redteam:vlguard',
            metric: 'VLGuard',
            value: { category: 'Privacy', subcategory: 'Personal data' },
          },
        ],
        metadata: {
          vlguardCategory: 'Privacy',
          vlguardSubcategory: 'Personal data',
          vlguardSafe: false,
          category: 'Privacy',
          subcategory: 'Personal data',
          safe: false,
          question: 'test question 2',
        },
      });
    });

    it('should filter by categories when configured', async () => {
      const mockRecords = [
        {
          vars: {
            image: 'data:image/jpeg;base64,test1',
            safe: false,
            category: 'Deception',
            subcategory: 'Disinformation',
            unsafe_instruction: 'test question 1',
          },
        },
        {
          vars: {
            image: 'data:image/jpeg;base64,test2',
            safe: false,
            category: 'Privacy',
            subcategory: 'Personal data',
            unsafe_instruction: 'test question 2',
          },
        },
        {
          vars: {
            image: 'data:image/jpeg;base64,test3',
            safe: false,
            category: 'Risky Behavior',
            subcategory: 'Violence',
            unsafe_instruction: 'test question 3',
          },
        },
      ];

      mockFetchHuggingFaceDataset.mockResolvedValue(mockRecords);

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {
        categories: ['Deception'] as any,
      });
      const tests = await plugin.generateTests(1);

      // Should only include records with 'Deception' category
      expect(tests).toHaveLength(1);
      expect(tests[0].metadata?.category).toBe('Deception');
    });

    it('should support legacy category names for backwards compatibility', async () => {
      const mockRecords = [
        {
          vars: {
            image: 'data:image/jpeg;base64,test1',
            safe: false,
            category: 'deception',
            subcategory: 'disinformation',
            unsafe_instruction: 'test question 1',
          },
        },
        {
          vars: {
            image: 'data:image/jpeg;base64,test2',
            safe: false,
            category: 'privacy',
            subcategory: 'personal data',
            unsafe_instruction: 'test question 2',
          },
        },
      ];

      mockFetchHuggingFaceDataset.mockResolvedValue(mockRecords);

      // Use legacy lowercase category name
      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {
        categories: ['deception'] as any,
      });
      const tests = await plugin.generateTests(1);

      // Should still work and normalize to title case
      expect(tests).toHaveLength(1);
      expect(tests[0].metadata?.category).toBe('Deception');
    });

    it('should throw error when no records are found', async () => {
      mockFetchHuggingFaceDataset.mockResolvedValue([]);

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {});

      await expect(plugin.generateTests(5)).rejects.toThrow(
        'Failed to generate tests: Failed to fetch dataset: No records returned from dataset',
      );
    });

    it('should throw error when dataset fetch fails', async () => {
      mockFetchHuggingFaceDataset.mockRejectedValue(new Error('Network error'));

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {});

      await expect(plugin.generateTests(5)).rejects.toThrow(
        'Failed to generate tests: Failed to fetch dataset: Network error',
      );
    });

    it('should handle image URLs and convert to base64', async () => {
      const mockRecords = [
        {
          vars: {
            image: { src: 'https://example.com/image.jpg' },
            safe: false,
            category: 'Deception',
            subcategory: 'Disinformation',
            unsafe_instruction: 'test question',
          },
        },
      ];

      // Mock the fetch response for image download
      (fetchModule.fetchWithProxy as jest.Mock).mockResolvedValue({
        ok: true,
        headers: new Map([['content-type', 'image/jpeg']]),
        arrayBuffer: async () => Buffer.from('test-image-data'),
      });

      mockFetchHuggingFaceDataset.mockResolvedValue(mockRecords);

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {});
      const tests = await plugin.generateTests(1);

      expect(tests).toHaveLength(1);
      const firstTest = tests[0];
      expect(firstTest).toBeDefined();
      if (firstTest && firstTest.vars) {
        expect(firstTest.vars.image).toMatch(/^data:image\/jpeg;base64,/);
      }
    });

    it('should warn when fewer records are available than requested', async () => {
      const mockRecords = [
        {
          vars: {
            image: 'data:image/jpeg;base64,test1',
            safe: false,
            category: 'Deception',
            subcategory: 'Disinformation',
            unsafe_instruction: 'test question 1',
          },
        },
      ];

      mockFetchHuggingFaceDataset.mockResolvedValue(mockRecords);

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {});
      const tests = await plugin.generateTests(5);

      expect(tests).toHaveLength(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Requested 5 tests but only 1 records were found'),
      );
    });

    it('should handle records with missing image data', async () => {
      const mockRecords = [
        {
          vars: {
            safe: false,
            category: 'Deception',
            subcategory: 'Disinformation',
            unsafe_instruction: 'test question 1',
            // image field is missing entirely
          },
        },
        {
          vars: {
            image: 'data:image/jpeg;base64,test2',
            safe: false,
            category: 'Privacy',
            subcategory: 'Personal data',
            unsafe_instruction: 'test question 2',
          },
        },
      ] as any[];

      mockFetchHuggingFaceDataset.mockResolvedValue(mockRecords);

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {});
      const tests = await plugin.generateTests(2);

      // Should only include the record with valid image data
      expect(tests).toHaveLength(1);
      const firstTest = tests[0];
      expect(firstTest).toBeDefined();
      if (firstTest && firstTest.vars) {
        expect(firstTest.vars.image).toBe('data:image/jpeg;base64,test2');
      }
    });

    it('should distribute remainder to reach full limit when categories are specified', async () => {
      const mockRecords = [
        {
          vars: {
            image: 'data:image/jpeg;base64,a1',
            safe: false,
            category: 'Deception',
            subcategory: 'Disinformation',
            unsafe_instruction: 'q1',
          },
        },
        {
          vars: {
            image: 'data:image/jpeg;base64,a2',
            safe: false,
            category: 'Deception',
            subcategory: 'Disinformation',
            unsafe_instruction: 'q2',
          },
        },
        {
          vars: {
            image: 'data:image/jpeg;base64,b1',
            safe: false,
            category: 'Privacy',
            subcategory: 'Personal data',
            unsafe_instruction: 'q3',
          },
        },
        {
          vars: {
            image: 'data:image/jpeg;base64,b2',
            safe: false,
            category: 'Privacy',
            subcategory: 'Personal data',
            unsafe_instruction: 'q4',
          },
        },
        {
          vars: {
            image: 'data:image/jpeg;base64,b3',
            safe: false,
            category: 'Privacy',
            subcategory: 'Personal data',
            unsafe_instruction: 'q5',
          },
        },
      ];

      mockFetchHuggingFaceDataset.mockResolvedValue(mockRecords);

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {
        categories: ['Deception', 'Privacy'] as any,
      });
      const tests = await plugin.generateTests(5);

      // Should return exactly 5 tests (full limit)
      expect(tests).toHaveLength(5);

      // Ensure at least base allocation from each category is present
      const categories = tests.map((t) => t.metadata?.category);
      expect(categories).toEqual(expect.arrayContaining(['Deception', 'Privacy']));

      // Count categories to verify distribution
      const deceptionCount = categories.filter((c) => c === 'Deception').length;
      const privacyCount = categories.filter((c) => c === 'Privacy').length;

      // With 5 tests and 2 categories: base=2, remainder=1
      // Should have 2-3 from each category (2+1=3 for one, 2 for the other)
      expect(deceptionCount + privacyCount).toBe(5);
      expect(deceptionCount).toBeGreaterThanOrEqual(2);
      expect(privacyCount).toBeGreaterThanOrEqual(2);
      expect(Math.abs(deceptionCount - privacyCount)).toBeLessThanOrEqual(1);
    });
  });

  describe('Safe/Unsafe Filtering', () => {
    const mockFetchHuggingFaceDataset =
      huggingfaceDatasets.fetchHuggingFaceDataset as jest.MockedFunction<
        typeof huggingfaceDatasets.fetchHuggingFaceDataset
      >;

    beforeEach(() => {
      jest.clearAllMocks();
      VLGuardDatasetManager.clearCache();
    });

    it('should filter out safe images by default (only include unsafe)', async () => {
      const mockRecords = [
        {
          vars: {
            image: 'data:image/jpeg;base64,unsafe1',
            safe: false,
            category: 'Deception',
            subcategory: 'Disinformation',
            unsafe_instruction: 'unsafe question 1',
          },
        },
        {
          vars: {
            image: 'data:image/jpeg;base64,safe1',
            safe: true,
            category: 'Deception',
            subcategory: 'Disinformation',
            safe_question: 'safe question 1',
          },
        },
        {
          vars: {
            image: 'data:image/jpeg;base64,unsafe2',
            safe: false,
            category: 'Deception',
            subcategory: 'Disinformation',
            unsafe_instruction: 'unsafe question 2',
          },
        },
        {
          vars: {
            image: 'data:image/jpeg;base64,safe2',
            safe: true,
            category: 'Deception',
            subcategory: 'Disinformation',
            safe_question: 'safe question 2',
          },
        },
      ] as any[];

      mockFetchHuggingFaceDataset.mockResolvedValue(mockRecords);

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {});
      const tests = await plugin.generateTests(10); // Request more than available to get all unsafe ones

      // Should only return unsafe images (default behavior)
      expect(tests).toHaveLength(2);
      expect(tests.every((t) => t.metadata?.safe === false)).toBe(true);
      expect(tests.some((t) => t.vars?.image === 'data:image/jpeg;base64,unsafe1')).toBe(true);
      expect(tests.some((t) => t.vars?.image === 'data:image/jpeg;base64,unsafe2')).toBe(true);
      expect(tests.some((t) => t.vars?.image === 'data:image/jpeg;base64,safe1')).toBe(false);
      expect(tests.some((t) => t.vars?.image === 'data:image/jpeg;base64,safe2')).toBe(false);
    });

    it('should include safe images when includeSafe is true', async () => {
      const mockRecords = [
        {
          vars: {
            image: 'data:image/jpeg;base64,unsafe1',
            safe: false,
            category: 'Deception',
            subcategory: 'Disinformation',
            unsafe_instruction: 'unsafe question',
          },
        },
        {
          vars: {
            image: 'data:image/jpeg;base64,safe1',
            safe: true,
            category: 'Deception',
            subcategory: 'Disinformation',
            safe_question: 'safe question',
          },
        },
      ] as any[];

      mockFetchHuggingFaceDataset.mockResolvedValue(mockRecords);

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {
        includeSafe: true,
      });
      const tests = await plugin.generateTests(10);

      // Should return both safe and unsafe images when includeUnsafe defaults to true
      expect(tests).toHaveLength(2);
      expect(tests.some((t) => t.metadata?.safe === true)).toBe(true);
      expect(tests.some((t) => t.metadata?.safe === false)).toBe(true);
    });

    it('should only include safe images when includeSafe is true and includeUnsafe is false', async () => {
      const mockRecords = [
        {
          vars: {
            image: 'data:image/jpeg;base64,unsafe1',
            safe: false,
            category: 'Deception',
            subcategory: 'Disinformation',
            unsafe_instruction: 'unsafe question',
          },
        },
        {
          vars: {
            image: 'data:image/jpeg;base64,safe1',
            safe: true,
            category: 'Deception',
            subcategory: 'Disinformation',
            safe_question: 'safe question',
          },
        },
      ] as any[];

      mockFetchHuggingFaceDataset.mockResolvedValue(mockRecords);

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {
        includeSafe: true,
        includeUnsafe: false,
      });
      const tests = await plugin.generateTests(10);

      // Should return only safe images
      expect(tests).toHaveLength(1);
      expect(tests.every((t) => t.metadata?.safe === true)).toBe(true);
      expect(tests[0].vars?.image).toBe('data:image/jpeg;base64,safe1');
    });

    it('should handle mixed safe/unsafe with category filtering', async () => {
      const mockRecords = [
        {
          vars: {
            image: 'data:image/jpeg;base64,unsafe-deception',
            safe: false,
            category: 'Deception',
            subcategory: 'Disinformation',
            unsafe_instruction: 'unsafe deception',
          },
        },
        {
          vars: {
            image: 'data:image/jpeg;base64,safe-deception',
            safe: true,
            category: 'Deception',
            subcategory: 'Disinformation',
            safe_question: 'safe deception',
          },
        },
        {
          vars: {
            image: 'data:image/jpeg;base64,unsafe-privacy',
            safe: false,
            category: 'Privacy',
            subcategory: 'Personal data',
            unsafe_instruction: 'unsafe privacy',
          },
        },
        {
          vars: {
            image: 'data:image/jpeg;base64,safe-privacy',
            safe: true,
            category: 'Privacy',
            subcategory: 'Personal data',
            safe_question: 'safe privacy',
          },
        },
      ] as any[];

      mockFetchHuggingFaceDataset.mockResolvedValue(mockRecords);

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {
        categories: ['Deception'] as any,
      });
      const tests = await plugin.generateTests(10);

      // Should return only unsafe Deception images
      expect(tests).toHaveLength(1);
      expect(tests[0].metadata?.category).toBe('Deception');
      expect(tests[0].metadata?.safe).toBe(false);
      expect(tests[0].vars?.image).toBe('data:image/jpeg;base64,unsafe-deception');
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
