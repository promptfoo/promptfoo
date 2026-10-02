import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as cache from '../../../src/cache';
import logger from '../../../src/logger';
import * as imageDatasetUtils from '../../../src/redteam/plugins/imageDatasetUtils';
import {
  CATEGORY_NAMES,
  VALID_GRADES,
  VLSU_CATEGORIES,
  VLSUDatasetManager,
  VLSUPlugin,
} from '../../../src/redteam/plugins/vlsu';
import { createMockProvider } from '../../factories/provider';

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
  VLSUDatasetManager.clearCache();
});

// Helper to create mock CSV data matching VLSU format
function createMockCSVRecord(overrides: Partial<Record<string, string>> = {}) {
  return {
    prompt: 'Sample test prompt',
    image_grade: 'safe',
    consensus_text_grade: 'safe',
    consensus_combined_grade: 'unsafe',
    image_category: '',
    text_category: '',
    combined_category: 'C9: Interpersonal Violence',
    web_path: 'https://example.com/image.jpg',
    uuid: `test-uuid-${Math.random().toString(36).substring(7)}`,
    ...overrides,
  };
}

// Helper to create mock CSV text
function createMockCSVText(records: Array<Record<string, string>>): string {
  const headers = Object.keys(records[0]).join(',');
  const rows = records.map((r) =>
    Object.values(r)
      .map((v) => `"${v}"`)
      .join(','),
  );
  return [headers, ...rows].join('\n');
}

function mockDataset(records: Array<Record<string, string>>) {
  mockFetchImageAsBase64.mockResolvedValue('data:image/jpeg;base64,test');
  mockFetchWithCache.mockResolvedValue({
    status: 200,
    data: createMockCSVText(records),
    cached: false,
    statusText: 'OK',
  } as any);
}

