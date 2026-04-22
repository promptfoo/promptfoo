import { describe, expect, it } from 'vitest';
import { generateIdFromPrompt } from '../../src/models/prompt';
import { sha256 } from '../../src/util/createHash';

describe('generateIdFromPrompt', () => {
  describe('priority order', () => {
    it('uses label when provided (highest priority)', () => {
      const result = generateIdFromPrompt({
        id: 'my-id',
        label: 'My Label',
        raw: 'My raw prompt',
      });
      expect(result).toBe(sha256('My Label'));
    });

    it('uses id when label is empty string', () => {
      const result = generateIdFromPrompt({
        id: 'my-id',
        label: '',
        raw: 'My raw prompt',
      });
      expect(result).toBe(sha256('my-id'));
    });

    it('uses id when label is undefined', () => {
      const result = generateIdFromPrompt({
        id: 'my-id',
        label: undefined,
        raw: 'My raw prompt',
      });
      expect(result).toBe(sha256('my-id'));
    });

    it('uses id when label is not provided', () => {
      const result = generateIdFromPrompt({
        id: 'my-id',
        raw: 'My raw prompt',
      });
      expect(result).toBe(sha256('my-id'));
    });

    it('falls back to raw when both label and id are empty', () => {
      const result = generateIdFromPrompt({
        id: '',
        label: '',
        raw: 'My raw prompt',
      });
      expect(result).toBe(sha256('My raw prompt'));
    });

    it('falls back to raw when both label and id are undefined', () => {
      const result = generateIdFromPrompt({
        raw: 'My raw prompt',
      });
      expect(result).toBe(sha256('My raw prompt'));
    });
  });

  describe('raw content handling', () => {
    it('hashes string raw content directly', () => {
      const result = generateIdFromPrompt({
        raw: 'Simple string prompt',
      });
      expect(result).toBe(sha256('Simple string prompt'));
    });

    it('stringifies object raw content before hashing', () => {
      const rawObject = { role: 'user', content: 'Hello' };
      const result = generateIdFromPrompt({
        raw: rawObject,
      });
      expect(result).toBe(sha256(JSON.stringify(rawObject)));
    });

    it('stringifies array raw content before hashing', () => {
      const rawArray = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
      ];
      const result = generateIdFromPrompt({
        raw: rawArray,
      });
      expect(result).toBe(sha256(JSON.stringify(rawArray)));
    });

    it('handles empty string raw content', () => {
      const result = generateIdFromPrompt({
        raw: '',
      });
      expect(result).toBe(sha256(''));
    });

    it('handles empty object raw content', () => {
      const result = generateIdFromPrompt({
        raw: {},
      });
      expect(result).toBe(sha256('{}'));
    });
  });

  describe('edge cases', () => {
    it('treats whitespace-only label as truthy', () => {
      const result = generateIdFromPrompt({
        id: 'my-id',
        label: '   ',
        raw: 'My raw prompt',
      });
      expect(result).toBe(sha256('   '));
    });

    it('treats whitespace-only id as truthy', () => {
      const result = generateIdFromPrompt({
        id: '   ',
        label: '',
        raw: 'My raw prompt',
      });
      expect(result).toBe(sha256('   '));
    });

    it('produces consistent hashes for same input', () => {
      const prompt = { label: 'Test', raw: 'Content' };
      const result1 = generateIdFromPrompt(prompt);
      const result2 = generateIdFromPrompt(prompt);
      expect(result1).toBe(result2);
    });

    it('produces different hashes for different labels', () => {
      const result1 = generateIdFromPrompt({ label: 'Label A', raw: 'Same content' });
      const result2 = generateIdFromPrompt({ label: 'Label B', raw: 'Same content' });
      expect(result1).not.toBe(result2);
    });

    it('produces different hashes for different raw content', () => {
      const result1 = generateIdFromPrompt({ raw: 'Content A' });
      const result2 = generateIdFromPrompt({ raw: 'Content B' });
      expect(result1).not.toBe(result2);
    });
  });

  describe('real-world scenarios', () => {
    it('handles prompt with all properties', () => {
      const result = generateIdFromPrompt({
        id: 'prompt-123',
        label: 'Customer Support Prompt',
        raw: 'You are a helpful customer support agent. Answer: {{question}}',
      });
      expect(result).toBe(sha256('Customer Support Prompt'));
    });

    it('handles prompt with only id and raw (common case)', () => {
      const result = generateIdFromPrompt({
        id: 'prompt-123',
        raw: 'Answer the question: {{question}}',
      });
      expect(result).toBe(sha256('prompt-123'));
    });

    it('handles prompt with template variables in raw', () => {
      const result = generateIdFromPrompt({
        raw: 'Translate {{text}} to {{language}}',
      });
      expect(result).toBe(sha256('Translate {{text}} to {{language}}'));
    });

    it('handles prompt with multiline raw content', () => {
      const multilineRaw = `You are a helpful assistant.

Please answer the following question:
{{question}}

Be concise and accurate.`;
      const result = generateIdFromPrompt({ raw: multilineRaw });
      expect(result).toBe(sha256(multilineRaw));
    });

    it('handles JSON-structured prompt', () => {
      const jsonPrompt = {
        raw: {
          messages: [
            { role: 'system', content: 'You are helpful' },
            { role: 'user', content: '{{input}}' },
          ],
        },
      };
      const result = generateIdFromPrompt(jsonPrompt);
      expect(result).toBe(sha256(JSON.stringify(jsonPrompt.raw)));
    });
  });
});
