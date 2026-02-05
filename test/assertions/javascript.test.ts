import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../src/assertions/index';
import { buildFunctionBody } from '../../src/assertions/javascript';
import { importModule } from '../../src/esm';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { isPackagePath, loadFromPackage } from '../../src/providers/packageParser';

import type { Assertion, AtomicTestCase, GradingResult } from '../../src/types/index';

vi.mock('../../src/redteam/remoteGeneration', () => ({
  shouldGenerateRemote: vi.fn().mockReturnValue(false),
}));

vi.mock('proxy-agent', () => ({
  ProxyAgent: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('node:module', () => {
  const mockRequire: NodeJS.Require = {
    resolve: vi.fn() as unknown as NodeJS.RequireResolve,
  } as unknown as NodeJS.Require;
  return {
    createRequire: vi.fn().mockReturnValue(mockRequire),
  };
});

vi.mock('../../src/util/fetch/index.ts', async () => {
  const actual = await vi.importActual<typeof import('../../src/util/fetch/index')>(
    '../../src/util/fetch/index.ts',
  );
  return {
    ...actual,
    fetchWithRetries: vi.fn(actual.fetchWithRetries),
  };
});

vi.mock('glob', () => ({
  globSync: vi.fn(),
}));

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  promises: {
    readFile: vi.fn(),
  },
}));

vi.mock('../../src/esm', () => ({
  importModule: vi.fn().mockImplementation((_path, _functionName) => {
    // Make sure both parameters are captured in the mock call
    return Promise.resolve();
  }),
  __esModule: true,
}));
vi.mock('../../src/database', () => ({
  getDb: vi.fn(),
}));
vi.mock('path', async () => {
  const actualPath = await vi.importActual<typeof import('path')>('path');
  const mocked = {
    ...actualPath,
    resolve: vi.fn(),
    extname: vi.fn(),
  };
  return {
    ...mocked,
    default: mocked,
  };
});

vi.mock('../../src/cliState', () => ({
  default: {
    basePath: '/base/path',
  },
  basePath: '/base/path',
}));
vi.mock('../../src/matchers', async () => {
  const actual = await vi.importActual<typeof import('../../src/matchers')>('../../src/matchers');
  return {
    ...actual,
    matchesContextRelevance: vi
      .fn()
      .mockResolvedValue({ pass: true, score: 1, reason: 'Mocked reason' }),
    matchesContextFaithfulness: vi
      .fn()
      .mockResolvedValue({ pass: true, score: 1, reason: 'Mocked reason' }),
  };
});

// Add this mock for packageParser
vi.mock('../../src/providers/packageParser', () => {
  const mockIsPackagePath = vi.fn();
  const mockLoadFromPackage = vi.fn();
  return {
    isPackagePath: mockIsPackagePath,
    loadFromPackage: mockLoadFromPackage,
    __esModule: true, // This is important for proper mocking
  };
});

