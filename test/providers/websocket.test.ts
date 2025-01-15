import { createTransformResponse } from '../../src/providers/websocket';

describe('createTransformResponse', () => {
  it('should use provided function parser directly', () => {
    const parser = (data: any) => ({ output: `parsed-${data}` });
    const transform = createTransformResponse(parser);
    expect(transform('test')).toEqual({ output: 'parsed-test' });
  });

  it('should create function from string parser', () => {
    const parser = "({ output: 'string-parsed-' + data })";
    const transform = createTransformResponse(parser);
    expect(transform('test')).toEqual({ output: 'string-parsed-test' });
  });

  it('should return default transform when parser is undefined', () => {
    const transform = createTransformResponse(undefined);
    const data = { foo: 'bar' };
    expect(transform(data)).toEqual({ output: data });
  });

  it('should handle complex data structures', () => {
    const parser = (data: any) => ({
      output: data.nested.value,
      error: data.error,
    });
    const transform = createTransformResponse(parser);

    const testData = {
      nested: { value: 'test-value' },
      error: null,
    };

    expect(transform(testData)).toEqual({
      output: 'test-value',
      error: null,
    });
  });

  it('should use default transform for invalid string parser', () => {
    const invalidParser = 'this is not valid javascript';

    // Should throw when creating transform function
    expect(() => {
      createTransformResponse(invalidParser);
    }).toThrow(SyntaxError);
  });
});