describe('VLSUPlugin', () => {
  describe('constructor', () => {
    it('should initialize with default config', () => {
      const plugin = new VLSUPlugin(mockProvider, 'test purpose', 'image', {});
      expect(plugin.id).toBe('promptfoo:redteam:vlsu');
    });

    it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, '2', 'invalid', false])(
      'should reject invalid maxConcurrency %s before generating tests',
      (maxConcurrency) => {
        const config: Record<string, unknown> = { maxConcurrency };
        expect(() => new VLSUPlugin(mockProvider, 'test purpose', 'image', config)).toThrow(
          '[vlsu] maxConcurrency must be a positive integer',
        );
        expect(mockFetchWithCache).not.toHaveBeenCalled();
      },
    );

    it.each([1, 5, 32, undefined])('should accept maxConcurrency %s', (maxConcurrency) => {
      expect(
        () => new VLSUPlugin(mockProvider, 'test purpose', 'image', { maxConcurrency }),
      ).not.toThrow();
    });

    it.each([
      [{ categories: ['C1', 'invalid-category'] }, 'Invalid categories: invalid-category'],
      [{ grades: ['safe', 'invalid-grade'] as any }, 'Invalid grades: invalid-grade'],
      [
        { severityPatterns: ['safe_safe_unsafe', 'invalid_pattern'] },
        'Invalid severity pattern: invalid_pattern',
      ],
    ])('should validate config %j', (config, warning) => {
      new VLSUPlugin(mockProvider, 'test purpose', 'image', config);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(warning));
    });

    it('should set canGenerateRemote to false', () => {
      expect(VLSUPlugin.canGenerateRemote).toBe(false);
    });
  });

  describe('getTemplate', () => {
    it('should return the inject variable', async () => {
      const plugin = new VLSUPlugin(mockProvider, 'test purpose', 'myImage', {});
      const template = await plugin.getTemplate();
      expect(template).toBe('myImage');
    });
  });

  describe('getAssertions', () => {
    it('should generate correct assertions', () => {
      const plugin = new VLSUPlugin(mockProvider, 'test purpose', 'image', {});
      const assertions = (plugin as any).getAssertions('test prompt');

      expect(assertions).toEqual([
        {
          type: 'promptfoo:redteam:vlsu',
          metric: 'VLSU',
        },
      ]);
    });
  });

  describe('constants', () => {
    it('should have all 15 VLSU categories', () => {
      expect(VLSU_CATEGORIES).toHaveLength(15);
      expect(VLSU_CATEGORIES).toContain('C1');
      expect(VLSU_CATEGORIES).toContain('C15');
    });

    it('should have human-readable names for all categories', () => {
      for (const category of VLSU_CATEGORIES) {
        expect(CATEGORY_NAMES[category]).toBeDefined();
        expect(typeof CATEGORY_NAMES[category]).toBe('string');
      }
    });

    it('should have valid grades defined', () => {
      expect(VALID_GRADES).toContain('safe');
      expect(VALID_GRADES).toContain('unsafe');
      expect(VALID_GRADES).toContain('borderline');
      expect(VALID_GRADES).toContain('not_sure');
    });
  });

  describe('generateTests', () => {
    it('should generate test cases from CSV records', async () => {
      const mockRecords = [
        createMockCSVRecord({
          prompt: 'Test prompt 1',
          combined_category: 'C4: Self-Harm and Suicide',
          image_grade: 'safe',
          consensus_text_grade: 'safe',
          consensus_combined_grade: 'unsafe',
        }),
        createMockCSVRecord({
          prompt: 'Test prompt 2',
          combined_category: 'C9: Interpersonal Violence',
          image_grade: 'borderline',
          consensus_text_grade: 'safe',
          consensus_combined_grade: 'borderline',
        }),
      ];

      mockDataset(mockRecords);

      const plugin = new VLSUPlugin(mockProvider, 'test purpose', 'image', {});
      const tests = await plugin.generateTests(2);

      expect(tests).toHaveLength(2);
      expect(tests[0].vars?.image).toBeDefined();
      expect(tests[0].metadata?.combinedCategory).toBeDefined();
      expect(tests[0].metadata?.vlsuSeverityPattern).toBeDefined();
    });

    it('should filter by categories when configured', async () => {
      const mockRecords = [
        createMockCSVRecord({ combined_category: 'C4: Self-Harm and Suicide' }),
        createMockCSVRecord({ combined_category: 'C9: Interpersonal Violence' }),
        createMockCSVRecord({ combined_category: 'C12: Terrorism and Violent Extremism' }),
      ];

      mockDataset(mockRecords);

      const plugin = new VLSUPlugin(mockProvider, 'test purpose', 'image', {
        categories: ['C4'],
      });
      const tests = await plugin.generateTests(10);

      expect(tests).toHaveLength(1);
      expect(tests[0].metadata?.combinedCategory).toBe('C4');
    });

    it('should filter by grades when configured', async () => {
      const mockRecords = [
        createMockCSVRecord({ consensus_combined_grade: 'safe' }),
        createMockCSVRecord({ consensus_combined_grade: 'unsafe' }),
        createMockCSVRecord({ consensus_combined_grade: 'borderline' }),
      ];

      mockDataset(mockRecords);

      const plugin = new VLSUPlugin(mockProvider, 'test purpose', 'image', {
        grades: ['unsafe'],
      });
      const tests = await plugin.generateTests(10);

      expect(tests).toHaveLength(1);
      expect(tests[0].metadata?.combinedGrade).toBe('unsafe');
    });

    it('should filter by severity patterns when configured', async () => {
      const mockRecords = [
        createMockCSVRecord({
          image_grade: 'safe',
          consensus_text_grade: 'safe',
          consensus_combined_grade: 'unsafe',
        }),
        createMockCSVRecord({
          image_grade: 'unsafe',
          consensus_text_grade: 'safe',
          consensus_combined_grade: 'borderline',
        }),
        createMockCSVRecord({
          image_grade: 'borderline',
          consensus_text_grade: 'borderline',
          consensus_combined_grade: 'unsafe',
        }),
      ];

      mockDataset(mockRecords);

      const plugin = new VLSUPlugin(mockProvider, 'test purpose', 'image', {
        severityPatterns: ['safe_safe_unsafe'],
      });
      const tests = await plugin.generateTests(10);

      expect(tests).toHaveLength(1);
      expect(tests[0].metadata?.vlsuSeverityPattern).toBe('safe_safe_unsafe');
    });

    it('should filter for compositional cases when compositionalOnly is true', async () => {
      const mockRecords = [
        // Compositional case: safe + safe = unsafe
        createMockCSVRecord({
          image_grade: 'safe',
          consensus_text_grade: 'safe',
          consensus_combined_grade: 'unsafe',
        }),
        // Not compositional: unsafe + safe = unsafe
        createMockCSVRecord({
          image_grade: 'unsafe',
          consensus_text_grade: 'safe',
          consensus_combined_grade: 'unsafe',
        }),
        // Not compositional: safe + safe = safe
        createMockCSVRecord({
          image_grade: 'safe',
          consensus_text_grade: 'safe',
          consensus_combined_grade: 'safe',
        }),
      ];

      mockDataset(mockRecords);

      const plugin = new VLSUPlugin(mockProvider, 'test purpose', 'image', {
        compositionalOnly: true,
      });
      const tests = await plugin.generateTests(10);

      expect(tests).toHaveLength(1);
      expect(tests[0].metadata?.vlsuIsCompositional).toBe(true);
      expect(tests[0].metadata?.imageGrade).toBe('safe');
      expect(tests[0].metadata?.textGrade).toBe('safe');
      expect(tests[0].metadata?.combinedGrade).toBe('unsafe');
    });

    it('should throw error when no records match filters', async () => {
      const mockRecords = [createMockCSVRecord({ combined_category: 'C4: Self-Harm and Suicide' })];

      mockDataset(mockRecords);

      const plugin = new VLSUPlugin(mockProvider, 'test purpose', 'image', {
        categories: ['C15'], // No records match this
      });

      await expect(plugin.generateTests(5)).rejects.toThrow('Failed to generate tests');
    });

    it('should throw error when CSV fetch fails', async () => {
      mockFetchWithCache.mockResolvedValue({
        status: 404,
        statusText: 'Not Found',
        data: null,
        cached: false,
      } as any);

      const plugin = new VLSUPlugin(mockProvider, 'test purpose', 'image', {});

      await expect(plugin.generateTests(5)).rejects.toThrow('Failed to generate tests');
    });

    it('should skip records with failed image fetches', async () => {
      const mockRecords = [
        createMockCSVRecord({ uuid: 'success-1' }),
        createMockCSVRecord({ uuid: 'fail-1' }),
        createMockCSVRecord({ uuid: 'success-2' }),
      ];

      mockDataset(mockRecords);

      // Fail one specific call deterministically (second call fails)
      mockFetchImageAsBase64
        .mockResolvedValueOnce('data:image/jpeg;base64,test')
        .mockResolvedValueOnce(null);

      const plugin = new VLSUPlugin(mockProvider, 'test purpose', 'image', {});
      const tests = await plugin.generateTests(3);

      // Should have exactly 2 tests (one failed image fetch is skipped)
      expect(tests.length).toBe(2);
    });

    it('should warn when fewer records are available than requested', async () => {
      const mockRecords = [createMockCSVRecord()];

      mockDataset(mockRecords);

      const plugin = new VLSUPlugin(mockProvider, 'test purpose', 'image', {});
      const tests = await plugin.generateTests(10);

      expect(tests).toHaveLength(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Requested 10 tests but only 1 records'),
      );
    });

    it('should include prompt as separate variable by default', async () => {
      const mockRecords = [createMockCSVRecord({ prompt: 'Test multimodal prompt' })];

      mockDataset(mockRecords);

      const plugin = new VLSUPlugin(mockProvider, 'test purpose', 'image', {});
      const tests = await plugin.generateTests(1);

      expect(tests).toHaveLength(1);
      // Image is the base64 string
      expect(tests[0].vars?.image).toBe('data:image/jpeg;base64,test');
      // Prompt is a separate variable
      expect(tests[0].vars?.prompt).toBe('Test multimodal prompt');
    });

    it('should not include prompt variable when includePrompt is false', async () => {
      const mockRecords = [createMockCSVRecord({ prompt: 'Test prompt' })];

      mockDataset(mockRecords);

      const plugin = new VLSUPlugin(mockProvider, 'test purpose', 'image', {
        includePrompt: false,
      });
      const tests = await plugin.generateTests(1);

      expect(tests).toHaveLength(1);
      expect(tests[0].vars?.image).toBe('data:image/jpeg;base64,test');
      expect(tests[0].vars?.prompt).toBeUndefined();
    });
  });

  describe('metadata population', () => {
    it('should populate all VLSU-specific metadata fields', async () => {
      const mockRecords = [
        createMockCSVRecord({
          prompt: 'Test prompt',
          image_grade: 'safe',
          consensus_text_grade: 'safe',
          consensus_combined_grade: 'unsafe',
          combined_category: 'C4: Self-Harm and Suicide',
        }),
      ];

      mockDataset(mockRecords);

      const plugin = new VLSUPlugin(mockProvider, 'test purpose', 'image', {});
      const tests = await plugin.generateTests(1);

      const metadata = tests[0].metadata;
      expect(metadata?.vlsuCategory).toBe('C4');
      expect(metadata?.vlsuCategoryName).toBe('Self-Harm and Suicide');
      expect(metadata?.vlsuGrade).toBe('unsafe');
      expect(metadata?.vlsuSeverityPattern).toBe('safe_safe_unsafe');
      expect(metadata?.vlsuIsCompositional).toBe(true);
      expect(metadata?.imageGrade).toBe('safe');
      expect(metadata?.textGrade).toBe('safe');
      expect(metadata?.combinedGrade).toBe('unsafe');
      expect(metadata?.originalPrompt).toBe('Test prompt');
    });
  });
});

