import './setup';

import fs from 'fs';
import os from 'os';
import path from 'path';

import { globSync } from 'glob';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatVarsForDisplay,
  generateVarCombinations,
  isAllowedPrompt,
} from '../../src/evaluator';
import { type Prompt } from '../../src/types/index';
import { ConfigResolutionError } from '../../src/util/config/load';

const tempDirs: string[] = [];

function createTempValuesFile(
  fileName: string,
  contents: string,
): {
  basePath: string;
  filePath: string;
} {
  const basePath = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-var-values-'));
  tempDirs.push(basePath);
  const filePath = path.join(basePath, fileName);
  fs.writeFileSync(filePath, contents);
  return { basePath, filePath };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('generateVarCombinations', () => {
  it('should generate combinations for simple variables', () => {
    const vars = { language: 'English', greeting: 'Hello' };
    const expected = [{ language: 'English', greeting: 'Hello' }];
    expect(generateVarCombinations(vars)).toEqual(expected);
  });

  it('should generate combinations for array variables', () => {
    const vars = { language: ['English', 'French'], greeting: 'Hello' };
    const expected = [
      { language: 'English', greeting: 'Hello' },
      { language: 'French', greeting: 'Hello' },
    ];
    expect(generateVarCombinations(vars)).toEqual(expected);
  });

  it('should handle file paths and expand them into combinations', () => {
    const vars = { language: 'English', greeting: 'file:///path/to/greetings/*.txt' };
    vi.mocked(globSync).mockReturnValue(['greeting1.txt', 'greeting2.txt']);
    const expected = [
      { language: 'English', greeting: 'file://greeting1.txt' },
      { language: 'English', greeting: 'file://greeting2.txt' },
    ];
    expect(generateVarCombinations(vars)).toEqual(expected);
  });

  it('should load matrix values from a relative YAML file', () => {
    const { basePath } = createTempValuesFile('languages.yaml', '- English\n- French\n- Spanish\n');

    expect(
      generateVarCombinations({ language: { $values: 'file://languages.yaml' } }, basePath),
    ).toEqual([{ language: 'English' }, { language: 'French' }, { language: 'Spanish' }]);
  });

  it('should load matrix values from an absolute file URL', () => {
    const { filePath } = createTempValuesFile('languages.yaml', '- English\n- French\n');
    const fileUrl =
      process.platform === 'win32'
        ? `file:///${filePath.replace(/\\/g, '/')}`
        : `file://${filePath}`;

    expect(generateVarCombinations({ language: { $values: fileUrl } })).toEqual([
      { language: 'English' },
      { language: 'French' },
    ]);
  });

  it('should flatten multiple value files alongside direct matrix values', () => {
    const { basePath } = createTempValuesFile('primary.yaml', '- English\n- French\n');
    fs.writeFileSync(path.join(basePath, 'secondary.json'), JSON.stringify(['Spanish', 'German']));

    expect(
      generateVarCombinations(
        {
          language: [
            { $values: 'file://primary.yaml' },
            'Klingon',
            { $values: 'file://secondary.json' },
          ],
        },
        basePath,
      ),
    ).toEqual([
      { language: 'English' },
      { language: 'French' },
      { language: 'Klingon' },
      { language: 'Spanish' },
      { language: 'German' },
    ]);
  });

  it('should cache each values file for an eval snapshot', () => {
    const { basePath } = createTempValuesFile('languages.yaml', '- English\n- French\n');
    const readFileSpy = vi.spyOn(fs, 'readFileSync');
    const cache = new Map();

    generateVarCombinations({ language: { $values: 'file://languages.yaml' } }, basePath, cache);
    generateVarCombinations({ language: { $values: 'file://languages.yaml' } }, basePath, cache);

    expect(readFileSpy).toHaveBeenCalledTimes(1);
  });

  it('should preserve object values loaded from a matrix values file', () => {
    const { basePath } = createTempValuesFile(
      'users.yaml',
      '- name: Alice\n  role: admin\n- name: Bob\n  role: viewer\n',
    );

    expect(generateVarCombinations({ user: { $values: 'file://users.yaml' } }, basePath)).toEqual([
      { user: { name: 'Alice', role: 'admin' } },
      { user: { name: 'Bob', role: 'viewer' } },
    ]);
  });

  it('should reject value files without a top-level array', () => {
    const { basePath, filePath } = createTempValuesFile('languages.yaml', 'language: English\n');

    expect(() =>
      generateVarCombinations({ language: { $values: 'file://languages.yaml' } }, basePath),
    ).toThrow(`must contain a top-level array: ${filePath}`);
  });

  it('should report errors when a values file cannot be loaded', () => {
    const { basePath } = createTempValuesFile('existing.yaml', '- English\n');

    const loadMissingFile = () =>
      generateVarCombinations({ language: { $values: 'file://missing.yaml' } }, basePath);

    expect(loadMissingFile).toThrow(ConfigResolutionError);
    expect(loadMissingFile).toThrow('Failed to load $values for variable "language"');
  });

  it('should reject invalid entries in a values file', () => {
    const { basePath, filePath } = createTempValuesFile('languages.yaml', '- English\n- null\n');

    expect(() =>
      generateVarCombinations({ language: { $values: 'file://languages.yaml' } }, basePath),
    ).toThrow(`contains an invalid value at index 1: ${filePath}`);
  });

  it('should reject malformed $values references', () => {
    const loadMalformedReference = () =>
      generateVarCombinations({ language: [{ $values: 'languages.yaml' }] });

    expect(loadMalformedReference).toThrow(ConfigResolutionError);
    expect(loadMalformedReference).toThrow('Expected { $values: "file://path/to/values.yaml" }');
  });

  it('should correctly handle nested array variables', () => {
    const vars = {
      options: [
        ['opt1', 'opt2'],
        ['opt3', 'opt4'],
      ],
    };
    const expected = [
      {
        options: [
          ['opt1', 'opt2'],
          ['opt3', 'opt4'],
        ],
      },
    ];
    expect(generateVarCombinations(vars)).toEqual(expected);
  });

  it('should return an empty array for empty input', () => {
    const vars = {};
    const expected = [{}];
    expect(generateVarCombinations(vars)).toEqual(expected);
  });
});

describe('isAllowedPrompt', () => {
  const prompt1: Prompt = {
    label: 'prompt1',
    raw: '',
  };
  const prompt2: Prompt = {
    label: 'group1:prompt2',
    raw: '',
  };
  const prompt3: Prompt = {
    label: 'group2:prompt3',
    raw: '',
  };

  it('should return true if allowedPrompts is undefined', () => {
    expect(isAllowedPrompt(prompt1, undefined)).toBe(true);
  });

  it('should return true if allowedPrompts includes the prompt label', () => {
    expect(isAllowedPrompt(prompt1, ['prompt1', 'prompt2'])).toBe(true);
  });

  it('should return true if allowedPrompts includes a label that matches the start of the prompt label followed by a colon', () => {
    expect(isAllowedPrompt(prompt2, ['group1'])).toBe(true);
  });

  it('should return true if allowedPrompts includes a wildcard prefix', () => {
    expect(isAllowedPrompt(prompt2, ['group1:*'])).toBe(true);
  });

  it('should return false if a wildcard prefix does not match the prompt label', () => {
    expect(isAllowedPrompt(prompt3, ['group1:*'])).toBe(false);
  });

  it('should return false if allowedPrompts does not include the prompt label or any matching start label with a colon', () => {
    expect(isAllowedPrompt(prompt3, ['group1', 'prompt2'])).toBe(false);
  });

  it('should return false if allowedPrompts is an empty array', () => {
    expect(isAllowedPrompt(prompt1, [])).toBe(false);
  });
});

describe('formatVarsForDisplay', () => {
  it('should return empty string for empty or undefined vars', () => {
    expect(formatVarsForDisplay({}, 50)).toBe('');
    expect(formatVarsForDisplay(undefined, 50)).toBe('');
    expect(formatVarsForDisplay(null as any, 50)).toBe('');
  });

  it('should format simple variables correctly', () => {
    const vars = { name: 'John', age: 25, city: 'NYC' };
    const result = formatVarsForDisplay(vars, 50);

    expect(result).toBe('name=John age=25 city=NYC');
  });

  it('should handle different variable types', () => {
    const vars = {
      string: 'hello',
      number: 42,
      boolean: true,
      nullValue: null,
      undefinedValue: undefined,
      object: { nested: 'value' },
      array: [1, 2, 3],
    };

    const result = formatVarsForDisplay(vars, 200);

    expect(result).toContain('string=hello');
    expect(result).toContain('number=42');
    expect(result).toContain('boolean=true');
    expect(result).toContain('nullValue=null');
    expect(result).toContain('undefinedValue=undefined');
    expect(result).toContain('object=[object Object]');
    expect(result).toContain('array=1,2,3');
  });

  it('should truncate individual values to prevent memory issues', () => {
    const bigValue = 'x'.repeat(200);
    const vars = { bigVar: bigValue };

    const result = formatVarsForDisplay(vars, 200);

    // Should truncate the value to 100 chars
    expect(result).toBe(`bigVar=${'x'.repeat(100)}`);
    expect(result.length).toBeLessThanOrEqual(200);
  });

  it('should handle extremely large vars without crashing', () => {
    // This would have caused RangeError before the fix
    const megaString = 'x'.repeat(500 * 1024); // 500KB string (reduced from 5MB to prevent SIGSEGV on macOS/Node24)
    const vars = {
      mega1: megaString,
      mega2: megaString,
      small: 'normal',
    };

    expect(() => formatVarsForDisplay(vars, 50)).not.toThrow();

    const result = formatVarsForDisplay(vars, 50);
    expect(typeof result).toBe('string');
    expect(result.length).toBeLessThanOrEqual(50);
  });

  it('should truncate final result to maxLength', () => {
    const vars = {
      var1: 'value1',
      var2: 'value2',
      var3: 'value3',
      var4: 'value4',
    };

    const result = formatVarsForDisplay(vars, 20);

    expect(result.length).toBeLessThanOrEqual(20);
    expect(result).toBe('var1=value1 var2=val');
  });

  it('should replace newlines with spaces', () => {
    const vars = {
      multiline: 'line1\nline2\nline3',
    };

    const result = formatVarsForDisplay(vars, 100);

    expect(result).toBe('multiline=line1 line2 line3');
    expect(result).not.toContain('\n');
  });

  it('should return fallback message on any error', () => {
    // Create a problematic object that might throw during String() conversion
    const problematicVars = {
      badProp: {
        toString() {
          throw new Error('Cannot convert to string');
        },
      },
    };

    const result = formatVarsForDisplay(problematicVars, 50);

    expect(result).toBe('[vars unavailable]');
  });

  it('should handle multiple variables with space distribution', () => {
    const vars = {
      a: 'short',
      b: 'medium_value',
      c: 'a_very_long_value_that_exceeds_normal_length',
    };

    const result = formatVarsForDisplay(vars, 30);

    expect(result.length).toBeLessThanOrEqual(30);
    expect(result).toContain('a=short');
    // Should fit as much as possible within the limit
  });
});
