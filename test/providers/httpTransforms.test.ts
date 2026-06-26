import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createTransformRequest,
  createTransformResponse,
} from '../../src/providers/httpTransforms';

afterEach(() => {
  vi.resetAllMocks();
});

const supportsSourcePhaseImports = (() => {
  try {
    new Function('return () => import.source("./unused.wasm")');
    return true;
  } catch {
    return false;
  }
})();

describe('createTransformResponse', () => {
  it('should throw error if file:// reference is passed (should be pre-loaded)', async () => {
    await expect(createTransformResponse('file://custom-parser.js')).rejects.toThrow(
      /should be pre-loaded before calling createTransformResponse/,
    );
  });

  it('should throw error for unsupported parser type', async () => {
    await expect(createTransformResponse(123 as any)).rejects.toThrow(
      "Unsupported response transform type: number. Expected a function, a string starting with 'file://' pointing to a JavaScript file, or a string containing a JavaScript expression.",
    );
  });

  it('should return default parser when no parser is provided', async () => {
    const parser = await createTransformResponse(undefined);
    const result = parser({ key: 'value' }, 'raw text');
    expect(result.output).toEqual({ key: 'value' });
  });

  it('should handle function parser returning an object', async () => {
    const parser = await createTransformResponse((data: any) => ({
      output: data.result,
      metadata: { something: 1 },
      tokenUsage: { prompt: 2, completion: 3, total: 4 },
    }));

    const result = parser({ result: 'response text' }, '');
    expect(result).toEqual({
      output: 'response text',
      metadata: { something: 1 },
      tokenUsage: { prompt: 2, completion: 3, total: 4 },
    });
  });

  it('should handle function parser returning a primitive', async () => {
    const parser = await createTransformResponse((data: any) => data.result);
    const result = parser({ result: 'success' }, '');
    expect(result).toEqual({ output: 'success' });
  });

  it('should handle string parser expression', async () => {
    const parser = await createTransformResponse('json.result');
    const result = parser({ result: 'parsed' }, '');
    expect(result.output).toBe('parsed');
  });

  it('should wrap numeric string parser results as provider output', async () => {
    const parser = await createTransformResponse('42');
    const result = parser({}, '');
    expect(result).toEqual({ output: 42 });
  });

  it('should handle arrow function expression', async () => {
    const parser = await createTransformResponse('(json) => json.data');
    const result = parser({ data: 'value' }, '');
    expect(result.output).toBe('value');
  });

  it('should handle regular function expression', async () => {
    const parser = await createTransformResponse('function(json) { return json.data; }');
    const result = parser({ data: 'value' }, '');
    expect(result.output).toBe('value');
  });

  it('should pass context parameter to parser', async () => {
    const parser = await createTransformResponse(
      '(json, text, context) => ({ output: json.data, status: context.response.status })',
    );
    const result = parser({ data: 'value' }, '', { response: { status: 200 } } as any);
    expect(result).toEqual({ output: 'value', status: 200 });
  });

  it('should handle errors in function parser gracefully', async () => {
    const errorFn = () => {
      throw new Error('Parser error');
    };
    const parser = await createTransformResponse(errorFn);
    expect(() => parser({ data: 'test' }, 'test')).toThrow('Parser error');
  });

  it('should handle errors in string expression parser', async () => {
    const parser = await createTransformResponse('json.nonexistent.field');
    expect(() => parser({}, '')).toThrow();
  });

  it('should return output with default data when no data provided', async () => {
    const parser = await createTransformResponse(undefined);
    const result = parser(null, 'raw text');
    expect(result.output).toBe('raw text');
  });

  it.each([
    ['parenthesized arrow', '(json) => json.data;', 'value'],
    ['comment-separated arrow', '(json) /* parser */ => json.data;', 'value'],
    ['single-parameter arrow', 'json => json.data;;\r\n', 'value'],
    ['async-prefixed parameter', 'asyncValue => asyncValue.data;', 'value'],
    ['escaped-identifier arrow', '\\u0061 => \\u0061.data;', 'value'],
    ['redundantly grouped arrow', '((json) => json.data);', 'value'],
    ['multiline parameters', '(\n json,\n text\n) => json.data;', 'value'],
    ['parameter comment', '(json /* payload */) => json.data;', 'value'],
    ['destructured and rest parameters', '({ data }, ...rest) => data + rest.length;', 'value2'],
    ['anonymous function', 'function(json) { return json.data; };', 'value'],
    ['sloppy anonymous function', 'function(json, json) { return json; };', 'raw'],
  ])('should strip trailing semicolons from %s response expressions', async (_, code, output) => {
    const parser = await createTransformResponse(code);
    const result = parser({ data: 'value' }, 'raw');
    expect(result.output).toBe(output);
  });

  it('should preserve semicolons inside quoted values and object literals', async () => {
    const parser = await createTransformResponse(
      '() => ({ output: "literal;", metadata: { marker: "inner;" } });;',
    );
    const result = parser({}, '');
    expect(result).toEqual({ output: 'literal;', metadata: { marker: 'inner;' } });
  });

  it('should preserve semicolons inside template literals', async () => {
    const parser = await createTransformResponse('(json) => `value;${json.data};`;;');
    const result = parser({ data: 'inner' }, '');
    expect(result.output).toBe('value;inner;');
  });

  it('should handle regex and division in default parameters', async () => {
    const parser = await createTransformResponse(
      '(json, text, context, divisor = 4 / 2, pattern = /value/) => pattern.test(json.data) ? json.data.length / divisor : 0;',
    );
    const result = parser({ data: 'value' }, '');
    expect(result.output).toBe(2.5);
  });

  it('should handle multi-statement function bodies without stripping internal semicolons', async () => {
    const parser = await createTransformResponse(`(json) => {
      const suffix = ";";
      return { output: json.data + suffix };
    };;   `);
    const result = parser({ data: 'value' }, '');
    expect(result.output).toBe('value;');
  });

  it('should handle nested syntax in function bodies and arrow parameters', async () => {
    const functionParser = await createTransformResponse(
      'function(json) { if (json) { return { output: json.data }; } return null; };',
    );
    const arrowParser = await createTransformResponse(
      '(json, text, context, pattern = /\\)/, getter = (value) => value.data) => pattern.test(json.marker) ? getter(json) : null;',
    );
    expect(functionParser({ data: 'function' }, '')).toEqual({ output: 'function' });
    expect(arrowParser({ data: 'arrow', marker: ')' }, '')).toEqual({ output: 'arrow' });
  });

  it('should parse transforms in the generated function context', async () => {
    const parser = await createTransformResponse('() => typeof new.target;');
    expect(parser({}, '')).toEqual({ output: 'undefined' });
  });

  it.skipIf(!supportsSourcePhaseImports)(
    'should accept runtime-supported source-phase import syntax',
    async () => {
      for (const sourceImport of [
        'import.source("./unused.wasm")',
        'import /* phase */ . source /* call */ ("./unused.wasm")',
      ]) {
        const responseParser = await createTransformResponse(
          `() => false ? ${sourceImport} : "response";`,
        );
        const requestTransform = await createTransformRequest(
          `() => false ? ${sourceImport} : "request";`,
        );
        expect(responseParser({}, '')).toEqual({ output: 'response' });
        await expect(requestTransform('hello', {} as any)).resolves.toBe('request');
      }
    },
  );

  it('should preserve multiline function-valued expression semantics', async () => {
    const parser = await createTransformResponse('(\n  () => json.data\n)()');
    const result = parser({ data: 'value' }, '');
    expect(result.output).toBe('value');
  });

  it('should invoke multiply grouped arrow functions', async () => {
    const parser = await createTransformResponse('(((json) => json.data))');
    const result = parser({ data: 'value' }, '');
    expect(result.output).toBe('value');
  });

  it('should reject bare multi-statement response bodies', async () => {
    const parser = await createTransformResponse('const value = json.data; return value;');
    expect(() => parser({ data: 'value' }, '')).toThrow('Failed to transform response');
  });

  it('should keep expressions containing the word return as expressions', async () => {
    const parser = await createTransformResponse(
      'json.message.includes("return") ? json.message : text',
    );
    const result = parser({ message: 'please return this' }, 'fallback');
    expect(result.output).toBe('please return this');
  });

  it('should not invoke arbitrary function-valued expressions', async () => {
    const returnedFunction = () => 'value';
    const parser = await createTransformResponse('json.callback');
    const result = parser({ callback: returnedFunction }, '');
    expect(result.output).toBe(returnedFunction);
  });

  it.each([
    ['bare-arrow sequence', 'json => json.data, json.callback;'],
    ['grouped sequence', '((json) => json.data, json.callback);'],
    ['arrow-like string', '(") =>", json.callback);'],
    ['anonymous-function composite', 'function() {} && json.callback;'],
    ['anonymous-function arithmetic', 'function() {} + json.callback();'],
    ['anonymous-function IIFE', 'function() { return json.callback; }(0);'],
    ['comment-decoy arrow', '(json) // => decoy\n? json.callback : json.other;'],
    ['parser-wrapper escape', 'json => json); json.callback(); return (0;'],
  ])('should reject semicolon-terminated %s expressions without invoking them', async (_, code) => {
    const callback = vi.fn(() => 'value');
    const parser = await createTransformResponse(code);
    expect(() => parser({ callback, data: 'ignored' }, '')).toThrow('Failed to transform response');
    expect(callback).not.toHaveBeenCalled();
  });

  it.each([
    'async (json) => json.data;',
    '(async (json) => json.data);',
  ])('should reject serialized async response function %s', async (code) => {
    const parser = await createTransformResponse(code);
    expect(() => parser({ data: 'value' }, '')).toThrow('Failed to transform response');
  });

  it('should not invoke an async response function without a terminal semicolon', async () => {
    const parser = await createTransformResponse('async (json) => json.data');
    const result = parser({ data: 'value' }, '');
    expect(result.output).toBeTypeOf('function');
  });

  it('should preserve assignment-expression semantics', async () => {
    const parser = await createTransformResponse('json = value => value.data');
    const result = parser({ data: 'value' }, '');
    expect(result.output).toBeTypeOf('function');
  });

  it.each([
    'json = value => value.data;',
    'json = async (value) => value.data;',
  ])('should reject semicolon-terminated assignment expression %s', async (code) => {
    const parser = await createTransformResponse(code);
    expect(() => parser({ data: 'value' }, '')).toThrow('Failed to transform response');
  });
});

