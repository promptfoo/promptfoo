import dedent from 'dedent';
import path from 'path';
import { fetchWithCache } from '../src/cache';
import { importModule } from '../src/esm';
import { HttpProvider, processBody, createResponseParser } from '../src/providers/http';
import { maybeLoadFromExternalFile } from '../src/util';

jest.mock('../src/cache', () => ({
  fetchWithCache: jest.fn(),
}));

jest.mock('../src/util', () => ({
  ...jest.requireActual('../src/util'),
  maybeLoadFromExternalFile: jest.fn((input) => input),
}));

jest.mock('../src/esm', () => ({
  importModule: jest.fn(async (modulePath: string, functionName?: string) => {
    const mockModule = {
      default: jest.fn((data) => data.defaultField),
      parseResponse: jest.fn((data) => data.specificField),
    };
    if (functionName) {
      return mockModule[functionName as keyof typeof mockModule];
    }
    return mockModule;
  }),
}));

jest.mock('../src/cliState', () => ({
  basePath: '/mock/base/path',
}));

describe('HttpProvider', () => {
  const mockUrl = 'http://example.com/api';
  let provider: HttpProvider;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call the API and return the response', async () => {
    provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: '{{ prompt }}' },
        responseParser: (data: any) => data.result,
      },
    });
    const mockResponse = {
      data: JSON.stringify({ result: 'response text' }),
      cached: false,
    };
    jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('test prompt');
    expect(result.output).toBe('response text');
    expect(fetchWithCache).toHaveBeenCalledWith(
      mockUrl,
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'test prompt' }),
      }),
      expect.any(Number),
      'text',
      undefined,
    );
  });

  it('should handle API call errors', async () => {
    provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: 'value' },
        responseParser: (data: any) => data.result,
      },
    });
    const mockError = new Error('Network error');
    jest.mocked(fetchWithCache).mockRejectedValueOnce(mockError);

    const result = await provider.callApi('test prompt');
    expect(result).toEqual({
      error: 'HTTP call error: Error: Network error',
    });
  });

  it('should use custom method/headers/queryParams', async () => {
    provider = new HttpProvider(mockUrl, {
      config: {
        method: 'PATCH',
        headers: { Authorization: 'Bearer token' },
        body: { key: '{{ prompt }}' },
        queryParams: { foo: 'bar' },
        responseParser: (data: any) => data,
      },
    });
    const mockResponse = { data: 'custom response', cached: false };
    jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');
    expect(fetchWithCache).toHaveBeenCalledWith(
      `${mockUrl}?foo=bar`,
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: 'Bearer token' },
        body: JSON.stringify({ key: 'test prompt' }),
      }),
      expect.any(Number),
      'text',
      undefined,
    );
  });

  const testCases = [
    { parser: (data: any) => data.custom, expected: 'parsed' },
    { parser: 'json.result', expected: 'parsed' },
    { parser: 'text', expected: JSON.stringify({ result: 'parsed', custom: 'parsed' }) },
  ];

  testCases.forEach(({ parser, expected }) => {
    it(`should handle response parser type: ${parser}`, async () => {
      provider = new HttpProvider(mockUrl, {
        config: {
          body: { key: '{{ prompt }}' },
          responseParser: parser,
        },
      });
      const mockResponse = {
        data: JSON.stringify({ result: 'parsed', custom: 'parsed' }),
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test prompt');
      expect(result.output).toEqual(expected);
    });
  });

  it('should correctly render Nunjucks templates in config', async () => {
    provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'X-Custom-Header': '{{ prompt | upper }}' },
        body: { key: '{{ prompt }}' },
        responseParser: (data: any) => data,
      },
    });
    const mockResponse = { data: 'custom response', cached: false };
    jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');
    expect(fetchWithCache).toHaveBeenCalledWith(
      mockUrl,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-custom-header': 'TEST PROMPT' },
        body: JSON.stringify({ key: 'test prompt' }),
      },
      expect.any(Number),
      'text',
      undefined,
    );
  });

  it('should throw an error when creating HttpProvider with invalid config', () => {
    const invalidConfig = 'this isnt json';
    expect(() => {
      new HttpProvider(mockUrl, {
        config: invalidConfig as any,
      });
    }).toThrow(
      new Error(
        'Invariant failed: Expected HTTP provider http://example.com/api to have a config containing {body}, but instead got "this isnt json"',
      ),
    );
  });

  it('should return provider id and string representation', () => {
    provider = new HttpProvider(mockUrl, {
      config: { body: 'yo mama' },
    });
    expect(provider.id()).toBe(mockUrl);
    expect(provider.toString()).toBe(`[HTTP Provider ${mockUrl}]`);
  });

  it('should handle GET requests with query parameters', async () => {
    provider = new HttpProvider(mockUrl, {
      config: {
        method: 'GET',
        queryParams: {
          q: '{{ prompt }}',
          foo: 'bar',
        },
        responseParser: (data: any) => data,
      },
    });
    const mockResponse = { data: 'response data', cached: false };
    jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');
    expect(fetchWithCache).toHaveBeenCalledWith(
      `${mockUrl}?q=test+prompt&foo=bar`,
      expect.objectContaining({
        method: 'GET',
      }),
      expect.any(Number),
      'text',
      undefined,
    );
  });

  describe('raw request', () => {
    it('should handle a basic GET raw request', async () => {
      const rawRequest = dedent`
        GET /api/data HTTP/1.1
        Host: example.com
        User-Agent: TestAgent/1.0
      `;
      const provider = new HttpProvider('http', {
        config: {
          request: rawRequest,
          responseParser: (data: any) => data,
        },
      });

      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        'http://example.com/api/data',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            host: 'example.com',
            'user-agent': 'TestAgent/1.0',
          }),
        }),
        expect.any(Number),
        'text',
      );
      expect(result.output).toEqual({ result: 'success' });
    });

    it('should handle a POST raw request with body and variable substitution', async () => {
      const rawRequest = dedent`
        POST /api/submit HTTP/1.1
        Host: example.com
        Content-Type: application/json

        {"data": "{{prompt}}"}
      `;
      const provider = new HttpProvider('https', {
        config: {
          request: rawRequest,
          responseParser: (data: any) => data,
        },
      });

      const mockResponse = {
        data: JSON.stringify({ result: 'received' }),
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test data');

      expect(fetchWithCache).toHaveBeenCalledWith(
        'https://example.com/api/submit',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            host: 'example.com',
            'content-type': 'application/json',
          }),
          body: '{"data": "test data"}',
        }),
        expect.any(Number),
        'text',
      );
      expect(result.output).toEqual({ result: 'received' });
    });

    it('should load raw request from file if file:// prefix is used', async () => {
      const filePath = 'file://path/to/request.txt';
      const fileContent = dedent`
        GET /api/data HTTP/1.1
        Host: example.com
      `;
      jest.mocked(maybeLoadFromExternalFile).mockReturnValueOnce(fileContent);

      const provider = new HttpProvider('https', {
        config: {
          request: filePath,
          responseParser: (data: any) => data,
        },
      });

      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test prompt');

      expect(maybeLoadFromExternalFile).toHaveBeenCalledWith(filePath);
      expect(fetchWithCache).toHaveBeenCalledWith(
        'https://example.com/api/data',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            host: 'example.com',
          }),
        }),
        expect.any(Number),
        'text',
      );
      expect(result.output).toEqual({ result: 'success' });
    });

    it('should throw an error for invalid raw requests', async () => {
      const provider = new HttpProvider('http', {
        config: {
          request: 'yo mama',
        },
      });
      await expect(provider.callApi('test prompt')).rejects.toThrow(
        'Error parsing raw HTTP request',
      );
    });
  });

  describe('processBody', () => {
    it('should process simple key-value pairs', () => {
      const body = { key: 'value', prompt: '{{ prompt }}' };
      const vars = { prompt: 'test prompt' };
      const result = processBody(body, vars);
      expect(result).toEqual({ key: 'value', prompt: 'test prompt' });
    });

    it('should process nested objects', () => {
      const body = {
        outer: {
          inner: '{{ prompt }}',
          static: 'value',
        },
      };
      const vars = { prompt: 'test prompt' };
      const result = processBody(body, vars);
      expect(result).toEqual({
        outer: {
          inner: 'test prompt',
          static: 'value',
        },
      });
    });

    it('should process arrays', () => {
      const body = {
        list: ['{{ prompt }}', 'static', '{{ prompt }}'],
      };
      const vars = { prompt: 'test prompt' };
      const result = processBody(body, vars);
      expect(result).toEqual({
        list: ['test prompt', 'static', 'test prompt'],
      });
    });

    it('should handle empty vars', () => {
      const body = { key: '{{ prompt }}' };
      const result = processBody(body, {});
      expect(result).toEqual({ key: '' });
    });

    it('should handle complex nested structures', () => {
      const body = {
        outer: {
          inner: ['{{ prompt }}', { nestedKey: '{{ prompt }}' }],
          static: 'value',
        },
        jsonArray: '[1, 2, "{{ prompt }}"]',
      };
      const vars = { prompt: 'test prompt' };
      const result = processBody(body, vars);

      expect(result).toEqual({
        outer: {
          inner: ['test prompt', { nestedKey: 'test prompt' }],
          static: 'value',
        },
        jsonArray: `[1, 2, \"test prompt\"]`,
      });
    });
  });

  describe('createResponseParser', () => {
    it('should handle function parser', async () => {
      const functionParser = (data: any) => data.result;
      const provider = new HttpProvider(mockUrl, {
        config: {
          body: { key: 'value' },
          responseParser: functionParser,
        },
      });

      const mockResponse = { data: JSON.stringify({ result: 'success' }), cached: false };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test prompt');
      expect(result.output).toBe('success');
    });

    it('should handle file:// parser with JavaScript file', async () => {
      const mockParser = jest.fn((data, text) => text.toUpperCase());
      jest.mocked(importModule).mockResolvedValueOnce(mockParser);

      const parser = await createResponseParser('file://custom-parser.js');
      const result = parser({ customField: 'parsed' }, 'parsed');
      expect(importModule).toHaveBeenCalledWith(
        path.resolve('/mock/base/path', 'custom-parser.js'),
        undefined,
      );
      expect(result).toBe('PARSED');
    });

    it('should throw error for unsupported parser type', async () => {
      await expect(createResponseParser(123 as any)).rejects.toThrow(
        "Unsupported response parser type: number. Expected a function, a string starting with 'file://' pointing to a JavaScript file, or a string containing a JavaScript expression.",
      );
    });

    it('should handle string parser', async () => {
      const provider = new HttpProvider(mockUrl, {
        config: {
          body: { key: 'value' },
          responseParser: 'json.result',
        },
      });

      const mockResponse = { data: JSON.stringify({ result: 'parsed' }), cached: false };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test prompt');
      expect(result.output).toBe('parsed');
    });

    it('should handle file:// parser with specific function name', async () => {
      const mockParser = jest.fn((data, text) => data.specificField);
      jest.mocked(importModule).mockResolvedValueOnce(mockParser);

      const parser = await createResponseParser('file://custom-parser.js:parseResponse');
      const result = parser({ specificField: 'parsed' }, '');
      expect(importModule).toHaveBeenCalledWith(
        path.resolve('/mock/base/path', 'custom-parser.js'),
        'parseResponse',
      );
      expect(result).toBe('parsed');
    });

    it('should throw error for malformed file:// parser', async () => {
      jest.mocked(importModule).mockResolvedValueOnce({});

      await expect(createResponseParser('file://invalid-parser.js')).rejects.toThrow(
        /Response parser malformed: .*invalid-parser\.js must export a function or have a default export as a function/,
      );
    });

    it('should return default parser when no parser is provided', async () => {
      const parser = await createResponseParser(undefined);
      const result = parser({ key: 'value' }, 'raw text');
      expect(result.output).toEqual({ key: 'value' });
    });

    it('should handle response parser file with default export', async () => {
      const mockParser = jest.fn((data) => data.defaultField);
      jest.mocked(importModule).mockResolvedValueOnce(mockParser);

      const parser = await createResponseParser('file://default-parser.js');
      const result = parser({ defaultField: 'parsed' }, '');

      expect(result).toBe('parsed');
      expect(importModule).toHaveBeenCalledWith(
        path.resolve('/mock/base/path', 'default-parser.js'),
        undefined,
      );
    });
  });

  it('should use default parser when no parser is provided', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'GET',
      },
    });
    const mockResponse = {
      data: JSON.stringify({ key: 'value' }),
      cached: false,
    };
    jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('test prompt');
    expect(result.output).toEqual({ key: 'value' });
  });

  it('should handle response parser returning an object', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        body: { key: 'value' },
        responseParser: (json: any, text: string) => ({ custom: json.result }),
      },
    });

    const mockResponse = { data: JSON.stringify({ result: 'success' }), cached: false };
    jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('test prompt');
    expect(result.output).toEqual({ custom: 'success' });
  });

  describe('getDefaultHeaders', () => {
    it('should return empty object for GET requests', () => {
      const provider = new HttpProvider(mockUrl, { config: { method: 'GET' } });
      const result = provider['getDefaultHeaders'](null);
      expect(result).toEqual({});
    });

    it('should return application/json for object body', () => {
      const provider = new HttpProvider(mockUrl, {
        config: { method: 'POST', body: { key: 'value' } },
      });
      const result = provider['getDefaultHeaders']({ key: 'value' });
      expect(result).toEqual({ 'content-type': 'application/json' });
    });

    it('should return empty object for string body', () => {
      const provider = new HttpProvider(mockUrl, { config: { method: 'POST', body: 'test' } });
      const result = provider['getDefaultHeaders']('string body');
      expect(result).toEqual({});
    });
  });

  describe('validateContentTypeAndBody', () => {
    it('should not throw for valid content-type and body', () => {
      const provider = new HttpProvider(mockUrl, { config: { body: 'test' } });
      expect(() => {
        provider['validateContentTypeAndBody'](
          { 'content-type': 'application/json' },
          { key: 'value' },
        );
      }).not.toThrow();
    });

    it('should throw for non-json content-type with object body', () => {
      const provider = new HttpProvider(mockUrl, { config: { body: 'test' } });
      expect(() => {
        provider['validateContentTypeAndBody']({ 'content-type': 'text/plain' }, { key: 'value' });
      }).toThrow('Content-Type is not application/json, but body is an object or array');
    });
  });

  describe('getContentType', () => {
    it('should return content-type if present', () => {
      const provider = new HttpProvider(mockUrl, { config: { body: 'test' } });
      const result = provider['getContentType']({ 'content-type': 'application/json' });
      expect(result).toBe('application/json');
    });

    it('should return undefined if content-type is not present', () => {
      const provider = new HttpProvider(mockUrl, { config: { body: 'test' } });
      const result = provider['getContentType']({});
      expect(result).toBeUndefined();
    });

    it('should be case-insensitive', () => {
      const provider = new HttpProvider(mockUrl, { config: { body: 'test' } });
      const result = provider['getContentType']({ 'Content-Type': 'application/json' });
      expect(result).toBe('application/json');
    });
  });

  describe('getHeaders', () => {
    it('should combine default headers with config headers', () => {
      const provider = new HttpProvider(mockUrl, {
        config: {
          headers: { 'X-Custom': '{{ prompt }}' },
          body: 'test',
        },
      });
      const result = provider['getHeaders'](
        { 'content-type': 'application/json' },
        { prompt: 'test' },
      );
      expect(result).toEqual({
        'content-type': 'application/json',
        'x-custom': 'test',
      });
    });

    it('should render template strings in headers', () => {
      const provider = new HttpProvider(mockUrl, {
        config: {
          headers: { 'X-Custom': '{{ prompt | upper }}' },
          body: 'test',
        },
      });
      const result = provider['getHeaders']({}, { prompt: 'test' });
      expect(result).toEqual({
        'x-custom': 'TEST',
      });
    });
  });

  it('should default to application/json for content-type if body is an object', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'X-Custom': '{{ prompt }}' },
        body: { key: '{{ prompt }}' },
      },
    });
    const mockResponse = { data: JSON.stringify({ result: 'success' }), cached: false };
    jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    expect(fetchWithCache).toHaveBeenCalledWith(
      mockUrl,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-custom': 'test prompt',
        },
        body: JSON.stringify({ key: 'test prompt' }),
      }),
      expect.any(Number),
      'text',
      undefined,
    );
  });

  it('should not default to application/json for content-type if body is not an object', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        body: 'test',
      },
    });
    const mockResponse = { data: JSON.stringify({ result: 'success' }), cached: false };
    jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    expect(fetchWithCache).toHaveBeenCalledWith(
      mockUrl,
      expect.objectContaining({
        method: 'POST',
        headers: {},
        body: 'test',
      }),
      expect.any(Number),
      'text',
      undefined,
    );
  });

  it('should throw an error if the body is an object and the content-type is not application/json', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: { key: 'value' },
      },
    });

    await expect(provider.callApi('test prompt')).rejects.toThrow(
      'Content-Type is not application/json, but body is an object or array',
    );
  });
});
