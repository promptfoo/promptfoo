/**
 * Tests for inject variable prompt extraction logic in ResultsTable
 * Lines 691-707 in ResultsTable.tsx
 *
 * Tests the cell rendering logic that uses getActualPrompt to display
 * provider-reported prompts or redteam final prompts in inject variable cells.
 */

import { getActualPrompt } from '@app/utils/providerResponse';
import { describe, expect, it } from 'vitest';

/**
 * Simulates the inject variable cell rendering logic from ResultsTable
 * This mirrors lines 696-707 in ResultsTable.tsx
 */
function getCellValueForInjectVar(
  originalValue: string,
  outputs: Array<{ response?: any; metadata?: any }> | undefined,
): string {
  if (!outputs) {
    return originalValue;
  }

  // Check all outputs to find one with provider-reported prompt or redteamFinalPrompt
  for (const output of outputs) {
    const actualPrompt = getActualPrompt(output?.response);
    if (actualPrompt) {
      return actualPrompt;
    }
  }

  return originalValue;
}

describe('ResultsTable inject variable cell rendering', () => {
  describe('with provider-reported prompt', () => {
    it('should use provider-reported string prompt from first output', () => {
      const originalValue = '{{topic}}';
      const outputs = [
        {
          response: {
            prompt: 'Dynamic prompt with persona and context',
          },
        },
      ];

      const result = getCellValueForInjectVar(originalValue, outputs);
      expect(result).toBe('Dynamic prompt with persona and context');
    });

    it('should use provider-reported chat message array prompt', () => {
      const originalValue = '{{topic}}';
      const outputs = [
        {
          response: {
            prompt: [
              { role: 'system', content: 'You are a helpful assistant' },
              { role: 'user', content: 'Hello world' },
            ],
          },
        },
      ];

      const result = getCellValueForInjectVar(originalValue, outputs);
      expect(result).toContain('system');
      expect(result).toContain('You are a helpful assistant');
      expect(result).toContain('user');
      expect(result).toContain('Hello world');
      expect(result).toBe(
        '[{"role":"system","content":"You are a helpful assistant"},{"role":"user","content":"Hello world"}]',
      );
    });

    it('should prioritize provider prompt over redteamFinalPrompt', () => {
      const originalValue = '{{topic}}';
      const outputs = [
        {
          response: {
            prompt: 'Provider-reported prompt',
            metadata: {
              redteamFinalPrompt: 'Legacy red team prompt',
            },
          },
        },
      ];

      const result = getCellValueForInjectVar(originalValue, outputs);
      expect(result).toBe('Provider-reported prompt');
    });
  });

  describe('with legacy redteamFinalPrompt', () => {
    it('should fall back to redteamFinalPrompt when no provider prompt', () => {
      const originalValue = '{{topic}}';
      const outputs = [
        {
          response: {
            metadata: {
              redteamFinalPrompt: 'Legacy red team injected prompt',
            },
          },
        },
      ];

      const result = getCellValueForInjectVar(originalValue, outputs);
      expect(result).toBe('Legacy red team injected prompt');
    });

    it('should use redteamFinalPrompt from nested metadata', () => {
      const originalValue = '{{topic}}';
      const outputs = [
        {
          metadata: {
            redteamFinalPrompt: 'Red team prompt in output metadata',
          },
        },
      ];

      const result = getCellValueForInjectVar(originalValue, outputs);
      // getActualPrompt expects response.metadata, not output.metadata
      // So this should return original value
      expect(result).toBe(originalValue);
    });
  });

  describe('with multiple outputs', () => {
    it('should use prompt from first output with provider prompt', () => {
      const originalValue = '{{topic}}';
      const outputs = [
        {
          response: {},
        },
        {
          response: {
            prompt: 'Second output prompt',
          },
        },
        {
          response: {
            prompt: 'Third output prompt',
          },
        },
      ];

      const result = getCellValueForInjectVar(originalValue, outputs);
      expect(result).toBe('Second output prompt');
    });

    it('should skip outputs without prompts and find first valid one', () => {
      const originalValue = '{{topic}}';
      const outputs = [
        { response: {} },
        { response: { output: 'some output' } },
        {
          response: {
            metadata: {
              redteamFinalPrompt: 'Found red team prompt',
            },
          },
        },
      ];

      const result = getCellValueForInjectVar(originalValue, outputs);
      expect(result).toBe('Found red team prompt');
    });

    it('should handle mixed prompt types across outputs', () => {
      const originalValue = '{{topic}}';
      const outputs = [
        {
          response: {
            metadata: {
              redteamFinalPrompt: 'Legacy prompt',
            },
          },
        },
        {
          response: {
            prompt: 'Provider prompt (should not be used)',
          },
        },
      ];

      const result = getCellValueForInjectVar(originalValue, outputs);
      // First output has redteamFinalPrompt, should use that
      expect(result).toBe('Legacy prompt');
    });
  });

  describe('edge cases', () => {
    it('should return original value when no outputs', () => {
      const originalValue = '{{topic}}';
      const outputs = undefined;

      const result = getCellValueForInjectVar(originalValue, outputs);
      expect(result).toBe('{{topic}}');
    });

    it('should return original value when outputs is empty array', () => {
      const originalValue = '{{topic}}';
      const outputs: any[] = [];

      const result = getCellValueForInjectVar(originalValue, outputs);
      expect(result).toBe('{{topic}}');
    });

    it('should return original value when no output has prompt', () => {
      const originalValue = '{{topic}}';
      const outputs = [
        { response: { output: 'just output' } },
        { response: { metadata: {} } },
        { response: {} },
      ];

      const result = getCellValueForInjectVar(originalValue, outputs);
      expect(result).toBe('{{topic}}');
    });

    it('should handle undefined response in output', () => {
      const originalValue = '{{topic}}';
      const outputs = [
        { response: undefined },
        {
          response: {
            prompt: 'Valid prompt',
          },
        },
      ];

      const result = getCellValueForInjectVar(originalValue, outputs);
      expect(result).toBe('Valid prompt');
    });

    it('should handle null response in output', () => {
      const originalValue = '{{topic}}';
      const outputs = [
        { response: null },
        {
          response: {
            metadata: {
              redteamFinalPrompt: 'Valid red team prompt',
            },
          },
        },
      ];

      const result = getCellValueForInjectVar(originalValue, outputs);
      expect(result).toBe('Valid red team prompt');
    });

    it('should handle empty string provider prompt as no prompt', () => {
      const originalValue = '{{topic}}';
      const outputs = [
        {
          response: {
            prompt: '',
          },
        },
        {
          response: {
            metadata: {
              redteamFinalPrompt: 'Fallback prompt',
            },
          },
        },
      ];

      const result = getCellValueForInjectVar(originalValue, outputs);
      // Empty string prompt is treated as undefined by getActualPrompt
      expect(result).toBe('Fallback prompt');
    });

    it('should handle empty array provider prompt as no prompt', () => {
      const originalValue = '{{topic}}';
      const outputs = [
        {
          response: {
            prompt: [],
          },
        },
        {
          response: {
            metadata: {
              redteamFinalPrompt: 'Fallback prompt',
            },
          },
        },
      ];

      const result = getCellValueForInjectVar(originalValue, outputs);
      // Empty array is treated as undefined by getActualPrompt
      expect(result).toBe('Fallback prompt');
    });
  });

  describe('integration with getActualPrompt', () => {
    it('should correctly use getActualPrompt priority chain', () => {
      const testCases = [
        {
          description: 'provider prompt takes precedence',
          output: {
            response: {
              prompt: 'provider',
              metadata: { redteamFinalPrompt: 'redteam' },
            },
          },
          expected: 'provider',
        },
        {
          description: 'falls back to redteamFinalPrompt',
          output: {
            response: {
              metadata: { redteamFinalPrompt: 'redteam' },
            },
          },
          expected: 'redteam',
        },
        {
          description: 'returns undefined when neither present',
          output: {
            response: {
              metadata: {},
            },
          },
          expected: '{{original}}',
        },
      ];

      for (const testCase of testCases) {
        const result = getCellValueForInjectVar('{{original}}', [testCase.output]);
        expect(result).toBe(testCase.expected);
      }
    });
  });
});
