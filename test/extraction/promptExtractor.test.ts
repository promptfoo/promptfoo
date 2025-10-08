import { detectSimilarPrompts } from '../../src/extraction/promptExtractor';
import type { ExtractedPrompt } from '../../src/extraction/types';

describe('promptExtractor', () => {
  describe('detectSimilarPrompts', () => {
    it('should identify identical prompts as duplicates', () => {
      const prompts: ExtractedPrompt[] = [
        {
          content: 'You are a helpful assistant.',
          variables: [],
          location: { file: 'test.ts', line: 1, context: '' },
          confidence: 0.9,
        },
        {
          content: 'You are a helpful assistant.',
          variables: [],
          location: { file: 'test.ts', line: 10, context: '' },
          confidence: 0.85,
        },
      ];

      const result = detectSimilarPrompts(prompts, 0.8);

      expect(result[0].isDuplicate).toBe(false); // Higher confidence kept
      expect(result[1].isDuplicate).toBe(true); // Lower confidence marked as duplicate
      expect(result[0].similarTo).toContain(1);
      expect(result[1].similarTo).toContain(0);
    });

    it('should handle whitespace differences', () => {
      const prompts: ExtractedPrompt[] = [
        {
          content: 'You are a helpful   assistant.',
          variables: [],
          location: { file: 'test.ts', line: 1, context: '' },
          confidence: 0.9,
        },
        {
          content: 'You are a helpful assistant.',
          variables: [],
          location: { file: 'test.ts', line: 10, context: '' },
          confidence: 0.9,
        },
      ];

      const result = detectSimilarPrompts(prompts, 0.8);

      expect(result[0].similarTo).toContain(1);
      expect(result[1].similarTo).toContain(0);
    });

    it('should not mark dissimilar prompts as duplicates', () => {
      const prompts: ExtractedPrompt[] = [
        {
          content: 'You are a helpful assistant.',
          variables: [],
          location: { file: 'test.ts', line: 1, context: '' },
          confidence: 0.9,
        },
        {
          content: 'Translate the following text to French.',
          variables: [],
          location: { file: 'test.ts', line: 10, context: '' },
          confidence: 0.9,
        },
      ];

      const result = detectSimilarPrompts(prompts, 0.8);

      expect(result[0].isDuplicate).toBe(false);
      expect(result[1].isDuplicate).toBe(false);
      expect(result[0].similarTo).toHaveLength(0);
      expect(result[1].similarTo).toHaveLength(0);
    });

    it('should detect similar but not identical prompts', () => {
      const prompts: ExtractedPrompt[] = [
        {
          content: 'You are a helpful assistant that answers questions.',
          variables: [],
          location: { file: 'test.ts', line: 1, context: '' },
          confidence: 0.9,
        },
        {
          content: 'You are a helpful assistant.',
          variables: [],
          location: { file: 'test.ts', line: 10, context: '' },
          confidence: 0.9,
        },
      ];

      const result = detectSimilarPrompts(prompts, 0.7);

      expect(result[0].similarTo).toContain(1);
      expect(result[1].similarTo).toContain(0);
      // Should not mark as duplicate since similarity is not > 0.95
      expect(result[0].isDuplicate).toBe(false);
      expect(result[1].isDuplicate).toBe(false);
    });

    it('should handle multiple similar prompts', () => {
      const prompts: ExtractedPrompt[] = [
        {
          content: 'You are a helpful assistant.',
          variables: [],
          location: { file: 'test.ts', line: 1, context: '' },
          confidence: 0.95,
        },
        {
          content: 'You are a helpful assistant.',
          variables: [],
          location: { file: 'test.ts', line: 10, context: '' },
          confidence: 0.9,
        },
        {
          content: 'You are a helpful assistant.',
          variables: [],
          location: { file: 'test.ts', line: 20, context: '' },
          confidence: 0.85,
        },
      ];

      const result = detectSimilarPrompts(prompts, 0.8);

      expect(result[0].isDuplicate).toBe(false); // Highest confidence
      expect(result[1].isDuplicate).toBe(true);
      expect(result[2].isDuplicate).toBe(true);
    });

    it('should respect custom similarity threshold', () => {
      const prompts: ExtractedPrompt[] = [
        {
          content: 'You are a helpful assistant that provides detailed answers.',
          variables: [],
          location: { file: 'test.ts', line: 1, context: '' },
          confidence: 0.9,
        },
        {
          content: 'You are a helpful assistant.',
          variables: [],
          location: { file: 'test.ts', line: 10, context: '' },
          confidence: 0.9,
        },
      ];

      // With high threshold (0.9), these moderately similar prompts should not match
      const result1 = detectSimilarPrompts(prompts, 0.9);
      expect(result1[0].similarTo).toHaveLength(0);

      // With lower threshold (0.5), they should be considered similar
      const result2 = detectSimilarPrompts(prompts, 0.5);
      expect(result2[0].similarTo).toContain(1);
    });

    it('should handle empty prompts array', () => {
      const prompts: ExtractedPrompt[] = [];
      const result = detectSimilarPrompts(prompts, 0.8);
      expect(result).toEqual([]);
    });

    it('should handle single prompt', () => {
      const prompts: ExtractedPrompt[] = [
        {
          content: 'You are a helpful assistant.',
          variables: [],
          location: { file: 'test.ts', line: 1, context: '' },
          confidence: 0.9,
        },
      ];

      const result = detectSimilarPrompts(prompts, 0.8);

      expect(result).toHaveLength(1);
      expect(result[0].isDuplicate).toBe(false);
      expect(result[0].similarTo).toHaveLength(0);
    });
  });
});
