import { describe, expect, it, vi } from 'vitest';
import { hashPrompt, maybeFilePath, normalizeInput } from '../../src/prompts/utils';
import { sha256 } from '../../src/util/createHash';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    statSync: vi.fn(actual.statSync),
  };
});

vi.mock('glob', () => ({
  globSync: vi.fn(),
  hasMagic: vi.fn((pattern: string | string[]) => {
    const p = Array.isArray(pattern) ? pattern.join('') : pattern;
    return p.includes('*') || p.includes('?') || p.includes('[') || p.includes('{');
  }),
}));

describe('maybeFilePath', () => {
  it('should return true for valid file paths', () => {
    expect(maybeFilePath('C:\\path\\to\\file.txt')).toBe(true);
    expect(maybeFilePath('file.*')).toBe(true);
    expect(maybeFilePath('filename.ext')).toBe(true);
    expect(maybeFilePath('path/to/file.txt')).toBe(true);
  });

  it('should return false for strings with new lines', () => {
    expect(maybeFilePath('path/to\nfile.txt')).toBe(false);
    expect(maybeFilePath('file\nname.ext')).toBe(false);
  });

  it('should return false for strings with "portkey://"', () => {
    expect(maybeFilePath('portkey://path/to/file')).toBe(false);
  });

  it('should return false for strings with "langfuse://"', () => {
    expect(maybeFilePath('langfuse://path/to/file')).toBe(false);
  });

  it('should return false for strings with "helicone://"', () => {
    expect(maybeFilePath('helicone://path/to/file')).toBe(false);
  });

  it('should return false for strings without file path indicators', () => {
    expect(maybeFilePath('anotherstring')).toBe(false);
    expect(maybeFilePath('justastring')).toBe(false);
    expect(maybeFilePath('stringwith.dotbutnotfile')).toBe(false);
  });

  it('should return true for strings with file:// prefix', () => {
    expect(maybeFilePath('file://path/to/file.txt')).toBe(true);
  });

  it('should return true for strings with wildcard character', () => {
    expect(maybeFilePath('*.txt')).toBe(true);
    expect(maybeFilePath('path/to/*.txt')).toBe(true);
  });

  it('should return true for strings with file extension at the third or fourth last position', () => {
    expect(maybeFilePath('file.ext')).toBe(true);
    expect(maybeFilePath('file.name.ext')).toBe(true);
    expect(maybeFilePath('filename.e')).toBe(false);
    expect(maybeFilePath('filename.ex')).toBe(true);
  });

  it('should work for files that end with specific allowed extensions', () => {
    expect(maybeFilePath('filename.cjs')).toBe(true);
    expect(maybeFilePath('filename.js')).toBe(true);
    expect(maybeFilePath('filename.js:functionName')).toBe(true);
    expect(maybeFilePath('filename.j2')).toBe(true);
    expect(maybeFilePath('filename.json')).toBe(true);
    expect(maybeFilePath('filename.jsonl')).toBe(true);
    expect(maybeFilePath('filename.mjs')).toBe(true);
    expect(maybeFilePath('filename.py')).toBe(true);
    expect(maybeFilePath('filename.py:functionName')).toBe(true);
    expect(maybeFilePath('filename.txt')).toBe(true);
  });

  // Additional tests
  it('should return false for empty strings', () => {
    expect(maybeFilePath('')).toBe(false);
  });

  it('should return false for whitespace strings', () => {
    expect(maybeFilePath('   ')).toBe(false);
    expect(maybeFilePath('\t')).toBe(false);
  });

  it('should return false for non-string inputs', () => {
    expect(() => maybeFilePath(123 as never)).toThrow('Invalid input: 123');
    expect(() => maybeFilePath({} as never)).toThrow('Invalid input: {}');
    expect(() => maybeFilePath([] as never)).toThrow('Invalid input: []');
  });

  it('should return false for strings with invalid and valid indicators mixed', () => {
    expect(maybeFilePath('file://path/to\nfile.txt')).toBe(false);
    expect(maybeFilePath('path/to/file.txtportkey://')).toBe(false);
  });

  it('should return true for very long valid file paths', () => {
    const longPath = `${'a/'.repeat(100)}file.txt`;
    expect(maybeFilePath(longPath)).toBe(true);
  });

  it('should return false for very long invalid file paths', () => {
    const longInvalidPath = `${'a/'.repeat(100)}file\n.txt`;
    expect(maybeFilePath(longInvalidPath)).toBe(false);
  });

  it('should return false for strings ending with a dot', () => {
    expect(maybeFilePath('Write a tweet about {{topic}}.')).toBe(false);
  });

  it('should recognize Jinja2 template files', () => {
    expect(maybeFilePath('template.j2')).toBe(true);
    expect(maybeFilePath('path/to/template.j2')).toBe(true);
    expect(maybeFilePath('file://path/to/template.j2')).toBe(true);
    expect(maybeFilePath('*.j2')).toBe(true);
    expect(maybeFilePath('path/to/*.j2')).toBe(true);
    expect(maybeFilePath('template.j2:functionName')).toBe(true);
  });

  it('should return false for prompt strings resembling Jinja2 syntax', () => {
    expect(maybeFilePath('Hello {{ name }}! How are you?')).toBe(false);
    expect(maybeFilePath('{% if condition %}Content{% endif %}')).toBe(false);
    expect(maybeFilePath('{{ variable | filter }}')).toBe(false);
    expect(maybeFilePath('Text with {{ variable.attribute }} in it.')).toBe(false);
  });
});

