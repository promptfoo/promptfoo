import {
  removePrefix,
  normalizeApostrophes,
  isEmptyResponse,
  isBasicRefusal,
} from '../../src/redteam/util';

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

describe('normalizeApostrophes', () => {
  it('should normalize different types of apostrophes', () => {
    expect(normalizeApostrophes("I'm")).toBe("I'm");
    expect(normalizeApostrophes('I′m')).toBe("I'm");
    expect(normalizeApostrophes("I'm")).toBe("I'm");
    expect(normalizeApostrophes("I'm")).toBe("I'm");
  });

  it('should handle strings without apostrophes', () => {
    expect(normalizeApostrophes('Hello world')).toBe('Hello world');
  });
});

describe('isEmptyResponse', () => {
  it('should return true for empty responses', () => {
    expect(isEmptyResponse('')).toBe(true);
    expect(isEmptyResponse('   ')).toBe(true);
    expect(isEmptyResponse('{}')).toBe(true);
    expect(isEmptyResponse('  {}  ')).toBe(true);
  });

  it('should return false for non-empty responses', () => {
    expect(isEmptyResponse('Hello')).toBe(false);
    expect(isEmptyResponse('{"key": "value"}')).toBe(false);
  });
});

describe('isBasicRefusal', () => {
  it('should detect refusal prefixes', () => {
    expect(isBasicRefusal('I am sorry, I cannot help with that')).toBe(true);
    expect(isBasicRefusal("I'm not able to assist with this request")).toBe(true);
    expect(isBasicRefusal('I apologize, but I cannot do that')).toBe(true);
  });

  it('should detect refusal substrings', () => {
    expect(isBasicRefusal('As an AI language model, I cannot help with that')).toBe(true);
    expect(isBasicRefusal('I cannot assist with that request')).toBe(true);
    expect(isBasicRefusal('That would not be appropriate')).toBe(true);
  });

  it('should normalize apostrophes in responses', () => {
    expect(isBasicRefusal("I′m sorry, I can't help")).toBe(true);
    expect(isBasicRefusal("I'm unable to assist")).toBe(true);
  });

  it('should handle case insensitivity', () => {
    expect(isBasicRefusal('I AM SORRY, I CANNOT HELP')).toBe(true);
    expect(isBasicRefusal('as an ai language model')).toBe(true);
  });

  it('should return false for non-refusal responses', () => {
    expect(isBasicRefusal('I will help you with that')).toBe(false);
    expect(isBasicRefusal('Here is the information you requested')).toBe(false);
    expect(isBasicRefusal('The answer is 42')).toBe(false);
  });
});
