import dedent from 'dedent';
import path from 'path';
import { fetchWithCache } from '../../src/cache';
import { importModule } from '../../src/esm';
import {
  createTransformRequest,
  createTransformResponse,
  determineRequestBody,
  HttpProvider,
  processJsonBody,
} from '../../src/providers/http';
import { REQUEST_TIMEOUT_MS } from '../../src/providers/shared';
import { maybeLoadFromExternalFile } from '../../src/util';

jest.mock('../../src/cache', () => ({
  fetchWithCache: jest.fn(),
}));

jest.mock('../../src/util', () => ({
  ...jest.requireActual('../../src/util'),
  maybeLoadFromExternalFile: jest.fn((input) => input),
}));

jest.mock('../../src/esm', () => ({
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

jest.mock('../../src/cliState', () => ({
  basePath: '/mock/base/path',
}));

jest.mock('../../src/logger');

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
        transformResponse: (data: any) => data.result,
      },
    });
    const mockResponse = {
      data: JSON.stringify({ result: 'response text' }),
      status: 200,
      statusText: 'OK',
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
        transformResponse: (data: any) => data.result,
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
        transformResponse: (data: any) => data,
      },
    });
    const mockResponse = {
      data: 'custom response',
      status: 200,
      statusText: 'OK',
      cached: false,
    };
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
          transformResponse: parser,
        },
      });
      const mockResponse = {
        data: JSON.stringify({ result: 'parsed', custom: 'parsed' }),
        status: 200,
        statusText: 'OK',
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
        transformResponse: (data: any) => data,
      },
    });
    const mockResponse = {
      data: 'custom response',
      cached: false,
      status: 200,
      statusText: 'OK',
    };
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
    }).toThrow(/Expected object, received string/);
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
        transformResponse: (data: any) => data,
      },
    });
    const mockResponse = {
      data: 'response data',
      status: 200,
      statusText: 'OK',
      cached: false,
    };
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
          transformResponse: (data: any) => data,
        },
      });

      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        cached: false,
        status: 200,
        statusText: 'OK',
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
          transformResponse: (data: any) => data,
        },
      });

      const mockResponse = {
        data: JSON.stringify({ result: 'received' }),
        cached: false,
        status: 200,
        statusText: 'OK',
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
          transformResponse: (data: any) => data,
        },
      });

      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        status: 200,
        statusText: 'OK',
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

  describe('processJsonBody', () => {
    it('should process simple key-value pairs', () => {
      const body = { key: 'value', prompt: '{{ prompt }}' };
      const vars = { prompt: 'test prompt' };
      const result = processJsonBody(body, vars);
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
      const result = processJsonBody(body, vars);
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
      const result = processJsonBody(body, vars);
      expect(result).toEqual({
        list: ['test prompt', 'static', 'test prompt'],
      });
    });

    it('should handle empty vars', () => {
      const body = { key: '{{ prompt }}' };
      const result = processJsonBody(body, {});
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
      const result = processJsonBody(body, vars);

      expect(result).toEqual({
        outer: {
          inner: ['test prompt', { nestedKey: 'test prompt' }],
          static: 'value',
        },
        jsonArray: [1, 2, 'test prompt'],
      });
    });
  });

  describe('createtransformResponse', () => {
    it('should handle function parser', async () => {
      const functionParser = (data: any) => data.result;
      const provider = new HttpProvider(mockUrl, {
        config: {
          body: { key: 'value' },
          transformResponse: functionParser,
        },
      });

      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test prompt');
      expect(result.output).toBe('success');
    });

    it('should handle file:// parser with JavaScript file', async () => {
      const mockParser = jest.fn((data, text) => text.toUpperCase());
      jest.mocked(importModule).mockResolvedValueOnce(mockParser);

      const parser = await createTransformResponse('file://custom-parser.js');
      const result = parser({ customField: 'parsed' }, 'parsed');
      expect(importModule).toHaveBeenCalledWith(
        path.resolve('/mock/base/path', 'custom-parser.js'),
        undefined,
      );
      expect(result).toBe('PARSED');
    });

    it('should throw error for unsupported parser type', async () => {
      await expect(createTransformResponse(123 as any)).rejects.toThrow(
        "Unsupported response parser type: number. Expected a function, a string starting with 'file://' pointing to a JavaScript file, or a string containing a JavaScript expression.",
      );
    });

    it('should handle string parser', async () => {
      const provider = new HttpProvider(mockUrl, {
        config: {
          body: { key: 'value' },
          transformResponse: 'json.result',
        },
      });

      const mockResponse = {
        data: JSON.stringify({ result: 'parsed' }),
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test prompt');
      expect(result.output).toBe('parsed');
    });

    it('should handle file:// parser with specific function name', async () => {
      const mockParser = jest.fn((data, text) => data.specificField);
      jest.mocked(importModule).mockResolvedValueOnce(mockParser);

      const parser = await createTransformResponse('file://custom-parser.js:parseResponse');
      const result = parser({ specificField: 'parsed' }, '');
      expect(importModule).toHaveBeenCalledWith(
        path.resolve('/mock/base/path', 'custom-parser.js'),
        'parseResponse',
      );
      expect(result).toBe('parsed');
    });

    it('should throw error for malformed file:// parser', async () => {
      jest.mocked(importModule).mockResolvedValueOnce({});

      await expect(createTransformResponse('file://invalid-parser.js')).rejects.toThrow(
        /Response parser malformed: .*invalid-parser\.js must export a function or have a default export as a function/,
      );
    });

    it('should return default parser when no parser is provided', async () => {
      const parser = await createTransformResponse(undefined);
      const result = parser({ key: 'value' }, 'raw text');
      expect(result.output).toEqual({ key: 'value' });
    });

    it('should handle response parser file with default export', async () => {
      const mockParser = jest.fn((data) => data.defaultField);
      jest.mocked(importModule).mockResolvedValueOnce(mockParser);

      const parser = await createTransformResponse('file://default-parser.js');
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
      status: 200,
      statusText: 'OK',
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
        transformResponse: (json: any, text: string) => ({ custom: json.result }),
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
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

    it('should return application/x-www-form-urlencoded for string body', () => {
      const provider = new HttpProvider(mockUrl, { config: { method: 'POST', body: 'test' } });
      const result = provider['getDefaultHeaders']('string body');
      expect(result).toEqual({ 'content-type': 'application/x-www-form-urlencoded' });
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
        provider['validateContentTypeAndBody'](
          { 'content-type': 'application/x-www-form-urlencoded' },
          { key: 'value' },
        );
      }).toThrow('Content-Type is not application/json, but body is an object or array');
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
    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
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

  it('should default to application/x-www-form-urlencoded for content-type if body is not an object', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        body: 'test',
      },
    });
    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    expect(fetchWithCache).toHaveBeenCalledWith(
      mockUrl,
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
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

  describe('Content-Type and body handling', () => {
    it('should render string body when content-type is not set', async () => {
      const provider = new HttpProvider(mockUrl, {
        config: {
          method: 'POST',
          body: 'Hello {{ prompt }}',
        },
      });
      const mockResponse = {
        data: 'response',
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      await provider.callApi('world');

      expect(fetchWithCache).toHaveBeenCalledWith(
        mockUrl,
        expect.objectContaining({
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: 'Hello world',
        }),
        expect.any(Number),
        'text',
        undefined,
      );
    });

    it('should default to JSON when content-type is not set and body is an object', async () => {
      const provider = new HttpProvider(mockUrl, {
        config: {
          method: 'POST',
          body: { key: 'test' },
        },
      });

      const mockResponse = {
        data: 'response',
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      await provider.callApi('test');

      expect(fetchWithCache).toHaveBeenCalledWith(
        mockUrl,
        expect.objectContaining({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key: 'test' }),
        }),
        expect.any(Number),
        'text',
        undefined,
      );
    });

    it('should render object body when content-type is application/json', async () => {
      const provider = new HttpProvider(mockUrl, {
        config: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { key: '{{ prompt }}' },
        },
      });
      const mockResponse = {
        data: 'response',
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      await provider.callApi('test');

      expect(fetchWithCache).toHaveBeenCalledWith(
        mockUrl,
        expect.objectContaining({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key: 'test' }),
        }),
        expect.any(Number),
        'text',
        undefined,
      );
    });

    it('should render a stringified object body when content-type is application/json', async () => {
      const provider = new HttpProvider(mockUrl, {
        config: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: '{{ prompt }}' }),
        },
      });
      const mockResponse = {
        data: 'response',
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      await provider.callApi('test');

      expect(fetchWithCache).toHaveBeenCalledWith(
        mockUrl,
        expect.objectContaining({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key: 'test' }),
        }),
        expect.any(Number),
        'text',
        undefined,
      );
    });

    it('should render nested object variables correctly when content-type is application/json', async () => {
      const provider = new HttpProvider(mockUrl, {
        config: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: {
            details: {
              names: '{{ names | dump }}',
            },
          },
        },
      });
      const mockResponse = {
        data: 'response',
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const vars = {
        names: [
          { firstName: 'Jane', lastName: 'Smith' },
          { firstName: 'John', lastName: 'Doe' },
        ],
      };

      await provider.callApi('test', { vars, prompt: { raw: 'test', label: 'test' } });

      expect(fetchWithCache).toHaveBeenCalledWith(
        mockUrl,
        expect.objectContaining({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            details: {
              names: vars.names,
            },
          }),
        }),
        expect.any(Number),
        'text',
        undefined,
      );
    });

    it('should render nested array variables correctly when content-type is application/json', async () => {
      const provider = new HttpProvider(mockUrl, {
        config: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: [
            {
              id: 1,
              details: {
                names: '{{ names | dump }}',
              },
            },
            {
              id: 2,
              details: {
                names: '{{ names | dump }}',
              },
            },
          ],
        },
      });
      const mockResponse = {
        data: 'response',
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const vars = {
        names: [
          { firstName: 'Jane', lastName: 'Smith' },
          { firstName: 'John', lastName: 'Doe' },
        ],
      };

      await provider.callApi('test', { vars, prompt: { raw: 'test', label: 'test' } });

      expect(fetchWithCache).toHaveBeenCalledWith(
        mockUrl,
        expect.objectContaining({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify([
            {
              id: 1,
              details: {
                names: vars.names,
              },
            },
            {
              id: 2,
              details: {
                names: vars.names,
              },
            },
          ]),
        }),
        expect.any(Number),
        'text',
        undefined,
      );
    });
  });

  describe('deprecated responseParser handling', () => {
    it('should use responseParser when transformResponse is not set', async () => {
      const provider = new HttpProvider(mockUrl, {
        config: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { key: '{{ prompt }}' },
          responseParser: (data: any) => ({ chat_history: data.result }),
        },
      });
      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test');

      expect(result).toEqual({ output: { chat_history: 'success' } });
    });

    it('should prefer transformResponse over responseParser when both are set', async () => {
      const provider = new HttpProvider(mockUrl, {
        config: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { key: '{{ prompt }}' },
          responseParser: (data: any) => ({ chat_history: 'from responseParser' }),
          transformResponse: (data: any) => ({ chat_history: 'from transformResponse' }),
        },
      });
      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test');

      expect(result).toEqual({ output: { chat_history: 'from transformResponse' } });
    });

    it('should handle string-based responseParser when transformResponse is not set', async () => {
      const provider = new HttpProvider(mockUrl, {
        config: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { key: '{{ prompt }}' },
          responseParser: 'json.result',
        },
      });
      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test');

      expect(result).toEqual({ output: 'success' });
    });
  });
});