describe('VLSUDatasetManager', () => {
  describe('singleton pattern', () => {
    it('should return same instance on multiple calls', () => {
      const instance1 = VLSUDatasetManager.getInstance();
      const instance2 = VLSUDatasetManager.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should clear cache correctly', async () => {
      const mockRecords = [createMockCSVRecord()];

      mockDataset(mockRecords);

      const manager = VLSUDatasetManager.getInstance();
      await manager.getFilteredRecords(1, {});

      // Clear and fetch again
      VLSUDatasetManager.clearCache();
      await manager.getFilteredRecords(1, {});

      // Should fetch twice (cache was cleared)
      expect(mockFetchWithCache).toHaveBeenCalledTimes(2);
    });
  });

  describe('CSV caching', () => {
    it('should cache CSV data after first fetch', async () => {
      const mockRecords = [createMockCSVRecord()];

      mockDataset(mockRecords);

      const manager = VLSUDatasetManager.getInstance();
      await manager.getFilteredRecords(1, {});
      await manager.getFilteredRecords(1, {});

      // CSV should only be fetched once
      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
    });
  });

  describe('category code extraction', () => {
    it.each([
      ['C12: Terrorism and Violent Extremism', 'C12'],
      ['', ''],
    ])('should extract category code %j as %j', async (combined_category, expected) => {
      const mockRecords = [createMockCSVRecord({ combined_category })];
      mockDataset(mockRecords);
      const manager = VLSUDatasetManager.getInstance();
      const records = await manager.getFilteredRecords(1, {});
      expect(records[0].combinedCategory).toBe(expected);
    });
  });

  describe('severity pattern computation', () => {
    it('should compute correct severity patterns', async () => {
      const mockRecords = [
        createMockCSVRecord({
          image_grade: 'borderline',
          consensus_text_grade: 'unsafe',
          consensus_combined_grade: 'unsafe',
        }),
      ];

      mockDataset(mockRecords);

      const manager = VLSUDatasetManager.getInstance();
      const records = await manager.getFilteredRecords(1, {});

      expect(records[0].severityPattern).toBe('borderline_unsafe_unsafe');
    });
  });
});

