import { describe, expect, it } from 'vitest';
import { filterPrompts } from '../../../src/commands/eval/filterPrompts';

import type { Prompt } from '../../../src/types/index';

describe('filterPrompts', () => {
  const mockPrompts: Prompt[] = [
    {
      id: 'prompt-1',
      raw: 'Hello {{name}}',
      label: 'Greeting Prompt',
    },
    {
      id: 'prompt-2',
      raw: 'Goodbye {{name}}',
      label: 'Farewell Prompt',
    },
    {
      id: 'prompt-3',
      raw: 'How are you?',
      label: 'Question Prompt',
    },
    {
      id: 'prompt-4',
      raw: 'System message',
      label: 'System:Admin',
    },
    {
      id: 'prompt-5',
      raw: 'No label here',
      label: '', // Empty label
    },
  ];

  it('should return all prompts if no filter is provided', () => {
    const result = filterPrompts(mockPrompts);
    expect(result).toEqual(mockPrompts);
  });

  it('should filter prompts by exact label match', () => {
    const result = filterPrompts(mockPrompts, 'Greeting Prompt');
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Greeting Prompt');
  });

  it('should filter prompts by partial label match', () => {
    const result = filterPrompts(mockPrompts, 'Prompt');
    expect(result).toHaveLength(3);
    expect(result.map((p) => p.label)).toEqual([
      'Greeting Prompt',
      'Farewell Prompt',
      'Question Prompt',
    ]);
  });

  it('should filter prompts by id', () => {
    const result = filterPrompts(mockPrompts, 'prompt-1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('prompt-1');
  });

  it('should filter prompts by id pattern', () => {
    const result = filterPrompts(mockPrompts, 'prompt-[12]');
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.id)).toEqual(['prompt-1', 'prompt-2']);
  });

  it('should match on either id or label', () => {
    const mixedPrompts: Prompt[] = [
      { id: 'greeting-v1', raw: 'Hello', label: 'Greeting' },
      { id: 'farewell-v1', raw: 'Goodbye', label: 'Farewell' },
    ];
    const result1 = filterPrompts(mixedPrompts, 'v1');
    expect(result1).toHaveLength(2);
    const result2 = filterPrompts(mixedPrompts, 'Greeting');
    expect(result2).toHaveLength(1);
    expect(result2[0].label).toBe('Greeting');
  });

  it('should handle regex patterns', () => {
    const result = filterPrompts(mockPrompts, '(Greeting|Farewell)');
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.label)).toEqual(['Greeting Prompt', 'Farewell Prompt']);
  });

  it('should handle case-sensitive regex', () => {
    const result = filterPrompts(mockPrompts, 'greeting');
    expect(result).toHaveLength(0);
  });

  it('should handle case-sensitive matching (default behavior)', () => {
    // JavaScript RegExp is case-sensitive by default
    // Users can use [Gg] or similar patterns for case-insensitive matching
    const result = filterPrompts(mockPrompts, '[Gg]reeting');
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Greeting Prompt');
  });

  it('should return empty array if no prompts match filter', () => {
    const result = filterPrompts(mockPrompts, 'nonexistent');
    expect(result).toHaveLength(0);
  });

  it('should handle prompts with empty labels', () => {
    const result = filterPrompts(mockPrompts, 'prompt-');
    expect(result).toHaveLength(5);
  });

  it('should handle prompts without label property', () => {
    const promptsWithoutLabel: Prompt[] = [
      {
        id: 'test-1',
        raw: 'Test',
        label: 'Valid Label',
      },
      {
        id: 'test-2',
        raw: 'Test 2',
        label: undefined as any, // Simulate missing label
      },
    ];
    const result1 = filterPrompts(promptsWithoutLabel, 'Valid');
    expect(result1).toHaveLength(1);
    expect(result1[0].label).toBe('Valid Label');
    const result2 = filterPrompts(promptsWithoutLabel, 'test-');
    expect(result2).toHaveLength(2);
  });

  it('should handle special regex characters in labels', () => {
    const result = filterPrompts(mockPrompts, 'System:Admin');
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('System:Admin');
  });

  it('should handle complex regex patterns', () => {
    const result = filterPrompts(mockPrompts, '^(Greeting|Question).*');
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.label)).toEqual(['Greeting Prompt', 'Question Prompt']);
  });

  it('should handle empty prompts array', () => {
    const result = filterPrompts([], 'anything');
    expect(result).toEqual([]);
  });

  it('should throw on invalid regex', () => {
    expect(() => filterPrompts(mockPrompts, '[invalid')).toThrow();
  });

  it('should filter with word boundaries', () => {
    const result = filterPrompts(mockPrompts, '\\bPrompt\\b');
    expect(result).toHaveLength(3);
  });
});