describe('createTransformRequest', () => {
  it('should return identity function when no transform specified', async () => {
    const transform = await createTransformRequest(undefined);
    const result = await transform('test prompt');
    expect(result).toBe('test prompt');
  });

  it('should handle string templates', async () => {
    const transform = await createTransformRequest('return {"text": prompt}');
    const result = await transform('hello');
    expect(result).toEqual({
      text: 'hello',
    });
  });

  it('should handle function-based request transform', async () => {
    jest.clearAllMocks();

    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: 'value' },
        transformRequest: (prompt: string) => ({ transformed: prompt.toUpperCase() }),
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test');

    expect(fetchWithCache).toHaveBeenCalledWith(
      'http://test.com',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'value', transformed: 'TEST' }),
      },
      REQUEST_TIMEOUT_MS,
      'text',
      undefined,
    );
  });

  it('should throw error for unsupported transform type', async () => {
    await expect(createTransformRequest(123 as any)).rejects.toThrow(
      'Unsupported request transform type: number',
    );
  });
});

describe('determineRequestBody', () => {
  it('should merge parsed prompt object with config body when content type is JSON', () => {
    const result = determineRequestBody(
      true,
      { promptField: 'test value' },
      { configField: 'config value' },
      { vars: 'not used in this case' },
    );

    expect(result).toEqual({
      promptField: 'test value',
      configField: 'config value',
    });
  });

  it('should process JSON body with variables when parsed prompt is not an object', () => {
    const result = determineRequestBody(
      true,
      'test prompt',
      { message: '{{ prompt }}' },
      { prompt: 'test prompt' },
    );

    expect(result).toEqual({
      message: 'test prompt',
    });
  });

  it('should process text body when content type is not JSON', () => {
    const result = determineRequestBody(false, 'test prompt', 'Message: {{ prompt }}', {
      prompt: 'test prompt',
    });

    expect(result).toBe('Message: test prompt');
  });

  it('should handle nested JSON structures', () => {
    const result = determineRequestBody(
      true,
      'test prompt',
      {
        outer: {
          inner: '{{ prompt }}',
          static: 'value',
        },
        array: ['{{ prompt }}', 'static'],
      },
      { prompt: 'test prompt' },
    );

    expect(result).toEqual({
      outer: {
        inner: 'test prompt',
        static: 'value',
      },
      array: ['test prompt', 'static'],
    });
  });

  it('should handle undefined config body with object prompt', () => {
    const result = determineRequestBody(true, { message: 'test prompt' }, undefined, {});

    expect(result).toEqual({
      message: 'test prompt',
    });
  });

  it('should handle array config body', () => {
    const result = determineRequestBody(true, 'test prompt', ['static', '{{ prompt }}'], {
      prompt: 'test prompt',
    });

    expect(result).toEqual(['static', 'test prompt']);
  });
});