describe('normalizeInput', () => {
  it('rejects invalid input types', () => {
    expect(() => normalizeInput(null as any)).toThrow('Invalid input prompt: null');
    expect(() => normalizeInput(undefined as any)).toThrow('Invalid input prompt: undefined');
    expect(() => normalizeInput(1 as any)).toThrow('Invalid input prompt: 1');
    expect(() => normalizeInput(true as any)).toThrow('Invalid input prompt: true');
    expect(() => normalizeInput(false as any)).toThrow('Invalid input prompt: false');
  });

  it('rejects empty inputs', () => {
    expect(() => normalizeInput([])).toThrow('Invalid input prompt: []');
    expect(() => normalizeInput({} as any)).toThrow('Invalid input prompt: {}');
    expect(() => normalizeInput('')).toThrow('Invalid input prompt: ""');
  });

  it('returns array with single string when input is a non-empty string', () => {
    expect(normalizeInput('valid string')).toEqual([{ raw: 'valid string' }]);
  });

  it('returns input array when input is a non-empty array', () => {
    const inputArray = ['prompt1', { raw: 'prompt2' }];
    expect(normalizeInput(inputArray)).toEqual([{ raw: 'prompt1' }, { raw: 'prompt2' }]);
  });

  // NOTE: Legacy mode. This is deprecated and will be removed in a future version.
  it('returns array of prompts when input is an object', () => {
    const inputObject = {
      'prompts1.txt': 'label A',
      'prompts2.txt': 'label B',
    };
    expect(normalizeInput(inputObject)).toEqual([
      {
        label: 'label A',
        raw: 'prompts1.txt',
      },
      {
        label: 'label B',
        raw: 'prompts2.txt',
      },
    ]);
  });
});

describe('hashPrompt', () => {
  describe('priority order', () => {
    it('uses label when provided (highest priority)', () => {
      expect(
        hashPrompt({
          id: 'prompt-id',
          label: 'Prompt Label',
          raw: 'Prompt Raw',
        }),
      ).toBe(sha256('Prompt Label'));
    });

    it('falls back to id when label is empty string', () => {
      expect(
        hashPrompt({
          id: 'prompt-id',
          label: '',
          raw: 'Prompt Raw',
        }),
      ).toBe(sha256('prompt-id'));
    });

    it('falls back to raw when both label and id are empty', () => {
      expect(
        hashPrompt({
          id: '',
          label: '',
          raw: 'Prompt Raw Content',
        }),
      ).toBe(sha256('Prompt Raw Content'));
    });

    it('falls back to raw when label and id are not provided', () => {
      expect(
        hashPrompt({
          label: '',
          raw: 'Only raw content',
        }),
      ).toBe(sha256('Only raw content'));
    });
  });

  describe('consistency with generateIdFromPrompt', () => {
    it('produces same result as generateIdFromPrompt', () => {
      const prompt = {
        id: 'test-id',
        label: 'Test Label',
        raw: 'Test Raw',
      };
      // Both functions should produce identical results
      expect(hashPrompt(prompt)).toBe(sha256('Test Label'));
    });
  });
});