describe('buildFunctionBody', () => {
  it('should prepend return to simple expressions', () => {
    expect(buildFunctionBody('output === "test"')).toBe('return output === "test"');
    expect(buildFunctionBody('output.length > 5')).toBe('return output.length > 5');
    expect(buildFunctionBody('true')).toBe('return true');
  });

  it('should inject return before final expression when starting with const', () => {
    expect(buildFunctionBody('const s = output; s === "test"')).toBe(
      'const s = output; return s === "test"',
    );
    expect(buildFunctionBody('const x = 5; const y = 10; x + y')).toBe(
      'const x = 5; const y = 10; return x + y',
    );
  });

  it('should inject return before final expression when starting with let', () => {
    expect(buildFunctionBody('let x = output.length; x > 5')).toBe(
      'let x = output.length; return x > 5',
    );
  });

  it('should inject return before final expression when starting with var', () => {
    expect(buildFunctionBody('var x = output.length; x > 5')).toBe(
      'var x = output.length; return x > 5',
    );
  });

  it('should handle trailing semicolons', () => {
    expect(buildFunctionBody('const x = 5; x > 0;')).toBe('const x = 5; return x > 0');
    expect(buildFunctionBody('const x = 5; x > 0;;')).toBe('const x = 5; return x > 0');
    expect(buildFunctionBody('output === "test";')).toBe('return output === "test"');
  });

  it('should handle whitespace', () => {
    expect(buildFunctionBody('  const x = 5; x > 0  ')).toBe('const x = 5; return x > 0');
    expect(buildFunctionBody('  output === "test"  ')).toBe('return output === "test"');
  });

  it('should handle declaration without final expression', () => {
    // This is an edge case - user forgot to add the expression
    expect(buildFunctionBody('const x = 5;')).toBe('const x = 5');
  });

  it('should handle semicolons inside strings in declarations', () => {
    // Semicolon in string within the declaration part (not the final expression)
    expect(buildFunctionBody('const s = "a;b"; s.length')).toBe('const s = "a;b"; return s.length');
  });

  it('should handle semicolons inside strings in final expression', () => {
    // Critical edge case: semicolon in string is the LAST semicolon in the code
    // This was the bug that caused silent failures
    expect(buildFunctionBody('const s = output; s === "test;value"')).toBe(
      'const s = output; return s === "test;value"',
    );
    expect(buildFunctionBody('const x = output; x.includes(";")')).toBe(
      'const x = output; return x.includes(";")',
    );
    expect(buildFunctionBody('const x = output; x === "a;b;c"')).toBe(
      'const x = output; return x === "a;b;c"',
    );
  });

  it('should handle single-quoted strings with semicolons', () => {
    expect(buildFunctionBody("const s = output; s === 'test;value'")).toBe(
      "const s = output; return s === 'test;value'",
    );
    expect(buildFunctionBody("const s = 'a;b'; s.length")).toBe("const s = 'a;b'; return s.length");
  });

  it('should handle template literals with semicolons', () => {
    expect(buildFunctionBody('const s = output; s === `test;value`')).toBe(
      'const s = output; return s === `test;value`',
    );
    expect(buildFunctionBody('const s = `a;b`; s.length')).toBe('const s = `a;b`; return s.length');
  });

  it('should handle escaped quotes', () => {
    // Escaped quote should not toggle quote state
    expect(buildFunctionBody('const s = output; s === "test\\"with;quotes"')).toBe(
      'const s = output; return s === "test\\"with;quotes"',
    );
    expect(buildFunctionBody("const s = output; s === 'test\\'with;quotes'")).toBe(
      "const s = output; return s === 'test\\'with;quotes'",
    );
  });

  it('should handle multiple escaped backslashes', () => {
    // \\\\ is two escaped backslashes, so the quote after is NOT escaped
    expect(buildFunctionBody('const s = "a\\\\"; s.length')).toBe(
      'const s = "a\\\\"; return s.length',
    );
  });

  it('should handle mixed quote types', () => {
    // Single quotes inside double quotes
    expect(buildFunctionBody('const s = output; s === "it\'s;here"')).toBe(
      'const s = output; return s === "it\'s;here"',
    );
    // Double quotes inside single quotes
    expect(buildFunctionBody('const s = output; s === \'say "hi;there"\'')).toBe(
      'const s = output; return s === \'say "hi;there"\'',
    );
  });

  it('should not modify expressions starting with const-like words', () => {
    // "constant" starts with "const" but isn't a declaration
    expect(buildFunctionBody('constant === true')).toBe('return constant === true');
  });
});

const javascriptStringAssertion: Assertion = {
  type: 'javascript',
  value: 'output === "Expected output"',
};

const javascriptMultilineStringAssertion: Assertion = {
  type: 'javascript',
  value: `
      if (output === "Expected output") {
        return {
          pass: true,
          score: 0.5,
          reason: 'Assertion passed',
        };
      }
      return {
        pass: false,
        score: 0,
        reason: 'Assertion failed',
      };`,
};

const javascriptStringAssertionWithNumber: Assertion = {
  type: 'javascript',
  value: 'output.length * 10',
};

const javascriptBooleanAssertionWithConfig: Assertion = {
  type: 'javascript',
  value: 'output.length <= context.config.maximumOutputSize',
  config: {
    maximumOutputSize: 20,
  },
};

const javascriptStringAssertionWithNumberAndThreshold: Assertion = {
  type: 'javascript',
  value: 'output.length * 10',
  threshold: 0.5,
};

const javascriptFunctionAssertion: Assertion = {
  type: 'javascript',
  value: async (_output: string) => ({
    pass: true,
    score: 0.5,
    reason: 'Assertion passed',
  }),
};

const javascriptFunctionFailAssertion: Assertion = {
  type: 'javascript',
  value: async (_output: string) => ({
    pass: false,
    score: 0.5,
    reason: 'Assertion failed',
  }),
};