describe('createTransformRequest', () => {
  it('should return identity function when no transform specified', async () => {
    const transform = await createTransformRequest(undefined);
    const result = await transform('test prompt', {} as any);
    expect(result).toBe('test prompt');
  });

  it('should handle string templates', async () => {
    const transform = await createTransformRequest('return {"text": prompt}');
    const result = await transform('hello', {} as any);
    expect(result).toEqual({
      text: 'hello',
    });
  });

  it('should handle errors in function-based transform', async () => {
    const errorFn = () => {
      throw new Error('Transform function error');
    };
    const transform = await createTransformRequest(errorFn);
    await expect(async () => {
      await transform('test', {} as any);
    }).rejects.toThrow('Error in request transform function: Transform function error');
  });

  it('should throw error if file:// reference is passed (should be pre-loaded)', async () => {
    await expect(createTransformRequest('file://error-transform.js')).rejects.toThrow(
      /should be pre-loaded before calling createTransformRequest/,
    );
  });

  it('should handle errors in string template transform', async () => {
    const transform = await createTransformRequest('return badVariable.nonexistent');
    await expect(async () => {
      await transform('test', {} as any);
    }).rejects.toThrow('Failed to transform request:');
  });

  it('should throw error for unsupported transform type', async () => {
    await expect(createTransformRequest(123 as any)).rejects.toThrow(
      'Unsupported request transform type: number',
    );
  });

  it('should handle errors in JavaScript expression transform', async () => {
    const transform = await createTransformRequest('throw new Error("Expression error")');
    await expect(async () => {
      await transform('test', {} as any);
    }).rejects.toThrow('Failed to transform request:');
  });

  it('should handle arrow function with explicit body', async () => {
    const transform = await createTransformRequest(
      '(prompt, vars) => { return { text: prompt.toUpperCase() } }',
    );
    const result = await transform('hello', {} as any);
    expect(result).toEqual({ text: 'HELLO' });
  });

  it('should handle arrow function with implicit return', async () => {
    const transform = await createTransformRequest('(prompt) => prompt.toUpperCase()');
    const result = await transform('hello', {} as any);
    expect(result).toBe('HELLO');
  });

  it('should handle regular function with explicit body', async () => {
    const transform = await createTransformRequest(
      'function(prompt, vars) { return { text: prompt.toUpperCase() } }',
    );
    const result = await transform('hello', {} as any);
    expect(result).toEqual({ text: 'HELLO' });
  });

  it('should handle simple expression without return', async () => {
    const transform = await createTransformRequest('prompt.toUpperCase()');
    const result = await transform('hello', {} as any);
    expect(result).toBe('HELLO');
  });

  it('should handle arrow function with context parameter', async () => {
    const transform = await createTransformRequest(
      '(prompt, vars, context) => ({ prompt, contextVars: context?.vars })',
    );
    const result = await transform('hello', { foo: 'bar' }, { vars: { test: 'value' } } as any);
    expect(result).toEqual({ prompt: 'hello', contextVars: { test: 'value' } });
  });

  it('should handle function-based transform', async () => {
    const transform = await createTransformRequest((prompt: string) => ({
      transformed: prompt.toUpperCase(),
    }));
    const result = await transform('hello', {} as any);
    expect(result).toEqual({ transformed: 'HELLO' });
  });

  it('should handle async function-based transform', async () => {
    const transform = await createTransformRequest(async (prompt: string) => {
      await Promise.resolve();
      return { transformed: prompt.toUpperCase() };
    });
    const result = await transform('hello', {} as any);
    expect(result).toEqual({ transformed: 'HELLO' });
  });

  it('should pass all parameters to function-based transform', async () => {
    const mockFn = vi.fn((prompt, vars, context) => ({ prompt, vars, context }));
    const transform = await createTransformRequest(mockFn);
    const vars = { foo: 'bar' };
    const context = { test: 'value' };
    await transform('hello', vars, context as any);

    expect(mockFn).toHaveBeenCalledWith('hello', vars, context);
  });

  it('should handle string expression with vars parameter', async () => {
    const transform = await createTransformRequest('({ text: prompt, extra: vars.extra })');
    const result = await transform('hello', { extra: 'data' } as any);
    expect(result).toEqual({ text: 'hello', extra: 'data' });
  });

  it.each([
    ['parenthesized arrow', '(prompt) => prompt.toUpperCase();'],
    ['comment-separated arrow', '(prompt) /* parser */ => prompt.toUpperCase();'],
    ['single-parameter arrow', 'prompt => prompt.toUpperCase();;\r\n'],
    ['async-prefixed parameter', 'asyncValue => asyncValue.toUpperCase();'],
    ['escaped-identifier arrow', '\\u{70}rompt => \\u{70}rompt.toUpperCase();'],
    ['redundantly grouped arrow', '((prompt) => prompt.toUpperCase());'],
    ['multiline parameters', '(\n prompt,\n vars\n) => prompt.toUpperCase();'],
    ['anonymous function', 'function(prompt) { return prompt.toUpperCase(); };'],
  ])('should strip trailing semicolons from %s request expressions', async (_, code) => {
    const transform = await createTransformRequest(code);
    const result = await transform('hello', {} as any);
    expect(result).toBe('HELLO');
  });

  it.each([
    ['spaced', 'async (prompt) => prompt.toUpperCase();'],
    ['unspaced', 'async(prompt) => prompt.toUpperCase();;'],
    ['multiline parameters', 'async (\n prompt\n) => prompt.toUpperCase();'],
    ['redundantly grouped', '(async (prompt) => prompt.toUpperCase());'],
  ])('should handle %s serialized async request functions', async (_, code) => {
    const transform = await createTransformRequest(code);
    const result = await transform('hello', {} as any);
    expect(result).toBe('HELLO');
  });

  it('should preserve quoted return text and nested objects in expressions', async () => {
    const transform = await createTransformRequest(
      '({ text: "please return this;", nested: { prompt } })',
    );
    const result = await transform('hello', {} as any);
    expect(result).toEqual({ text: 'please return this;', nested: { prompt: 'hello' } });
  });

  it('should preserve raw multi-statement request bodies', async () => {
    const transform = await createTransformRequest(`
      function decorate(value) {
        return value.toUpperCase();
      }
      return { text: decorate(prompt) };
    `);
    const result = await transform('hello', {} as any);
    expect(result).toEqual({ text: 'HELLO' });
  });

  it('should preserve raw request bodies that begin with an arrow expression', async () => {
    const transform = await createTransformRequest(
      '(value) => value; const result = prompt.toUpperCase(); return result;',
    );
    await expect(transform('hello', {} as any)).resolves.toBe('HELLO');
  });

  it('should parse transforms in the generated function context', async () => {
    const transform = await createTransformRequest('() => typeof new.target;');
    await expect(transform('hello', {} as any)).resolves.toBe('undefined');
  });

  it('should preserve multiline function-valued expression semantics', async () => {
    const transform = await createTransformRequest('(\n  () => prompt.toUpperCase()\n)()');
    const result = await transform('hello', {} as any);
    expect(result).toBe('HELLO');
  });

  it('should not invoke arbitrary function-valued expressions', async () => {
    const callback = () => 'value';
    const transform = await createTransformRequest('vars.callback');
    const result = await transform('hello', { callback } as any);
    expect(result).toBe(callback);
  });

  it.each([
    ['bare-arrow sequence', 'prompt => prompt, vars.callback;'],
    ['grouped sequence', '((prompt) => prompt, vars.callback);'],
    ['arrow-like string', '(") =>", vars.callback);'],
    ['anonymous-function composite', 'function() {} && vars.callback;'],
    ['anonymous-function arithmetic', 'function() {} + vars.callback();'],
    ['anonymous-function IIFE', 'function() { return vars.callback; }(0);'],
    ['comment-decoy arrow', '(prompt) // => decoy\n? vars.callback : vars.other;'],
    ['parser-wrapper escape', 'prompt => prompt); vars.callback(); return (0;'],
  ])('should reject semicolon-terminated %s expressions without invoking them', async (_, code) => {
    const callback = vi.fn(() => 'value');
    const transform = await createTransformRequest(code);
    await expect(transform('hello', { callback } as any)).rejects.toThrow(
      'Failed to transform request',
    );
    expect(callback).not.toHaveBeenCalled();
  });

  it('should handle large multi-statement function bodies', async () => {
    const transform = await createTransformRequest(`() => {${';'.repeat(100_000)}return 'ok';};`);
    await expect(transform('hello', {} as any)).resolves.toBe('ok');
  });

  it('should parse large arrow-like strings once when creating the transform', async () => {
    const value = '=>'.repeat(50_000);
    const transform = await createTransformRequest(JSON.stringify(value));
    for (let index = 0; index < 10; index++) {
      await expect(transform('hello', {} as any)).resolves.toBe(value);
    }
  });

  it('should handle deeply grouped arrows', async () => {
    const wrappers = 100;
    const transform = await createTransformRequest(
      `${'('.repeat(wrappers)}(prompt) => prompt.toUpperCase()${')'.repeat(wrappers)};`,
    );
    await expect(transform('hello', {} as any)).resolves.toBe('HELLO');
  });

  it('should preserve URL strings in parameter defaults and grouped arrow bodies', async () => {
    const withDefault = await createTransformRequest(
      '(prompt, vars, context, url = "https://example.test/") => url + prompt;',
    );
    const grouped = await createTransformRequest('((prompt) => "http://example.test/" + prompt);');
    await expect(withDefault('hello', {} as any)).resolves.toBe('https://example.test/hello');
    await expect(grouped('hello', {} as any)).resolves.toBe('http://example.test/hello');
  });

  it('should handle nested syntax in function bodies and arrow parameters', async () => {
    const functionTransform = await createTransformRequest(
      'function(prompt) { if (prompt) { return { text: prompt.toUpperCase() }; } return null; };',
    );
    const arrowTransform = await createTransformRequest(
      '(prompt, vars, context, apply = (value) => value.toUpperCase()) => apply(prompt);',
    );
    await expect(functionTransform('hello', {} as any)).resolves.toEqual({ text: 'HELLO' });
    await expect(arrowTransform('hello', {} as any)).resolves.toBe('HELLO');
  });

  it('should handle nested template literals in default parameters', async () => {
    const transform = await createTransformRequest(
      '(prompt, vars, context, value = `${`nested`}`) => `${prompt}:${value}`;',
    );
    await expect(transform('hello', {} as any)).resolves.toBe('hello:nested');
  });

  it('should ignore arrow-like text while locating function parameters', async () => {
    const arrowText = '=>'.repeat(300);
    const transform = await createTransformRequest(
      `(prompt, vars, context, value = ${JSON.stringify(arrowText)}) => prompt.toUpperCase();`,
    );
    await expect(transform('hello', {} as any)).resolves.toBe('HELLO');
  });

  it('should ignore arrow-like regex content while locating function parameters', async () => {
    const regexBody = '=>'.repeat(300);
    const transform = await createTransformRequest(
      `(prompt, vars, context, value = /${regexBody}/) => prompt.toUpperCase();`,
    );
    await expect(transform('hello', {} as any)).resolves.toBe('HELLO');
  });

  it('should reject large malformed regex syntax without excessive backtracking', async () => {
    const transform = await createTransformRequest('/['.repeat(32_000));
    await expect(transform('hello', {} as any)).rejects.toThrow('Failed to transform request');
  });

  it('should handle long comment sequences without repeated reverse scans', async () => {
    const transform = await createTransformRequest(`("value"${'/**/'.repeat(32_000)})`);
    await expect(transform('hello', {} as any)).resolves.toBe('value');
  });

  it('should preserve assignment-expression semantics', async () => {
    const transform = await createTransformRequest('prompt = value => value.toUpperCase()');
    await expect(transform('hello', {} as any)).resolves.toBeTypeOf('function');
  });

  it('should reject semicolon-terminated arrow assignment expressions', async () => {
    const transform = await createTransformRequest(
      'prompt = async (value) => value.toUpperCase();',
    );
    await expect(transform('hello', {} as any)).rejects.toThrow('Failed to transform request');
  });

  it('should handle comment-prefixed serialized functions', async () => {
    const transform = await createTransformRequest('/* lead */ (prompt) => prompt.toUpperCase();');
    await expect(transform('hello', {} as any)).resolves.toBe('HELLO');
  });

  it.each([
    '(prompt) => { return prompt.toUpperCase(); }; /* tail */',
    '(prompt) => { return prompt.toUpperCase(); };; /* tail */',
  ])('should reject serialized functions with comments after terminal semicolons', async (code) => {
    const transform = await createTransformRequest(code);
    await expect(transform('hello', {} as any)).rejects.toThrow('Failed to transform request');
  });

  it('should reject malformed request functions', async () => {
    const transform = await createTransformRequest('(prompt) => { return prompt;');
    await expect(transform('hello', {} as any)).rejects.toThrow('Failed to transform request');
  });
});