describe('constructor validation', () => {
  it('should validate config using Zod schema', () => {
    expect(() => {
      new HttpProvider('http://test.com', {
        config: {
          headers: { 'Content-Type': 123 }, // Invalid header type
        },
      });
    }).toThrow('Expected string, received number');
  });

  it('should require body or GET method', () => {
    expect(() => {
      new HttpProvider('http://test.com', {
        config: {
          method: 'POST',
          // Missing body
        },
      });
    }).toThrow(/Expected HTTP provider http:\/\/test.com to have a config containing {body}/);
  });
});

describe('content type handling', () => {
  it('should handle JSON content type with object body', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: '{{ prompt }}' },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test');

    expect(fetchWithCache).toHaveBeenCalledWith(
      'http://test.com',
      expect.objectContaining({
        headers: expect.objectContaining({ 'content-type': 'application/json' }),
        body: JSON.stringify({ key: 'test' }),
      }),
      expect.any(Number),
      'text',
      undefined,
    );
  });

  it('should handle non-JSON content type with string body', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'Raw text {{ prompt }}',
      },
    });

    const mockResponse = {
      data: 'success',
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test');

    expect(fetchWithCache).toHaveBeenCalledWith(
      'http://test.com',
      expect.objectContaining({
        headers: expect.objectContaining({ 'content-type': 'text/plain' }),
        body: 'Raw text test',
      }),
      expect.any(Number),
      'text',
      undefined,
    );
  });

  it('should throw error for object body with non-JSON content type', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: { key: 'value' },
      },
    });

    await expect(provider.callApi('test')).rejects.toThrow(/Content-Type is not application\/json/);
  });
});

