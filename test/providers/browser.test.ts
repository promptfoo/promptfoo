import { BrowserProvider, createTransformResponse } from '../../src/providers/browser';

describe('createTransformResponse', () => {
  it('should handle function input', () => {
    const parser = (extracted: Record<string, any>, finalHtml: string) => ({
      output: `${finalHtml}-${JSON.stringify(extracted)}`,
    });
    const transformer = createTransformResponse(parser);
    const result = transformer({ foo: 'bar' }, '<html>test</html>');
    expect(result).toEqual({ output: '<html>test</html>-{"foo":"bar"}' });
  });

  it('should handle string input', () => {
    const parser = '({ output: finalHtml })';
    const transformer = createTransformResponse(parser);
    const result = transformer({ foo: 'bar' }, '<html>test</html>');
    expect(result).toEqual({ output: '<html>test</html>' });
  });

  it('should handle undefined input', () => {
    const transformer = createTransformResponse(undefined);
    const result = transformer({}, '<html>test</html>');
    expect(result).toEqual({ output: undefined });
  });
});

describe('BrowserProvider', () => {
  const mockConfig = {
    steps: [
      {
        action: 'navigate',
        args: { url: 'https://example.com' },
      },
    ],
  };

  it('should initialize with default config', () => {
    const provider = new BrowserProvider('test', { config: mockConfig });
    expect(provider.id()).toBe('browser-provider');
    expect(provider.toString()).toBe('[Browser Provider]');
  });

  it('should throw error for invalid config', () => {
    expect(() => {
      // @ts-ignore
      new BrowserProvider('test', { config: { steps: 'invalid' } });
    }).toThrow('Expected Headless provider to have a config containing {steps}');
  });

  it('should handle callApi with missing dependencies', async () => {
    jest.mock('playwright-extra', () => {
      throw new Error('Module not found');
    });

    const provider = new BrowserProvider('test', { config: mockConfig });
    const result = await provider.callApi('test prompt');
    expect(result.error).toContain('Failed to import required modules');
  });

  it('should use default timeout', () => {
    const provider = new BrowserProvider('test', { config: mockConfig });
    // @ts-ignore
    expect(provider.defaultTimeout).toBe(30000);
  });

  it('should use custom timeout', () => {
    const provider = new BrowserProvider('test', {
      config: { ...mockConfig, timeoutMs: 5000 },
    });
    // @ts-ignore
    expect(provider.defaultTimeout).toBe(5000);
  });

  it('should use custom headless setting', () => {
    const provider = new BrowserProvider('test', {
      config: { ...mockConfig, headless: false },
    });
    // @ts-ignore
    expect(provider.headless).toBe(false);
  });

  it('should use default transform response', () => {
    const provider = new BrowserProvider('test', { config: mockConfig });
    const result = provider.transformResponse({ test: 'data' }, '<html>test</html>');
    expect(result).toEqual({ output: undefined });
  });

  it('should use custom transform response', () => {
    const provider = new BrowserProvider('test', {
      config: {
        ...mockConfig,
        transformResponse: '({ output: JSON.stringify(extracted) })',
      },
    });
    const result = provider.transformResponse({ test: 'data' }, '<html>test</html>');
    expect(result).toEqual({ output: '{"test":"data"}' });
  });
});
