import { describe, expect, it, vi } from 'vitest';
import {
  createTransformRequest,
  createTransformResponse,
} from '../../src/providers/httpTransforms';

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

  it('should strip trailing semicolon from arrow function expression', async () => {
    const parser = await createTransformResponse('(json) => json.data;');
    const result = parser({ data: 'value' }, '');
    expect(result.output).toBe('value');
  });

  it('should strip trailing semicolon from multi-line arrow function', async () => {
    const parser = await createTransformResponse(`(json, text) => {
      return json.result;
    };`);
    const result = parser({ result: 'success' }, '');
    expect(result.output).toBe('success');
  });

  it('should strip trailing semicolon from regular function expression', async () => {
    const parser = await createTransformResponse('function(json) { return json.data; };');
    const result = parser({ data: 'value' }, '');
    expect(result.output).toBe('value');
  });

  it('should handle function body with return statements (no function wrapper)', async () => {
    const parser = await createTransformResponse(`
      const value = json.data;
      if (value) {
        return value.toUpperCase();
      }
      return text;
    `);
    const result = parser({ data: 'hello' }, 'fallback');
    expect(result.output).toBe('HELLO');
  });

  it('should handle multi-line function body with complex logic', async () => {
    const parser = await createTransformResponse(`
      if (json && json.result) {
        return json.result;
      }
      if (text) {
        return text;
      }
      return 'no data';
    `);
    const result = parser({ result: 'success' }, '');
    expect(result.output).toBe('success');
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
      await new Promise((resolve) => setTimeout(resolve, 10));
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

  it('should strip trailing semicolon from arrow function expression', async () => {
    const transform = await createTransformRequest('(prompt) => prompt.toUpperCase();');
    const result = await transform('hello', {} as any);
    expect(result).toBe('HELLO');
  });

  it('should strip trailing semicolon from multi-line arrow function', async () => {
    const transform = await createTransformRequest(`(prompt, vars) => {
      return { text: prompt.toUpperCase() };
    };`);
    const result = await transform('hello', {} as any);
    expect(result).toEqual({ text: 'HELLO' });
  });

  it('should strip trailing semicolon from regular function expression', async () => {
    const transform = await createTransformRequest(
      'function(prompt) { return prompt.toUpperCase(); };',
    );
    const result = await transform('hello', {} as any);
    expect(result).toBe('HELLO');
  });
});
