import { describe, expect, it } from 'vitest';
import { filterPrompts } from '../../../src/commands/eval/filterPrompts';

import type { Prompt } from '../../../src/types/prompts';

describe('filterPrompts', () => {
  const mockPrompts: Prompt[] = [
    {
      label: 'Helpful Assistant',
      raw: 'You are a helpful assistant.',
      id: 'helpful-assistant',
    },
    {
      label: 'Code Expert',
      raw: 'You are a code expert.',
      id: 'code-expert',
    },
    {
      label: 'Travel Planner',
      raw: 'You are a travel planner.',
      id: 'travel-planner',
    },
    {
      label: 'No ID Prompt',
      raw: 'A prompt without an explicit id.',
      // No id field
    },
  ];

  it('should return all prompts if no filter is provided', () => {
    const result = filterPrompts(mockPrompts);
    expect(result).toEqual(mockPrompts);
  });

  it('should return all prompts if filter is undefined', () => {
    const result = filterPrompts(mockPrompts, undefined);
    expect(result).toEqual(mockPrompts);
  });

  it('should return all prompts if filter is empty string', () => {
    // Empty string regex matches everything
    const result = filterPrompts(mockPrompts, '');
    expect(result).toEqual(mockPrompts);
  });

  it('should filter prompts by label', () => {
    const result = filterPrompts(mockPrompts, 'Assistant');
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Helpful Assistant');
  });

  it('should filter prompts by id', () => {
    const result = filterPrompts(mockPrompts, 'code-expert');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('code-expert');
  });

  it('should filter prompts by partial label match', () => {
    const result = filterPrompts(mockPrompts, 'Expert');
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Code Expert');
  });

  it('should filter prompts by partial id match', () => {
    const result = filterPrompts(mockPrompts, 'travel');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('travel-planner');
  });

  it('should handle regex patterns', () => {
    const result = filterPrompts(mockPrompts, '(Assistant|Expert)');
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.label)).toEqual(['Helpful Assistant', 'Code Expert']);
  });

  it('should return empty array if no prompts match', () => {
    const result = filterPrompts(mockPrompts, 'nonexistent');
    expect(result).toHaveLength(0);
  });

  it('should handle prompts without id field', () => {
    const result = filterPrompts(mockPrompts, 'No ID');
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('No ID Prompt');
  });

  it('should handle case sensitivity', () => {
    // Default regex is case-sensitive
    const resultLower = filterPrompts(mockPrompts, 'helpful');
    expect(resultLower).toHaveLength(1); // matches id 'helpful-assistant'

    const resultUpper = filterPrompts(mockPrompts, 'Helpful');
    expect(resultUpper).toHaveLength(1); // matches label 'Helpful Assistant'
  });

  it('should support word boundary regex patterns', () => {
    const result = filterPrompts(mockPrompts, '\\bCode\\b');
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Code Expert');
  });

  it('should support case-insensitive flag', () => {
    // Without flag - case sensitive, no match for lowercase
    const resultSensitive = filterPrompts(mockPrompts, 'helpful assistant');
    expect(resultSensitive).toHaveLength(0);

    // With 'i' flag - case insensitive, matches
    const resultInsensitive = filterPrompts(mockPrompts, 'helpful assistant', 'i');
    expect(resultInsensitive).toHaveLength(1);
    expect(resultInsensitive[0].label).toBe('Helpful Assistant');
  });

  it('should match either label or id', () => {
    // This pattern matches 'travel' in id and 'Helpful' in label
    const result = filterPrompts(mockPrompts, '(travel|Helpful)');
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.label).sort()).toEqual(['Helpful Assistant', 'Travel Planner']);
  });

  it('should handle empty prompts array', () => {
    const result = filterPrompts([], 'anything');
    expect(result).toEqual([]);
  });

  it('should handle complex regex patterns', () => {
    const result = filterPrompts(mockPrompts, '^Code');
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Code Expert');
  });

  it('should match prompts with hyphenated ids', () => {
    const result = filterPrompts(mockPrompts, '-expert$');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('code-expert');
  });

  it('should filter multiple prompts with similar labels', () => {
    const promptsWithSimilarLabels: Prompt[] = [
      { label: 'Dev Prompt v1', raw: 'v1', id: 'dev-v1' },
      { label: 'Dev Prompt v2', raw: 'v2', id: 'dev-v2' },
      { label: 'Prod Prompt', raw: 'prod', id: 'prod' },
    ];
    const result = filterPrompts(promptsWithSimilarLabels, 'Dev');
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.id)).toEqual(['dev-v1', 'dev-v2']);
  });
});
