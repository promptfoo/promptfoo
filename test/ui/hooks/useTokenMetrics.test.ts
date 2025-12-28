/**
 * Tests for useTokenMetrics hook and related utilities.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// Test the normalizeProviderId function directly by recreating it
// This matches the implementation in src/ui/hooks/useTokenMetrics.ts
function normalizeProviderId(trackerId: string): string {
  // Handle null/empty provider IDs
  if (!trackerId || trackerId.trim() === '') {
    return 'unknown-provider';
  }
  // Match pattern: "provider-id (ConstructorName)"
  const match = trackerId.match(/^(.+?)\s+\([^)]+\)$/);
  return match ? match[1] : trackerId;
}

describe('useTokenMetrics', () => {
  describe('normalizeProviderId', () => {
    describe('basic functionality', () => {
      it('should extract provider ID from tracker format', () => {
        expect(normalizeProviderId('openai:gpt-4o-mini (OpenAiGenericProvider)')).toBe(
          'openai:gpt-4o-mini',
        );
      });

      it('should return original ID if no constructor name', () => {
        expect(normalizeProviderId('openai:gpt-4')).toBe('openai:gpt-4');
      });

      it('should handle complex provider IDs', () => {
        expect(normalizeProviderId('anthropic:claude-3-opus (AnthropicProvider)')).toBe(
          'anthropic:claude-3-opus',
        );
      });
    });

    describe('edge cases - empty/null handling', () => {
      it('should return unknown-provider for empty string', () => {
        expect(normalizeProviderId('')).toBe('unknown-provider');
      });

      it('should return unknown-provider for whitespace-only string', () => {
        expect(normalizeProviderId('   ')).toBe('unknown-provider');
        expect(normalizeProviderId('\t')).toBe('unknown-provider');
        expect(normalizeProviderId('\n')).toBe('unknown-provider');
      });
    });

    describe('edge cases - special characters', () => {
      it('should handle provider IDs with special characters', () => {
        expect(normalizeProviderId('provider/with:special@chars (TestProvider)')).toBe(
          'provider/with:special@chars',
        );
      });

      it('should handle provider IDs with hyphens and underscores', () => {
        expect(normalizeProviderId('my-custom_provider-v2 (CustomProvider)')).toBe(
          'my-custom_provider-v2',
        );
      });

      it('should handle provider IDs with dots', () => {
        expect(normalizeProviderId('api.openai.com (HttpProvider)')).toBe('api.openai.com');
      });

      it('should handle provider IDs with parentheses in the ID itself', () => {
        // This is an edge case - if the ID has () it might conflict
        // The regex should still work because it matches the last parentheses
        expect(normalizeProviderId('provider (v2) (TestProvider)')).toBe('provider (v2)');
      });

      it('should handle provider IDs with unicode characters', () => {
        expect(normalizeProviderId('日本語provider (UnicodeProvider)')).toBe('日本語provider');
      });

      it('should handle provider IDs with emoji', () => {
        expect(normalizeProviderId('test-🚀-provider (EmojiProvider)')).toBe('test-🚀-provider');
      });
    });

    describe('edge cases - malformed inputs', () => {
      it('should handle ID with only opening parenthesis', () => {
        expect(normalizeProviderId('provider (incomplete')).toBe('provider (incomplete');
      });

      it('should handle ID with only closing parenthesis', () => {
        expect(normalizeProviderId('provider incomplete)')).toBe('provider incomplete)');
      });

      it('should handle ID with empty parentheses', () => {
        // Empty parentheses don't match the pattern, so original is returned
        expect(normalizeProviderId('provider ()')).toBe('provider ()');
      });

      it('should handle ID with nested parentheses', () => {
        expect(normalizeProviderId('provider ((nested)) (Outer)')).toBe('provider ((nested))');
      });

      it('should handle very long provider IDs', () => {
        const longId = 'a'.repeat(1000);
        expect(normalizeProviderId(`${longId} (VeryLongProvider)`)).toBe(longId);
      });
    });

    describe('edge cases - whitespace handling', () => {
      it('should preserve leading whitespace in ID', () => {
        expect(normalizeProviderId('  leading-space (Provider)')).toBe('  leading-space');
      });

      it('should handle multiple spaces before constructor', () => {
        expect(normalizeProviderId('provider   (Provider)')).toBe('provider');
      });

      it('should handle tabs in ID', () => {
        expect(normalizeProviderId('provider\t(Provider)')).toBe('provider');
      });
    });
  });
});
