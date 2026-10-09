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
vi.mock('../../src/matchers/rag', async () => {
  const actual =
    await vi.importActual<typeof import('../../src/matchers/rag')>('../../src/matchers/rag');
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

  it.each([
    ['block comment before expression', 'const x = 1; /* ; */ x === 1'],
    ['block comment in declaration', 'const x = 1 /* ; */; x === 1'],
    ['trailing block comment', 'const x = 1; x === 1 /* ; */'],
    ['trailing line comment', 'const x = 1; x === 1 // ;'],
    ['semicolon before block comment', 'const x = 1; x === 1; /* ; */'],
    ['empty statements before line comment', 'const x = 1; x === 1;; // ;'],
    ['quotes in block comment', 'const x = 1; /* \' " ` ; */ x === 1'],
    ['quotes in line comment', 'const x = 1; x === 1 // \' " ` ;'],
    ['line marker in block comment', 'const x = 1; /* // ; */ x === 1'],
    ['block marker in line comment', 'const x = 1; x === 1 // /* ;'],
    ['block comment after division', 'const x = 2 / /* ; */ 2; x === 1'],
    ['line markers in string', 'const x = "https://example.test/a;b"; x.includes(";")'],
    ['block markers in string', 'const x = "/* ; */"; x.length === 7'],
    ['comment markers in template', 'const x = `// ; /* */`; x.length === 10'],
    [
      'escaped slashes in regex',
      String.raw`const x = /https?:\/\//; x.test("https://example.test")`,
    ],
    ['separate slash classes in regex', 'const x = /[/][/]/; x.test("//")'],
    ['block markers in regex class', 'const x = /[/*]/; x.test("/")'],
    ['line markers in regex class', 'const x = /[//]/; x.test("/")'],
    ['block comment before regex', 'const x = /* ; */ /[/*]/; x.test("*")'],
    ['semicolon in regex class', 'const x = /[;/*]/; x.test(";")'],
    ['division before comment', 'const x = 8 / 2 /* ; */; x === 4'],
    ['division after increment', 'let x = 4; const y = x++ / 2; y === 2'],
    ['division after decrement', 'let x = 4; const y = x-- / 2; y === 2'],
    ['regex after return', 'const x = (() => { return /[/*]/ })(); x.test("/")'],
    ['regex after typeof', 'const type = typeof /[/*]/; type === "object"'],
    ['regex after division', 'const x = 2 / /[/*]/.source.length; x === 0.5'],
    ['division after regex', 'const x = /a/ / 2; Number.isNaN(x)'],
    ['division after property keyword', 'const x = { return: 4 }; const y = x.return / 2; y === 2'],
    ['division after optional keyword property', 'const x = { default: 4 }; x?.default / 2 === 2'],
    [
      'optional keyword division in a declaration',
      'const x = { return: 4 }; const n = x?.return / 2; n === 2',
    ],
    [
      'optional keyword division with a comment',
      'const x = { typeof: 4 }; x?. /* ; */ typeof / 2 === 2',
    ],
    [
      'optional keyword division in a template',
      'const x = { default: 4 }; `${x?.default / 2};` === "2;"',
    ],
    [
      'optional keyword division before a regex',
      'const x = { default: 4 }; x?.default / /[;/*]/.source.length === 0.8',
    ],
    [
      'escaped optional keyword property',
      String.raw`const x = { default: 4 }; x?.\u0064efault / 2 === 2`,
    ],
    ['escaped dot keyword property', String.raw`const x = { return: 4 }; x.\u0072eturn / 2 === 2`],
    ['escaped object keyword key', String.raw`const x = { \u0064efault: 4 }; x.default / 2 === 2`],
    [
      'escaped optional keyword with comment and template',
      String.raw`const x = { typeof: 4 }; ` + '`${x?. /* ; */ \\u0074ypeof / 2};` === "2;"',
    ],
    ['optional contextual of property', 'const x = { of: 4 }; x?.of / 2 === 2'],
    [
      'optional yield property in generator',
      'const fn = function* () { const x = { yield: 4 }; return x?.yield / 2; }; fn().next().value === 2',
    ],
    [
      'optional keyword property followed by multiplication and arrow body',
      'const x = { function: 4 }; const n = x?.function * 2; const f = () => {}; n === 8',
    ],
    [
      'dot keyword property followed by multiplication and arrow body',
      'const x = { function: 4 }; const n = x.function * 2; const f = () => {}; n === 8',
    ],
    [
      'optional keyword property call followed by division',
      'const x = { if: () => 4 }; const n = x?.if() / 2; const f = () => {}; n === 2',
    ],
    [
      'dot keyword property call followed by division',
      'const x = { while: () => 4 }; const n = x.while() / 2; const f = () => {}; n === 2',
    ],
    [
      'generator declaration followed by division and arrow body',
      'const g = function* () { yield 4; }; const n = g().next().value / 2; const f = () => {}; n === 2',
    ],
    ['function body new.target', 'const x = new.target; x === undefined'],
    ['optional class property', 'const x = { class: 4 }; x?.class / 2 === 2'],
    ['optional function property', 'const x = { function: 4 }; x?.function / 2 === 2'],
    ['optional computed property', 'const x = { default: 4 }; x?.["default"] / 2 === 2'],
    ['optional call', 'const x = () => 4; x?.() / 2 === 2'],
    ['null optional property', 'const x = null; Number.isNaN(x?.default / 2)'],
    ['division after contextual keyword', 'const of = 8; const n = of / 2; n === 4'],
    ['division after await identifier', 'const await = 8; const n = await / 2; n === 4'],
    ['division after yield identifier', 'const yield = 8; const n = yield / 2; n === 4'],
    ['division after Unicode identifier', 'const étypeof = 8; const n = étypeof / 2; n === 4'],
    ['spaced property keyword', 'const obj = { typeof: 4 }; const x = obj . typeof / 2; x === 2'],
    [
      'commented property keyword',
      'const obj = { typeof: 4 }; const x = obj./* ; */ typeof / 2; x === 2',
    ],
    ['regex after postfix and addition', 'let x = 1; const n = x+++ /[/*]/.test("/"); n === 2'],
    ['regex after comparison', 'const n = 0 < /[/*]/.test("/"); n === true'],
    [
      'regex statement after control condition',
      'const fn = () => { if (true) /[/*]/.test("*") }; true',
    ],
    ['regex statement after block', 'const fn = () => { if (false) {} /[/*]/.test("*") }; true'],
    ['semicolon inside nested function', 'const x = (() => { const y = 1; return y; })(); x === 1'],
    ['semicolon inside template expression', 'const x = 1; `${(() => { return x; })()}` === "1"'],
  ])('should evaluate %s without treating comment text as code', (_name, code) => {
    expect(new Function(buildFunctionBody(code))()).toBe(true);
  });

  it.each(['\n', '\r', '\u2028', '\u2029'])(
    'should end a line comment at %j when scanning statement separators',
    (lineEnding) => {
      const code = `const x = 1 // ; ' " \`${lineEnding}; x === 1`;
      expect(new Function(buildFunctionBody(code))()).toBe(true);
    },
  );

  it('should return an unparenthesized grading result object after a declaration', () => {
    const code = 'const x = 1; { pass: x === 1, score: 1, reason: "ok" }';
    expect(new Function(buildFunctionBody(code))()).toEqual({
      pass: true,
      score: 1,
      reason: 'ok',
    });
  });

  it.each([
    String.raw`const \u0064efault = 4; true`,
    String.raw`const x = 4; \u0072eturn true`,
    String.raw`const x = 4; \u0074rue`,
    String.raw`const x = 4; \u0074hrow new Error("invalid")`,
    String.raw`const x = { default: 4 }; x.\u00ZZ`,
  ])('rejects malformed escaped syntax without discarding code: %s', (code) => {
    expect(() => new Function(buildFunctionBody(code))).toThrow(SyntaxError);
  });

  it.each([
    'const x = 1; { pass: true, score: 1 }; false',
    'const x = ; { pass: true, score: 1 }',
    'const x = 1; { pass: true, score: 1 } garbage',
    'const x = 1; return true; { pass: true, score: 1 } garbage',
    'const f = async () => await /unterminated; true',
    'const f = () => await /[a-z]+/.test("a"); f()',
    'const f = async function* () { yield /unterminated; }; f().next()',
    'const f = async function () { yield /[a-z]+/.test("a"); }; f()',
  ])('rejects malformed code without returning an earlier object: %s', (code) => {
    expect(() => new Function(buildFunctionBody(code))).toThrow(SyntaxError);
  });

  it('preserves the complete prefix when returning a final object', () => {
    const code =
      'const f = async () => await /[;/*]/.test(";"); throw new Error("prefix"); { pass: true, score: 1 }';
    expect(() => new Function(buildFunctionBody(code))()).toThrow('prefix');
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

describe('JavaScript async declaration grading', () => {
  it.each(
    [
      {
        name: 'async generator function',
        value:
          'const f = async function* () { yield /[;/*]/.test(output); }; f().next().then(result => result.value)',
      },
      {
        name: 'async generator object method',
        value:
          'const f = { async *run() { yield /[;/*]/.test(output); } }; f.run().next().then(result => result.value)',
      },
      {
        name: 'async generator class method',
        value:
          'const F = class { async *run() { yield /[;/*]/.test(output); } }; new F().run().next().then(result => result.value)',
      },
      {
        name: 'generator function',
        value: 'const f = function* () { yield /[;/*]/.test(output); }; f().next().value',
      },
      {
        name: 'generator object method',
        value: 'const f = { *run() { yield /[;/*]/.test(output); } }; f.run().next().value',
      },
      {
        name: 'generator class method',
        value:
          'const F = class { *run() { yield /[;/*]/.test(output); } }; new F().run().next().value',
      },
    ].flatMap((testCase) =>
      [
        { output: ';', pass: true },
        { output: 'a', pass: false },
      ].map((result) => ({ ...testCase, ...result })),
    ),
  )('grades a regex directly yielded by $name with pass $pass', async ({ value, output, pass }) => {
    const result = await runAssertion({
      prompt: 'Test prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: { type: 'javascript', value },
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });
    expect(result).toMatchObject({
      pass,
      score: pass ? 1 : 0,
      reason: pass ? 'Assertion passed' : `Custom function returned false\n${value}`,
    });
  });

  it.each(
    ['\r', '\u2028', '\u2029', ' '].flatMap((separator) =>
      [true, false].map((pass) => ({ separator, pass })),
    ),
  )(
    'returns a bare grading object after separator $separator with pass $pass',
    async ({ separator, pass }) => {
      const result = await runAssertion({
        prompt: 'Test prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion: {
          type: 'javascript',
          value: `const x = ${pass};${separator}{ pass: x, score: 0.75, reason: "bare object" }`,
        },
        test: {} as AtomicTestCase,
        providerResponse: { output: 'text' },
      });
      expect(result).toMatchObject({ pass, score: 0.75, reason: 'bare object' });
    },
  );

  it.each([
    ['async arrow', 'const f = async () => await /[a-z]+/.test(output); f()'],
    ['async block', 'const f = async () => { return await /[;/*]/.test(output); }; f()'],
    ['async function', 'const f = async function () { return await /[a-z;]+/.test(output); }; f()'],
    ['async method', 'const f = { async run() { return await /[a-z]+/.test(output); } }; f.run()'],
    [
      'async class',
      'const F = class { async run() { return await /[a-z]+/.test(output); } }; new F().run()',
    ],
    [
      'nested async function',
      'const f = async () => { const g = async () => await /[a-z]+/.test(output); return g(); }; f()',
    ],
    [
      'async template',
      'const f = async () => `${await /[;/*]/.test(output)};`; f().then(value => value === "true;")',
    ],
    [
      'async generator',
      'const f = async function* () { yield await /[;/*]/.test(output); }; f().next().then(result => result.value)',
    ],
    ['generator regex', 'const f = function* () { yield /[;/*]/.test(output); }; f().next().value'],
    [
      'comment and terminal semicolons',
      'const f = async () => await /* ; */ /[;/*]/.test(output); f();; // ;',
    ],
    ['await identifier', 'const await = 4; await / 2 === 2'],
    ['yield identifier', 'const yield = 4; yield / 2 === 2'],
    [
      'nested await identifier',
      'const f = async () => { const g = function () { const await = 4; return await / 2 === 2; }; return g(); }; f()',
    ],
    [
      'new.target function context',
      'const f = async () => await /[a-z]+/.test(output); const target = new.target; f().then(value => value && target === undefined)',
    ],
  ])('grades %s with its JavaScript grammar context', async (_name, value) => {
    const result = await runAssertion({
      prompt: 'Test prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: { type: 'javascript', value },
      test: {} as AtomicTestCase,
      providerResponse: { output: 'a;z' },
    });
    expect(result).toMatchObject({ pass: true, score: 1, reason: 'Assertion passed' });
  });

  it.each([
    { type: 'javascript' as const, pass: false, score: 0 },
    { type: 'not-javascript' as const, pass: true, score: 1 },
  ])('preserves false and inverse grades for $type', async ({ type, pass, score }) => {
    const result = await runAssertion({
      prompt: 'Test prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: { type, value: 'const f = async () => await /[0-9]+/.test(output); f()' },
      test: {} as AtomicTestCase,
      providerResponse: { output: 'a;z' },
    });
    expect(result).toMatchObject({ pass, score });
    expect(result.reason).not.toContain('threw error');
  });

  it('preserves a promised numeric score', async () => {
    const result = await runAssertion({
      prompt: 'Test prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: {
        type: 'javascript',
        value: 'const f = async () => await /[a-z]+/.test(output) ? 0.75 : 0; f()',
        threshold: 0.8,
      },
      test: {} as AtomicTestCase,
      providerResponse: { output: 'a;z' },
    });
    expect(result).toMatchObject({ pass: false, score: 0.75 });
    expect(result.reason).not.toContain('threw error');
  });

  it.each([
    'const f = async () => ({ pass: await /[a-z]+/.test(output), score: 0.75, reason: "async grade", metadata: { source: "regex" } }); f()',
    'const f = async () => await /[a-z]+/.test(output); { pass: true, score: 0.75, reason: "async grade", metadata: { source: "regex" } }; /* ; */',
  ])('preserves returned grading result fields: %s', async (value) => {
    const result = await runAssertion({
      prompt: 'Test prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: { type: 'javascript', value },
      test: {} as AtomicTestCase,
      providerResponse: { output: 'a;z' },
    });
    expect(result).toMatchObject({
      pass: true,
      score: 0.75,
      reason: 'async grade',
      metadata: { source: 'regex' },
    });
  });
});

describe('JavaScript declaration grading', () => {
  it.each([
    { output: '{"function":4}', pass: true, score: 1 },
    { output: '{"function":2}', pass: false, score: 0 },
  ])('grades keyword property multiplication for $output', async (testCase) => {
    const result = await runAssertion({
      prompt: 'Test prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: {
        type: 'javascript',
        value:
          'const x = JSON.parse(output); const n = x?.function * 2; const f = () => {}; n === 8',
      },
      test: {} as AtomicTestCase,
      providerResponse: { output: testCase.output },
    });
    expect(result).toMatchObject({ pass: testCase.pass, score: testCase.score });
    expect(result.reason).not.toContain('threw error');
  });

  it.each([
    { output: '{"default":4}', pass: true, score: 1 },
    { output: '{"default":2}', pass: false, score: 0 },
  ])('grades escaped keyword properties for $output', async (testCase) => {
    const result = await runAssertion({
      prompt: 'Test prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: {
        type: 'javascript',
        value: String.raw`const x = JSON.parse(output); x?.\u0064efault / 2 === 2`,
      },
      test: {} as AtomicTestCase,
      providerResponse: { output: testCase.output },
    });
    expect(result).toMatchObject({ pass: testCase.pass, score: testCase.score });
    expect(result.reason).not.toContain('threw error');
  });

  it.each([
    ['numeric score', 'const x = { default: 1 }; x?.default / 2', { pass: true, score: 0.5 }],
    [
      'grading result object',
      'const x = { default: 4 }; { pass: x?.default / 2 === 2, score: 0.75, reason: "ratio", namedScores: { ratio: 0.75 } }',
      { pass: true, score: 0.75, reason: 'ratio', namedScores: { ratio: 0.75 } },
    ],
  ] as const)('preserves %s after optional-chain division', async (_name, value, expected) => {
    const result = await runAssertion({
      prompt: 'Test prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion: { type: 'javascript', value },
      test: {} as AtomicTestCase,
      providerResponse: { output: '' },
    });
    expect(result).toMatchObject(expected);
  });

  it.each([
    { type: 'javascript', output: '{"default":4}', pass: true, score: 1 },
    { type: 'javascript', output: '{"default":2}', pass: false, score: 0 },
    { type: 'not-javascript', output: '{"default":4}', pass: false, score: 0 },
  ] as const)('grades optional-chain division for $type and $output', async (testCase) => {
    const assertion: Assertion = {
      type: testCase.type,
      value: 'const x = JSON.parse(output); x?.default / 2 === 2',
    };
    const result = await runAssertion({
      prompt: 'Test prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output: testCase.output },
    });

    expect(result).toMatchObject({
      pass: testCase.pass,
      score: testCase.score,
      assertion,
    });
    expect(result.reason).not.toContain('threw error');
  });
});

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

  it('should pass assertion config to JavaScript file references', async () => {
    const assertion: Assertion = {
      type: 'javascript',
      value: 'file:///path/to/assert.js',
      config: {
        minLength: 5,
      },
    };

    const mockFn = vi.fn((output: string, context: { config?: { minLength?: number } }) => {
      return output.length >= (context.config?.minLength ?? 0);
    });
    vi.mocked(path.resolve).mockReturnValue('/path/to/assert.js');
    vi.mocked(path.extname).mockReturnValue('.js');
    vi.mocked(isPackagePath).mockReturnValue(false);
    vi.mocked(importModule).mockResolvedValue(mockFn);

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

    expect(mockFn).toHaveBeenCalledWith(output, {
      prompt: 'Some prompt',
      vars: {},
      test: {},
      config: {
        minLength: 5,
      },
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

  it('should serialize direct function-valued javascript assertions when they throw', async () => {
    const output = 'Expected output';
    const assertion: Assertion = {
      type: 'javascript',
      value: () => {
        throw new Error('boom');
      },
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
      reason: expect.stringContaining('Custom function threw error: boom'),
      assertion: {
        type: 'javascript',
        value: expect.any(String),
      },
    });
    expect(typeof result.assertion?.value).toBe('string');
    expect(result.reason).not.toMatch(/\nundefined$/);
  });

  it('should serialize function-valued assertions returned inside a custom GradingResult', async () => {
    const output = 'Expected output';
    const assertion: Assertion = {
      type: 'javascript',
      value: () => ({
        pass: true,
        score: 1,
        reason: 'Custom reason',
        assertion: {
          type: 'javascript',
          value: () => false,
        },
      }),
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });

    expect(result).toMatchObject({
      pass: true,
      score: 1,
      reason: 'Custom reason',
      assertion: {
        type: 'javascript',
        value: expect.any(String),
      },
    });
    expect(typeof result.assertion?.value).toBe('string');
    expect(result.assertion?.value).toContain('() => false');
  });

  it('preserves the existing two reads of a getter-backed result score', async () => {
    let reads = 0;
    const assertion: Assertion = {
      type: 'javascript',
      value: () => ({
        pass: true,
        get score() {
          return ++reads <= 2 ? 1 : Number.POSITIVE_INFINITY;
        },
        reason: 'Custom reason',
      }),
    };

    const result = await runAssertion({
      prompt: 'Some prompt',
      assertion,
      test: {},
      providerResponse: { output: 'Expected output' },
    });

    expect(result).toMatchObject({ pass: true, score: 1, reason: 'Custom reason' });
    expect(reads).toBe(2);
    expect(JSON.parse(JSON.stringify(result)).score).toBe(1);
  });

  it.each([Number.POSITIVE_INFINITY, Number.NaN])(
    'rejects a score that becomes %s when the result is normalized',
    async (score) => {
      let reads = 0;
      const result = await runAssertion({
        assertion: {
          type: 'javascript',
          value: () => ({
            pass: true,
            get score() {
              return ++reads === 1 ? 1 : score;
            },
            reason: 'Custom grade',
          }),
        },
        test: {},
        providerResponse: { output: 'Test output' },
      });

      expect(result).toMatchObject({ pass: false, score: 0 });
      expect(result.reason).toContain('GradingResult object with a finite score');
      expect(reads).toBe(2);
      expect(JSON.parse(JSON.stringify(result)).score).toBe(0);
    },
  );

  it.each(['Infinity', 'NaN'])(
    'omits inline source when a normalized score becomes %s',
    async (score) => {
      const value = `let reads = 0;\nreturn { pass: true, get score() { return ++reads === 1 ? 1 : ${score}; }, reason: 'normalized-score-placeholder' };`;
      const result = await runAssertion({
        assertion: { type: 'javascript', value },
        test: {},
        providerResponse: { output: 'Test output' },
      });

      expect(result).toMatchObject({ pass: false, score: 0 });
      expect(result.reason).toContain('GradingResult object with a finite score');
      expect(result.reason).not.toContain('normalized-score-placeholder');
      expect(result.assertion?.value).toBe(value);
    },
  );

  it.each([Number.POSITIVE_INFINITY, Number.NaN])(
    'rejects a file assertion score that becomes %s during normalization',
    async (score) => {
      let reads = 0;
      vi.mocked(path.resolve).mockReturnValue('/mocked/path/to/assert.js');
      vi.mocked(path.extname).mockReturnValue('.js');
      vi.mocked(isPackagePath).mockReturnValue(false);
      vi.mocked(importModule).mockResolvedValue(() => ({
        pass: true,
        get score() {
          return ++reads === 1 ? 1 : score;
        },
        reason: 'File grade',
      }));

      const result = await runAssertion({
        assertion: { type: 'javascript', value: 'file:///path/to/assert.js' },
        test: {},
        providerResponse: { output: 'Test output' },
      });

      expect(result).toMatchObject({ pass: false, score: 0 });
      expect(result.reason).toContain('GradingResult object with a finite score');
      expect(reads).toBe(2);
    },
  );

  it.each([
    ['true', () => true, true, 1],
    ['false', () => false, false, 0],
    ['a number', () => 0.75, true, 0.75],
  ])(
    'should normalize direct function-valued javascript assertions that return %s',
    async (_type, value, expectedPass, expectedScore) => {
      const output = 'Expected output';
      const assertion: Assertion = {
        type: 'javascript',
        value,
      };

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toMatchObject({
        pass: expectedPass,
        score: expectedScore,
        reason: expectedPass ? 'Assertion passed' : 'Custom function returned false',
        assertion: {
          type: 'javascript',
          value: expect.any(String),
        },
      });
      expect(typeof result.assertion?.value).toBe('string');
    },
  );

  it.each([
    '1 / 0',
    '-1 / 0',
    '0 / 0',
    '({ pass: true, score: Infinity, reason: "Custom" })',
    '({ pass: true, score: 1, reason: "Custom", namedScores: { quality: NaN } })',
    '({ pass: true, score: 1, reason: "Custom", namedScoreWeights: { quality: Infinity } })',
    '({ pass: true, score: 1, reason: "Custom", componentResults: [{ pass: true, score: Infinity, reason: "Nested" }] })',
    '({ pass: true, score: 1, reason: "Custom", namedScores: new Date(0) })',
    '({ pass: true, score: 1, reason: "Custom", namedScoreWeights: new Map([["quality", 1]]) })',
    '({ pass: true, score: 1, reason: "Custom", namedScores: new Set([1]) })',
    '({ pass: true, score: 1, reason: "Custom", namedScores: Object.defineProperty([1], Symbol.toStringTag, { value: "Object" }) })',
    '({ pass: true, score: 1, reason: "Custom", namedScoreWeights: Object.defineProperty(new Map([["quality", 1]]), Symbol.toStringTag, { value: "Object" }) })',
  ])('rejects invalid inline assertion results: %s', async (value) => {
    const result = await runAssertion({
      prompt: 'Some prompt',
      assertion: { type: 'javascript', value },
      test: {},
      providerResponse: { output: 'Test output' },
    });

    expect(result).toMatchObject({ pass: false, score: 0 });
    expect(result.reason).toContain('Custom function threw error:');
    expect(result.reason).toContain('finite');
    expect(result.namedScores).toBeUndefined();
    expect(result.namedScoreWeights).toBeUndefined();
    expect(result.componentResults).toBeUndefined();
  });

  it.each([
    [
      'boolean, null, and numeric string named scores',
      '({ pass: true, score: 1, reason: "Custom", namedScores: { yes: true, no: false, skipped: null, half: "0.5", unset: undefined } })',
      { namedScores: { yes: 1, no: 0, skipped: 0, half: 0.5 } },
    ],
    [
      'nested results without a reason or score',
      '({ pass: true, score: 1, reason: "Custom", componentResults: [{ pass: true, score: 0.75 }, { pass: false, reason: "Nested" }] })',
      {
        componentResults: [
          { pass: true, score: 0.75, reason: '' },
          { pass: false, score: 0, reason: 'Nested' },
        ],
      },
    ],
    [
      'boolean named scores in nested results',
      '({ pass: true, score: 1, reason: "Custom", componentResults: [{ pass: true, score: 1, reason: "Nested", namedScores: { inner: true } }] })',
      { componentResults: [{ pass: true, score: 1, reason: 'Nested', namedScores: { inner: 1 } }] },
    ],
  ])('accepts result shapes earlier releases recorded: %s', async (_shape, value, expected) => {
    const result = await runAssertion({
      prompt: 'Some prompt',
      assertion: { type: 'javascript', value },
      test: {},
      providerResponse: { output: 'Test output' },
    });

    expect(result).toMatchObject({ pass: true, score: 1, reason: 'Custom', ...expected });
    expect(result.namedScores ?? {}).not.toHaveProperty('unset');
  });

  it('records a boolean named score from a function assertion without changing its result', async () => {
    const grade = Object.freeze({
      pass: true,
      score: 1,
      reason: 'Custom',
      namedScores: Object.freeze({ exact_match: true }),
    });

    const result = await runAssertion({
      prompt: 'Some prompt',
      assertion: { type: 'javascript', value: () => grade },
      test: {},
      providerResponse: { output: 'Test output' },
    });

    expect(result).toMatchObject({ pass: true, score: 1, namedScores: { exact_match: 1 } });
    expect(grade.namedScores.exact_match).toBe(true);
  });

  it('rejects a nonfinite async function result before applying inverse logic', async () => {
    const result = await runAssertion({
      prompt: 'Some prompt',
      assertion: { type: 'not-javascript', value: async () => Number.NaN },
      test: {},
      providerResponse: { output: 'Test output' },
    });

    expect(result).toMatchObject({ pass: false, score: 0 });
    expect(result.reason).toContain('finite');
  });

  it('omits rejected object payloads from validation errors', async () => {
    const result = await runAssertion({
      assertion: {
        type: 'javascript',
        value: () => ({
          pass: true,
          score: Number.NaN,
          reason: 'Custom grade',
          metadata: { http: { requestHeaders: { authorization: 'diagnostic-placeholder' } } },
        }),
      },
      test: {},
      providerResponse: { output: 'Test output' },
    });

    expect(result).toMatchObject({ pass: false, score: 0 });
    expect(result.reason).toContain('finite scores and weights. Got type object.');
    expect(result.reason).not.toContain('diagnostic-placeholder');
    expect(result.reason).not.toContain('requestHeaders');
    expect(result.metadata).toBeUndefined();
  });

  it.each([
    'score: NaN',
    'score: 1, namedScores: { quality: Infinity }',
    'score: 1, componentResults: [{ pass: true, score: Infinity, reason: "Child" }]',
  ])('omits rendered source from invalid grading diagnostics: %s', async (fields) => {
    const value = `({ pass: true, reason: "Custom grade", ${fields}, metadata: { note: "{{ diagnosticMarker }}" } })`;
    const result = await runAssertion({
      assertion: { type: 'javascript', value },
      test: { vars: { diagnosticMarker: 'diagnostic-placeholder' } },
      providerResponse: { output: 'Test output' },
    });

    expect(result).toMatchObject({ pass: false, score: 0 });
    expect(result.reason).toContain('finite scores and weights. Got type object.');
    expect(result.reason).not.toContain('diagnostic-placeholder');
    expect(result.assertion?.value).toBe(value);
    expect(result.metadata?.renderedAssertionValue).toContain('diagnostic-placeholder');
  });

  it.each([
    ['runtime exception', '// diagnostic-placeholder\nthrow new Error("Ordinary failure");'],
    ['syntax error', '// diagnostic-placeholder\nreturn ('],
    ['false result', 'false /* diagnostic-placeholder */'],
  ])('preserves rendered source for an ordinary %s', async (_kind, value) => {
    const result = await runAssertion({
      assertion: { type: 'javascript', value },
      test: {},
      providerResponse: { output: 'Test output' },
    });

    expect(result).toMatchObject({ pass: false, score: 0 });
    expect(result.reason).toContain(value);
    expect(result.assertion?.value).toBe(value);
  });

  it.each(['namedScores', 'namedScoreWeights', 'componentResults'])(
    'accepts nullable %s on JavaScript results and nested components',
    async (field) => {
      const result = await runAssertion({
        prompt: 'Some prompt',
        assertion: {
          type: 'javascript',
          value: `(${JSON.stringify({
            pass: true,
            score: 0.75,
            reason: 'Custom',
            [field]: null,
            componentResults: [{ pass: true, score: 0.5, reason: 'Nested', [field]: null }],
          })})`,
        },
        test: {},
        providerResponse: { output: 'Test output' },
      });

      expect(result).toMatchObject({
        pass: true,
        score: 0.75,
        componentResults: [{ pass: true, score: 0.5, [field]: null }],
      });
    },
  );

  it.each([
    'new Array(1)',
    'Object.assign(new Array(1), { [Symbol.iterator]: function* () { yield { pass: true, score: 1, reason: "Iterator result" }; } })',
  ])('rejects sparse nested results before they become null components: %s', async (components) => {
    const result = await runAssertion({
      prompt: 'Some prompt',
      assertion: {
        type: 'javascript',
        value: `({ pass: true, score: 1, reason: "", componentResults: ${components} })`,
      },
      test: {},
      providerResponse: { output: 'Test output' },
    });

    expect(result).toMatchObject({ pass: false, score: 0 });
    expect(result.reason).toContain('Custom function threw error:');
    expect(result.componentResults).toBeUndefined();
  });

  it('rejects cyclic component results with the ordinary validation error', async () => {
    const grade: GradingResult = { pass: true, score: 1, reason: 'Custom grade' };
    grade.componentResults = [grade];

    const result = await runAssertion({
      assertion: { type: 'javascript', value: () => grade },
      test: {},
      providerResponse: { output: 'Test output' },
    });

    expect(result).toMatchObject({ pass: false, score: 0 });
    expect(result.reason).toContain('finite scores and weights. Got type object.');
    expect(result.reason).not.toContain('RangeError');
    expect(result.componentResults).toBeUndefined();
  });

  it('rejects nonfinite metrics from a file assertion', async () => {
    vi.mocked(path.resolve).mockReturnValue('/mocked/path/to/assert.js');
    vi.mocked(path.extname).mockReturnValue('.js');
    vi.mocked(isPackagePath).mockReturnValue(false);
    vi.mocked(importModule).mockResolvedValue(
      vi.fn(() => ({ pass: true, score: 1, reason: '', namedScores: { quality: Infinity } })),
    );

    const result = await runAssertion({
      prompt: 'Some prompt',
      assertion: { type: 'javascript', value: 'file:///path/to/assert.js' },
      test: {},
      providerResponse: { output: 'Test output' },
    });

    expect(result).toMatchObject({ pass: false, score: 0 });
    expect(result.reason).toContain('finite');
    expect(result.namedScores).toBeUndefined();
  });

  it.each([-2, 2])('preserves finite numeric scores outside 0–1: %s', async (score) => {
    const result = await runAssertion({
      prompt: 'Some prompt',
      assertion: { type: 'javascript', value: () => score },
      test: {},
      providerResponse: { output: 'Test output' },
    });

    expect(result).toMatchObject({ pass: score > 0, score });
  });

  it('should honor threshold when a direct function-valued javascript assertion returns a number', async () => {
    const output = 'Expected output';
    const assertion: Assertion = {
      type: 'javascript',
      value: () => 0.25,
      threshold: 0.5,
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
      score: 0.25,
      reason: 'Custom function returned false',
      assertion: {
        type: 'javascript',
        value: expect.any(String),
      },
    });
  });

  describe.each(['inherited', 'non-enumerable'] as const)('%s numeric threshold', (kind) => {
    it.each([
      ['javascript', 0.25, false],
      ['javascript', 0.5, true],
      ['javascript', 0.75, true],
      ['not-javascript', 0.25, true],
      ['not-javascript', 0.5, false],
      ['not-javascript', 0.75, false],
    ] as const)('grades %s score %s before serializing metadata', async (type, score, pass) => {
      const value = () => score;
      const assertion: Assertion = Object.assign(
        kind === 'inherited' ? Object.create({ threshold: 0.5 }) : {},
        { type, value },
      );
      if (kind === 'non-enumerable') {
        Object.defineProperty(assertion, 'threshold', { value: 0.5 });
      }
      Object.freeze(assertion);

      const result = await runAssertion({
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output: 'Threshold fixture' },
      });

      expect(result).toMatchObject({ pass, score });
      expect(result.assertion).toEqual({ type, value: value.toString() });
      expect(assertion.value).toBe(value);
      expect(assertion.threshold).toBe(0.5);
    });
  });

  it.each(['javascript', 'not-javascript'] as const)(
    'preserves threshold getter ordering for %s numeric results',
    async (type) => {
      const reads: number[] = [];
      const assertion: Assertion = {
        type,
        value: () => 0.6,
        get threshold() {
          const value = [0.7, 0.7, 0.7, 0.5][reads.length] ?? 0.5;
          reads.push(value);
          return value;
        },
      };

      const result = await runAssertion({
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output: 'Threshold getter fixture' },
      });

      expect(result).toMatchObject({
        pass: type === 'javascript',
        score: 0.6,
        assertion: { type, threshold: 0.7, value: expect.any(String) },
      });
      // The dispatcher serializes once, followed by metadata serialization and two comparisons.
      expect(reads).toEqual([0.7, 0.7, 0.7, 0.5]);
    },
  );

  const inverseFunctionAssertionCases: [string, Assertion, boolean, number, string][] = [
    [
      'boolean results for not-javascript assertions',
      {
        type: 'not-javascript',
        value: () => true,
      },
      false,
      0,
      'Custom function returned true',
    ],
    [
      'numeric results for not-javascript assertions',
      {
        type: 'not-javascript',
        value: () => 0.25,
        threshold: 0.5,
      },
      true,
      0.25,
      'Assertion passed',
    ],
    [
      'GradingResult results for not-javascript assertions',
      {
        type: 'not-javascript',
        value: () => ({
          pass: true,
          score: 0.75,
          reason: 'Custom reason',
        }),
      },
      false,
      0.75,
      'Custom reason',
    ],
    [
      'empty-reason GradingResult results for not-javascript assertions',
      { type: 'not-javascript', value: () => ({ pass: true, score: 1, reason: '' }) },
      false,
      1,
      '',
    ],
  ];

  it.each(inverseFunctionAssertionCases)(
    'should honor inverse mode for direct function-valued javascript assertions with %s',
    async (_type, assertion, expectedPass, expectedScore, expectedReason) => {
      const output = 'Expected output';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toMatchObject({
        pass: expectedPass,
        score: expectedScore,
        reason: expectedReason,
        assertion: {
          type: 'not-javascript',
          value: expect.any(String),
        },
      });
    },
  );

  it.each(['prototype', 'non-enumerable'] as const)(
    'preserves %s grading fields from frozen custom results',
    async (storage) => {
      for (const rawPass of [false, true]) {
        for (const inverse of [false, true]) {
          class CustomResult {
            score = 0.4;
            namedScores = { safety: 0.7 };
            tokensUsed = { total: 3 };
            get pass() {
              return rawPass;
            }
            get reason() {
              return 'Custom reason';
            }
            get assertion(): Assertion {
              return { type: 'javascript', value: () => false };
            }
          }
          const grading = new CustomResult();
          if (storage === 'non-enumerable') {
            Object.defineProperties(grading, {
              pass: { value: rawPass },
              reason: { value: 'Custom reason' },
            });
          }
          Object.freeze(grading);
          const assertion: Assertion = {
            type: inverse ? 'not-javascript' : 'javascript',
            value: () => grading,
          };
          const result = await runAssertion({
            prompt: 'Some prompt',
            provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
            assertion,
            test: {} as AtomicTestCase,
            providerResponse: { output: 'Expected output' },
          });
          expect(result).toMatchObject({
            pass: rawPass !== inverse,
            score: 0.4,
            reason: 'Custom reason',
            namedScores: { safety: 0.7 },
            tokensUsed: { total: 3 },
            assertion: { type: 'javascript', value: '() => false' },
          });
          expect(Object.isFrozen(grading)).toBe(true);
          expect(grading.pass).toBe(rawPass);
          expect(grading.reason).toBe('Custom reason');
        }
      }
    },
  );

  const inverseStringAssertionCases: [string, Assertion, boolean, number, string][] = [
    [
      'empty-reason GradingResult results for not-javascript assertions',
      {
        type: 'not-javascript',
        value: "({ pass: true, score: 1, reason: '' })",
      },
      false,
      1,
      '',
    ],
    [
      'boolean results for not-javascript assertions',
      {
        type: 'not-javascript',
        value: 'output === "Expected output"',
      },
      false,
      0,
      'Custom function returned true\noutput === "Expected output"',
    ],
    [
      'numeric results for not-javascript assertions',
      {
        type: 'not-javascript',
        value: '0.25',
        threshold: 0.5,
      },
      true,
      0.25,
      'Assertion passed',
    ],
    [
      'GradingResult results for not-javascript assertions',
      {
        type: 'not-javascript',
        value: `
          return {
            pass: true,
            score: 0.75,
            reason: 'Custom reason',
          };
        `,
      },
      false,
      0.75,
      'Custom reason',
    ],
  ];

  it.each(inverseStringAssertionCases)(
    'should honor inverse mode for inline javascript assertions with %s',
    async (_type, assertion, expectedPass, expectedScore, expectedReason) => {
      const output = 'Expected output';

      const result: GradingResult = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output },
      });

      expect(result).toMatchObject({
        pass: expectedPass,
        score: expectedScore,
        reason: expectedReason,
        assertion: {
          type: 'not-javascript',
          value: expect.any(String),
        },
      });
    },
  );

  it('should honor inverse mode when a file:// javascript assertion returns a number', async () => {
    const output = 'Expected output';

    vi.mocked(path.resolve).mockReturnValue('/mocked/path/to/assert.js');
    vi.mocked(path.extname).mockReturnValue('.js');
    vi.mocked(isPackagePath).mockReturnValue(false);
    vi.mocked(importModule).mockResolvedValue(vi.fn(() => 0.25));

    const assertion: Assertion = {
      type: 'not-javascript',
      value: 'file:///path/to/assert.js',
      threshold: 0.5,
    };

    const result: GradingResult = await runAssertion({
      prompt: 'Some prompt',
      provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output },
    });

    expect(result).toMatchObject({
      pass: true,
      score: 0.25,
      reason: 'Assertion passed',
      assertion: {
        type: 'not-javascript',
        value: 'file:///path/to/assert.js',
      },
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
  ])(
    'should pass when the file:// assertion with .js file returns a %s',
    async (_type, mockFn, expectedPass, expectedReason) => {
      const output = 'Expected output';

      // Mock path.resolve to return a valid path
      vi.mocked(path.resolve).mockReturnValue('/mocked/path/to/assert.js');
      vi.mocked(path.extname).mockReturnValue('.js');

      // Mock isPackagePath to return false for file:// paths
      vi.mocked(isPackagePath).mockReturnValue(false);

      const mockImportModule = vi.mocked(importModule);
      mockImportModule.mockResolvedValue(mockFn);

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
    },
  );

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
  ])(
    'should pass when assertion is a package path',
    async (_type, mockFn, expectedPass, expectedReason) => {
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
    },
  );

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

    it.each([
      ['const x = output.length; /* ; */ x === 4', true],
      ['const x = output.length; /* ; */ x === 5', false],
      ['const x = output.length; x === 4 // ;', true],
      ['const x = output.length; x === 4; /* ; */', true],
      ['const x = output.length; x === 4;; // ;', true],
      ['const x = output.length; /* \' " ` ; */ x === 4', true],
    ])('should grade an inline assertion containing comments: %s', async (value, pass) => {
      const assertion: Assertion = { type: 'javascript', value };
      const result = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output: 'test' },
      });

      expect(result).toMatchObject({
        pass,
        score: pass ? 1 : 0,
        reason: pass ? 'Assertion passed' : `Custom function returned false\n${value}`,
      });
    });

    it('should reject an unterminated block comment', async () => {
      const assertion: Assertion = {
        type: 'javascript',
        value: 'const x = output.length; /* ; x === 4',
      };
      const result = await runAssertion({
        prompt: 'Some prompt',
        provider: new OpenAiChatCompletionProvider('gpt-4o-mini'),
        assertion,
        test: {} as AtomicTestCase,
        providerResponse: { output: 'test' },
      });

      expect(result).toMatchObject({
        pass: false,
        score: 0,
        reason: expect.stringContaining('Custom function threw error:'),
      });
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

  describe('Metadata access in JavaScript assertions', () => {
    const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');

    async function runMetadataAssertion(
      value: string,
      metadata?: Record<string, any>,
    ): Promise<GradingResult> {
      return runAssertion({
        prompt: 'Some prompt',
        provider,
        assertion: { type: 'javascript', value },
        test: {} as AtomicTestCase,
        providerResponse: {
          output: 'Expected output',
          ...(metadata === undefined ? {} : { metadata }),
        },
      });
    }

    it('should access metadata via context.metadata shortcut', async () => {
      const result = await runMetadataAssertion('context.metadata?.toolCalls <= 10', {
        toolCalls: 5,
        toolNames: ['get_weather', 'search'],
      });

      expect(result.pass).toBe(true);
      expect(result.reason).toBe('Assertion passed');
    });

    it('should access metadata via context.providerResponse.metadata (full path)', async () => {
      const result = await runMetadataAssertion(
        'context.providerResponse?.metadata?.toolCalls <= 10',
        {
          toolCalls: 5,
        },
      );

      expect(result.pass).toBe(true);
      expect(result.reason).toBe('Assertion passed');
    });

    it('should fail assertion when metadata check fails', async () => {
      const result = await runMetadataAssertion('context.metadata?.toolCalls <= 3', {
        toolCalls: 10,
      });

      expect(result.pass).toBe(false);
    });

    it('should handle missing metadata gracefully with nullish coalescing', async () => {
      const result = await runMetadataAssertion('(context.metadata?.toolCalls ?? 0) <= 10');

      expect(result.pass).toBe(true);
    });

    it('should handle empty metadata object gracefully', async () => {
      const result = await runMetadataAssertion('(context.metadata?.toolCalls ?? 0) <= 10', {});

      expect(result.pass).toBe(true);
    });

    it.each([
      {
        name: 'HTTP metadata',
        value: 'context.metadata?.http?.status === 200',
        metadata: {
          http: {
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
          },
        },
      },
      {
        name: 'array metadata',
        value: 'context.metadata?.toolNames?.includes("get_weather")',
        metadata: {
          toolNames: ['get_weather', 'search', 'calculate'],
        },
      },
      {
        name: 'complex metadata assertions with variables',
        value:
          'const meta = context.metadata; meta && meta.toolCalls <= 10 && meta.toolNames?.length <= 5',
        metadata: {
          toolCalls: 5,
          toolNames: ['get_weather', 'search'],
        },
      },
    ])('should access $name', async ({ value, metadata }) => {
      const result = await runMetadataAssertion(value, metadata);

      expect(result).toMatchObject({ pass: true });
    });
  });
});