describe('request transformation', () => {
  it('should handle string-based request transform', async () => {
    jest.clearAllMocks();

    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: 'value' },
        transformRequest: 'return { transformed: prompt.toLowerCase() }',
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('TEST');

    expect(fetchWithCache).toHaveBeenCalledWith(
      'http://test.com',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'content-type': 'application/json' }),
        body: JSON.stringify({ key: 'value', transformed: 'test' }),
      }),
      expect.any(Number),
      'text',
      undefined,
    );
  });

  it('should handle function-based request transform', async () => {
    jest.clearAllMocks();

    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: 'value' },
        transformRequest: (prompt: string) => ({ transformed: prompt.toUpperCase() }),
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test');

    expect(fetchWithCache).toHaveBeenCalledWith(
      'http://test.com',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'value', transformed: 'TEST' }),
      },
      REQUEST_TIMEOUT_MS,
      'text',
      undefined,
    );
  });
});

describe('response handling', () => {
  it('should handle successful JSON response', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: '{{ prompt }}' },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('test');
    expect(result.output).toEqual({ result: 'success' });
  });

  it('should handle non-JSON response', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'test',
        transformResponse: (data: Record<string, unknown>, text: string) => text,
      },
    });

    const mockResponse = {
      data: 'Raw response',
      status: 200,
      statusText: 'OK',
      cached: false,
      headers: {},
    };
    jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('test');
    expect(result.output).toBe(mockResponse.data);
  });

  it('should include debug information when requested', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: '{{ prompt }}' },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
      headers: { 'x-test': 'test-header' },
    };
    jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('test', {
      debug: true,
      prompt: { raw: 'test', label: 'test' },
      vars: {},
    });
    expect(result.raw).toBe(mockResponse.data);
    expect(result.metadata).toEqual({
      headers: mockResponse.headers,
    });
  });
});

describe('session handling', () => {
  it('should extract session ID from headers when configured', async () => {
    const sessionParser = jest.fn().mockReturnValue('test-session');
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: '{{ prompt }}' },
        sessionParser,
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
      headers: { 'x-session-id': 'test-session' },
    };
    jest.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('test');
    expect(result.sessionId).toBe('test-session');
    expect(sessionParser).toHaveBeenCalledWith({ headers: mockResponse.headers });
  });
});
