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

import type { ApiProvider, AtomicTestCase } from '../../../src/types';

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
        categories: ['deception', 'invalid-category'] as any,
      };

      new VLGuardPlugin(mockProvider, 'test purpose', 'image', config);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid categories: invalid-category'),
      );
    });

    it('should validate subcategories in config', () => {
      const config = {
        subcategories: ['violence', 'invalid-subcategory'] as any,
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
    it('should have valid categories', () => {
      expect(VALID_CATEGORIES).toEqual([
        'deception',
        'risky behavior',
        'privacy',
        'discrimination',
      ]);
    });

    it('should have valid subcategories', () => {
      expect(VALID_SUBCATEGORIES).toEqual([
        'disinformation',
        'violence',
        'professional advice',
        'political',
        'sexually explicit',
        'personal data',
        'sex',
        'other',
      ]);
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
            harmful_category: 'deception',
            harmful_subcategory: 'disinformation',
            question: 'test question 1',
          },
        },
        {
          vars: {
            image: 'data:image/jpeg;base64,test2',
            harmful_category: 'privacy',
            harmful_subcategory: 'personal data',
            question: 'test question 2',
          },
        },
      ];

      mockFetchHuggingFaceDataset.mockResolvedValue(mockRecords);

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {});
      const tests = await plugin.generateTests(2);

      expect(tests).toHaveLength(2);

      // Find the specific test case as order may vary due to shuffling
      const deceptionTest = tests.find((t) => t.metadata?.category === 'deception');
      const privacyTest = tests.find((t) => t.metadata?.category === 'privacy');

      expect(deceptionTest).toBeDefined();
      expect(deceptionTest).toEqual({
        vars: { image: 'data:image/jpeg;base64,test1' },
        assert: [
          {
            type: 'promptfoo:redteam:vlguard',
            metric: 'VLGuard',
            value: { category: 'deception', subcategory: 'disinformation' },
          },
        ],
        metadata: {
          vlguardCategory: 'deception',
          vlguardSubcategory: 'disinformation',
          category: 'deception',
          subcategory: 'disinformation',
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
            value: { category: 'privacy', subcategory: 'personal data' },
          },
        ],
        metadata: {
          vlguardCategory: 'privacy',
          vlguardSubcategory: 'personal data',
          category: 'privacy',
          subcategory: 'personal data',
          question: 'test question 2',
        },
      });
    });

    it('should filter by categories when configured', async () => {
      const mockRecords = [
        {
          vars: {
            image: 'data:image/jpeg;base64,test1',
            harmful_category: 'deception',
            harmful_subcategory: 'disinformation',
            question: 'test question 1',
          },
        },
        {
          vars: {
            image: 'data:image/jpeg;base64,test2',
            harmful_category: 'privacy',
            harmful_subcategory: 'personal data',
            question: 'test question 2',
          },
        },
        {
          vars: {
            image: 'data:image/jpeg;base64,test3',
            harmful_category: 'risky behavior',
            harmful_subcategory: 'violence',
            question: 'test question 3',
          },
        },
      ];

      mockFetchHuggingFaceDataset.mockResolvedValue(mockRecords);

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {
        categories: ['deception'] as any,
      });
      const tests = await plugin.generateTests(1);

      // Should only include records with 'deception' category
      expect(tests).toHaveLength(1);
      expect(tests[0].metadata?.category).toBe('deception');
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
            harmful_category: 'deception',
            harmful_subcategory: 'disinformation',
            question: 'test question',
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
            harmful_category: 'deception',
            harmful_subcategory: 'disinformation',
            question: 'test question 1',
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
            harmful_category: 'deception',
            harmful_subcategory: 'disinformation',
            question: 'test question 1',
            // image field is missing entirely
          },
        },
        {
          vars: {
            image: 'data:image/jpeg;base64,test2',
            harmful_category: 'privacy',
            harmful_subcategory: 'personal data',
            question: 'test question 2',
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
            harmful_category: 'deception',
            harmful_subcategory: 'disinformation',
            question: 'q1',
          },
        },
        {
          vars: {
            image: 'data:image/jpeg;base64,a2',
            harmful_category: 'deception',
            harmful_subcategory: 'disinformation',
            question: 'q2',
          },
        },
        {
          vars: {
            image: 'data:image/jpeg;base64,b1',
            harmful_category: 'privacy',
            harmful_subcategory: 'personal data',
            question: 'q3',
          },
        },
        {
          vars: {
            image: 'data:image/jpeg;base64,b2',
            harmful_category: 'privacy',
            harmful_subcategory: 'personal data',
            question: 'q4',
          },
        },
        {
          vars: {
            image: 'data:image/jpeg;base64,b3',
            harmful_category: 'privacy',
            harmful_subcategory: 'personal data',
            question: 'q5',
          },
        },
      ];

      mockFetchHuggingFaceDataset.mockResolvedValue(mockRecords);

      const plugin = new VLGuardPlugin(mockProvider, 'test purpose', 'image', {
        categories: ['deception', 'privacy'] as any,
      });
      const tests = await plugin.generateTests(5);

      // Should return exactly 5 tests (full limit)
      expect(tests).toHaveLength(5);

      // Ensure at least base allocation from each category is present
      const categories = tests.map((t) => t.metadata?.category);
      expect(categories).toEqual(expect.arrayContaining(['deception', 'privacy']));

      // Count categories to verify distribution
      const deceptionCount = categories.filter((c) => c === 'deception').length;
      const privacyCount = categories.filter((c) => c === 'privacy').length;

      // With 5 tests and 2 categories: base=2, remainder=1
      // Should have 2-3 from each category (2+1=3 for one, 2 for the other)
      expect(deceptionCount + privacyCount).toBe(5);
      expect(deceptionCount).toBeGreaterThanOrEqual(2);
      expect(privacyCount).toBeGreaterThanOrEqual(2);
      expect(Math.abs(deceptionCount - privacyCount)).toBeLessThanOrEqual(1);
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
          category: 'deception',
          subcategory: 'disinformation',
        },
      } as AtomicTestCase;

      const rubric = grader.getRubricForTest(test);

      expect(rubric).toContain('category: deception');
      expect(rubric).toContain('subcategory: disinformation');
      expect(rubric).toContain('Do not spread false information');
    });

    it('should generate rubric for violence subcategory', () => {
      const test: AtomicTestCase = {
        metadata: {
          category: 'risky behavior',
          subcategory: 'violence',
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
      expect((grader as any).guidance).toHaveProperty('deception');
      expect((grader as any).guidance).toHaveProperty('risky behavior');
      expect((grader as any).guidance).toHaveProperty('privacy');
      expect((grader as any).guidance).toHaveProperty('discrimination');
    });

    it('should have guidance for key subcategories', () => {
      const grader = new VLGuardGrader();
      expect((grader as any).guidance).toHaveProperty('violence');
      expect((grader as any).guidance).toHaveProperty('disinformation');
      expect((grader as any).guidance).toHaveProperty('professional advice');
    });

    it('should have default guidance', () => {
      const grader = new VLGuardGrader();
      expect((grader as any).guidance).toHaveProperty('default');
    });
  });
});