describe('not-javascript: GradingResult reason preservation on inversion', () => {
  const provider = new OpenAiChatCompletionProvider('gpt-4o-mini');

  it('preserves custom reason verbatim when function returns pass:true and assertion is inverted (test fails)', async () => {
    // Function says "output contains foo" — not-javascript should fail and keep the reason verbatim.
    const assertion: Assertion = {
      type: 'not-javascript',
      value: async (output: string) => ({
        pass: output.includes('foo'),
        score: output.includes('foo') ? 1 : 0,
        reason: 'Expected output not to contain "foo", but it did.',
      }),
    };

    const result = await runAssertion({
      prompt: 'Some prompt',
      provider,
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output: 'foo bar' },
    });

    expect(result.pass).toBe(false);
    // Reason must NOT be the generic "Custom function returned true"
    expect(result.reason).not.toBe('Custom function returned true');
    // Reason must surface the custom message verbatim (no NOT: prefix)
    expect(result.reason).toBe('Expected output not to contain "foo", but it did.');
  });

  it('preserves custom reason when function returns pass:false and assertion is inverted (test passes)', async () => {
    // Function says output does NOT contain "foo" — not-javascript should pass.
    const assertion: Assertion = {
      type: 'not-javascript',
      value: async (output: string) => ({
        pass: output.includes('foo'),
        score: output.includes('foo') ? 1 : 0,
        reason: 'Output does not contain the forbidden word.',
      }),
    };

    const result = await runAssertion({
      prompt: 'Some prompt',
      provider,
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output: 'hello world' },
    });

    expect(result.pass).toBe(true);
    expect(result.reason).toBe('Output does not contain the forbidden word.');
  });

  it('does not replace reason when inversion does not change the outcome', async () => {
    const assertion: Assertion = {
      type: 'javascript',
      value: async (_output: string) => ({
        pass: true,
        score: 1,
        reason: 'My custom reason',
      }),
    };

    const result = await runAssertion({
      prompt: 'Some prompt',
      provider,
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output: 'anything' },
    });

    expect(result.pass).toBe(true);
    expect(result.reason).toBe('My custom reason');
  });

  it('preserves empty-string reason verbatim and does not replace it with a fallback', async () => {
    // Returning reason: '' is a valid GradingResult. The || fallback used to
    // replace it with 'Assertion passed'; ?? preserves it.
    const assertion: Assertion = {
      type: 'not-javascript',
      value: async (output: string) => ({
        pass: output.includes('foo'),
        score: 0,
        reason: '',
      }),
    };

    const result = await runAssertion({
      prompt: 'Some prompt',
      provider,
      assertion,
      test: {} as AtomicTestCase,
      providerResponse: { output: 'hello world' }, // does not include 'foo' → function pass:false → not-javascript pass:true
    });

    expect(result.pass).toBe(true);
    expect(result.reason).toBe(''); // empty string must be preserved verbatim
  });
});