describe('JavaScript file references', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset all mocks before each test
    vi.mocked(importModule).mockReset();
    vi.mocked(path.resolve).mockReset();
    vi.mocked(isPackagePath).mockReset();
    vi.mocked(loadFromPackage).mockReset();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should handle JavaScript file reference with function name', async () => {
    const assertion: Assertion = {
      type: 'javascript',
      value: 'file:///path/to/assert.js:customFunction',
    };

    const mockFn = vi.fn((_output: string) => true);
    vi.mocked(path.resolve).mockReturnValue('/path/to/assert.js');
    vi.mocked(path.extname).mockReturnValue('.js');
    vi.mocked(isPackagePath).mockReturnValue(false);

    // Mock importModule to return the mock function
    vi.mocked(importModule).mockImplementationOnce((_path, _functionName) => {
      return Promise.resolve({
        customFunction: mockFn,
      });
    });

    const output = 'Expected output';
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
    const providerResponse = { output };

    const result = await runAssertion({
      prompt: 'Some prompt',
      provider,
      assertion,
      test: {} as AtomicTestCase,
      providerResponse,
    });

    // Verify the mock was called with both parameters
    expect(importModule).toHaveBeenCalledWith('/path/to/assert.js', 'customFunction');
    expect(mockFn).toHaveBeenCalledWith(output, {
      prompt: 'Some prompt',
      vars: {},
      test: {},
      provider,
      providerResponse,
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should handle default export when no function name specified', async () => {
    const assertion: Assertion = {
      type: 'javascript',
      value: 'file:///path/to/assert.js',
    };

    const mockFn = vi.fn((_output: string) => true);
    vi.mocked(path.resolve).mockReturnValue('/path/to/assert.js');
    vi.mocked(path.extname).mockReturnValue('.js');
    vi.mocked(isPackagePath).mockReturnValue(false);

    // Mock importModule to return the mock function
    vi.mocked(importModule).mockImplementationOnce((_path, _functionName) => {
      return Promise.resolve(mockFn);
    });

    const output = 'Expected output';
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
    const providerResponse = { output };

    const result = await runAssertion({
      prompt: 'Some prompt',
      provider,
      assertion,
      test: {} as AtomicTestCase,
      providerResponse,
    });

    expect(importModule).toHaveBeenCalledWith('/path/to/assert.js', undefined);
    expect(mockFn).toHaveBeenCalledWith(output, {
      prompt: 'Some prompt',
      vars: {},
      test: {},
      provider,
      providerResponse,
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should handle default export object with function', async () => {
    const assertion: Assertion = {
      type: 'javascript',
      value: 'file:///path/to/assert.js',
    };

    const mockFn = vi.fn((_output: string) => true);
    vi.mocked(path.resolve).mockReturnValue('/path/to/assert.js');
    vi.mocked(path.extname).mockReturnValue('.js');
    vi.mocked(isPackagePath).mockReturnValue(false);

    // Mock importModule to handle both parameters
    const mockImportModule = vi.mocked(importModule);
    mockImportModule.mockImplementationOnce((_path, _functionName) => {
      // Return the mock function in a default export object
      return Promise.resolve({ default: mockFn });
    });

    const output = 'Expected output';
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
    const providerResponse = { output };

    const result = await runAssertion({
      prompt: 'Some prompt',
      provider,
      assertion,
      test: {} as AtomicTestCase,
      providerResponse,
    });

    expect(importModule).toHaveBeenCalledWith('/path/to/assert.js', undefined);
    expect(mockFn).toHaveBeenCalledWith(output, {
      prompt: 'Some prompt',
      vars: {},
      test: {},
      provider,
      providerResponse,
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should pass when the javascript assertion passes', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: javascriptStringAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should pass a score through when the javascript returns a number', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: javascriptStringAssertionWithNumber,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: true,
      score: output.length * 10,
      reason: 'Assertion passed',
    });
  });

  it('should pass when javascript returns an output string that is smaller than the maximum size threshold', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: javascriptBooleanAssertionWithConfig,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: true,
      score: 1.0,
      reason: 'Assertion passed',
    });
  });

  it('should fail when javascript returns an output string that is larger than the maximum size threshold', async () => {
    const output = 'Expected output with some extra characters';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: javascriptBooleanAssertionWithConfig,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: false,
      score: 0,
      reason: expect.stringContaining('Custom function returned false'),
    });
  });

  it('should pass when javascript returns a number above threshold', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: javascriptStringAssertionWithNumberAndThreshold,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: true,
      score: output.length * 10,
      reason: 'Assertion passed',
    });
  });

  it('should fail when javascript returns a number below threshold', async () => {
    const output = '';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: javascriptStringAssertionWithNumberAndThreshold,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: false,
      score: output.length * 10,
      reason: expect.stringContaining('Custom function returned false'),
    });
  });

  it('should set score when javascript returns false', async () => {
    const output = 'Test output';

    const assertion: Assertion = {
      type: 'javascript',
      value: 'output.length < 1',
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: false,
      score: 0,
      reason: expect.stringContaining('Custom function returned false'),
    });
  });

  it('should fail when the javascript assertion fails', async () => {
    const output = 'Different output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: javascriptStringAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Custom function returned false\noutput === "Expected output"',
    });
  });

  it('should pass when javascript function assertion passes - with vars', async () => {
    const output = 'Expected output';

    const javascriptStringAssertionWithVars: Assertion = {
      type: 'javascript',
      value: 'output === "Expected output" && context.vars.foo === "bar"',
    };
    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: javascriptStringAssertionWithVars,
      test: { vars: { foo: 'bar' } } as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the javascript does not match vars', async () => {
    const output = 'Expected output';

    const javascriptStringAssertionWithVars: Assertion = {
      type: 'javascript',
      value: 'output === "Expected output" && context.vars.foo === "something else"',
    };
    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: javascriptStringAssertionWithVars,
      test: { vars: { foo: 'bar' } } as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: false,
      reason:
        'Custom function returned false\noutput === "Expected output" && context.vars.foo === "something else"',
    });
  });

  // Fix for GitHub issue #7334: Dynamic vars should be resolved when passed to assertions
  it('should use resolved vars parameter over test.vars when provided (issue #7334)', async () => {
    const output = 'Expected output';

    // Simulates the case where test.vars has an unresolved file:// reference
    // but the vars parameter has the resolved value
    const javascriptStringAssertionWithVars: Assertion = {
      type: 'javascript',
      value: 'context.vars.dynamicVar === "resolved-value"',
    };
    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: javascriptStringAssertionWithVars,
      test: { vars: { dynamicVar: 'file://some-script.js' } } as AtomicTestCase,
      // Pass resolved vars - this should take precedence over test.vars
      vars: { dynamicVar: 'resolved-value' },
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fall back to test.vars when vars parameter is not provided', async () => {
    const output = 'Expected output';

    const javascriptStringAssertionWithVars: Assertion = {
      type: 'javascript',
      value: 'context.vars.foo === "bar"',
    };
    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: javascriptStringAssertionWithVars,
      test: { vars: { foo: 'bar' } } as AtomicTestCase,
      // No vars parameter - should fall back to test.vars
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should fail when vars parameter has wrong value even if test.vars has correct value (issue #7334 negative)', async () => {
    const output = 'Expected output';

    // This negative test verifies that vars parameter truly takes precedence over test.vars
    const javascriptStringAssertionWithVars: Assertion = {
      type: 'javascript',
      value: 'context.vars.dynamicVar === "expected-value"',
    };
    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: javascriptStringAssertionWithVars,
      // test.vars has the "correct" value
      test: { vars: { dynamicVar: 'expected-value' } } as AtomicTestCase,
      // But vars parameter has the wrong value - this should take precedence and fail
      vars: { dynamicVar: 'wrong-value' },
      providerResponse: { output },
    });
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('false');
  });

  it('should pass when the function returns pass', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: javascriptFunctionAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: true,
      score: 0.5,
      reason: 'Assertion passed',
    });
  });

  it('should fail when the function returns fail', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: javascriptFunctionFailAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass: false,
      score: 0.5,
      reason: 'Assertion failed',
    });
  });

  it('should pass when the multiline javascript assertion passes', async () => {
    const output = 'Expected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: javascriptMultilineStringAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  it('should pass when the multiline javascript assertion fails', async () => {
    const output = 'Not the expected output';

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      assertion: javascriptMultilineStringAssertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
    });
    expect(result).toMatchObject({
      pass: false,
      reason: 'Assertion failed',
    });
  });

  it.each([
    ['boolean', vi.fn((output: string) => output === 'Expected output'), true, 'Assertion passed'],
    ['number', vi.fn((output: string) => output.length), true, 'Assertion passed'],
    [
      'GradingResult',
      vi.fn((_output: string) => ({ pass: true, score: 1, reason: 'Custom reason' })),
      true,
      'Custom reason',
    ],
    [
      'boolean',
      vi.fn((output: string) => output !== 'Expected output'),
      false,
      'Custom function returned false',
    ],
    ['number', vi.fn((_output: string) => 0), false, 'Custom function returned false'],
    [
      'GradingResult',
      vi.fn((_output: string) => ({ pass: false, score: 0.1, reason: 'Custom reason' })),
      false,
      'Custom reason',
    ],
    [
      'boolean Promise',
      vi.fn((_output: string) => Promise.resolve(true)),
      true,
      'Assertion passed',
    ],
  ])('should pass when the file:// assertion with .js file returns a %s', async (_type, mockFn, expectedPass, expectedReason) => {
    const output = 'Expected output';

    // Mock path.resolve to return a valid path
    vi.mocked(path.resolve).mockReturnValue('/mocked/path/to/assert.js');
    vi.mocked(path.extname).mockReturnValue('.js');

    // Mock isPackagePath to return false for file:// paths
    vi.mocked(isPackagePath).mockReturnValue(false);

    // Mock importModule to handle both path and functionName
    const mockImportModule = vi.mocked(importModule);
    mockImportModule.mockImplementation((path, functionName) => {
      // Make sure both parameters are captured in the mock
      mockImportModule.mock.calls.push([path, functionName]);
      return Promise.resolve(mockFn);
    });

    const fileAssertion: Assertion = {
      type: 'javascript',
      value: 'file:///path/to/assert.js',
    };

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
    const providerResponse = { output };
    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider,
      assertion: fileAssertion,
      test: {} as AtomicTestCase,
      providerResponse,
    });

    expect(mockFn).toHaveBeenCalledWith(output, {
      prompt: 'Some prompt',
      vars: {},
      test: {},
      provider,
      providerResponse,
    });
    expect(result).toMatchObject({
      pass: expectedPass,
      reason: expect.stringContaining(expectedReason),
    });
  });

  it.each([
    ['boolean', vi.fn((output: string) => output === 'Expected output'), true, 'Assertion passed'],
    ['number', vi.fn((output: string) => output.length), true, 'Assertion passed'],
    [
      'GradingResult',
      vi.fn((_output: string) => ({ pass: true, score: 1, reason: 'Custom reason' })),
      true,
      'Custom reason',
    ],
    [
      'boolean',
      vi.fn((output: string) => output !== 'Expected output'),
      false,
      'Custom function returned false',
    ],
    ['number', vi.fn((_output: string) => 0), false, 'Custom function returned false'],
    [
      'GradingResult',
      vi.fn((_output: string) => ({ pass: false, score: 0.1, reason: 'Custom reason' })),
      false,
      'Custom reason',
    ],
    [
      'boolean Promise',
      vi.fn((_output: string) => Promise.resolve(true)),
      true,
      'Assertion passed',
    ],
  ])('should pass when assertion is a package path', async (_type, mockFn, expectedPass, expectedReason) => {
    const output = 'Expected output';

    // Mock isPackagePath to return true for package paths
    vi.mocked(isPackagePath).mockReturnValue(true);

    // Mock loadFromPackage to return the mockFn
    vi.mocked(loadFromPackage).mockResolvedValue(mockFn);

    const packageAssertion: Assertion = {
      type: 'javascript',
      value: 'package:@promptfoo/fake:assertionFunction',
    };

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
    const providerResponse = { output };
    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider,
      assertion: packageAssertion,
      test: {} as AtomicTestCase,
      providerResponse,
    });

    expect(mockFn).toHaveBeenCalledWith(output, {
      prompt: 'Some prompt',
      vars: {},
      test: {},
      provider,
      providerResponse,
    });
    expect(result).toMatchObject({
      pass: expectedPass,
      reason: expect.stringContaining(expectedReason),
    });
  });

  it('should resolve js paths relative to the configuration file', async () => {
    const output = 'Expected output';
    const mockFn = vi.fn((output: string) => output === 'Expected output');

    // Mock path.resolve to return a valid path
    vi.mocked(path.resolve).mockReturnValue('/base/path/path/to/assert.js');
    vi.mocked(path.extname).mockReturnValue('.js');

    // Mock isPackagePath to return false
    vi.mocked(isPackagePath).mockReturnValue(false);

    // Mock importModule to return the mockFn
    vi.mocked(importModule).mockResolvedValue(mockFn);

    const fileAssertion: Assertion = {
      type: 'javascript',
      value: 'file://./path/to/assert.js',
    };

    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');
    const providerResponse = { output };
    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider,
      assertion: fileAssertion,
      test: {} as AtomicTestCase,
      providerResponse,
    });

    expect(mockFn).toHaveBeenCalledWith(output, {
      prompt: 'Some prompt',
      vars: {},
      test: {},
      provider,
      providerResponse,
    });
    expect(result).toMatchObject({
      pass: true,
      reason: 'Assertion passed',
    });
  });

  describe('Single-line assertions with variable declarations', () => {
    it('should handle const declaration in single-line assertion', async () => {
      // The code injects `return` before the final expression, not at the start
      // "const s = ...; s >= 0.5" becomes "const s = ...; return s >= 0.5"
      const assertion: Assertion = {
        type: 'javascript',
        value: 'const s = JSON.parse(output).score; s >= 0.5 && s <= 0.75',
      };

      const output = JSON.stringify({ score: 0.67, reason: 'test' });

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result.pass).toBe(true);
      expect(result.reason).toBe('Assertion passed');
    });

    it('should handle let declaration in single-line assertion', async () => {
      const assertion: Assertion = {
        type: 'javascript',
        value: 'let x = output.length; x > 5',
      };

      const output = 'Hello World';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result.pass).toBe(true);
      expect(result.reason).toBe('Assertion passed');
    });

    it('should handle var declaration in single-line assertion', async () => {
      const assertion: Assertion = {
        type: 'javascript',
        value: 'var x = output.length; x > 5',
      };

      const output = 'Hello World';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result.pass).toBe(true);
      expect(result.reason).toBe('Assertion passed');
    });

    it('should handle multiple declarations in single-line assertion', async () => {
      const assertion: Assertion = {
        type: 'javascript',
        value: 'const a = 5; const b = 10; a + b === 15',
      };

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output: 'test' },
      });

      expect(result.pass).toBe(true);
    });

    it('should handle declaration with semicolon in string value', async () => {
      // Semicolons inside strings should not break the parsing
      const assertion: Assertion = {
        type: 'javascript',
        value: 'const s = "hello; world"; s.length > 5',
      };

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output: 'test' },
      });

      expect(result.pass).toBe(true);
    });

    it('should handle semicolon in final expression string (critical edge case)', async () => {
      // This is the critical bug fix test - semicolon in final expression's string
      // was causing silent failures before because lastIndexOf(';') found the wrong semicolon
      const assertion: Assertion = {
        type: 'javascript',
        value: 'const s = output; s === "test;value"',
      };

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output: 'test;value' },
      });

      expect(result.pass).toBe(true);
      expect(result.reason).toBe('Assertion passed');
    });

    it('should correctly evaluate includes() with semicolon argument', async () => {
      const assertion: Assertion = {
        type: 'javascript',
        value: 'const x = output; x.includes(";")',
      };

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output: 'hello;world' },
      });

      expect(result.pass).toBe(true);
    });

    it('should handle single quotes with semicolons in final expression', async () => {
      const assertion: Assertion = {
        type: 'javascript',
        value: "const s = output; s === 'a;b;c'",
      };

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output: 'a;b;c' },
      });

      expect(result.pass).toBe(true);
    });

    it('should handle template literals with semicolons in final expression', async () => {
      const assertion: Assertion = {
        type: 'javascript',
        value: 'const s = output; s === `test;value`',
      };

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output: 'test;value' },
      });

      expect(result.pass).toBe(true);
    });

    it('should handle trailing semicolon in assertion', async () => {
      const assertion: Assertion = {
        type: 'javascript',
        value: 'const x = 10; x > 5;',
      };

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output: 'test' },
      });

      expect(result.pass).toBe(true);
    });

    it('should still work with IIFE format', async () => {
      const assertion: Assertion = {
        type: 'javascript',
        value: '(() => { const s = JSON.parse(output).score; return s >= 0.5 && s <= 0.75; })()',
      };

      const output = JSON.stringify({ score: 0.67, reason: 'test' });

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result.pass).toBe(true);
    });

    it('should still work with multiline format', async () => {
      const assertion: Assertion = {
        type: 'javascript',
        value: `const s = JSON.parse(output).score;
return s >= 0.5 && s <= 0.75;`,
      };

      const output = JSON.stringify({ score: 0.67, reason: 'test' });

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result.pass).toBe(true);
    });

    it('should fail when assertion evaluates to false', async () => {
      const assertion: Assertion = {
        type: 'javascript',
        value: 'const x = output.length; x > 100',
      };

      const output = 'short';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result.pass).toBe(false);
      expect(result.reason).toContain('Custom function returned false');
    });
  });

  describe('JavaScript threshold edge cases', () => {
    const baseParams = {
      prompt: 'test',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      test: {} as AtomicTestCase,
      providerResponse: { output: '0' },
    };

    it('should FAIL when score=0 and no threshold (default behavior)', async () => {
      const assertion: Assertion = {
        type: 'javascript',
        value: '0',
      };

      const result: GradingResult = await runAssertion({
        ...baseParams,
        assertion,
      });

      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
    });

    it('should PASS when score=0 and threshold=0 (explicit zero threshold)', async () => {
      const assertion: Assertion = {
        type: 'javascript',
        value: '0',
        threshold: 0,
      };

      const result: GradingResult = await runAssertion({
        ...baseParams,
        assertion,
      });

      expect(result.pass).toBe(true);
      expect(result.score).toBe(0);
    });

    it('should FAIL when score=0 and threshold=0.1', async () => {
      const assertion: Assertion = {
        type: 'javascript',
        value: '0',
        threshold: 0.1,
      };

      const result: GradingResult = await runAssertion({
        ...baseParams,
        assertion,
      });

      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
    });

    it('should PASS when score=1 and threshold=0', async () => {
      const assertion: Assertion = {
        type: 'javascript',
        value: '1',
        threshold: 0,
      };

      const result: GradingResult = await runAssertion({
        ...baseParams,
        assertion,
        providerResponse: { output: '1' },
      });

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should PASS when score=1 and no threshold', async () => {
      const assertion: Assertion = {
        type: 'javascript',
        value: '1',
      };

      const result: GradingResult = await runAssertion({
        ...baseParams,
        assertion,
        providerResponse: { output: '1' },
      });

      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should handle threshold=0 differently from threshold=undefined', async () => {
      const assertionWithoutThreshold: Assertion = {
        type: 'javascript',
        value: '0',
      };

      const assertionWithZeroThreshold: Assertion = {
        type: 'javascript',
        value: '0',
        threshold: 0,
      };

      const resultWithoutThreshold: GradingResult = await runAssertion({
        ...baseParams,
        assertion: assertionWithoutThreshold,
      });

      const resultWithZeroThreshold: GradingResult = await runAssertion({
        ...baseParams,
        assertion: assertionWithZeroThreshold,
      });

      // These should have different outcomes
      expect(resultWithoutThreshold.pass).toBe(false); // score > 0 check
      expect(resultWithZeroThreshold.pass).toBe(true); // score >= 0 check

      // But same score
      expect(resultWithoutThreshold.score).toBe(0);
      expect(resultWithZeroThreshold.score).toBe(0);
    });

    it('should handle various falsy threshold values correctly', async () => {
      const testCases = [
        { threshold: 0, expected: true, description: 'threshold=0' },
        { threshold: undefined, expected: false, description: 'threshold=undefined' },
        // Note: null, empty string, false are treated as valid thresholds and compared numerically
        // null becomes 0 when compared: 0 >= null (which is 0) = true
        { threshold: null, expected: true, description: 'threshold=null (becomes 0)' },
        // Empty string becomes 0 when compared: 0 >= '' (which is 0) = true
        { threshold: '', expected: true, description: 'threshold="" (becomes 0)' },
        // false becomes 0 when compared: 0 >= false (which is 0) = true
        { threshold: false, expected: true, description: 'threshold=false (becomes 0)' },
      ];

      for (const testCase of testCases) {
        const assertion: Assertion = {
          type: 'javascript',
          value: '0',
          threshold: testCase.threshold as any,
        };

        const result: GradingResult = await runAssertion({
          ...baseParams,
          assertion,
        });

        expect(result.pass).toBe(testCase.expected);
        expect(result.score).toBe(0);
      }
    });
  });
});
