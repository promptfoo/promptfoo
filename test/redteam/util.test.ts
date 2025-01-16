import { removePrefix } from '../../src/redteam/util';

describe('removePrefix', () => {
  it('should remove a simple prefix', () => {
    expect(removePrefix('Prompt: Hello world', 'Prompt')).toBe('Hello world');
  });

  it('should be case insensitive', () => {
    expect(removePrefix('PROMPT: Hello world', 'prompt')).toBe('Hello world');
  });

  it('should remove asterisks from the prefix', () => {
    expect(removePrefix('**Prompt:** Hello world', 'Prompt')).toBe('Hello world');
  });

  it('should handle multiple asterisks', () => {
    expect(removePrefix('***Prompt:*** Hello world', 'Prompt')).toBe('Hello world');
  });

  it('should return the same string if prefix is not found', () => {
    expect(removePrefix('Hello world', 'Prefix')).toBe('Hello world');
  });

  it('should handle empty strings', () => {
    expect(removePrefix('', 'Prefix')).toBe('');
  });

  it('should handle prefix that is the entire string', () => {
    expect(removePrefix('Prompt:', 'Prompt')).toBe('');
  });
});