describe('edge cases', () => {
  describe('small n values', () => {
    it.each([1, 0])('should handle n=%i correctly', async (n) => {
      const mockRecords = [createMockCSVRecord()];

      mockDataset(mockRecords);

      const plugin = new VLSUPlugin(mockProvider, 'test purpose', 'image', {});
      const tests = await plugin.generateTests(n);

      expect(tests).toHaveLength(n);
    });
  });

  describe('not_sure grade handling', () => {
    it('should normalize not_sure grades correctly', async () => {
      const mockRecords = [
        createMockCSVRecord({
          image_grade: 'not_sure',
          consensus_text_grade: 'safe',
          consensus_combined_grade: 'unsafe',
        }),
      ];

      mockDataset(mockRecords);

      const plugin = new VLSUPlugin(mockProvider, 'test purpose', 'image', {});
      const tests = await plugin.generateTests(1);

      expect(tests[0].metadata?.imageGrade).toBe('not_sure');
      expect(tests[0].metadata?.vlsuSeverityPattern).toBe('not_sure_safe_unsafe');
      expect(tests[0].metadata?.isCompositional).toBe(false);
      expect(tests[0].metadata?.vlsuIsCompositional).toBe(false);
      expect(tests[0].assert?.[0]).toMatchObject({ value: { isCompositional: false } });
    });
  });

  describe('mixed filters', () => {
    it('should apply multiple filter types simultaneously', async () => {
      const mockRecords = [
        // Matches all filters
        createMockCSVRecord({
          combined_category: 'C9: Interpersonal Violence',
          image_grade: 'safe',
          consensus_text_grade: 'safe',
          consensus_combined_grade: 'unsafe',
        }),
        // Wrong category
        createMockCSVRecord({
          combined_category: 'C4: Self-Harm',
          image_grade: 'safe',
          consensus_text_grade: 'safe',
          consensus_combined_grade: 'unsafe',
        }),
        // Wrong grade
        createMockCSVRecord({
          combined_category: 'C9: Interpersonal Violence',
          image_grade: 'unsafe',
          consensus_text_grade: 'safe',
          consensus_combined_grade: 'borderline',
        }),
      ];

      mockDataset(mockRecords);

      const plugin = new VLSUPlugin(mockProvider, 'test purpose', 'image', {
        categories: ['C9'],
        grades: ['unsafe'],
        compositionalOnly: true,
      });
      const tests = await plugin.generateTests(10);

      expect(tests).toHaveLength(1);
      expect(tests[0].metadata?.combinedCategory).toBe('C9');
      expect(tests[0].metadata?.combinedGrade).toBe('unsafe');
      expect(tests[0].metadata?.vlsuIsCompositional).toBe(true);
    });
  });

  describe('case insensitivity', () => {
    it('should handle uppercase category codes', async () => {
      const mockRecords = [createMockCSVRecord({ combined_category: 'C9: Violence' })];

      mockDataset(mockRecords);

      const plugin = new VLSUPlugin(mockProvider, 'test purpose', 'image', {
        categories: ['c9'], // lowercase in config
      });
      const tests = await plugin.generateTests(1);

      expect(tests).toHaveLength(1);
    });
  });
});
