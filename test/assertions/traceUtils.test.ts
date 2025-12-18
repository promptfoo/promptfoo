import { describe, expect, it } from 'vitest';
import { matchesPattern } from '../../src/assertions/traceUtils';

describe('tracing utilities', () => {
  describe('matchesPattern', () => {
    it('should match exact span names', () => {
      expect(matchesPattern('llm.completion', 'llm.completion')).toBe(true);
      expect(matchesPattern('database.query', 'database.query')).toBe(true);
    });

    it('should not match different span names', () => {
      expect(matchesPattern('llm.completion', 'llm.chat')).toBe(false);
      expect(matchesPattern('database.query', 'api.call')).toBe(false);
    });

    it('should match wildcard * for any characters', () => {
      expect(matchesPattern('llm.completion', '*')).toBe(true);
      expect(matchesPattern('llm.completion', 'llm.*')).toBe(true);
      expect(matchesPattern('llm.completion', '*.completion')).toBe(true);
      expect(matchesPattern('llm.completion', '*.*')).toBe(true);
      expect(matchesPattern('llm.chat.stream', '*.*.*')).toBe(true);
    });

    it('should match wildcard * in the middle', () => {
      expect(matchesPattern('llm.completion', 'llm*completion')).toBe(true);
      expect(matchesPattern('llm.chat.completion', 'llm*completion')).toBe(true);
      expect(matchesPattern('api.external.call', 'api*call')).toBe(true);
    });

    it('should match wildcard ? for single character', () => {
      expect(matchesPattern('llm.chat', 'llm.c?at')).toBe(true);
      expect(matchesPattern('llm.coat', 'llm.c?at')).toBe(true);
      expect(matchesPattern('llm.chat', 'llm.???t')).toBe(true);
    });

    it('should not match ? for zero or multiple characters', () => {
      expect(matchesPattern('llm.ct', 'llm.c?at')).toBe(false);
      expect(matchesPattern('llm.chaat', 'llm.c?at')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(matchesPattern('LLM.COMPLETION', 'llm.completion')).toBe(true);
      expect(matchesPattern('llm.completion', 'LLM.COMPLETION')).toBe(true);
      expect(matchesPattern('LLM.Completion', '*llm*')).toBe(true);
    });

    it('should escape special regex characters', () => {
      expect(matchesPattern('llm.completion', 'llm.completion')).toBe(true);
      expect(matchesPattern('test[0]', 'test[0]')).toBe(true);
      expect(matchesPattern('test(1)', 'test(1)')).toBe(true);
      expect(matchesPattern('price$100', 'price$100')).toBe(true);
      expect(matchesPattern('a+b', 'a+b')).toBe(true);
      expect(matchesPattern('a^b', 'a^b')).toBe(true);
      expect(matchesPattern('a|b', 'a|b')).toBe(true);
      expect(matchesPattern('path\\file', 'path\\file')).toBe(true);
    });

    it('should handle empty pattern', () => {
      expect(matchesPattern('', '')).toBe(true);
      expect(matchesPattern('something', '')).toBe(false);
    });

    it('should handle empty span name', () => {
      expect(matchesPattern('', '*')).toBe(true);
      expect(matchesPattern('', 'something')).toBe(false);
    });

    it('should match complex patterns', () => {
      expect(matchesPattern('api.v2.users.get', 'api.*.users.*')).toBe(true);
      expect(matchesPattern('api.v2.posts.get', 'api.*.users.*')).toBe(false);
      expect(matchesPattern('retrieval.search.vector', '*retrieval*')).toBe(true);
      expect(matchesPattern('llm.openai.chat', 'llm.*.chat')).toBe(true);
    });
  });
});
