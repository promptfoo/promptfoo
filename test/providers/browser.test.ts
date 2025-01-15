import { createTransformResponse } from '../../src/providers/browser';

describe('createTransformResponse', () => {
  it('should return the provided function when input is a function', () => {
    const mockFn = (extracted: Record<string, any>, finalHtml: string) => ({ output: 'test' });
    const transformer = createTransformResponse(mockFn);
    expect(transformer({}, '')).toEqual({ output: 'test' });
  });

  it('should handle extracted data in transformer function', () => {
    const mockFn = (extracted: Record<string, any>) => ({ output: extracted.value });
    const transformer = createTransformResponse(mockFn);
    const extracted = { value: 'test value' };
    expect(transformer(extracted, '')).toEqual({ output: 'test value' });
  });

  it('should handle finalHtml in transformer function', () => {
    const mockFn = (_: Record<string, any>, finalHtml: string) => ({ output: finalHtml });
    const transformer = createTransformResponse(mockFn);
    const finalHtml = 'test html';
    expect(transformer({}, finalHtml)).toEqual({ output: finalHtml });
  });

  it('should create function from string input', () => {
    const transformer = createTransformResponse('({ output: finalHtml })');
    const finalHtml = 'test html';
    expect(transformer({}, finalHtml)).toEqual({ output: finalHtml });
  });

  it('should handle undefined input by returning a function that returns extracted and finalHtml', () => {
    const transformer = createTransformResponse(undefined);
    const result = transformer({ extracted: 'data' }, 'html');
    expect(result).toEqual({ output: undefined });
  });

  it('should handle null input by returning a function that returns extracted and finalHtml', () => {
    const transformer = createTransformResponse(null);
    const result = transformer({ extracted: 'data' }, 'html');
    expect(result).toEqual({ output: undefined });
  });
});
