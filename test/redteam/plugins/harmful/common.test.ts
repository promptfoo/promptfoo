import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEnvBool, getEnvString } from '../../../../src/envars';
import {
  HARM_PLUGINS,
  LLAMA_GUARD_ENABLED_CATEGORIES,
  LLAMA_GUARD_REPLICATE_PROVIDER,
} from '../../../../src/redteam/constants';
import { categoryAliases } from '../../../../src/redteam/constants/metadata';
import { GRADERS } from '../../../../src/redteam/graders';
import {
  createTestCase,
  getHarmfulAssertions,
} from '../../../../src/redteam/plugins/harmful/common';

vi.mock('../../../../src/envars');

describe('harmful plugin', () => {
  beforeEach(() => {
    vi.mocked(getEnvBool).mockReset();
    vi.mocked(getEnvString).mockReset();
  });

  describe('getHarmfulAssertions', () => {
    beforeEach(() => {
      vi.mocked(getEnvBool).mockReset();
      vi.mocked(getEnvString).mockReset();
    });

    it('should use specific subcategory as metric name for privacy category', () => {
      const assertions = getHarmfulAssertions('harmful:privacy');
      expect(assertions).toEqual([
        {
          metric: categoryAliases['harmful:privacy'],
          type: 'promptfoo:redteam:harmful:privacy',
        },
      ]);
      expect(assertions[0].metric).toBe('Privacy violations');
    });

    it('should use specific subcategory as metric name for intellectual property category', () => {
      const assertions = getHarmfulAssertions('harmful:intellectual-property');
      expect(assertions).toEqual([
        {
          metric: categoryAliases['harmful:intellectual-property'],
          type: 'promptfoo:redteam:harmful:intellectual-property',
        },
      ]);
      expect(assertions[0].metric).toBe('Intellectual Property violation');
    });

    it('should use specific subcategory as metric name for copyright violations', () => {
      const assertions = getHarmfulAssertions('harmful:copyright-violations');
      expect(assertions).toEqual([
        {
          metric: categoryAliases['harmful:copyright-violations'],
          type: 'promptfoo:redteam:harmful:copyright-violations',
        },
      ]);
      expect(assertions[0].metric).toBe('Copyright Violations - Copyrighted text');
    });

    it('should return only basic assertions when moderation is disabled', () => {
      vi.mocked(getEnvBool).mockImplementation(function (key) {
        if (key === 'PROMPTFOO_DISABLE_REDTEAM_MODERATION') {
          return true;
        }
        return false;
      });
      vi.mocked(getEnvString).mockImplementation(function () {
        return 'test-key';
      });

      const assertions = getHarmfulAssertions('harmful:privacy');
      expect(assertions).toHaveLength(1);
      expect(assertions[0].metric).toBe('Privacy violations');
      expect(assertions).not.toContainEqual(expect.objectContaining({ type: 'moderation' }));
    });

    it('should prioritize Replicate over OpenAI when both keys are present', () => {
      vi.mocked(getEnvString).mockImplementation(function (key) {
        if (key === 'REPLICATE_API_KEY') {
          return 'replicate-key';
        }
        if (key === 'OPENAI_API_KEY') {
          return 'openai-key';
        }
        return '';
      });

      const assertions = getHarmfulAssertions('harmful:privacy');
      expect(assertions).toContainEqual({
        metric: 'Privacy violations',
        type: 'moderation',
        value: LLAMA_GUARD_ENABLED_CATEGORIES,
        provider: LLAMA_GUARD_REPLICATE_PROVIDER,
      });
      expect(assertions).toHaveLength(2);
      // Verify all assertions use the same metric name
      expect(assertions[0].metric).toBe('Privacy violations');
      expect(assertions[1].metric).toBe('Privacy violations');
    });

    it('should handle REPLICATE_API_TOKEN', () => {
      vi.mocked(getEnvString).mockImplementation(function (key) {
        if (key === 'REPLICATE_API_TOKEN') {
          return 'replicate-token';
        }
        return '';
      });

      const assertions = getHarmfulAssertions('harmful:privacy');
      expect(assertions).toContainEqual({
        metric: 'Privacy violations',
        type: 'moderation',
        value: LLAMA_GUARD_ENABLED_CATEGORIES,
        provider: LLAMA_GUARD_REPLICATE_PROVIDER,
      });
    });

    it('should use subcategory metric name for OpenAI moderation assertions', () => {
      vi.mocked(getEnvString).mockImplementation(function (key) {
        if (key === 'OPENAI_API_KEY') {
          return 'openai-key';
        }
        return '';
      });

      const assertions = getHarmfulAssertions('harmful:hate');
      expect(assertions).toHaveLength(2);
      expect(assertions[0].metric).toBe('Hate');
      expect(assertions[1].metric).toBe('Hate');
      expect(assertions[1].type).toBe('moderation');
    });

    it('should fallback to harm category when not in categoryAliases', () => {
      const unknownCategory = 'harmful:unknown-category' as keyof typeof HARM_PLUGINS;
      const assertions = getHarmfulAssertions(unknownCategory);
      expect(assertions[0].metric).toBe(unknownCategory);
    });
  });

  describe('createTestCase', () => {
    it('should create test case with single line output', () => {
      const testCase = createTestCase('inputVar', 'single line output', 'harmful:privacy');

      expect(testCase).toEqual({
        vars: {
          inputVar: 'single line output',
        },
        metadata: {
          harmCategory: HARM_PLUGINS['harmful:privacy'],
          pluginId: 'harmful:privacy',
        },
        assert: expect.any(Array),
      });
    });

    it('should handle multiline output', () => {
      const testCase = createTestCase(
        'inputVar',
        'first line\nsecond line\nthird line',
        'harmful:privacy',
      );

      expect(testCase.vars?.inputVar).toBe('first line\nsecond line\nthird line');
    });

    it('should handle whitespace in output', () => {
      const testCase = createTestCase('inputVar', '  padded output  ', 'harmful:privacy');
      expect(testCase.vars?.inputVar).toBe('padded output');
    });

    it('should use harm category as fallback when not in HARM_PLUGINS', () => {
      const unknownCategory = 'harmful:unknown' as keyof typeof HARM_PLUGINS;
      const testCase = createTestCase('inputVar', 'test output', unknownCategory);

      expect(testCase.metadata?.harmCategory).toBe(unknownCategory);
    });
  });

  describe('plugin category validation', () => {
    it('should have graders for all harmful categories', () => {
      const harmCategories = Object.keys(HARM_PLUGINS);

      const harmGraders = Object.keys(GRADERS).filter((key) =>
        key.startsWith('promptfoo:redteam:harmful:'),
      );
      expect(harmGraders.length).toBeGreaterThanOrEqual(harmCategories.length);
    });
  });
});
