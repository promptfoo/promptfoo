/**
 * Tests for provider string extraction logic in ResultsTable
 * Lines 1051-1056 in ResultsTable.tsx
 */

import { describe, expect, it } from 'vitest';

/**
 * Extract provider string extraction logic for testing
 * This mirrors the logic in ResultsTable.tsx lines 1051-1056
 */
function extractProviderString(provider: any): string {
  return typeof provider === 'string'
    ? provider
    : typeof provider === 'object' && provider !== null
      ? (provider as any).id || JSON.stringify(provider)
      : String(provider || 'Unknown provider');
}

describe('ResultsTable provider string extraction', () => {
  describe('string providers', () => {
    it('returns string provider as-is', () => {
      const result = extractProviderString('openai:gpt-4o');
      expect(result).toBe('openai:gpt-4o');
    });

    it('handles empty string', () => {
      const result = extractProviderString('');
      expect(result).toBe('');
    });

    it('handles very long provider string', () => {
      const longString =
        'custom-provider:very-long-model-name-with-many-characters-exceeding-typical-length';
      const result = extractProviderString(longString);
      expect(result).toBe(longString);
    });

    it('handles provider string with special characters', () => {
      const result = extractProviderString('provider:model-v1.0-2024_beta');
      expect(result).toBe('provider:model-v1.0-2024_beta');
    });

    it('handles provider string with multiple colons', () => {
      const result = extractProviderString('google:gemini-2.0-flash:thinking');
      expect(result).toBe('google:gemini-2.0-flash:thinking');
    });
  });

  describe('object providers', () => {
    it('extracts id from provider object', () => {
      const provider = { id: 'openai:gpt-4o', config: { temperature: 0.7 } };
      const result = extractProviderString(provider);
      expect(result).toBe('openai:gpt-4o');
    });

    it('extracts id when both id and label present', () => {
      const provider = { id: 'openai:gpt-4o', label: 'My GPT' };
      const result = extractProviderString(provider);
      expect(result).toBe('openai:gpt-4o');
    });

    it('falls back to JSON.stringify when id is missing', () => {
      const provider = { label: 'Custom Provider', config: { temperature: 0.5 } };
      const result = extractProviderString(provider);
      expect(result).toBe(JSON.stringify(provider));
    });

    it('falls back to JSON.stringify for empty object', () => {
      const provider = {};
      const result = extractProviderString(provider);
      expect(result).toBe('{}');
    });

    it('extracts empty string id', () => {
      const provider = { id: '', config: { temperature: 0.5 } };
      const result = extractProviderString(provider);
      // Empty string is falsy, so falls back to JSON.stringify
      expect(result).toBe(JSON.stringify(provider));
    });

    it('handles null id with other properties', () => {
      const provider = { id: null, config: { temperature: 0.5 } };
      const result = extractProviderString(provider);
      // null is falsy, so falls back to JSON.stringify
      expect(result).toBe(JSON.stringify(provider));
    });

    it('handles undefined id with other properties', () => {
      const provider = { id: undefined, config: { temperature: 0.5 } };
      const result = extractProviderString(provider);
      expect(result).toBe(JSON.stringify(provider));
    });

    it('handles object with numeric id', () => {
      const provider = { id: 123, config: {} };
      const result = extractProviderString(provider);
      // Numeric id is truthy, so it's used
      expect(result).toBe(123);
    });

    it('handles object with boolean id', () => {
      const provider = { id: true, config: {} };
      const result = extractProviderString(provider);
      expect(result).toBe(true);
    });

    it('handles deeply nested object', () => {
      const provider = {
        nested: {
          deeply: {
            config: { temperature: 0.5 },
          },
        },
      };
      const result = extractProviderString(provider);
      expect(result).toBe(JSON.stringify(provider));
    });

    it('handles object with circular reference prevention', () => {
      const provider: any = { id: 'test', config: {} };
      provider.self = provider; // Circular reference
      // JSON.stringify will throw on circular reference, but with id present it won't reach that
      const result = extractProviderString(provider);
      expect(result).toBe('test');
    });
  });

  describe('null and undefined providers', () => {
    it('handles null provider', () => {
      const result = extractProviderString(null);
      expect(result).toBe('Unknown provider');
    });

    it('handles undefined provider', () => {
      const result = extractProviderString(undefined);
      expect(result).toBe('Unknown provider');
    });
  });

  describe('primitive type providers', () => {
    it('handles numeric provider', () => {
      const result = extractProviderString(42);
      expect(result).toBe('42');
    });

    it('handles boolean true provider', () => {
      const result = extractProviderString(true);
      expect(result).toBe('true');
    });

    it('handles boolean false provider', () => {
      const result = extractProviderString(false);
      expect(result).toBe('Unknown provider');
    });

    it('handles zero as provider', () => {
      const result = extractProviderString(0);
      expect(result).toBe('Unknown provider');
    });

    it('handles NaN as provider', () => {
      const result = extractProviderString(NaN);
      // NaN is not a string, and it's falsy (NaN || 'Unknown' => 'Unknown')
      // So String(NaN || 'Unknown provider') => 'Unknown provider'
      expect(result).toBe('Unknown provider');
    });

    it('handles Infinity as provider', () => {
      const result = extractProviderString(Infinity);
      // Infinity is truthy, so String(Infinity) => 'Infinity'
      expect(result).toBe('Infinity');
    });
  });

  describe('array providers', () => {
    it('handles array as provider (object type)', () => {
      const provider = ['openai:gpt-4o', 'anthropic:claude'];
      const result = extractProviderString(provider);
      expect(result).toBe(JSON.stringify(provider));
    });

    it('handles empty array', () => {
      const provider: any[] = [];
      const result = extractProviderString(provider);
      expect(result).toBe('[]');
    });
  });

  describe('function providers', () => {
    it('handles function as provider (edge case)', () => {
      const provider = () => 'openai:gpt-4o';
      const result = extractProviderString(provider);
      // Functions are objects, no id property, so JSON.stringify returns undefined
      // Then String(undefined) => 'undefined'
      // But JSON.stringify on functions actually returns undefined, so the || kicks in
      // Actually: typeof function === 'function', not 'object', so it goes to the else
      // String(function) converts it to its source code string representation
      expect(result).toContain('openai:gpt-4o');
    });
  });

  describe('special object types', () => {
    it('handles Date object as provider', () => {
      const provider = new Date('2024-01-01');
      const result = extractProviderString(provider);
      // Date is an object, no id property, so JSON.stringify
      expect(result).toBe(JSON.stringify(provider));
    });

    it('handles RegExp object as provider', () => {
      const provider = /test/g;
      const result = extractProviderString(provider);
      expect(result).toBe(JSON.stringify(provider));
    });

    it('handles Error object as provider', () => {
      const provider = new Error('test error');
      const result = extractProviderString(provider);
      expect(result).toBe(JSON.stringify(provider));
    });
  });

  describe('malformed providers', () => {
    it('handles object with only whitespace id', () => {
      const provider = { id: '   ', config: {} };
      const result = extractProviderString(provider);
      // Whitespace string is truthy
      expect(result).toBe('   ');
    });

    it('handles object with id set to object', () => {
      const provider = { id: { nested: 'value' }, config: {} };
      const result = extractProviderString(provider);
      // Object id is truthy, returned as-is
      expect(result).toEqual({ nested: 'value' });
    });

    it('handles object with id set to array', () => {
      const provider = { id: ['test'], config: {} };
      const result = extractProviderString(provider);
      expect(result).toEqual(['test']);
    });

    it('handles very large object', () => {
      const provider: any = { id: null };
      // Create a large object
      for (let i = 0; i < 100; i++) {
        provider[`key${i}`] = `value${i}`;
      }
      const result = extractProviderString(provider);
      expect(result).toBe(JSON.stringify(provider));
      expect(result.length).toBeGreaterThan(100);
    });
  });
});
