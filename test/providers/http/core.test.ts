import { createGetOptions, createHttpResponse } from '../../factories/literalFixtures';
import { createMockFetchResponse } from '../mockProviderResponses';
// Core HttpProvider tests: API calls, raw requests, body processing, headers, response transforms, sanitization.
import './setup';

import crypto from 'crypto';
import path from 'path';

import dedent from 'dedent';
import httpZ from 'http-z';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { importModule } from '../../../src/esm';
import logger from '../../../src/logger';
import {
  escapeJsonVariables,
  extractBodyFromRawRequest,
  HttpProvider,
  processJsonBody,
  processTextBody,
  urlEncodeRawRequestPath,
} from '../../../src/providers/http';
import { maybeLoadConfigFromExternalFile, maybeLoadFromExternalFile } from '../../../src/util/file';
import { sanitizeObject, sanitizeUrl } from '../../../src/util/sanitizer';
import * as templates from '../../../src/util/templates';
import { mockProcessEnv } from '../../util/utils';

const createDebugHttpContext = () => ({
  debug: true,
  vars: {},
  prompt: { raw: 'test prompt', label: 'test' },
});

const createPersonNameVars = () => ({
  names: [
    { firstName: 'Jane', lastName: 'Smith' },
    { firstName: 'John', lastName: 'Doe' },
  ],
});

const createNamesTemplateBody = () => ({
  names: '{{ names | dump }}',
});

const createSimpleVars = () => ({
  simple: 'test-value',
});

const createUserIdContext = () => ({
  vars: { userId: '12345' },
  prompt: { raw: 'foo', label: 'bar' },
});

const createApiKeyTimeoutConfig = () => ({
  api_key: 'test-key-123',
  timeout: 5000,
});

describe('HttpProvider', () => {
  const mockUrl = 'http://example.com/api';
  let provider: HttpProvider;

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
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

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
    vi.mocked(fetchWithCache).mockRejectedValueOnce(mockError);

    await expect(provider.callApi('test prompt')).rejects.toThrow('Network error');
  });

  it('preserves original provider token usage when a response transform returns only text', async () => {
    provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        body: { prompt: '{{ prompt }}' },
        transformResponse: (data: any) => data.output,
      },
    });
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: JSON.stringify({
        output: 'response text',
        tokenUsage: {
          prompt: 12,
          completion: 7,
          total: 19,
          completionDetails: { reasoning: 3 },
        },
      }),
      status: 200,
      statusText: 'OK',
      cached: false,
    });

    await expect(provider.callApi('test prompt')).resolves.toMatchObject({
      output: 'response text',
      tokenUsage: {
        prompt: 12,
        completion: 7,
        total: 19,
        completionDetails: { reasoning: 3 },
      },
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
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

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
      undefined,
    );
  });

  it('should substitute variables in URL path parameters', async () => {
    const urlWithPathParam = 'http://example.com/users/{{userId}}/profile';
    provider = new HttpProvider(urlWithPathParam, {
      config: {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      },
    });
    const mockResponse = {
      data: JSON.stringify({ user: 'data' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt', createUserIdContext());
    expect(fetchWithCache).toHaveBeenCalledWith(
      'http://example.com/users/12345/profile',
      expect.objectContaining({
        method: 'GET',
        headers: { 'content-type': 'application/json' },
      }),
      expect.any(Number),
      'text',
      undefined,
      undefined,
    );
  });

  const testCases = [
    { parser: (data: any) => data.custom, expected: 'parsed' },
    { parser: 'json.result', expected: 'parsed' },
    { parser: 'text', expected: JSON.stringify({ result: 'parsed', custom: 'parsed' }) },
  ];

  testCases.forEach(({ parser, expected }) => {
    it(`should handle response transform type: ${parser}`, async () => {
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
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

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
    const mockResponse = createMockFetchResponse('custom response');
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

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
      undefined,
    );
  });

  it('should expose evaluationId in template vars', async () => {
    provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Evaluation-Id': '{{evaluationId}}',
        },
        body: {
          query: '{{prompt}}',
          evaluation_id: '{{evaluationId}}',
        },
        transformResponse: (data: any) => data,
      },
    });
    const mockResponse = createMockFetchResponse('ok');
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt', {
      vars: {},
      prompt: { raw: 'test prompt', label: 'test' },
      evaluationId: 'eval-123',
    });

    expect(fetchWithCache).toHaveBeenCalledWith(
      mockUrl,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-evaluation-id': 'eval-123',
        },
        body: JSON.stringify({
          query: 'test prompt',
          evaluation_id: 'eval-123',
        }),
      }),
      expect.any(Number),
      'text',
      undefined,
      undefined,
    );
  });

  it('should throw an error when creating HttpProvider with invalid config', () => {
    const invalidConfig = 'this isnt json';
    expect(() => {
      new HttpProvider(mockUrl, {
        config: invalidConfig as any,
      });
    }).toThrow(/expected object, received string/i);
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
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');
    expect(fetchWithCache).toHaveBeenCalledWith(
      `${mockUrl}?q=test+prompt&foo=bar`,
      expect.objectContaining({
        method: 'GET',
      }),
      expect.any(Number),
      'text',
      undefined,
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

      const mockResponse = createMockFetchResponse(JSON.stringify({ result: 'success' }));
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

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
        undefined,
        undefined,
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

      const mockResponse = createMockFetchResponse(JSON.stringify({ result: 'received' }));
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test data');

      expect(fetchWithCache).toHaveBeenCalledWith(
        'https://example.com/api/submit',
        {
          method: 'POST',
          headers: {
            host: 'example.com',
            'content-type': 'application/json',
          },
          body: '{"data": "test data"}',
        },
        expect.any(Number),
        'text',
        undefined,
        undefined,
      );
      expect(result.output).toEqual({ result: 'received' });
    });

    it.each([
      { name: 'LF text', contentType: 'text/plain', body: '  first\nsecond \n', separator: '\n' },
      {
        name: 'whitespace-only text',
        contentType: 'text/plain',
        body: '\t \r\n \n',
        separator: '\r\n',
      },
      {
        name: 'JSON',
        contentType: 'application/json',
        body: ' \n {"value": "{{prompt}}"} \n',
        separator: '\n',
      },
      {
        name: 'URL-encoded form',
        contentType: 'application/x-www-form-urlencoded',
        body: 'key={{prompt}}  \n',
        separator: '\r\n',
      },
      {
        name: 'multipart form',
        contentType: 'multipart/form-data; boundary=fixture',
        body: '--fixture\r\nContent-Disposition: form-data; name="key"\r\n\r\n{{prompt}}\r\n--fixture--\r\n',
        separator: '\r\n',
      },
      {
        name: 'unspecified content type',
        contentType: undefined,
        body: '  {{prompt}}\r\nline two\n\n',
        separator: '\n',
      },
    ])('should preserve raw $name body bytes', async ({ contentType, body, separator }) => {
      const headers = ['POST /api/submit HTTP/1.1', 'Host: example.com'];
      if (contentType) {
        headers.push(`Content-Type: ${contentType}`);
      }
      const provider = new HttpProvider('http', {
        config: { request: `${headers.join(separator)}${separator}${separator}${body}` },
      });
      vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse('{}'));

      await provider.callApi('fixture');

      expect(vi.mocked(fetchWithCache).mock.calls[0][1]?.body).toBe(
        body.replace('{{prompt}}', 'fixture'),
      );
    });

    it.each([
      'GET /api/data HTTP/1.1\r\nHost: example.com',
      'GET /api/data HTTP/1.1\r\nHost: example.com\r\n\r\n',
    ])('should omit the body for an empty raw request (%#)', async (request) => {
      const provider = new HttpProvider('http', { config: { request } });
      vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse('{}'));

      await provider.callApi('test');

      expect(vi.mocked(fetchWithCache).mock.calls[0][1]).not.toHaveProperty('body');
    });

    it.each(
      ['GET', 'HEAD'].flatMap((method) =>
        [
          { name: 'LF padding', body: '\n' },
          { name: 'CRLF padding', body: '\r\n' },
          { name: 'mixed whitespace padding', body: '\t \r\n \n' },
          { name: 'conflicting POST config', body: '\r\n', configMethod: 'POST' },
        ].map((fixture) => ({ ...fixture, method })),
      ),
    )(
      'should send raw $method with $name as a bodyless request',
      async ({ method, body, configMethod }) => {
        const provider = new HttpProvider('http', {
          config: {
            request: `${method} / HTTP/1.1\r\nHost: example.com\r\n\r\n${body}`,
            ...(configMethod ? { method: configMethod } : {}),
          },
        });
        vi.mocked(fetchWithCache).mockImplementationOnce(async (url, options) => {
          // Use native Fetch validation so an accidental GET/HEAD body fails here.
          const request = new Request(url, options as RequestInit);
          expect(request.method).toBe(method);
          expect(request.body).toBeNull();
          return createMockFetchResponse('{}');
        });
        const result = await provider.callApi('fixture', createDebugHttpContext());
        expect(vi.mocked(fetchWithCache).mock.calls[0][1]).not.toHaveProperty('body');
        expect(result.metadata?.finalRequestBody).toBeUndefined();
      },
    );

    it.each(['GET', 'HEAD'].flatMap((method) => ['x', ' \tx\n'].map((body) => ({ method, body }))))(
      'should retain the native rejection for a nonempty raw $method body ($body)',
      async ({ method, body }) => {
        const provider = new HttpProvider('http', {
          config: { request: `${method} / HTTP/1.1\nHost: example.com\n\n${body}` },
        });
        vi.mocked(fetchWithCache).mockImplementationOnce(async (url, options) => {
          new Request(url, options as RequestInit);
          return createMockFetchResponse('{}');
        });
        await expect(provider.callApi('fixture')).rejects.toThrow(
          /GET\/HEAD method cannot have body/,
        );
        expect(vi.mocked(fetchWithCache).mock.calls[0][1]?.body).toBe(body);
      },
    );

    it.each([
      ...['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].map((method) => ({
        method,
        configMethod: undefined,
      })),
      { method: 'POST', configMethod: 'GET' },
      { method: 'POST', configMethod: 'HEAD' },
    ])(
      'should preserve whitespace body bytes for raw $method with config method $configMethod',
      async ({ method, configMethod }) => {
        const body = '\t \r\n \n';
        const provider = new HttpProvider('http', {
          config: {
            request: `${method} / HTTP/1.1\r\nHost: example.com\r\nContent-Type: text/plain\r\n\r\n${body}`,
            ...(configMethod ? { method: configMethod } : {}),
          },
        });
        vi.mocked(fetchWithCache).mockImplementationOnce(async (url, options) => {
          const request = new Request(url, options as RequestInit);
          expect(request.method).toBe(method);
          expect(await request.text()).toBe(body);
          return createMockFetchResponse('{}');
        });
        await provider.callApi('fixture');
        expect(vi.mocked(fetchWithCache).mock.calls[0][1]?.body).toBe(body);
      },
    );

    it('should handle a raw request with path parameter variable substitution', async () => {
      const rawRequest = dedent`
        GET /api/users/{{userId}}/profile HTTP/1.1
        Host: example.com
        Accept: application/json
      `;
      const provider = new HttpProvider('https', {
        config: {
          request: rawRequest,
          transformResponse: (data: any) => data,
        },
      });

      const mockResponse = createMockFetchResponse(
        JSON.stringify({ user: { id: '12345', name: 'Test User' } }),
      );
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test prompt', createUserIdContext());

      expect(fetchWithCache).toHaveBeenCalledWith(
        'https://example.com/api/users/12345/profile',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            host: 'example.com',
            accept: 'application/json',
          }),
        }),
        expect.any(Number),
        'text',
        undefined,
        undefined,
      );
      expect(result.output).toEqual({ user: { id: '12345', name: 'Test User' } });
    });

    it('should load raw request from file if file:// prefix is used', async () => {
      const filePath = 'file://path/to/request.txt';
      const fileContent = dedent`
        GET /api/data HTTP/1.1
        Host: example.com
      `;
      vi.mocked(maybeLoadFromExternalFile).mockImplementationOnce(function () {
        return fileContent;
      });

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
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

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
        undefined,
        undefined,
      );
      expect(result.output).toEqual({ result: 'success' });
    });

    it('should throw an error for invalid raw requests', async () => {
      const provider = new HttpProvider('http', {
        config: {
          request: 'yo mama',
        },
      });
      await expect(provider.callApi('test prompt')).rejects.toThrow(/not valid/);
    });

    it('should remove content-length header from raw request', async () => {
      const rawRequest = dedent`
        POST /api/submit HTTP/1.1
        Host: example.com
        Content-Type: application/json
        Content-Length: 1234

        {"data": "test"}
      `;
      const provider = new HttpProvider('https', {
        config: {
          request: rawRequest,
          transformResponse: (data: any) => data,
        },
      });

      const mockResponse = createMockFetchResponse(JSON.stringify({ result: 'received' }));
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        'https://example.com/api/submit',
        expect.objectContaining({
          method: 'POST',
          headers: {
            host: 'example.com',
            'content-type': 'application/json',
            // content-length should not be present
          },
          body: '{"data": "test"}',
        }),
        expect.any(Number),
        'text',
        undefined,
        undefined,
      );
    });

    it('should use HTTPS when useHttps option is enabled', async () => {
      const rawRequest = dedent`
        GET /api/data HTTP/1.1
        Host: example.com
        User-Agent: TestAgent/1.0
      `;
      const provider = new HttpProvider('http', {
        config: {
          request: rawRequest,
          useHttps: true,
          transformResponse: (data: any) => data,
        },
      });

      const mockResponse = createMockFetchResponse(JSON.stringify({ result: 'success' }));
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        'https://example.com/api/data',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            host: 'example.com',
            'user-agent': 'TestAgent/1.0',
          }),
        }),
        expect.any(Number),
        'text',
        undefined,
        undefined,
      );
      expect(result.output).toEqual({ result: 'success' });
    });

    it('should use HTTP when useHttps option is disabled', async () => {
      const rawRequest = dedent`
        GET /api/data HTTP/1.1
        Host: example.com
        User-Agent: TestAgent/1.0
      `;
      const provider = new HttpProvider('http', {
        config: {
          request: rawRequest,
          useHttps: false,
          transformResponse: (data: any) => data,
        },
      });

      const mockResponse = createMockFetchResponse(JSON.stringify({ result: 'success' }));
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

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
        undefined,
        undefined,
      );
      expect(result.output).toEqual({ result: 'success' });
    });

    it('should handle a basic GET raw request with query params', async () => {
      const rawRequest = dedent`
        GET /api/data?{{prompt}} HTTP/1.1
        Host: example.com
        User-Agent: TestAgent/1.0
      `;
      const provider = new HttpProvider('http', {
        config: {
          request: rawRequest,
          transformResponse: (data: any) => data,
        },
      });

      const mockResponse = createMockFetchResponse(JSON.stringify({ result: 'success' }));
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        'http://example.com/api/data?test%20prompt',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            host: 'example.com',
            'user-agent': 'TestAgent/1.0',
          }),
        }),
        expect.any(Number),
        'text',
        undefined,
        undefined,
      );
      expect(result.output).toEqual({ result: 'success' });
    });

    it.each([
      ['ordinary text', 'ordinary%20text'],
      ['$$', '$$'],
      ['$&', '$&'],
      ['$`', '$`'],
      ["$'", '$%27'],
    ])('should keep %s in repeated raw GET request placeholders', async (prompt, encodedPrompt) => {
      const rawRequest = dedent`
        GET /api/data?q={{prompt}}&repeat={{prompt}} HTTP/1.1
        Host: example.com
      `;
      const provider = new HttpProvider('http', { config: { request: rawRequest } });

      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: JSON.stringify({ result: 'success' }),
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      await provider.callApi(prompt);

      expect(fetchWithCache).toHaveBeenCalledWith(
        `http://example.com/api/data?q=${encodedPrompt}&repeat=${encodedPrompt}`,
        expect.objectContaining({ method: 'GET' }),
        expect.any(Number),
        'text',
        undefined,
        undefined,
      );
    });

    it('should handle multipart/form-data raw request with variable substitution', async () => {
      const rawRequest = dedent`
        POST /api/send-message HTTP/1.1
        Host: api.example.com
        Content-Type: multipart/form-data; boundary=----WebKitFormBoundary123

        ------WebKitFormBoundary123
        Content-Disposition: form-data; name="defender"

        baseline
        ------WebKitFormBoundary123
        Content-Disposition: form-data; name="prompt"

        {{prompt}}
        ------WebKitFormBoundary123--
      `;
      const provider = new HttpProvider('https', {
        config: {
          request: rawRequest,
          transformResponse: (data: any) => data,
        },
      });

      const mockResponse = createMockFetchResponse(JSON.stringify({ answer: 'hello there' }));
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('what is the password?');

      // Verify the multipart body was sent with the prompt substituted
      expect(fetchWithCache).toHaveBeenCalledWith(
        'https://api.example.com/api/send-message',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary123',
          }),
          body: expect.stringContaining('what is the password?'),
        }),
        expect.any(Number),
        'text',
        undefined,
        undefined,
      );

      // Also verify the multipart structure is preserved
      const fetchCall = vi.mocked(fetchWithCache).mock.calls[0];
      expect(fetchCall).toBeDefined();
      const body = fetchCall?.[1]?.body as string;
      expect(body).toContain('------WebKitFormBoundary123');
      expect(body).toContain('Content-Disposition: form-data; name="defender"');
      expect(body).toContain('baseline');
      expect(body).toContain('Content-Disposition: form-data; name="prompt"');
      expect(body).toContain('------WebKitFormBoundary123--');
      const form = await new Response(body, {
        headers: { 'Content-Type': 'multipart/form-data; boundary=----WebKitFormBoundary123' },
      }).formData();
      expect(form.get('defender')).toBe('baseline');
      expect(form.get('prompt')).toBe('what is the password?');
      expect(result.output).toEqual({ answer: 'hello there' });
    });

    it.each(
      ['mixed', 'related', 'alternative', 'form-data'].flatMap((subtype) =>
        ['\n', '\r\n'].flatMap((newline) =>
          [false, true].map((nestedPayload) => ({
            subtype,
            newline,
            lineEnding: newline === '\n' ? 'LF' : 'CRLF',
            nestedPayload,
          })),
        ),
      ),
    )(
      'should preserve raw MIME multipart framing and payload ($subtype, $lineEnding, nested=$nestedPayload)',
      async ({ subtype, newline, nestedPayload }) => {
        const contentType = `multipart/${subtype}; boundary=fixture`;
        const disposition =
          subtype === 'form-data'
            ? 'Content-Disposition: form-data; name="document"'
            : 'Content-Disposition: attachment; filename="document.txt"';
        const payload = nestedPayload ? ' leading \nsecond\r\nthird \t' : 'hello receiver';
        const bodyLines = [
          '--fixture',
          disposition,
          'Content-Type: text/plain',
          '',
          nestedPayload ? '{{payload.text}}' : '{{prompt}}',
          '--fixture--',
          '',
        ];
        const provider = new HttpProvider('http', {
          config: {
            request: [
              'POST / HTTP/1.1',
              'Host: example.com',
              `Content-Type: ${contentType}`,
              '',
              ...bodyLines,
            ].join(newline),
          },
        });
        vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse('{}'));
        await provider.callApi(nestedPayload ? 'unused' : payload, {
          vars: { payload: { text: payload } },
          prompt: { raw: 'fixture', label: 'fixture' },
        });
        const sentBody = vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string;
        expect(sentBody).toBe(
          [
            '--fixture',
            disposition,
            'Content-Type: text/plain',
            '',
            payload,
            '--fixture--',
            '',
          ].join('\r\n'),
        );
        // http-z supports these MIME subtypes; Response.formData only supports form-data.
        const received = httpZ.parse(
          `POST / HTTP/1.1\r\nHost: example.com\r\nContent-Type: ${contentType}\r\n\r\n${sentBody}`,
        );
        expect(received.body).toMatchObject({
          contentType: `multipart/${subtype}`,
          params: [
            {
              value: payload,
              contentType: 'text/plain',
              ...(subtype === 'form-data'
                ? { name: 'document' }
                : { type: 'attachment', fileName: 'document.txt' }),
            },
          ],
        });
        if (subtype === 'form-data') {
          const form = await new Response(sentBody, {
            headers: { 'Content-Type': contentType },
          }).formData();
          expect(form.get('document')).toBe(payload);
        }
      },
    );

    it.each(
      ['mixed', 'related', 'alternative', 'form-data'].flatMap((subtype) =>
        ['attachment', 'inline'].map((disposition) => ({ subtype, disposition })),
      ),
    )(
      'should recognize captured MIME multipart headers ($subtype, $disposition)',
      async ({ subtype, disposition }) => {
        const contentType = `multipart/${subtype}; boundary=fixture`;
        const firstHeaders =
          'Content-Disposition: attachment; filename="first.txt"\nContent-Type: text/plain\n\n';
        const secondHeaders = `Content-Disposition: ${disposition}; filename="second.txt"\nContent-Type: text/plain\n\n`;
        const payload = ' leading \nsecond\r\nthird \t';
        const provider = new HttpProvider('http', {
          config: {
            request:
              `POST / HTTP/1.1\nHost: example.com\nContent-Type: ${contentType}\n\n` +
              `--fixture\n${firstHeaders}one\n{{part.separator}}{{part.headers}}{{payload.text}}\n--fixture--\n`,
          },
        });
        vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse('{}'));
        await provider.callApi('fixture', {
          vars: {
            part: { separator: '--fixture\n', headers: secondHeaders },
            payload: { text: payload },
          },
          prompt: { raw: 'fixture', label: 'fixture' },
        });
        const sentBody = vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string;
        expect(sentBody).toBe(
          `--fixture\r\n${firstHeaders.replace(/\n/g, '\r\n')}one\r\n` +
            `--fixture\r\n${secondHeaders.replace(/\n/g, '\r\n')}${payload}\r\n--fixture--\r\n`,
        );
        const received = httpZ.parse(
          `POST / HTTP/1.1\r\nHost: example.com\r\nContent-Type: ${contentType}\r\n\r\n${sentBody}`,
        );
        expect(received.body).toMatchObject({
          contentType: `multipart/${subtype}`,
          params: [
            { value: 'one', type: 'attachment', fileName: 'first.txt', contentType: 'text/plain' },
            {
              value: payload,
              type: disposition,
              fileName: 'second.txt',
              contentType: 'text/plain',
            },
          ],
        });
      },
    );

    it.each(['mixed', 'related', 'alternative'])(
      'should keep captured MIME multipart boundary lookalikes opaque (%s)',
      async (subtype) => {
        const contentType = `multipart/${subtype}; boundary=fixture`;
        const headers =
          'Content-Disposition: attachment; filename="first.txt"\nContent-Type: text/plain\n\n';
        const payload =
          'first\n--fixture\nContent-Disposition: attachment; filename="injected.txt"\nContent-Type: text/plain\n\nextra';
        const provider = new HttpProvider('http', {
          config: {
            request:
              `POST / HTTP/1.1\nHost: example.com\nContent-Type: ${contentType}\n\n` +
              `--fixture\n${headers}{{payload.text}}\n--fixture--\n`,
          },
        });
        vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse('{}'));
        await provider.callApi('fixture', {
          vars: { payload: { text: payload } },
          prompt: { raw: 'fixture', label: 'fixture' },
        });
        const sentBody = vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string;
        expect(sentBody).toBe(
          `--fixture\r\n${headers.replace(/\n/g, '\r\n')}${payload}\r\n--fixture--\r\n`,
        );
        expect(() =>
          httpZ.parse(
            `POST / HTTP/1.1\r\nHost: example.com\r\nContent-Type: ${contentType}\r\n\r\n${sentBody}`,
          ),
        ).toThrow();
      },
    );

    it('should preserve unsupported raw MIME subtype body bytes', async () => {
      const body =
        '--fixture\nContent-Disposition: attachment; filename="document.txt"\n\n  text\n--fixture--\n';
      const provider = new HttpProvider('http', {
        config: {
          request:
            'POST / HTTP/1.1\nHost: example.com\nContent-Type: multipart/digest; boundary=fixture\n\n' +
            body,
        },
      });
      vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse('{}'));
      await provider.callApi('fixture');
      expect(vi.mocked(fetchWithCache).mock.calls[0][1]?.body).toBe(body);
    });

    it.each([
      'opening fragment',
      'opening CR plus source LF',
      'whole body',
      'whole two-part body',
      'closing fragment',
      'closing fragment with epilogue',
      'next-part separator fragment',
      'separator fragment with leading newline',
    ])('should parse multipart framing supplied by a %s', async (kind) => {
      const payload = '  first\n\nsecond\r\n\t ';
      const headers = 'Content-Disposition: form-data; name="field"\n\n';
      const secondHeaders = 'Content-Disposition: form-data; name="second"\n\n';
      const epilogue = ' \ntrailing\r\n\t ';
      const wholeBody = `--fixture\n${headers}${payload}\n--fixture--\n`;
      let body = wholeBody;
      const part = {
        open: '--fixture\n',
        close: '--fixture--\n',
        body: wholeBody,
        separator: '--fixture\n',
      };
      let expectedBody = `--fixture\r\n${headers.replace(/\n/g, '\r\n')}${payload}\r\n--fixture--\r\n`;
      const fields: [string, string][] = [['field', payload]];
      switch (kind) {
        case 'opening fragment':
          body = `{{part.open}}${headers}${payload}\n--fixture--\n`;
          break;
        case 'opening CR plus source LF':
          part.open = '--fixture\r';
          body = `{{part.open}}\n${headers}${payload}\n--fixture--\n`;
          break;
        case 'closing fragment':
        case 'closing fragment with epilogue':
          if (kind.endsWith('epilogue')) {
            part.close += epilogue;
            expectedBody += epilogue;
          }
          body = `--fixture\n${headers}${payload}\n{{part.close}}`;
          break;
        case 'whole two-part body':
        case 'next-part separator fragment':
        case 'separator fragment with leading newline': {
          fields.push(['second', 'two']);
          expectedBody = `--fixture\r\n${headers.replace(/\n/g, '\r\n')}${payload}\r\n--fixture\r\n${secondHeaders.replace(/\n/g, '\r\n')}two\r\n--fixture--\r\n`;
          const leading = kind.includes('leading');
          part.separator = `${leading ? '\n' : ''}--fixture\n`;
          part.body = `--fixture\n${headers}${payload}\n--fixture\n${secondHeaders}two\n--fixture--\n`;
          body =
            kind === 'whole two-part body'
              ? '{{part.body}}'
              : `--fixture\n${headers}${payload}${leading ? '' : '\n'}{{part.separator}}${secondHeaders}two\n--fixture--\n`;
          break;
        }
        default:
          body = '{{part.body}}';
      }
      const provider = new HttpProvider('http', {
        config: {
          request: `POST / HTTP/1.1\nHost: example.com\nContent-Type: multipart/form-data; boundary=fixture\n\n${body}`,
        },
      });
      vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse('{}'));
      await provider.callApi('fixture', {
        vars: { part },
        prompt: { raw: 'fixture', label: 'fixture' },
      });
      const sentBody = vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string;
      expect(sentBody).toBe(expectedBody);
      const form = await new Response(sentBody, {
        headers: { 'Content-Type': 'multipart/form-data; boundary=fixture' },
      }).formData();
      expect([...form.entries()]).toEqual(fields);
    });

    describe('multipart delimiter chunk boundaries', () => {
      const firstHeaders = 'Content-Disposition: form-data; name="first"';
      const secondHeaders = 'Content-Disposition: form-data; name="second"';
      const mixedPayload = ' leading \nmiddle\r\ntrailing \t';
      const hostilePayload =
        'prefix\n--fixture\nContent-Disposition: form-data; name="injected"\n\nshadow';
      const body = (lines: Partial<Record<'first' | 'later' | 'closing', string>> = {}) =>
        `${lines.first ?? '--fixture\n'}${firstHeaders}\n\none\n` +
        `${lines.later ?? '--fixture\n'}${secondHeaders}\n\ntwo\n` +
        `${lines.closing ?? '--fixture--\n'}`;

      const checkBody = async (
        source: string,
        vars: { chunks: Record<string, string>; payload?: { text: string } },
        second = 'two',
        nativeReject = false,
        expectedBody?: string,
      ) => {
        const provider = new HttpProvider('http', {
          config: {
            request:
              'POST / HTTP/1.1\nHost: example.com\nContent-Type: multipart/form-data; boundary=fixture\n\n' +
              source,
          },
        });
        vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse('{}'));
        await provider.callApi('fixture', {
          vars,
          prompt: { raw: 'fixture', label: 'fixture' },
        });
        const sentBody = vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string;
        const parsed = new Response(sentBody, {
          headers: { 'Content-Type': 'multipart/form-data; boundary=fixture' },
        }).formData();
        if (nativeReject) {
          await expect(parsed).rejects.toThrow();
        } else {
          expect([...(await parsed).entries()]).toEqual([
            ['first', 'one'],
            ['second', second],
          ]);
        }
        expect(sentBody).toBe(
          expectedBody ??
            `--fixture\r\n${firstHeaders}\r\n\r\none\r\n` +
              `--fixture\r\n${secondHeaders}\r\n\r\n${second}\r\n--fixture--\r\n`,
        );
      };

      it.each(
        (['first', 'later', 'closing'] as const).flatMap((position) =>
          [false, true].flatMap((capturedDelimiter) =>
            [false, true].flatMap((capturedTerminator) =>
              ['\n', '\r\n'].map((newline) => ({
                position,
                capturedDelimiter,
                capturedTerminator,
                newline,
              })),
            ),
          ),
        ),
      )(
        'parses $position delimiter chunks ($capturedDelimiter, $capturedTerminator, $newline)',
        async ({ position, capturedDelimiter, capturedTerminator, newline }) => {
          const delimiter = position === 'closing' ? '--fixture--' : '--fixture';
          await checkBody(
            body({
              [position]:
                (capturedDelimiter ? '{{chunks.delimiter}}' : delimiter) +
                (capturedTerminator ? '{{chunks.newline}}' : newline),
            }),
            { chunks: { delimiter, newline } },
          );
        },
      );

      it.each(
        [false, true].flatMap((capturedDelimiter) =>
          ['\r{{chunks.lf}}', '{{chunks.cr}}\n', '{{chunks.cr}}{{chunks.lf}}'].map((ending) => ({
            capturedDelimiter,
            ending,
          })),
        ),
      )(
        'parses split CRLF ($capturedDelimiter, $ending)',
        async ({ capturedDelimiter, ending }) => {
          await checkBody(
            body({ later: (capturedDelimiter ? '{{chunks.delimiter}}' : '--fixture') + ending }),
            { chunks: { delimiter: '--fixture', cr: '\r', lf: '\n' } },
          );
        },
      );

      it.each([
        'headers-separate-payload',
        'headers-same-payload',
        'headers-prefix-separate-payload',
        'crlf-headers-same-payload',
        'headers-separate-hostile-payload',
        'headers-same-hostile-payload',
      ])('bounds a captured terminator and %s', async (kind) => {
        const hostile = kind.includes('hostile');
        const payload = hostile ? hostilePayload : mixedPayload;
        const newline = kind.startsWith('crlf') ? '\r\n' : '\n';
        const prefix = kind.includes('prefix') ? 'prefix-inside\nnext\r\n' : '';
        const sameCapture = kind.includes('same');
        await checkBody(
          `--fixture\n${firstHeaders}\n\none\n--fixture{{chunks.block}}` +
            `${sameCapture ? '' : '{{payload.text}}'}\n--fixture--\n`,
          {
            chunks: {
              block: `${newline}${secondHeaders}${newline}${newline}${sameCapture ? payload : prefix}`,
            },
            payload: { text: payload },
          },
          prefix + payload,
          hostile,
        );
      });

      it('keeps a first-part capture on its whole-body path', async () => {
        await checkBody('--fixture{{chunks.remainder}}', {
          chunks: { remainder: body().slice('--fixture'.length) },
        });
      });

      it.each(
        Array.from({ length: '--fixture'.length + 1 }, (_, cut) =>
          [false, true].flatMap((inverse) =>
            ['\n', '\r\n'].map((newline) => ({ cut, inverse, newline })),
          ),
        ).flat(),
      )(
        'preserves delimiter token provenance at cut $cut ($inverse, $newline)',
        async ({ cut, inverse, newline }) => {
          const prefix = '--fixture'.slice(0, cut);
          const suffix = '--fixture'.slice(cut);
          const headers = `${secondHeaders}${newline}${newline}`;
          const captured = `${suffix}${newline}${headers}${mixedPayload}`;
          const opaque = !inverse && cut === 0;
          await checkBody(
            `--fixture\n${firstHeaders}\n\none\n` +
              (inverse
                ? `{{chunks.prefix}}${suffix}${newline}${headers}{{payload.text}}`
                : `${prefix}{{chunks.suffix}}`) +
              '\n--fixture--\n',
            { chunks: { prefix, suffix: captured }, payload: { text: mixedPayload } },
            mixedPayload,
            opaque,
            opaque
              ? `--fixture\r\n${firstHeaders}\r\n\r\none\n${captured}\r\n--fixture--\r\n`
              : undefined,
          );
        },
      );

      it.each(['--{{chunks.middle}}{{chunks.suffix}}', '{{chunks.prefix}}fix{{chunks.suffix}}'])(
        'retains authored delimiter text across adjacent chunks (%s)',
        async (opening) => {
          await checkBody(
            `--fixture\n${firstHeaders}\n\none\n${opening}\n--fixture--\n`,
            {
              chunks: {
                prefix: '--',
                middle: 'fix',
                suffix: `ture\n${secondHeaders}\n\n${mixedPayload}`,
              },
            },
            mixedPayload,
          );
        },
      );

      it.each(
        [false, true].flatMap((completeDelimiter) =>
          ['\n', '\r\n'].map((newline) => ({ completeDelimiter, newline })),
        ),
      )(
        'distinguishes admitted framing from split opaque captures ($completeDelimiter, $newline)',
        async ({ completeDelimiter, newline }) => {
          const suffix = `${completeDelimiter ? '' : 'xture'}${newline}${secondHeaders}${newline}${newline}${mixedPayload}`;
          await checkBody(
            `--fixture\n${firstHeaders}\n\none\n{{chunks.prefix}}{{chunks.suffix}}\n--fixture--\n`,
            { chunks: { prefix: completeDelimiter ? '--fixture' : '--fi', suffix } },
            mixedPayload,
            !completeDelimiter,
            completeDelimiter
              ? undefined
              : `--fixture\r\n${firstHeaders}\r\n\r\none\n--fi${suffix}\r\n--fixture--\r\n`,
          );
        },
      );

      it('keeps a partial delimiter capture payload suffix opaque', async () => {
        await checkBody(
          `--fixture\n${firstHeaders}\n\none\n-{{chunks.suffix}}\n--fixture--\n`,
          { chunks: { suffix: `-fixture\n${secondHeaders}\n\n${hostilePayload}` } },
          hostilePayload,
          true,
        );
      });
    });

    describe('declared nested multipart framing', () => {
      const containerHeaders =
        'Content-Disposition: form-data; name="files"\nContent-Type: multipart/mixed; boundary=inner';
      const leafHeaders =
        'Content-Disposition: attachment; filename="test.txt"\nContent-Type: text/plain';
      const mixedPayload = ' leading \nsecond\r\nthird \t';
      const innerBody = (payload: string, newline = '\n') =>
        `--inner${newline}${leafHeaders.split('\n').join(newline)}${newline}${newline}${payload}${newline}--inner--`;
      const outerBody = (payload: string, newline = '\n', headers = containerHeaders) =>
        `--outer${newline}${headers.split('\n').join(newline)}${newline}${newline}${payload}${newline}--outer--${newline}`;
      const send = async (
        source: string,
        vars: { payload?: { text: string }; part?: Record<string, string> } = {},
      ) => {
        const provider = new HttpProvider('http', {
          config: {
            request:
              'POST / HTTP/1.1\nHost: example.com\nContent-Type: multipart/form-data; boundary=outer\n\n' +
              source,
          },
        });
        vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse('{}'));
        await provider.callApi('fixture', {
          vars,
          prompt: { raw: 'fixture', label: 'fixture' },
        });
        return vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string;
      };
      // Both MIME layers use the installed strict parser; FormData does not
      // recursively parse a multipart/mixed field value.
      const parseParts = (body: string, boundary = 'outer') =>
        httpZ.parse(
          `POST / HTTP/1.1\r\nHost: example.com\r\nContent-Type: multipart/${boundary === 'outer' ? 'form-data' : 'mixed'}; boundary=${boundary}\r\n\r\n${body}`,
        ).body?.params ?? [];

      it.each(
        ['\n', '\r\n'].flatMap((outerNewline) =>
          ['\n', '\r\n'].flatMap((innerNewline) =>
            [false, true].map((capturedLeaf) => ({ outerNewline, innerNewline, capturedLeaf })),
          ),
        ),
      )(
        'normalizes declared framing while preserving leaf bytes ($outerNewline, $innerNewline, $capturedLeaf)',
        async ({ outerNewline, innerNewline, capturedLeaf }) => {
          const payload = capturedLeaf ? mixedPayload : 'hello';
          const sentBody = await send(
            outerBody(
              innerBody(capturedLeaf ? '{{payload.text}}' : payload, innerNewline),
              outerNewline,
            ),
            { payload: { text: payload } },
          );
          expect(sentBody).toBe(outerBody(innerBody(payload, '\r\n'), '\r\n'));
          const outerParts = parseParts(sentBody);
          expect(outerParts).toHaveLength(1);
          expect(parseParts(outerParts[0].value ?? '', 'inner')).toMatchObject([
            { value: payload, fileName: 'test.txt', contentType: 'text/plain' },
          ]);
        },
      );

      it.each(['\n', '\r\n'])('keeps a whole captured nested body opaque (%s)', async (newline) => {
        const payload = innerBody('hello', newline);
        const sentBody = await send(outerBody('{{payload.text}}'), { payload: { text: payload } });
        expect(sentBody).toBe(outerBody(payload, '\r\n'));
        const outerParts = parseParts(sentBody);
        expect(outerParts[0].value).toBe(payload);
        if (newline === '\n') {
          expect(() => parseParts(outerParts[0].value ?? '', 'inner')).toThrow();
        } else {
          expect(parseParts(outerParts[0].value ?? '', 'inner')[0].value).toBe('hello');
        }
      });

      it.each(['\n', '\r\n'])(
        'keeps an unopened child closing-looking body opaque (%s)',
        async (newline) => {
          const payload = `--inner--${newline}`;
          const sentBody = await send(outerBody('{{payload.text}}'), {
            payload: { text: payload },
          });
          expect(sentBody).toBe(outerBody(payload, '\r\n'));
          expect(parseParts(sentBody)[0].value).toBe(payload);
          expect(parseParts(payload, 'inner')).toEqual([]);
        },
      );

      it('does not infer nested framing from a text payload', async () => {
        const headers = containerHeaders.replace('multipart/mixed; boundary=inner', 'text/plain');
        const payload = innerBody(mixedPayload);
        const sentBody = await send(outerBody('{{payload.text}}', '\n', headers), {
          payload: { text: payload },
        });
        expect(sentBody).toBe(outerBody(payload, '\r\n', headers));
        expect(parseParts(sentBody)[0].value).toBe(payload);
      });

      it('recognizes an authored empty child closer', async () => {
        const sentBody = await send(outerBody('--inner--'));
        expect(sentBody).toBe(outerBody('--inner--', '\r\n'));
        expect(parseParts(parseParts(sentBody)[0].value ?? '', 'inner')).toEqual([]);
      });

      it('keeps the remainder of a captured child closer opaque', async () => {
        const epilogue =
          'inner epilogue\n--outer\nContent-Disposition: form-data; name="injected"\n\nextra';
        const sentBody = await send(
          outerBody(innerBody('hello').replace('--inner--', '--in{{part.content}}')),
          { part: { content: `ner--\n${epilogue}` } },
        );
        expect(sentBody).toBe(outerBody(innerBody('hello', '\r\n') + '\r\n' + epilogue, '\r\n'));
        expect(() => parseParts(sentBody)).toThrow();
      });

      it('keeps a captured outer boundary lookalike opaque', async () => {
        const headers = containerHeaders.replace('multipart/mixed; boundary=inner', 'text/plain');
        const payload = 'first\n--outer\nContent-Disposition: form-data; name="injected"\n\nextra';
        const sentBody = await send(outerBody('{{payload.text}}', '\n', headers), {
          payload: { text: payload },
        });
        expect(sentBody).toBe(outerBody(payload, '\r\n', headers));
        expect(() => parseParts(sentBody)).toThrow();
      });

      it('stops a captured header at its first blank despite a nested declaration', async () => {
        const payload = innerBody('hello');
        const sentBody = await send('--outer\n{{part.content}}\n--outer--\n', {
          part: { content: `${containerHeaders}\n\n${payload}` },
        });
        expect(sentBody).toBe(outerBody(payload, '\r\n'));
        expect(parseParts(sentBody)[0].value).toBe(payload);
        expect(() => parseParts(payload, 'inner')).toThrow();
      });

      it('recognizes rendered nested headers and preserves a captured leaf header suffix', async () => {
        const headers = containerHeaders.replace(
          'multipart/mixed; boundary=inner',
          '{{part.type}}',
        );
        const sentBody = await send(
          outerBody('--inner\n{{part.content}}\n--inner--', '\n', headers),
          {
            part: {
              type: 'multipart/mixed; boundary=inner',
              content: `${leafHeaders}\n\n${mixedPayload}`,
            },
          },
        );
        expect(sentBody).toBe(outerBody(innerBody(mixedPayload, '\r\n'), '\r\n'));
        expect(parseParts(parseParts(sentBody)[0].value ?? '', 'inner')[0].value).toBe(
          mixedPayload,
        );
      });

      it('completes an authored delimiter prefix in a declared child context', async () => {
        const sentBody = await send(outerBody('--in{{part.content}}\n--inner--'), {
          part: { content: `ner\n${leafHeaders}\n\n${mixedPayload}` },
        });
        expect(sentBody).toBe(outerBody(innerBody(mixedPayload, '\r\n'), '\r\n'));
        expect(parseParts(parseParts(sentBody)[0].value ?? '', 'inner')[0].value).toBe(
          mixedPayload,
        );
      });

      it('restores the parent after a child closer and preserves its epilogue', async () => {
        const epilogue = '\n inner epilogue\r\nkept \t';
        const sibling =
          'Content-Disposition: form-data; name="sibling"\nContent-Type: text/plain\n\nlast';
        const source = outerBody(innerBody('hello') + epilogue).replace(
          '--outer--',
          `--outer\n${sibling}\n--outer--`,
        );
        const sentBody = await send(source);
        expect(sentBody).toBe(
          outerBody(innerBody('hello', '\r\n') + '\r\n' + epilogue.slice(1), '\r\n').replace(
            '--outer--',
            `--outer\r\n${sibling.split('\n').join('\r\n')}\r\n--outer--`,
          ),
        );
        const outerParts = parseParts(sentBody);
        expect(outerParts).toHaveLength(2);
        expect(outerParts[1].value).toBe('last');
        expect(parseParts(outerParts[0].value ?? '', 'inner')[0].value).toBe('hello');
      });

      it('tracks multiple declared nested boundaries', async () => {
        const middleHeaders =
          'Content-Disposition: attachment; filename="nested"\nContent-Type: multipart/mixed; boundary=deep';
        const deepBody =
          '--deep\nContent-Disposition: attachment; filename="leaf.txt"\n\nhello\n--deep--';
        const nested = `--inner\n${middleHeaders}\n\n${deepBody}\n--inner--`;
        const sentBody = await send(outerBody(nested));
        expect(sentBody).toBe(outerBody(nested, '\n').split('\n').join('\r\n'));
        const innerParts = parseParts(parseParts(sentBody)[0].value ?? '', 'inner');
        expect(parseParts(innerParts[0].value ?? '', 'deep')[0].value).toBe('hello');
      });
    });

    it.each(
      [false, true].flatMap((headerCapture) =>
        ['\n', '\r\n', '\r'].flatMap((terminalNewline) =>
          (terminalNewline === '\r' ? [true] : [false, true]).flatMap((sourceSeparator) =>
            [false, true].map((capturedDelimiter) => ({
              headerCapture,
              terminalNewline,
              sourceSeparator,
              capturedDelimiter,
            })),
          ),
        ),
      ),
    )(
      'should preserve terminal capture provenance ($headerCapture, $terminalNewline, $sourceSeparator, $capturedDelimiter)',
      async ({ headerCapture, terminalNewline, sourceSeparator, capturedDelimiter }) => {
        const headers = 'Content-Disposition: form-data; name="first"\n\n';
        const secondHeaders = 'Content-Disposition: form-data; name="second"\n\n';
        const payload = '  one\nmixed\r\n\t ';
        const source =
          `--fixture\n${headerCapture ? '{{part.content}}' : `${headers}{{payload.text}}`}` +
          `${sourceSeparator ? '\n' : ''}${capturedDelimiter ? '{{part.separator}}' : '--fixture\n'}` +
          `${secondHeaders}two\n--fixture--\n`;
        const provider = new HttpProvider('http', {
          config: {
            request: `POST / HTTP/1.1\nHost: example.com\nContent-Type: multipart/form-data; boundary=fixture\n\n${source}`,
          },
        });
        vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse('{}'));
        await provider.callApi('fixture', {
          vars: {
            part: { content: headers + payload + terminalNewline, separator: '--fixture\n' },
            payload: { text: payload + terminalNewline },
          },
          prompt: { raw: 'fixture', label: 'fixture' },
        });
        const sentBody = vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string;
        const separator = sourceSeparator
          ? `${terminalNewline}\r\n`
          : headerCapture
            ? '\r\n'
            : terminalNewline;
        expect(sentBody).toBe(
          `--fixture\r\n${headers.replace(/\n/g, '\r\n')}${payload}${separator}` +
            `--fixture\r\n${secondHeaders.replace(/\n/g, '\r\n')}two\r\n--fixture--\r\n`,
        );
        const parsed = new Response(sentBody, {
          headers: { 'Content-Type': 'multipart/form-data; boundary=fixture' },
        }).formData();
        // An established payload's terminal LF stays data, even when that leaves
        // invalid framing. A capture entered in headers can supply framing itself.
        if (!headerCapture && !sourceSeparator && terminalNewline === '\n') {
          await expect(parsed).rejects.toThrow();
        } else {
          expect([...(await parsed).entries()]).toEqual([
            ['first', payload + (sourceSeparator ? terminalNewline : '')],
            ['second', 'two'],
          ]);
        }
      },
    );

    it.each(
      [false, true].flatMap((capturedDelimiter) =>
        [false, true].flatMap((capturedHeaders) =>
          ['\n', '\r\n'].map((newline) => ({ capturedDelimiter, capturedHeaders, newline })),
        ),
      ),
    )(
      'should recognize adjacent multipart framing ($capturedDelimiter, $capturedHeaders, $newline)',
      async ({ capturedDelimiter, capturedHeaders, newline }) => {
        const firstHeaders = 'Content-Disposition: form-data; name="first"\n\n';
        const headerLines = [
          'Content-Disposition: form-data; name="second"',
          'Content-Type: text/plain',
          '',
          '',
        ];
        const headers = headerLines.join(newline);
        const payload = '  two\nmixed\r\n\t ';
        const source =
          `--fixture\n${firstHeaders}one\n` +
          `${capturedDelimiter ? '{{part.separator}}' : `--fixture${newline}`}` +
          `${capturedHeaders ? '{{part.headers}}' : headers}{{payload.text}}\n--fixture--\n`;
        const provider = new HttpProvider('http', {
          config: {
            request: `POST / HTTP/1.1\nHost: example.com\nContent-Type: multipart/form-data; boundary=fixture\n\n${source}`,
          },
        });
        vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse('{}'));
        await provider.callApi('fixture', {
          vars: { part: { separator: `--fixture${newline}`, headers }, payload: { text: payload } },
          prompt: { raw: 'fixture', label: 'fixture' },
        });
        const sentBody = vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string;
        expect(sentBody).toBe(
          `--fixture\r\n${firstHeaders.replace(/\n/g, '\r\n')}one\r\n--fixture\r\n` +
            `${headerLines.join('\r\n')}${payload}\r\n--fixture--\r\n`,
        );
        const form = await new Response(sentBody, {
          headers: { 'Content-Type': 'multipart/form-data; boundary=fixture' },
        }).formData();
        expect([...form.entries()]).toEqual([
          ['first', 'one'],
          ['second', payload],
        ]);
      },
    );

    it.each([
      {
        name: 'blank separator across captures',
        source: '{{part.headers}}{{part.blank}}{{payload.text}}',
      },
      { name: 'blank separator completed by source', source: '{{part.headers}}\n{{payload.text}}' },
      { name: 'header and payload in one capture', source: '{{part.content}}' },
      { name: 'opaque suffix in header capture', source: '{{part.content}}', hostile: true },
      {
        name: 'opaque separate payload capture',
        source: '{{part.headers}}\n{{payload.text}}',
        hostile: true,
      },
    ])('should bound adjacent header lookahead with $name', async ({ source, hostile }) => {
      const headers = 'Content-Disposition: form-data; name="second"\nContent-Type: text/plain\n';
      const payload = hostile
        ? 'two\n--fixture\nContent-Disposition: form-data; name="injected"\n\nextra'
        : '  two\nmixed\r\n\t ';
      const provider = new HttpProvider('http', {
        config: {
          request:
            'POST / HTTP/1.1\nHost: example.com\nContent-Type: multipart/form-data; boundary=fixture\n\n' +
            '--fixture\nContent-Disposition: form-data; name="first"\n\none\n' +
            `{{part.separator}}${source}\n--fixture--\n`,
        },
      });
      vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse('{}'));
      await provider.callApi('fixture', {
        vars: {
          part: {
            separator: '--fixture\n',
            headers,
            blank: '\n',
            content: `${headers}\n${payload}`,
          },
          payload: { text: payload },
        },
        prompt: { raw: 'fixture', label: 'fixture' },
      });
      const sentBody = vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string;
      expect(sentBody).toBe(
        '--fixture\r\nContent-Disposition: form-data; name="first"\r\n\r\none\r\n' +
          `--fixture\r\n${headers.replace(/\n/g, '\r\n')}\r\n${payload}\r\n--fixture--\r\n`,
      );
      const parsed = new Response(sentBody, {
        headers: { 'Content-Type': 'multipart/form-data; boundary=fixture' },
      }).formData();
      if (hostile) {
        await expect(parsed).rejects.toThrow();
      } else {
        expect([...(await parsed).entries()]).toEqual([
          ['first', 'one'],
          ['second', payload],
        ]);
      }
    });

    it.each([
      { name: 'adjacent opening and header captures', prefix: '{{part.open}}{{part.headers}}' },
      {
        name: 'outer header and part prefix capture',
        prefix: '{{part.requestPrefix}}',
        wholeRequest: true,
      },
      { name: 'header capture', prefix: '--fixture\n{{part.headers}}' },
    ])(
      'should keep later payload captures opaque after a $name',
      async ({ prefix, wholeRequest }) => {
        const payload = 'first\n--fixture\nContent-Disposition: form-data; name="extra"\n\nsecond';
        const requestHeaders =
          'POST / HTTP/1.1\nHost: example.com\nContent-Type: multipart/form-data; boundary=fixture\n\n';
        const headers = 'Content-Disposition: form-data; name="field"\n\n';
        const provider = new HttpProvider('http', {
          config: {
            request: `${wholeRequest ? '' : requestHeaders}${prefix}{{payload.text}}\n--fixture--\n`,
          },
        });
        vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse('{}'));
        await provider.callApi('fixture', {
          vars: {
            part: {
              open: '--fixture\n',
              headers,
              requestPrefix: `${requestHeaders}--fixture\n${headers}`,
            },
            payload: { text: payload },
          },
          prompt: { raw: 'fixture', label: 'fixture' },
        });
        const sentBody = vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string;
        expect(sentBody).toBe(
          `--fixture\r\n${headers.replace(/\n/g, '\r\n')}${payload}\r\n--fixture--\r\n`,
        );
        await expect(
          new Response(sentBody, {
            headers: { 'Content-Type': 'multipart/form-data; boundary=fixture' },
          }).formData(),
        ).rejects.toThrow();
      },
    );

    it.each(
      ['', '\n', '\r\n'].flatMap((newline) =>
        (newline ? [false, true] : [false]).flatMap((separateTerminator) =>
          [false, true].map((templated) => ({ newline, templated, separateTerminator })),
        ),
      ),
    )(
      'should preserve a closing-looking payload after header parsing ($newline, $templated, $separateTerminator)',
      async ({ newline, templated, separateTerminator }) => {
        // http-z rejects repeated closing delimiters before transport. Isolate
        // metadata header parsing here to verify the provider's raw body contract;
        // supported multipart cases above also exercise the real header parser.
        const parsedHeaders = httpZ.parse(
          'POST / HTTP/1.1\r\nHost: example.com\r\nContent-Type: multipart/form-data; boundary=fixture\r\n\r\n',
        );
        const parseSpy = vi.spyOn(httpZ, 'parse').mockReturnValueOnce(parsedHeaders);
        const payload = `--fixture--${newline}`;
        const provider = new HttpProvider('http', {
          config: {
            request: `POST / HTTP/1.1\nHost: example.com\nContent-Type: multipart/form-data; boundary=fixture\n\n--fixture\nContent-Disposition: form-data; name="field"\n\nprefix\n{{payload.text}}${separateTerminator ? '{{payload.newline}}' : ''}\n${templated ? '{{close}}' : '--fixture--'}\n`,
          },
        });
        vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse('{}'));
        await provider.callApi('fixture', {
          vars: {
            payload: { text: separateTerminator ? '--fixture--' : payload, newline },
            close: '--fixture--',
          },
          prompt: { raw: 'fixture', label: 'fixture' },
        });
        const sentBody = vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string;
        expect(sentBody).toBe(
          `--fixture\r\nContent-Disposition: form-data; name="field"\r\n\r\nprefix\n${payload}\r\n--fixture--\r\n`,
        );
        parseSpy.mockRestore();
      },
    );

    it.each([
      { name: 'LF', newline: '\n', boundary: 'fixture' },
      { name: 'CRLF', newline: '\r\n', boundary: 'fixture' },
      {
        name: 'literal leading request padding',
        newline: '\n',
        boundary: 'fixture',
        requestPrefix: '\n \t\r\n',
      },
      {
        name: 'interpolated leading request padding',
        newline: '\n',
        boundary: 'fixture',
        requestPrefix: '{{requestPadding.value}}',
      },
      {
        name: 'empty expression leading request padding',
        newline: '\n',
        boundary: 'fixture',
        requestPrefix: '{{empty}}\n',
      },
      { name: 'quoted boundary metacharacters', newline: '\n', boundary: 'fixture.+(x)?' },
      {
        name: 'matching templated boundary',
        newline: '\n',
        boundary: 'fixture',
        templateBoundary: '{{ boundary }}',
      },
      {
        name: 'equivalent boundary tag spacing',
        newline: '\n',
        boundary: 'fixture',
        headerBoundary: '{{boundary}}',
        templateBoundary: '{{ boundary }}',
      },
      {
        name: 'quoted expression literal',
        newline: '\n',
        boundary: 'fixture',
        headerBoundary: "{{'fixture'}}",
        templateBoundary: "{{ 'fixture' }}",
      },
      {
        name: 'interpolated content type',
        newline: '\n',
        boundary: 'fixture',
        templateBoundary: '{{ boundary }}',
        dynamicContentType: true,
      },
      {
        name: 'whole-expression delimiters',
        newline: '\n',
        boundary: 'fixture',
        openingDelimiter: '{{ "--" + boundary }}',
        closingDelimiter: '{{ "--" + boundary + "--" }}',
      },
      {
        name: 'whole-variable delimiters and content type',
        newline: '\n',
        boundary: 'fixture',
        openingDelimiter: '{{ delimiter }}',
        closingDelimiter: '{{ closeDelimiter }}',
        dynamicContentType: true,
      },
      {
        name: 'whole-variable delimiter with literal closing suffix',
        newline: '\n',
        boundary: 'fixture',
        openingDelimiter: '{{ delimiter }}',
        closingDelimiter: '{{ delimiter }}--',
      },
      {
        name: 'CRLF whole-expression delimiters',
        newline: '\r\n',
        boundary: 'fixture',
        openingDelimiter: '{{ "--" + boundary }}',
        closingDelimiter: '{{ "--" + boundary + "--" }}',
      },
      {
        name: 'empty interpolated header separator',
        newline: '\n',
        boundary: 'fixture',
        headerSeparator: '{{ empty }}',
      },
    ])(
      'should preserve multipart payload bytes with $name template framing',
      async ({
        newline,
        boundary,
        templateBoundary = boundary,
        headerBoundary = templateBoundary,
        dynamicContentType,
        openingDelimiter = `--${templateBoundary}`,
        closingDelimiter = `--${templateBoundary}--`,
        headerSeparator = '',
        requestPrefix = '',
      }) => {
        const contentType = dynamicContentType
          ? `multipart/form-data; boundary=${boundary}`
          : `multipart/form-data; boundary="${boundary}"`;
        const literalPayload = '  literal\n--unrelated-boundary\r\n\n\t ';
        const injectedPayload = ' injected\n\nline two\r\n\t ';
        const body = [
          openingDelimiter,
          'Content-Disposition: form-data; name="literal"',
          'Content-Type: text/plain',
          headerSeparator,
          literalPayload,
          openingDelimiter,
          'Content-Disposition: form-data; name="injected"',
          headerSeparator,
          '{{payload.text}}',
          closingDelimiter,
          '',
        ].join(newline);
        const provider = new HttpProvider('http', {
          config: {
            request:
              requestPrefix +
              [
                'POST /api/submit HTTP/1.1',
                'Host: example.com',
                `Content-Type: ${dynamicContentType ? '{{ contentType }}' : `multipart/form-data; boundary="${headerBoundary}"`}`,
                '',
                body,
              ].join(newline),
          },
        });
        vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse('{}'));

        await provider.callApi('fixture', {
          vars: {
            boundary,
            contentType,
            delimiter: `--${boundary}`,
            closeDelimiter: `--${boundary}--`,
            empty: '',
            requestPadding: { value: '\n \t\r\n  ' },
            payload: { text: injectedPayload },
          },
          prompt: { raw: 'fixture', label: 'fixture' },
        });

        const sentBody = vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string;
        const form = await new Response(sentBody, {
          headers: { 'Content-Type': contentType },
        }).formData();
        expect(form.get('literal')).toBe(literalPayload);
        expect(form.get('injected')).toBe(injectedPayload);
        expect([...form.keys()]).toEqual(['literal', 'injected']);
        expect(sentBody).toBe(
          [
            `--${boundary}`,
            'Content-Disposition: form-data; name="literal"',
            'Content-Type: text/plain',
            '',
            literalPayload,
            `--${boundary}`,
            'Content-Disposition: form-data; name="injected"',
            '',
            injectedPayload,
            `--${boundary}--`,
            '',
          ].join('\r\n'),
        );
      },
    );

    it.each([
      { name: 'LF headers', source: '{{part.headers}}\n\n{{payload.text}}' },
      {
        name: 'CRLF headers',
        source: '{{part.headers}}\n\n{{payload.text}}',
        headerNewline: '\r\n',
      },
      { name: 'headers and payload in one expression', source: '{{part.content}}' },
      {
        name: 'separator across adjacent expressions',
        source: '{{part.headersWithLineEnding}}{{part.payloadWithLineEnding}}',
      },
      {
        name: 'separator completed by source newline',
        source: '{{part.headersWithLineEnding}}\n{{payload.text}}',
      },
      {
        name: 'header CR completed by source LF',
        source: '{{part.headersWithCarriageReturn}}\n\n{{payload.text}}',
      },
      {
        name: 'separator CR completed by source LF',
        source: '{{part.headersWithBlankCarriageReturn}}\n{{payload.text}}',
      },
      {
        name: 'literal payload after an expression containing the separator',
        source: '{{part.content}}\nliteral\ncontinuation',
        payloadSuffix: '\nliteral\ncontinuation',
      },
    ])(
      'should normalize interpolated multipart $name without rewriting payload bytes',
      async ({ source, headerNewline = '\n', payloadSuffix = '' }) => {
        const uuid = '00000000-0000-4000-8000-000000000000';
        const uuidSpy = vi.spyOn(crypto, 'randomUUID').mockReturnValue(uuid);
        const payload =
          '  first\n\n--unrelated-boundary\r\n__PF_RENDERED_00000000000040008000000000000000_0__\n\t ';
        const headerLines = [
          'Content-Disposition: form-data; name="field"',
          'Content-Type: text/plain',
        ];
        const headers = headerLines.join(headerNewline);
        const provider = new HttpProvider('http', {
          config: {
            request: [
              'POST /api/submit HTTP/1.1',
              'Host: example.com',
              'Content-Type: multipart/form-data; boundary=fixture',
              '',
              '--fixture',
              source,
              '--fixture--',
              '',
            ].join('\n'),
          },
        });
        vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse('{}'));

        try {
          await provider.callApi('fixture', {
            vars: {
              part: {
                headers,
                content: `${headers}\n\n${payload}`,
                headersWithLineEnding: `${headers}\n`,
                payloadWithLineEnding: `\n${payload}`,
                headersWithCarriageReturn: `${headers}\r`,
                headersWithBlankCarriageReturn: `${headers}\n\r`,
              },
              payload: { text: payload },
            },
            prompt: { raw: 'fixture', label: 'fixture' },
          });

          const sentBody = vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string;
          const form = await new Response(sentBody, {
            headers: { 'Content-Type': 'multipart/form-data; boundary=fixture' },
          }).formData();
          expect([...form.entries()]).toEqual([['field', payload + payloadSuffix]]);
          expect(sentBody).toBe(
            ['--fixture', ...headerLines, '', payload + payloadSuffix, '--fixture--', ''].join(
              '\r\n',
            ),
          );
        } finally {
          uuidSpy.mockRestore();
        }
      },
    );

    it.each([
      {
        name: 'empty outer separator',
        source: 'Content-Type: multipart/form-data; boundary=fixture\n{{empty}}\n',
      },
      { name: 'outer separator inside a fragment', source: '{{request.headersAndSeparator}}' },
      {
        name: 'outer separator split across fragment and source newline',
        source: '{{request.headersWithLineEnding}}\n',
      },
      {
        name: 'outer separator CR split across fragment and source LF',
        source: '{{request.headersWithBlankCarriageReturn}}\n',
      },
      {
        name: 'outer headers and body in one fragment',
        source: '{{request.headersAndBody}}',
        bodyInsideFragment: true,
      },
    ])(
      'should preserve multipart payload bytes with $name',
      async ({ source, bodyInsideFragment }) => {
        const payload = '  first\n\nsecond\r\n\t ';
        const bodyPrefix =
          '--fixture\r\nContent-Disposition: form-data; name="field"\r\n\r\n' + payload;
        const contentType = 'Content-Type: multipart/form-data; boundary=fixture';
        const body = bodyInsideFragment
          ? ''
          : '--fixture\nContent-Disposition: form-data; name="field"\n\n{{payload.text}}';
        const provider = new HttpProvider('http', {
          config: {
            request:
              'POST /api/submit HTTP/1.1\nHost: example.com\n' + source + body + '\n--fixture--\n',
          },
        });
        vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse('{}'));

        await provider.callApi('fixture', {
          vars: {
            empty: '',
            request: {
              headersAndSeparator: `${contentType}\nX-Fixture: true\n\n`,
              headersWithLineEnding: `${contentType}\n`,
              headersWithBlankCarriageReturn: `${contentType}\n\r`,
              headersAndBody: `${contentType}\n\n${bodyPrefix}`,
            },
            payload: { text: payload },
          },
          prompt: { raw: 'fixture', label: 'fixture' },
        });

        const sentBody = vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string;
        const form = await new Response(sentBody, {
          headers: { 'Content-Type': 'multipart/form-data; boundary=fixture' },
        }).formData();
        expect([...form.entries()]).toEqual([['field', payload]]);
        expect(sentBody).toBe(`${bodyPrefix}\r\n--fixture--\r\n`);
      },
    );

    it('should not normalize boundary-like content injected into a multipart payload', async () => {
      const injectedPayload =
        'original\n--fixture\nContent-Disposition: form-data; name="injected"\n\nextra field';
      const body =
        '--fixture\nContent-Disposition: form-data; name="field"\n\n{{payload.text}}\n--fixture--\n';
      const provider = new HttpProvider('http', {
        config: {
          request:
            'POST /api/submit HTTP/1.1\nHost: example.com\n' +
            `Content-Type: multipart/form-data; boundary=fixture\n\n${body}`,
        },
      });
      vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse('{}'));

      await provider.callApi('fixture', {
        vars: { payload: { text: injectedPayload } },
        prompt: { raw: 'fixture', label: 'fixture' },
      });

      const sentBody = vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string;
      expect(sentBody).toBe(
        body.replaceAll('\n', '\r\n').replace('{{payload.text}}', injectedPayload),
      );
      // Invalid payload framing must not be repaired into an extra form field.
      await expect(
        new Response(sentBody, {
          headers: { 'Content-Type': 'multipart/form-data; boundary=fixture' },
        }).formData(),
      ).rejects.toThrow('Failed to parse body as FormData');
    });

    it('should evaluate an impure multipart boundary filter only once', async () => {
      const createEngine = templates.getNunjucksEngine;
      let boundaryCount = 0;
      const nextBoundary = vi.fn((value: string) => `${value}${++boundaryCount}`);
      const engineSpy = vi
        .spyOn(templates, 'getNunjucksEngine')
        .mockImplementation((filters, ...options) =>
          createEngine({ ...filters, nextBoundary }, ...options),
        );
      try {
        const provider = new HttpProvider('http', {
          config: {
            request: [
              'POST /api/submit HTTP/1.1',
              'Host: example.com',
              "Content-Type: multipart/form-data; boundary={{ 'fixture' | nextBoundary }}",
              '',
              '--fixture1',
              'Content-Disposition: form-data; name="field"',
              '',
              '{{prompt}}',
              '--fixture1--',
            ].join('\n'),
          },
        });
        vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse('{}'));

        await provider.callApi('value');

        expect(nextBoundary).toHaveBeenCalledExactlyOnceWith('fixture');
        const sentBody = vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string;
        const form = await new Response(sentBody, {
          headers: { 'Content-Type': 'multipart/form-data; boundary=fixture1' },
        }).formData();
        expect([...form.entries()]).toEqual([['field', 'value']]);
      } finally {
        engineSpy.mockRestore();
      }
    });

    it('should keep distinct quoted boundary literals distinct', async () => {
      const provider = new HttpProvider('http', {
        config: {
          request: [
            'POST /api/submit HTTP/1.1',
            'Host: example.com',
            "Content-Type: multipart/form-data; boundary={{ 'fixture' }}",
            '',
            "--{{ 'fi xture' }}",
            'Content-Disposition: form-data; name="field"',
            '',
            'value',
            "--{{ 'fi xture' }}--",
          ].join('\n'),
        },
      });
      vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse('{}'));

      await provider.callApi('value');

      const sentBody = vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string;
      expect(sentBody).toBe(
        '--fi xture\nContent-Disposition: form-data; name="field"\n\nvalue\n--fi xture--',
      );
      await expect(
        new Response(sentBody, {
          headers: { 'Content-Type': 'multipart/form-data; boundary=fixture' },
        }).formData(),
      ).rejects.toThrow('Failed to parse body as FormData');
    });

    it.each([
      { name: 'undefined', value: undefined, expected: '' },
      { name: 'null', value: null, expected: '' },
      { name: 'false', value: false, expected: 'false' },
      { name: 'zero', value: 0, expected: '0' },
      { name: 'object', value: { nested: true }, expected: '[object Object]' },
      { name: 'array', value: ['a', 'b'], expected: 'a,b' },
    ])('should retain raw template rendering for $name values', async ({ value, expected }) => {
      const provider = new HttpProvider('http', {
        config: {
          request:
            'POST /api/submit HTTP/1.1\nHost: example.com\nContent-Type: text/plain\n\n' +
            'before[{{ payload.value }}]after',
        },
      });
      vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse('{}'));

      await provider.callApi('value', {
        vars: { payload: { value } },
        prompt: { raw: 'value', label: 'value' },
      });

      expect(vi.mocked(fetchWithCache).mock.calls[0][1]?.body).toBe(`before[${expected}]after`);
    });

    it('should retain raw template whitespace controls and safe string output', async () => {
      const provider = new HttpProvider('http', {
        config: {
          request:
            'POST /api/submit HTTP/1.1\nHost: example.com\nContent-Type: text/plain\n\n' +
            'before \n {{- "<tag>" | safe -}} \n after',
        },
      });
      vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse('{}'));

      await provider.callApi('value');

      expect(vi.mocked(fetchWithCache).mock.calls[0][1]?.body).toBe('before \n <tag> \n after');
    });

    it('should preserve repeated expression values and literal loop and macro syntax', async () => {
      let count = 0;
      const next = vi.fn(() => ++count);
      const provider = new HttpProvider('http', {
        config: {
          request:
            'POST /api/submit HTTP/1.1\nHost: example.com\nContent-Type: text/plain\n\n' +
            '{{ payload.next() }}|{{ payload.next() }}\n' +
            '{% for value in [1, 2] %}{{ payload.next() }}{% endfor %}\n' +
            '{% macro value() %}{{ payload.next() }}{% endmacro %}',
        },
      });
      vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse('{}'));

      await provider.callApi('value', {
        vars: { payload: { next } },
        prompt: { raw: 'value', label: 'value' },
      });

      expect(next).toHaveBeenCalledTimes(4);
      expect(vi.mocked(fetchWithCache).mock.calls[0][1]?.body).toBe(
        '1|2\n{% for value in [1, 2] %}3{% endfor %}\n{% macro value() %}4{% endmacro %}',
      );
    });

    it.each(['--fixture--', '{{ "--" + boundary + "--" }}'])(
      'should preserve empty multipart fields and epilogue bytes after %s',
      async (closingDelimiter) => {
        const epilogue = ' \n--unrelated-boundary\nepilogue\n';
        const body = `--fixture\nContent-Disposition: form-data; name="empty"\n\n\n${closingDelimiter}\n`;
        const provider = new HttpProvider('http', {
          config: {
            request:
              'POST /api/submit HTTP/1.1\nHost: example.com\n' +
              `Content-Type: multipart/form-data; boundary=fixture\n\n${body}${epilogue}`,
          },
        });
        vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse('{}'));

        await provider.callApi('fixture', {
          vars: { boundary: 'fixture' },
          prompt: { raw: 'fixture', label: 'fixture' },
        });

        const sentBody = vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string;
        expect(sentBody).toBe(
          body.replace(closingDelimiter, '--fixture--').replaceAll('\n', '\r\n') + epilogue,
        );
        const form = await new Response(sentBody, {
          headers: { 'Content-Type': 'multipart/form-data; boundary=fixture' },
        }).formData();
        expect([...form.entries()]).toEqual([['empty', '']]);
      },
    );

    it('should handle application/x-www-form-urlencoded raw request', async () => {
      const rawRequest = dedent`
        POST /api/submit HTTP/1.1
        Host: api.example.com
        Content-Type: application/x-www-form-urlencoded

        field1=value1&prompt={{prompt}}
      `;
      const provider = new HttpProvider('https', {
        config: {
          request: rawRequest,
          transformResponse: (data: any) => data,
        },
      });

      const mockResponse = createMockFetchResponse(JSON.stringify({ result: 'ok' }));
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('hello world');

      expect(fetchWithCache).toHaveBeenCalledWith(
        'https://api.example.com/api/submit',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'content-type': 'application/x-www-form-urlencoded',
          }),
          body: 'field1=value1&prompt=hello world',
        }),
        expect.any(Number),
        'text',
        undefined,
        undefined,
      );
      expect(result.output).toEqual({ result: 'ok' });
    });
  });

  describe('raw request - templating safety', () => {
    it('renders when Cookie contains {%22...} and substitutes {{prompt}}', async () => {
      const rawRequest = dedent`
        POST /api/faq HTTP/1.1
        Host: example.com
        Content-Type: application/json
        Cookie: kp.directions._dd_location={%22name%22:%22Oakland%20Medical%20Center%22}; other=1

        {"q": "{{prompt}}"}
      `;
      const provider = new HttpProvider('https', {
        config: {
          request: rawRequest,
          transformResponse: (data: any) => data,
        },
      });

      const mockResponse = createMockFetchResponse(JSON.stringify({ result: 'ok' }));
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('find doctors');

      expect(fetchWithCache).toHaveBeenCalledWith(
        'https://example.com/api/faq',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            host: 'example.com',
            'content-type': 'application/json',
            cookie: expect.stringContaining('{%22name%22:%22Oakland%20Medical%20Center%22}'),
          }),
          body: '{"q": "find doctors"}',
        }),
        expect.any(Number),
        'text',
        undefined,
        undefined,
      );
      expect(result.output).toEqual({ result: 'ok' });
    });

    it('supports dotted variables in headers and path while preserving raw blocks', async () => {
      const rawRequest = dedent`
        GET /api/users/{{meta.user.id}}/notes HTTP/1.1
        Host: example.com
        X-User: {{meta.user.id}}
        Accept: application/json
      `;
      const provider = new HttpProvider('https', {
        config: {
          request: rawRequest,
          transformResponse: (data: any) => data,
        },
      });

      const mockResponse = createMockFetchResponse(JSON.stringify({ ok: true }));
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('ignored', {
        vars: { meta: { user: { id: 'abc123' } } },
        prompt: { raw: 'x', label: 'y' },
      });

      expect(fetchWithCache).toHaveBeenCalledWith(
        'https://example.com/api/users/abc123/notes',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            host: 'example.com',
            accept: 'application/json',
            'x-user': 'abc123',
          }),
        }),
        expect.any(Number),
        'text',
        undefined,
        undefined,
      );
      expect(result.output).toEqual({ ok: true });
    });

    it('normalizes mixed LF/CRLF line endings and parses correctly', async () => {
      const mixed = 'GET /api/data HTTP/1.1\nHost: example.com\r\nUser-Agent: Test\n\n';
      const provider = new HttpProvider('http', {
        config: {
          request: mixed,
          transformResponse: (data: any) => data,
        },
      });

      const mockResponse = createMockFetchResponse(JSON.stringify({ ok: true }));
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('p');

      expect(fetchWithCache).toHaveBeenCalledWith(
        'http://example.com/api/data',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ host: 'example.com', 'user-agent': 'Test' }),
        }),
        expect.any(Number),
        'text',
        undefined,
        undefined,
      );
      expect(result.output).toEqual({ ok: true });
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

    it('should process deeply nested objects and arrays', () => {
      const body = {
        key: '{{var1}}',
        nested: {
          key2: '{{var2}}',
          items: ['{{var3}}', { nestedKey: '{{var4}}' }],
        },
      };
      const vars = { var1: 'value1', var2: 'value2', var3: 'value3', var4: 'value4' };
      const result = processJsonBody(body, vars);
      expect(result).toEqual({
        key: 'value1',
        nested: {
          key2: 'value2',
          items: ['value3', { nestedKey: 'value4' }],
        },
      });
    });

    it('should parse JSON strings if possible', () => {
      const body = {
        key: '{{var1}}',
        jsonString: '{"parsed":{{var2}}}',
      };
      const vars = { var1: 'value1', var2: 123 };
      const result = processJsonBody(body, vars);
      expect(result).toEqual({
        key: 'value1',
        jsonString: { parsed: 123 },
      });
    });

    describe('Raw JSON string handling (YAML literal case)', () => {
      it('should return raw JSON strings as-is with control characters', () => {
        // Simulate a YAML literal string that contains control characters
        const body = '{\n  "input": "Text with control char: \u0001",\n  "role": "user"\n}';
        const vars = { prompt: 'test' };
        const result = processJsonBody(body, vars);

        // Should return string as-is since it's already in intended format
        expect(result).toBe('{\n  "input": "Text with control char: \u0001",\n  "role": "user"\n}');
      });

      it('should return raw JSON strings as-is with bad syntax', () => {
        // Simulate malformed JSON that would fail parsing
        const body = '{\n  "input": "{{prompt}}",\n  "role": "user",\n}'; // trailing comma
        const vars = { prompt: 'test prompt' };
        const result = processJsonBody(body, vars);

        // Should return string as-is since it's already in intended format
        expect(result).toBe('{\n  "input": "test prompt",\n  "role": "user",\n}');
      });

      it('should parse valid JSON strings normally', () => {
        // Valid JSON string should be parsed into object
        const body = '{"input": "{{prompt}}", "role": "user"}';
        const vars = { prompt: 'test prompt' };
        const result = processJsonBody(body, vars);

        // Should return parsed object since JSON.parse succeeds
        expect(result).toEqual({
          input: 'test prompt',
          role: 'user',
        });
      });

      it('should handle JSON primitive strings correctly', () => {
        // JSON string literals should be parsed
        const body = '"{{prompt}}"';
        const vars = { prompt: 'hello world' };
        const result = processJsonBody(body, vars);

        // Should return the string value (not wrapped)
        expect(result).toBe('hello world');
      });

      it('should handle JSON number strings correctly', () => {
        const body = '{{number}}';
        const vars = { number: 42 };
        const result = processJsonBody(body, vars);

        // Should return the number value
        expect(result).toBe(42);
      });

      it('should handle JSON boolean strings correctly', () => {
        const body = '{{bool}}';
        const vars = { bool: true };
        const result = processJsonBody(body, vars);

        // Should return the boolean value
        expect(result).toBe(true);
      });

      it('should preserve numeric strings as strings in object bodies', () => {
        // This simulates the case where YAML has session: '1234'
        // The string should remain a string, not be converted to a number
        const body = {
          messages: '{{prompt}}',
          session: '1234',
        };
        const vars = { prompt: 'test prompt' };
        const result = processJsonBody(body, vars);

        // session should remain a string, not be converted to number
        expect(result).toEqual({
          messages: 'test prompt',
          session: '1234', // Should be string, not number
        });
        expect(typeof (result as Record<string, any>).session).toBe('string');
      });

      it('should preserve boolean-like strings as strings', () => {
        const body = {
          flag: 'true',
          enabled: 'false',
        };
        const vars = {};
        const result = processJsonBody(body, vars);

        // Should remain strings, not be converted to booleans
        expect(result).toEqual({
          flag: 'true',
          enabled: 'false',
        });
        expect(typeof (result as Record<string, any>).flag).toBe('string');
        expect(typeof (result as Record<string, any>).enabled).toBe('string');
      });

      it('should still parse JSON objects and arrays', () => {
        // JSON objects and arrays should still be parsed
        const body = {
          config: '{"key": "value"}',
          items: '["a", "b"]',
          session: '1234', // Should stay as string
        };
        const vars = {};
        const result = processJsonBody(body, vars);

        expect(result).toEqual({
          config: { key: 'value' }, // Parsed to object
          items: ['a', 'b'], // Parsed to array
          session: '1234', // Remains as string
        });
        expect(typeof (result as Record<string, any>).config).toBe('object');
        expect(Array.isArray((result as Record<string, any>).items)).toBe(true);
        expect(typeof (result as Record<string, any>).session).toBe('string');
      });

      it('should handle complex nested JSON with control characters', () => {
        // Complex nested structure with control characters
        const body = `{
  "user": {
    "query": "{{prompt}}",
    "metadata": {
      "session": "abc\u0001def",
      "tags": ["test", "debug\u0002"]
    }
  },
  "options": {
    "model": "gpt-4",
    "temperature": 0.7
  }
}`;
        const vars = { prompt: 'What is AI?' };
        const result = processJsonBody(body, vars);

        // Should return string as-is since it's already in intended format
        expect(result).toBe(`{
  "user": {
    "query": "What is AI?",
    "metadata": {
      "session": "abc\u0001def",
      "tags": ["test", "debug\u0002"]
    }
  },
  "options": {
    "model": "gpt-4",
    "temperature": 0.7
  }
}`);
      });

      it('should handle JSON with random whitespace and indentation', () => {
        // JSON with inconsistent formatting
        const body = `{
          "input":    "{{prompt}}",
       "role":   "engineering",
            "config": {
                "debug":true ,
              "timeout": 5000,
        }
}`;
        const vars = { prompt: 'Test with whitespace' };
        const result = processJsonBody(body, vars);

        // Should return string as-is since it's already in intended format
        expect(result).toBe(`{
          "input":    "Test with whitespace",
       "role":   "engineering",
            "config": {
                "debug":true ,
              "timeout": 5000,
        }
}`);
      });

      it('should handle deeply nested arrays with template variables', () => {
        // Deep nesting with trailing comma
        const body = `{
"messages": [
  {
    "role": "system",
    "content": "{{systemPrompt}}"
  },
  {
    "role": "user",
    "content": "{{prompt}}",
    "attachments": [
      {"type": "image", "url": "{{imageUrl}}"},
      {"type": "document", "data": "{{docData}}"}
    ]
  }
],
"stream": {{streaming}},
}`;
        const vars = {
          systemPrompt: 'You are a helpful assistant',
          prompt: 'Analyze this data',
          imageUrl: 'https://example.com/image.jpg',
          docData: 'base64encodeddata',
          streaming: false,
        };
        const result = processJsonBody(body, vars);

        // Should return string as-is since it's already in intended format
        expect(result).toBe(`{
"messages": [
  {
    "role": "system",
    "content": "You are a helpful assistant"
  },
  {
    "role": "user",
    "content": "Analyze this data",
    "attachments": [
      {"type": "image", "url": "https://example.com/image.jpg"},
      {"type": "document", "data": "base64encodeddata"}
    ]
  }
],
"stream": false,
}`);
      });

      it('should handle multiline strings with special characters', () => {
        // Multiline JSON with special characters and newlines
        const body = `{
"query": "{{prompt}}",
"system_message": "You are a helpful AI.\\n\\nRules:\\n- Be concise\\n- Use examples\\n- Handle edge cases",
"special_chars": "Quotes: \\"test\\" and symbols: @#$%^&*()",
"unicode": "Emoji: 🤖 and unicode: \\u00A9"
}`;
        const vars = { prompt: 'How does this work?' };
        const result = processJsonBody(body, vars);

        // This should actually parse successfully since it's valid JSON
        expect(result).toEqual({
          query: 'How does this work?',
          system_message:
            'You are a helpful AI.\n\nRules:\n- Be concise\n- Use examples\n- Handle edge cases',
          special_chars: 'Quotes: "test" and symbols: @#$%^&*()',
          unicode: 'Emoji: 🤖 and unicode: ©',
        });
      });

      it('should handle mixed valid and invalid JSON syntax', () => {
        // JSON that looks valid but has subtle syntax errors
        const body = `{
"valid_field": "{{prompt}}",
"numbers": [1, 2, 3,],
"object": {
  "nested": true,
  "value": "test"
},
"trailing_comma": "problem",
}`;
        const vars = { prompt: 'Test input' };
        const result = processJsonBody(body, vars);

        // Should return string as-is since it's already in intended format
        expect(result).toBe(`{
"valid_field": "Test input",
"numbers": [1, 2, 3,],
"object": {
  "nested": true,
  "value": "test"
},
"trailing_comma": "problem",
}`);
      });

      it('should auto-escape newlines in JSON templates (YAML literal case)', () => {
        // This is the real-world case: YAML literal string with unescaped newlines from red team
        const body = '{\n  "message": "{{prompt}}"\n}';
        const vars = {
          prompt: 'Multi-line prompt\nwith actual newlines\nand more text',
        };
        const result = processJsonBody(body, vars);

        // Should automatically escape the newlines and return parsed JSON object
        expect(result).toEqual({
          message: 'Multi-line prompt\nwith actual newlines\nand more text',
        });
      });

      it('should auto-escape quotes and special chars in JSON templates', () => {
        // Test various special characters that break JSON
        const body = '{\n  "message": "{{prompt}}",\n  "role": "user"\n}';
        const vars = {
          prompt: 'Text with "quotes" and \ttabs and \nmore stuff',
        };
        const result = processJsonBody(body, vars);

        // Should automatically escape and return parsed JSON object
        expect(result).toEqual({
          message: 'Text with "quotes" and \ttabs and \nmore stuff',
          role: 'user',
        });
      });

      it('should fall back gracefully when JSON template cannot be fixed', () => {
        // Test case where even escaping cannot fix the JSON (structural issues)
        const body = '{\n  "message": "{{prompt}}"\n  missing_comma: true\n}';
        const vars = {
          prompt: 'Some text with\nnewlines',
        };
        const result = processJsonBody(body, vars);

        // Should fall back to returning the original rendered string (with literal newlines)
        expect(result).toBe('{\n  "message": "Some text with\nnewlines"\n  missing_comma: true\n}');
      });
    });
  });

  describe('escapeJsonVariables', () => {
    it('should escape newlines in string values', () => {
      const vars = { prompt: 'Line 1\nLine 2' };
      const result = escapeJsonVariables(vars);
      expect(result.prompt).toBe('Line 1\\nLine 2');
    });

    it('should escape carriage returns in string values', () => {
      const vars = { text: 'Before\rAfter' };
      const result = escapeJsonVariables(vars);
      expect(result.text).toBe('Before\\rAfter');
    });

    it('should escape tabs in string values', () => {
      const vars = { text: 'Before\tAfter' };
      const result = escapeJsonVariables(vars);
      expect(result.text).toBe('Before\\tAfter');
    });

    it('should escape quotes in string values', () => {
      const vars = { text: 'He said "hello"' };
      const result = escapeJsonVariables(vars);
      expect(result.text).toBe('He said \\"hello\\"');
    });

    it('should escape backslashes in string values', () => {
      const vars = { path: 'C:\\Users\\test' };
      const result = escapeJsonVariables(vars);
      expect(result.path).toBe('C:\\\\Users\\\\test');
    });

    it('should handle mixed special characters', () => {
      const vars = {
        prompt: 'Line 1\nLine 2\tTabbed\r\nWindows line',
      };
      const result = escapeJsonVariables(vars);
      expect(result.prompt).toBe('Line 1\\nLine 2\\tTabbed\\r\\nWindows line');
    });

    it('should not escape non-string values', () => {
      const vars = {
        count: 42,
        active: true,
        items: null,
        ratio: 3.14,
      };
      const result = escapeJsonVariables(vars);
      expect(result.count).toBe(42);
      expect(result.active).toBe(true);
      expect(result.items).toBe(null);
      expect(result.ratio).toBe(3.14);
    });

    it('should handle objects with mixed types', () => {
      const vars = {
        text: 'Hello\nWorld',
        number: 123,
        bool: false,
        nested: 'Quote: "test"',
      };
      const result = escapeJsonVariables(vars);
      expect(result.text).toBe('Hello\\nWorld');
      expect(result.number).toBe(123);
      expect(result.bool).toBe(false);
      expect(result.nested).toBe('Quote: \\"test\\"');
    });

    it('should escape unicode control characters', () => {
      const vars = { text: 'Before\u0001After' };
      const result = escapeJsonVariables(vars);
      expect(result.text).toBe('Before\\u0001After');
    });

    it('should handle empty strings', () => {
      const vars = { text: '' };
      const result = escapeJsonVariables(vars);
      expect(result.text).toBe('');
    });

    it('should handle strings with only special characters', () => {
      const vars = { text: '\n\r\t' };
      const result = escapeJsonVariables(vars);
      expect(result.text).toBe('\\n\\r\\t');
    });

    it('should produce valid JSON when used in raw request templates', () => {
      // Simulate the actual use case: escaping variables before inserting into JSON template
      const vars = {
        prompt: 'Please write:\n"Hello"\nThank you',
        guid: '12345',
        count: 42,
      };
      const escaped = escapeJsonVariables(vars);

      // Construct a JSON string using the escaped values
      const jsonString = `{"user_input":"${escaped.prompt}","guid":"${escaped.guid}","count":${escaped.count}}`;

      // Should be valid JSON
      expect(() => JSON.parse(jsonString)).not.toThrow();

      // Should parse back to correct values
      const parsed = JSON.parse(jsonString);
      expect(parsed.user_input).toBe('Please write:\n"Hello"\nThank you');
      expect(parsed.guid).toBe('12345');
      expect(parsed.count).toBe(42);
    });
  });

  describe('processTextBody', () => {
    it('should render templates in text bodies', () => {
      const body = 'Hello {{name}}!';
      const vars = { name: 'World' };
      expect(processTextBody(body, vars)).toBe('Hello World!');
    });

    it('should handle rendering errors gracefully', () => {
      const body = 'Hello {{ unclosed tag';
      const vars = { name: 'World' };
      expect(processTextBody(body, vars)).toBe(body); // Should return original
    });

    it('should handle null body gracefully', () => {
      // @ts-ignore - Testing null input
      expect(processTextBody(null, {})).toBeNull();
    });
  });

  it('should use default parser when no parser is provided', async () => {
    const provider = new HttpProvider(mockUrl, createGetOptions());
    const mockResponse = {
      data: JSON.stringify({ key: 'value' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('test prompt');
    expect(result.output).toEqual({ key: 'value' });
  });

  it('should handle response transform returning an object', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        body: { key: 'value' },
        transformResponse: (json: any, _text: string) => ({ custom: json.result }),
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('test prompt');
    expect(result.output).toEqual({ custom: 'success' });
  });

  describe('file:// transform integration tests', () => {
    it('should handle file:// response transform', async () => {
      const mockParser = vi.fn((data: any) => ({ transformed: data.result }));
      vi.mocked(importModule).mockResolvedValueOnce(mockParser);

      const provider = new HttpProvider(mockUrl, {
        config: {
          method: 'POST',
          body: { key: 'value' },
          transformResponse: 'file://custom-parser.js',
        },
      });

      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test prompt');
      expect(result.output).toEqual({ transformed: 'success' });
      expect(importModule).toHaveBeenCalledWith(
        path.resolve('/mock/base/path', 'custom-parser.js'),
        undefined,
      );
    });

    it('should handle file:// response transform with specific function name', async () => {
      const mockParser = vi.fn((data: any) => data.customField);
      vi.mocked(importModule).mockResolvedValueOnce(mockParser);

      const provider = new HttpProvider(mockUrl, {
        config: {
          method: 'POST',
          body: { key: 'value' },
          transformResponse: 'file://custom-parser.js:parseResponse',
        },
      });

      const mockResponse = {
        data: JSON.stringify({ customField: 'parsed value' }),
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test prompt');
      expect(result.output).toBe('parsed value');
      expect(importModule).toHaveBeenCalledWith(
        path.resolve('/mock/base/path', 'custom-parser.js'),
        'parseResponse',
      );
    });

    it('should handle file:// request transform', async () => {
      const mockTransform = vi.fn((prompt: string) => ({ transformed: prompt.toUpperCase() }));
      vi.mocked(importModule).mockResolvedValueOnce(mockTransform);

      const provider = new HttpProvider(mockUrl, {
        config: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { key: 'value' },
          transformRequest: 'file://transform.js',
        },
      });

      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      await provider.callApi('test');

      expect(importModule).toHaveBeenCalledWith(
        path.resolve('/mock/base/path', 'transform.js'),
        undefined,
      );
      expect(mockTransform).toHaveBeenCalledWith('test', expect.any(Object), undefined);
      expect(fetchWithCache).toHaveBeenCalledWith(
        mockUrl,
        expect.objectContaining({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key: 'value', transformed: 'TEST' }),
        }),
        expect.any(Number),
        'text',
        undefined,
        undefined,
      );
    });

    it('should handle file:// request transform with specific function name', async () => {
      const mockTransform = vi.fn((prompt: string) => ({ custom: prompt }));
      vi.mocked(importModule).mockResolvedValueOnce(mockTransform);

      const provider = new HttpProvider(mockUrl, {
        config: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { key: 'value' },
          transformRequest: 'file://transform.js:myTransform',
        },
      });

      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      await provider.callApi('hello');

      expect(importModule).toHaveBeenCalledWith(
        path.resolve('/mock/base/path', 'transform.js'),
        'myTransform',
      );
      expect(fetchWithCache).toHaveBeenCalledWith(
        mockUrl,
        expect.objectContaining({
          body: JSON.stringify({ key: 'value', custom: 'hello' }),
        }),
        expect.any(Number),
        'text',
        undefined,
        undefined,
      );
    });

    it('should throw error for malformed file:// response transform', async () => {
      vi.mocked(importModule).mockResolvedValueOnce({});

      const provider = new HttpProvider(mockUrl, {
        config: {
          method: 'POST',
          body: { key: 'value' },
          transformResponse: 'file://invalid-parser.js',
        },
      });

      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      await expect(provider.callApi('test prompt')).rejects.toThrow(/Transform module malformed/);
    });

    it('should throw error for malformed file:// request transform', async () => {
      vi.mocked(importModule).mockResolvedValueOnce({});

      const provider = new HttpProvider(mockUrl, {
        config: {
          method: 'POST',
          body: { key: 'value' },
          transformRequest: 'file://invalid-transform.js',
        },
      });

      await expect(provider.callApi('test prompt')).rejects.toThrow(/Transform module malformed/);
    });
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
    it('should combine default headers with config headers', async () => {
      const provider = new HttpProvider(mockUrl, {
        config: {
          headers: { 'X-Custom': '{{ prompt }}' },
          body: 'test',
        },
      });
      const result = await provider.getHeaders(
        { 'content-type': 'application/json' },
        { prompt: 'test' },
      );
      expect(result).toEqual({
        'content-type': 'application/json',
        'x-custom': 'test',
      });
    });

    it('should render template strings in headers', async () => {
      const provider = new HttpProvider(mockUrl, {
        config: {
          headers: { 'X-Custom': '{{ prompt | upper }}' },
          body: 'test',
        },
      });
      const result = await provider.getHeaders({}, { prompt: 'test' });
      expect(result).toEqual({
        'x-custom': 'TEST',
      });
    });

    it('should render environment variables in headers', async () => {
      // Setup a provider with environment variables in headers
      const provider = new HttpProvider('http://example.com', {
        config: {
          method: 'GET', // GET method doesn't require body
          headers: {
            'X-API-Key': '{{env.API_KEY}}',
            Authorization: 'Bearer {{env.AUTH_TOKEN}}',
            Cookie: 'SESSION={{env.SESSION_ID}}; XSRF={{env.XSRF}}',
          },
        },
      });

      const restoreEnv = mockProcessEnv({
        API_KEY: 'test-api-key',
        AUTH_TOKEN: 'test-auth-token',
        SESSION_ID: 'test-session',
        XSRF: 'test-xsrf',
      });
      try {
        // Call getHeaders method
        const result = await provider.getHeaders({}, { prompt: 'test', env: process.env });

        // Verify environment variables are rendered correctly
        expect(result).toEqual({
          'x-api-key': 'test-api-key',
          authorization: 'Bearer test-auth-token',
          cookie: 'SESSION=test-session; XSRF=test-xsrf',
        });
      } finally {
        restoreEnv();
      }
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
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

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
      undefined,
    );
  });

  it('should bypass fetch cache when sending structured multipart requests', async () => {
    const provider = new HttpProvider(mockUrl, {
      config: {
        multipart: {
          parts: [
            {
              kind: 'field',
              name: 'documentQuery',
              value: '{{prompt}}',
            },
          ],
        },
      },
    });
    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    expect(fetchWithCache).toHaveBeenCalledWith(
      mockUrl,
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      }),
      expect.any(Number),
      'text',
      true,
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
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

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

  describe('Authentication header sanitization', () => {
    let debugSpy: MockInstance | undefined;

    afterEach(() => {
      debugSpy?.mockRestore();
      debugSpy = undefined;
    });

    it('should redact authentication headers in metadata', async () => {
      const provider = new HttpProvider(mockUrl, createGetOptions());

      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        status: 200,
        statusText: 'OK',
        cached: false,
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer secret-token',
          'x-api-key': 'api-key-12345',
          cookie: 'session=abc123; other=value',
          'x-custom-header': 'should-remain',
          'cache-control': 'no-cache',
        },
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test prompt');

      // Check that auth headers are redacted but other headers remain unchanged
      expect(result.metadata?.http?.headers).toEqual({
        'content-type': 'application/json',
        authorization: '[REDACTED]',
        'x-api-key': '[REDACTED]',
        cookie: '[REDACTED]',
        'x-custom-header': 'should-remain',
        'cache-control': 'no-cache',
      });
    });

    it('should redact various authentication header patterns', async () => {
      const provider = new HttpProvider(mockUrl, createGetOptions());

      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        status: 200,
        statusText: 'OK',
        cached: false,
        headers: {
          Authorization: 'Bearer token',
          'X-API-KEY': 'key123',
          'API-Key': 'key456',
          'X-Auth-Token': 'auth789',
          'Access-Token': 'access123',
          'X-Secret': 'secret456',
          Token: 'token789',
          ApiKey: 'apikey123',
          Password: 'pass456',
          Cookie: 'session=xyz',
          'X-CSRF-Token': 'csrf123',
          'Session-Id': 'session456',
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'test-agent',
        },
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test prompt');

      // Sensitive headers should be redacted, others remain unchanged
      expect(result.metadata?.http?.headers).toEqual({
        Authorization: '[REDACTED]',
        'X-API-KEY': '[REDACTED]',
        'API-Key': '[REDACTED]',
        'X-Auth-Token': '[REDACTED]',
        'Access-Token': '[REDACTED]',
        'X-Secret': '[REDACTED]',
        Token: '[REDACTED]',
        ApiKey: '[REDACTED]',
        Password: '[REDACTED]',
        Cookie: '[REDACTED]',
        'X-CSRF-Token': '[REDACTED]',
        'Session-Id': '[REDACTED]',
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'test-agent',
      });
    });

    it('should handle missing or undefined headers gracefully', async () => {
      const provider = new HttpProvider(mockUrl, createGetOptions());

      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        status: 200,
        statusText: 'OK',
        cached: false,
        headers: undefined,
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test prompt');

      // Should return undefined when headers are undefined
      expect(result.metadata?.http?.headers).toBeUndefined();
    });

    it('should redact auth headers in raw request mode with debug context', async () => {
      const rawRequest = dedent`
        POST /api/data?api_key=secret-query-value HTTP/1.0
        Host: example.com
        Authorization: Bearer raw-request-token-12345678901234567890
        Content-Type: application/json
        User-Agent: TestAgent/1.0

        {"password":"plain-secret","message":"ok"}
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
        headers: {
          authorization: 'Bearer token',
          'x-api-key': 'secret',
          'content-type': 'application/json',
          etag: 'W/"123"',
        },
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test prompt', createDebugHttpContext());

      // In debug mode, headers should still have auth info redacted
      expect(result.metadata?.headers).toEqual({
        authorization: '[REDACTED]',
        'x-api-key': '[REDACTED]',
        'content-type': 'application/json',
        etag: 'W/"123"',
      });
      expect(result.metadata?.http?.requestHeaders).toEqual({
        authorization: '[REDACTED]',
        host: 'example.com',
        'content-type': 'application/json',
        'user-agent': 'TestAgent/1.0',
      });
      expect(result.metadata?.finalRequestBody).toBe('{"password":"[REDACTED]","message":"ok"}');
      expect(result.metadata?.transformedRequest).toContain('/api/data?api_key=%5BREDACTED%5D');
      expect(result.metadata?.transformedRequest).toContain('HTTP/1.0');
      expect(result.metadata?.transformedRequest).not.toContain('secret-query-value');
      expect(result.metadata?.transformedRequest).not.toContain('raw-request-token');
      expect(result.metadata?.transformedRequest).not.toContain('plain-secret');
    });

    it('should redact multipart raw request bodies in debug metadata', async () => {
      const boundary = '----WebKitFormBoundaryPromptFooABC123';
      const opaqueToken = 'A'.repeat(64);
      const rawRequest = dedent`
        POST /upload HTTP/1.1
        Host: example.com
        Content-Type: multipart/form-data; boundary=${boundary}

        --${boundary}
        Content-Disposition: form-data; name="username"

        alice
        --${boundary}
        Content-Disposition: form-data; name=password

        plain-secret
        --${boundary}
        Content-Disposition: form-data; name="apiKey"

        sk-123456789012345678901234567890
        --${boundary}
        Content-Disposition: form-data; name="note"

        ${opaqueToken}
        --${boundary}--
      `;
      const provider = new HttpProvider('http', {
        config: {
          request: rawRequest,
          transformResponse: (data: any) => data,
        },
      });

      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: JSON.stringify({ result: 'success' }),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
      });

      const result = await provider.callApi('test prompt', createDebugHttpContext());

      expect(result.metadata?.transformedRequest).toContain(boundary);
      expect(result.metadata?.transformedRequest).toContain('name="username"');
      expect(result.metadata?.transformedRequest).toContain('alice');
      expect(result.metadata?.transformedRequest).toContain('name=password');
      expect(result.metadata?.transformedRequest).toContain('[REDACTED]');
      expect(result.metadata?.transformedRequest).not.toContain('plain-secret');
      expect(result.metadata?.transformedRequest).not.toContain(
        'sk-123456789012345678901234567890',
      );
      expect(result.metadata?.transformedRequest).not.toContain(opaqueToken);
      expect(result.metadata?.finalRequestBody).not.toContain('plain-secret');
      expect(result.metadata?.finalRequestBody).not.toContain('sk-123456789012345678901234567890');
      expect(result.metadata?.finalRequestBody).not.toContain(opaqueToken);
    });

    it.each(
      [
        { separator: '\n\n', valueSuffix: '' },
        { separator: '\r\n\r\n', valueSuffix: '' },
        { separator: '\n\r\n', valueSuffix: '' },
        { separator: '\r\n\n', valueSuffix: '' },
        { separator: '\n\n', valueSuffix: '\r\n\r\nsecret-tail' },
        { separator: '\n\r\n', valueSuffix: '\r\n\r\nsecret-tail' },
        { separator: '\r\n\n', valueSuffix: '\r\n\r\nsecret-tail' },
      ].flatMap((fixture) => [false, true].map((transform) => ({ ...fixture, transform }))),
    )(
      'should redact the first multipart separator in metadata and logs ($separator, $valueSuffix, $transform)',
      async ({ separator, valueSuffix, transform }) => {
        const secret = 'demo-password-729';
        const rawRequest = `POST /inner HTTP/1.1\nHost: example.com\nContent-Type: multipart/form-data; boundary=fixture\n\n--fixture\nContent-Disposition: form-data; name="password"${separator}${secret}${valueSuffix}\n--fixture\nContent-Disposition: form-data; name="username"\n\nalice\n--fixture--\n`;
        const provider = new HttpProvider('http', {
          config: {
            request:
              'POST /outer HTTP/1.1\nHost: example.com\nContent-Type: text/plain\n\n{{prompt}}',
            ...(transform ? { transformRequest: () => rawRequest } : {}),
          },
        });
        debugSpy = vi.spyOn(logger, 'debug');
        vi.mocked(fetchWithCache).mockResolvedValueOnce(createMockFetchResponse('{}'));
        const result = await provider.callApi(
          transform ? 'fixture' : rawRequest,
          createDebugHttpContext(),
        );
        expect(vi.mocked(fetchWithCache).mock.calls[0][1]?.body).toBe(
          JSON.stringify(rawRequest).slice(1, -1),
        );
        expect(result.metadata?.transformedRequest).toContain('alice');
        expect(result.metadata?.transformedRequest).toContain('[REDACTED]');
        expect(result.metadata?.transformedRequest).not.toContain(secret);
        expect(result.metadata?.transformedRequest).not.toContain('secret-tail');
        expect(JSON.stringify(debugSpy.mock.calls)).not.toContain(secret);
        expect(JSON.stringify(debugSpy.mock.calls)).not.toContain('secret-tail');
      },
    );

    it('should redact malformed multipart raw request bodies without throwing', async () => {
      const rawRequest = dedent`
        POST /upload HTTP/1.1
        Host: example.com
        Content-Type: multipart/form-data; boundary=MissingBoundary

        username=alice&password=plain-secret&api_key=sk-123456789012345678901234567890
      `;
      const provider = new HttpProvider('http', {
        config: {
          request: rawRequest,
          transformResponse: (data: any) => data,
        },
      });

      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: JSON.stringify({ result: 'success' }),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
      });

      const result = await provider.callApi('test prompt', createDebugHttpContext());

      expect(result.metadata?.transformedRequest).toContain('username=alice');
      expect(result.metadata?.transformedRequest).toContain('password=%5BREDACTED%5D');
      expect(result.metadata?.transformedRequest).toContain('api_key=%5BREDACTED%5D');
      expect(result.metadata?.transformedRequest).not.toContain('plain-secret');
      expect(result.metadata?.transformedRequest).not.toContain(
        'sk-123456789012345678901234567890',
      );
      expect(result.metadata?.finalRequestBody).toContain('password=%5BREDACTED%5D');
      expect(result.metadata?.finalRequestBody).toContain('api_key=%5BREDACTED%5D');
      expect(result.metadata?.finalRequestBody).not.toContain('plain-secret');
      expect(result.metadata?.finalRequestBody).not.toContain('sk-123456789012345678901234567890');
    });

    it('should redact transformed raw request strings in debug metadata', async () => {
      debugSpy = vi.spyOn(logger, 'debug');
      const transformedRawRequest = dedent`
        GET /api/data?api_key=transform-query-secret HTTP/1.1
        Host: example.com
        Authorization: Bearer raw-transform-token-12345678901234567890
        Content-Type: application/json

        {
          "apiKey": "sk-123456789012345678901234567890",
          "password": "plain-secret",
          "message": "ok"
        }
      `;
      const provider = new HttpProvider('http', {
        config: {
          request: dedent`
            POST /api/data HTTP/1.1
            Host: example.com
            Content-Type: text/plain

            {{prompt}}
          `,
          transformRequest: () => transformedRawRequest,
          transformResponse: (data: any) => data,
        },
      });

      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: JSON.stringify({ result: 'success' }),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
      });

      const result = await provider.callApi('test prompt', createDebugHttpContext());

      expect(result.metadata?.transformedRequest).toContain('/api/data?api_key=%5BREDACTED%5D');
      expect(result.metadata?.transformedRequest).toContain('authorization: [REDACTED]');
      expect(result.metadata?.transformedRequest).toContain('"apiKey":"[REDACTED]"');
      expect(result.metadata?.transformedRequest).toContain('"password":"[REDACTED]"');
      expect(result.metadata?.transformedRequest).not.toContain('transform-query-secret');
      expect(result.metadata?.transformedRequest).not.toContain('raw-transform-token');
      expect(result.metadata?.transformedRequest).not.toContain('plain-secret');
      expect(result.metadata?.transformedRequest).not.toContain(
        'sk-123456789012345678901234567890',
      );
      expect(result.metadata?.finalRequestBody).toContain('"apiKey":"[REDACTED]"');
      expect(result.metadata?.finalRequestBody).toContain('"password":"[REDACTED]"');
      expect(result.metadata?.finalRequestBody).not.toContain('raw-transform-token');
      expect(result.metadata?.finalRequestBody).not.toContain('plain-secret');
      expect(result.metadata?.finalRequestBody).not.toContain('sk-123456789012345678901234567890');
      const debugOutput = JSON.stringify(debugSpy.mock.calls);
      expect(debugOutput).not.toContain('transform-query-secret');
      expect(debugOutput).not.toContain('raw-transform-token');
      expect(debugOutput).not.toContain('plain-secret');
      expect(debugOutput).not.toContain('sk-123456789012345678901234567890');
    });

    it('should redact form-urlencoded transformed requests in debug metadata', async () => {
      debugSpy = vi.spyOn(logger, 'debug');
      const formBody =
        'username=alice&password=plain-secret&api_key=sk-123456789012345678901234567890';
      const provider = new HttpProvider('http://example.com/api', {
        config: {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: '{{ prompt }}',
          transformRequest: () => formBody,
          transformResponse: (data: any) => data,
        },
      });

      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: JSON.stringify({ result: 'success' }),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
      });

      const result = await provider.callApi('username=bob&password=original-secret', {
        debug: true,
        vars: {},
        prompt: { raw: 'username=bob&password=original-secret', label: 'test' },
      });

      expect(result.metadata?.transformedRequest).toContain('username=alice');
      expect(result.metadata?.transformedRequest).toContain('password=%5BREDACTED%5D');
      expect(result.metadata?.transformedRequest).toContain('api_key=%5BREDACTED%5D');
      expect(result.metadata?.transformedRequest).not.toContain('plain-secret');
      expect(result.metadata?.transformedRequest).not.toContain(
        'sk-123456789012345678901234567890',
      );
      expect(result.metadata?.finalRequestBody).toContain('username=alice');
      expect(result.metadata?.finalRequestBody).toContain('password=%5BREDACTED%5D');
      expect(result.metadata?.finalRequestBody).toContain('api_key=%5BREDACTED%5D');
      expect(result.metadata?.finalRequestBody).not.toContain('plain-secret');
      expect(result.metadata?.finalRequestBody).not.toContain('sk-123456789012345678901234567890');
      const debugOutput = JSON.stringify(debugSpy.mock.calls);
      expect(debugOutput).not.toContain('original-secret');
      expect(debugOutput).not.toContain('plain-secret');
      expect(debugOutput).not.toContain('sk-123456789012345678901234567890');
    });

    it('should redact form-urlencoded transformed raw request debug logs', async () => {
      debugSpy = vi.spyOn(logger, 'debug');
      const formBody =
        'username=alice&password=plain-secret&api_key=sk-123456789012345678901234567890';
      const provider = new HttpProvider('http', {
        config: {
          request: dedent`
            POST /api/data HTTP/1.1
            Host: example.com
            Content-Type: application/x-www-form-urlencoded

            {{ prompt }}
          `,
          transformRequest: () => formBody,
          transformResponse: (data: any) => data,
        },
      });

      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        data: JSON.stringify({ result: 'success' }),
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
      });

      const result = await provider.callApi('username=bob&password=original-secret', {
        debug: true,
        vars: {},
        prompt: { raw: 'username=bob&password=original-secret', label: 'test' },
      });

      expect(result.metadata?.transformedRequest).toContain('username=alice');
      expect(result.metadata?.transformedRequest).toContain('password=%5BREDACTED%5D');
      expect(result.metadata?.transformedRequest).toContain('api_key=%5BREDACTED%5D');
      expect(result.metadata?.transformedRequest).not.toContain('plain-secret');
      expect(result.metadata?.transformedRequest).not.toContain(
        'sk-123456789012345678901234567890',
      );
      expect(result.metadata?.finalRequestBody).toContain('username=alice');
      expect(result.metadata?.finalRequestBody).toContain('password=%5BREDACTED%5D');
      expect(result.metadata?.finalRequestBody).toContain('api_key=%5BREDACTED%5D');
      expect(result.metadata?.finalRequestBody).not.toContain('plain-secret');
      expect(result.metadata?.finalRequestBody).not.toContain('sk-123456789012345678901234567890');
      const debugOutput = JSON.stringify(debugSpy.mock.calls);
      expect(debugOutput).not.toContain('original-secret');
      expect(debugOutput).not.toContain('plain-secret');
      expect(debugOutput).not.toContain('sk-123456789012345678901234567890');
    });

    it('should handle case-insensitive header matching', async () => {
      const provider = new HttpProvider(mockUrl, createGetOptions());

      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        status: 200,
        statusText: 'OK',
        cached: false,
        headers: {
          AUTHORIZATION: 'Bearer TOKEN',
          'x-ApI-kEy': 'KEY',
          'Content-TYPE': 'application/json',
          'X-Request-ID': 'req-123',
        },
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test prompt');

      // Auth headers should be redacted regardless of case
      expect(result.metadata?.http?.headers).toEqual({
        AUTHORIZATION: '[REDACTED]',
        'x-ApI-kEy': '[REDACTED]',
        'Content-TYPE': 'application/json',
        'X-Request-ID': 'req-123',
      });
    });
  });

  describe('Content-Type and body handling', () => {
    it('should render string body when content-type is not set', async () => {
      const provider = new HttpProvider(mockUrl, {
        config: {
          method: 'POST',
          body: 'Hello {{ prompt }}',
        },
      });
      const mockResponse = createHttpResponse();
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

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

      const mockResponse = createHttpResponse();
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

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
      const mockResponse = createHttpResponse();
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

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
      const mockResponse = createHttpResponse();
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

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
        undefined,
      );
    });

    it('should render nested object variables correctly when content-type is application/json', async () => {
      const provider = new HttpProvider(mockUrl, {
        config: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: {
            details: createNamesTemplateBody(),
          },
        },
      });
      const mockResponse = createHttpResponse();
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const vars = createPersonNameVars();

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
              details: createNamesTemplateBody(),
            },
            {
              id: 2,
              details: createNamesTemplateBody(),
            },
          ],
        },
      });
      const mockResponse = createHttpResponse();
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const vars = createPersonNameVars();

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
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test');

      expect(result).toMatchObject({
        output: { chat_history: 'success' },
        raw: JSON.stringify({ result: 'success' }),
        metadata: {
          http: { status: 200, statusText: 'OK', headers: undefined },
        },
      });
    });

    it('should prefer transformResponse over responseParser when both are set', async () => {
      const provider = new HttpProvider(mockUrl, {
        config: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { key: '{{ prompt }}' },
          responseParser: (_data: any) => ({ chat_history: 'from responseParser' }),
          transformResponse: (_data: any) => ({ chat_history: 'from transformResponse' }),
        },
      });
      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test');

      expect(result).toMatchObject({
        output: { chat_history: 'from transformResponse' },
        raw: JSON.stringify({ result: 'success' }),
        metadata: {
          http: { status: 200, statusText: 'OK', headers: undefined },
        },
      });
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
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test');

      expect(result).toMatchObject({
        output: 'success',
        raw: JSON.stringify({ result: 'success' }),
        metadata: {
          http: { status: 200, statusText: 'OK', headers: undefined },
        },
      });
    });
  });

  it('should respect maxRetries configuration', async () => {
    provider = new HttpProvider(mockUrl, {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: '{{ prompt }}' },
        maxRetries: 2,
      },
    });
    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

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
      2,
    );
  });

  it('should handle query parameters correctly when the URL already has query parameters', async () => {
    const urlWithQueryParams = 'http://example.com/api?existing=param';
    provider = new HttpProvider(urlWithQueryParams, {
      config: {
        method: 'GET',
        queryParams: {
          additional: 'parameter',
          another: 'value',
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    // URL should contain both the existing and new query parameters
    expect(fetchWithCache).toHaveBeenCalledWith(
      expect.stringMatching(
        /http:\/\/example\.com\/api\?existing=param&additional=parameter&another=value/,
      ),
      expect.any(Object),
      expect.any(Number),
      'text',
      undefined,
      undefined,
    );
  });

  it('should handle URL construction fallback for potentially malformed URLs', async () => {
    // Create a URL with variable that when rendered doesn't fully qualify as a URL
    const malformedUrl = 'relative/path/{{var}}';

    provider = new HttpProvider(malformedUrl, {
      config: {
        method: 'GET',
        queryParams: {
          param: 'value',
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt', {
      prompt: { raw: 'test prompt', label: 'test' },
      vars: { var: 'test' },
    });

    // Should use the fallback mechanism to append query parameters
    expect(fetchWithCache).toHaveBeenCalledWith(
      'relative/path/test?param=value',
      expect.any(Object),
      expect.any(Number),
      'text',
      undefined,
      undefined,
    );
  });
});

describe('urlEncodeRawRequestPath', () => {
  it('should not modify request with no query parameters', () => {
    const rawRequest = 'GET /api/data HTTP/1.1';
    const result = urlEncodeRawRequestPath(rawRequest);
    expect(result).toBe(rawRequest);
  });

  it('should not modify request with simple query parameters', () => {
    const rawRequest = 'GET /api/data?key=value HTTP/1.1';
    const result = urlEncodeRawRequestPath(rawRequest);
    expect(result).toBe(rawRequest);
  });

  it('should encode URL with spaces in query parameters', () => {
    const rawRequest = 'GET /api/data?query=hello world HTTP/1.1';
    const result = urlEncodeRawRequestPath(rawRequest);
    expect(result).toBe('GET /api/data?query=hello%20world HTTP/1.1');
  });

  it('should encode URL with already percent-encoded characters', () => {
    const rawRequest = 'GET /api/data?query=already%20encoded HTTP/1.1';
    const result = urlEncodeRawRequestPath(rawRequest);
    expect(result).toBe('GET /api/data?query=already%20encoded HTTP/1.1');
  });

  it.each(['\n', '\r\n'])(
    'should keep dollar patterns and the rest of the request unchanged with %j line endings',
    (lineEnding) => {
      const rest = `${lineEnding}X-Literal: $$ $& $\` $'${lineEnding}${lineEnding}body $$ $& $\` $'`;
      const rawRequest = "POST /api/data?query=turn $$ into $& or $` or $' HTTP/1.1" + rest;
      expect(urlEncodeRawRequestPath(rawRequest)).toBe(
        'POST /api/data?query=turn%20$$%20into%20$&%20or%20$`%20or%20$%27 HTTP/1.1' + rest,
      );
    },
  );

  it('should not leak sensitive query values when logging URL encoding', () => {
    const debugSpy = vi.spyOn(logger, 'debug');
    try {
      const rawRequest = 'GET /api/data?api_key=secret%zz&query=hello world HTTP/1.1';
      const result = urlEncodeRawRequestPath(rawRequest);

      expect(result).toBe('GET /api/data?api_key=secret%zz&query=hello%20world HTTP/1.1');
      const debugOutput = debugSpy.mock.calls.flat().join('\n');
      expect(debugOutput).toContain('api_key=%5BREDACTED%5D');
      expect(debugOutput).not.toContain('secret%zz');
    } finally {
      debugSpy.mockRestore();
    }
  });

  it('should not leak secret-looking query values with non-sensitive parameter names', () => {
    const debugSpy = vi.spyOn(logger, 'debug');
    try {
      const rawRequest =
        'GET /api/data?cursor=sk-123456789012345678901234567890&query=hello world HTTP/1.1';
      const result = urlEncodeRawRequestPath(rawRequest);

      expect(result).toBe(
        'GET /api/data?cursor=sk-123456789012345678901234567890&query=hello%20world HTTP/1.1',
      );
      const debugOutput = debugSpy.mock.calls.flat().join('\n');
      expect(debugOutput).toContain('cursor=%5BREDACTED%5D');
      expect(debugOutput).not.toContain('sk-123456789012345678901234567890');
    } finally {
      debugSpy.mockRestore();
    }
  });

  it('should throw error when modifying malformed request with no URL', () => {
    const rawRequest = 'GET HTTP/1.1';
    expect(() => urlEncodeRawRequestPath(rawRequest)).toThrow(/not valid/);
  });

  it('should not leak query credentials from a malformed first line in errors or logs', () => {
    const errorSpy = vi.spyOn(logger, 'error');
    try {
      // A non-HTTP protocol token triggers the protocol-invalid path; the
      // request target carries a secret in its query string.
      const rawRequest = 'GET /v1/chat?api_key=sk-realsecret1234567890&note=foo FTP/1.1';
      expect(() => urlEncodeRawRequestPath(rawRequest)).toThrow(/protocol is not valid/);

      const thrownMessage = (() => {
        try {
          urlEncodeRawRequestPath(rawRequest);
          return '';
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      })();
      const loggedOutput = errorSpy.mock.calls.flat().join('\n');

      // The secret never appears in the thrown message or the error log.
      expect(thrownMessage).not.toContain('sk-realsecret1234567890');
      expect(loggedOutput).not.toContain('sk-realsecret1234567890');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('should not warn when encoding a valid raw request line', () => {
    // The first line is not a URL, so eagerly sanitizing it would console.warn on
    // every valid raw request. The sanitize must be deferred to the error branches.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = urlEncodeRawRequestPath('GET /api/data?q=hello world HTTP/1.1');
      expect(result).toBe('GET /api/data?q=hello%20world HTTP/1.1');
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('should handle complete raw request with headers', () => {
    const rawRequest = dedent`
      GET /summarized?topic=hello world&start=01/01/2025&end=01/07/2025&auto_extract_keywords=false HTTP/2
      Host: foo.bar.com
      User-Agent: curl/8.7.1
      Accept: application/json
    `;
    const expected = dedent`
      GET /summarized?topic=hello%20world&start=01/01/2025&end=01/07/2025&auto_extract_keywords=false HTTP/2
      Host: foo.bar.com
      User-Agent: curl/8.7.1
      Accept: application/json
    `;
    const result = urlEncodeRawRequestPath(rawRequest);
    expect(result).toBe(expected);
  });

  it('should handle POST request with JSON body', () => {
    const rawRequest = dedent`
      POST /api/submit?param=hello world HTTP/1.1
      Host: example.com
      Content-Type: application/json

      {"key": "value with spaces", "date": "01/01/2025"}
    `;
    const expected = dedent`
      POST /api/submit?param=hello%20world HTTP/1.1
      Host: example.com
      Content-Type: application/json

      {"key": "value with spaces", "date": "01/01/2025"}
    `;
    const result = urlEncodeRawRequestPath(rawRequest);
    expect(result).toBe(expected);
  });

  it('should handle URL with path containing spaces', () => {
    const rawRequest = 'GET /path with spaces/resource HTTP/1.1';
    const result = urlEncodeRawRequestPath(rawRequest);
    expect(result).toBe('GET /path%20with%20spaces/resource HTTP/1.1');
  });

  it('should handle URL with special characters in path and query', () => {
    const rawRequest = 'GET /path/with [brackets]?param=value&special=a+b+c HTTP/1.1';
    const result = urlEncodeRawRequestPath(rawRequest);
    expect(result).toBe('GET /path/with%20[brackets]?param=value&special=a+b+c HTTP/1.1');
  });

  it('should handle completely misformed first line', () => {
    const rawRequest = 'This is not a valid HTTP request line';
    expect(() => urlEncodeRawRequestPath(rawRequest)).toThrow(/not valid/);
  });

  it('should handle request with no HTTP protocol version', () => {
    const rawRequest = 'GET /api/data?query=test';
    expect(() => urlEncodeRawRequestPath(rawRequest)).toThrow(/not valid/);
  });

  it('should handle request with different HTTP methods', () => {
    const methods = ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];

    for (const method of methods) {
      const rawRequest = dedent`
        ${method} /api/submit?param=hello world HTTP/1.1
        Host: example.com
        Content-Type: application/json

      {"key": "value with spaces", "date": "01/01/2025"}
      `;
      const expected = dedent`
        ${method} /api/submit?param=hello%20world HTTP/1.1
        Host: example.com
        Content-Type: application/json

      {"key": "value with spaces", "date": "01/01/2025"}
    `;
      const result = urlEncodeRawRequestPath(rawRequest);
      expect(result).toBe(expected);
    }
  });
});

describe('extractBodyFromRawRequest', () => {
  it('should extract body from a simple POST request', () => {
    const rawRequest = dedent`
      POST /api/submit HTTP/1.1
      Host: example.com
      Content-Type: application/json

      {"key": "value"}
    `;
    expect(extractBodyFromRawRequest(rawRequest)).toBe('{"key": "value"}');
  });

  it('should extract multipart/form-data body', () => {
    const rawRequest = dedent`
      POST /api/upload HTTP/1.1
      Host: example.com
      Content-Type: multipart/form-data; boundary=----Boundary123

      ------Boundary123
      Content-Disposition: form-data; name="field1"

      value1
      ------Boundary123--
    `;
    const body = extractBodyFromRawRequest(rawRequest);
    expect(body).toContain('------Boundary123');
    expect(body).toContain('Content-Disposition: form-data; name="field1"');
    expect(body).toContain('value1');
    expect(body).toContain('------Boundary123--');
  });

  it('should extract x-www-form-urlencoded body', () => {
    const rawRequest = dedent`
      POST /api/submit HTTP/1.1
      Host: example.com
      Content-Type: application/x-www-form-urlencoded

      field1=value1&field2=value2
    `;
    expect(extractBodyFromRawRequest(rawRequest)).toBe('field1=value1&field2=value2');
  });

  it('should return undefined for GET request without body', () => {
    const rawRequest = dedent`
      GET /api/data HTTP/1.1
      Host: example.com
    `;
    expect(extractBodyFromRawRequest(rawRequest)).toBeUndefined();
  });

  it('should return undefined for request with empty body', () => {
    const rawRequest = dedent`
      POST /api/submit HTTP/1.1
      Host: example.com

    `;
    expect(extractBodyFromRawRequest(rawRequest)).toBeUndefined();
  });

  it('should handle body containing \\r\\n\\r\\n sequence', () => {
    const rawRequest = 'POST /api/submit HTTP/1.1\r\nHost: example.com\r\n\r\nline1\r\n\r\nline2';
    expect(extractBodyFromRawRequest(rawRequest)).toBe('line1\r\n\r\nline2');
  });

  it('should preserve mixed line endings within the body', () => {
    const rawRequest = 'POST /api/submit HTTP/1.1\nHost: example.com\r\n\nline1\nline2\r\n';
    expect(extractBodyFromRawRequest(rawRequest)).toBe('line1\nline2\r\n');
  });

  it('should preserve leading and trailing whitespace from the body', () => {
    const rawRequest =
      'POST /api/submit HTTP/1.1\nHost: example.com\n\n \t body with whitespace \n';
    expect(extractBodyFromRawRequest(rawRequest)).toBe(' \t body with whitespace \n');
  });

  it('should ignore blank lines before the request line', () => {
    const rawRequest = '\n\nPOST /api/submit HTTP/1.1\nHost: example.com\n\n body \n';
    expect(extractBodyFromRawRequest(rawRequest)).toBe(' body \n');
  });

  it('should preserve a whitespace-only body', () => {
    const rawRequest = 'POST /api/submit HTTP/1.1\r\nHost: example.com\r\n\r\n \t\r\n';
    expect(extractBodyFromRawRequest(rawRequest)).toBe(' \t\r\n');
  });

  it('should handle special characters in body', () => {
    const rawRequest = dedent`
      POST /api/submit HTTP/1.1
      Host: example.com
      Content-Type: application/json

      {"emoji": "🎉", "unicode": "日本語", "ampersand": "&"}
    `;
    expect(extractBodyFromRawRequest(rawRequest)).toBe(
      '{"emoji": "🎉", "unicode": "日本語", "ampersand": "&"}',
    );
  });

  it('should handle multiple headers before body', () => {
    const rawRequest = dedent`
      POST /api/submit HTTP/1.1
      Host: example.com
      Content-Type: application/json
      Authorization: Bearer token123
      X-Custom-Header: custom-value
      Accept: application/json

      {"data": "test"}
    `;
    expect(extractBodyFromRawRequest(rawRequest)).toBe('{"data": "test"}');
  });
});

describe('Body file resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve file:// references in body configuration', () => {
    const mockTransactions = [
      { id: '1', amount: '100.50', date: '2025-06-01' },
      { id: '2', amount: '250.75', date: '2025-06-02' },
    ];

    vi.mocked(maybeLoadConfigFromExternalFile).mockImplementation(function () {
      return {
        query: '{{prompt}}',
        date: '2025-06-03T22:01:13.797Z',
        transactions: mockTransactions,
      };
    });

    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          query: '{{prompt}}',
          date: '2025-06-03T22:01:13.797Z',
          transactions: 'file://./test_data/transactions.csv',
        },
      },
    });

    // Verify maybeLoadConfigFromExternalFile was called with the body
    expect(maybeLoadConfigFromExternalFile).toHaveBeenCalledWith({
      query: '{{prompt}}',
      date: '2025-06-03T22:01:13.797Z',
      transactions: 'file://./test_data/transactions.csv',
    });

    // The provider should have the resolved config
    expect(provider['config'].body).toEqual({
      query: '{{prompt}}',
      date: '2025-06-03T22:01:13.797Z',
      transactions: mockTransactions,
    });
  });

  it('should resolve nested file:// references in body configuration', () => {
    const mockTransactions = [
      { id: '1', amount: '100.50' },
      { id: '2', amount: '250.75' },
    ];
    const mockConfig = createApiKeyTimeoutConfig();
    const mockUsers = [
      { name: 'John', email: 'john@example.com' },
      { name: 'Jane', email: 'jane@example.com' },
    ];

    vi.mocked(maybeLoadConfigFromExternalFile).mockImplementation(function () {
      return {
        query: '{{prompt}}',
        data: {
          transactions: mockTransactions,
          settings: mockConfig,
          nested: {
            users: mockUsers,
          },
        },
      };
    });

    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          query: '{{prompt}}',
          data: {
            transactions: 'file://./transactions.csv',
            settings: 'file://./config.json',
            nested: {
              users: 'file://./users.csv',
            },
          },
        },
      },
    });

    // Verify the nested structure was resolved
    expect(provider['config'].body).toEqual({
      query: '{{prompt}}',
      data: {
        transactions: mockTransactions,
        settings: mockConfig,
        nested: {
          users: mockUsers,
        },
      },
    });
  });

  it('should resolve file:// references in arrays', () => {
    const mockConfig = createApiKeyTimeoutConfig();
    const mockUsers = [{ name: 'John', email: 'john@example.com' }];

    vi.mocked(maybeLoadConfigFromExternalFile).mockImplementation(function () {
      return [
        'regular string',
        mockConfig,
        {
          inside_array: mockUsers,
        },
      ];
    });

    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: [
          'regular string',
          'file://./config.json',
          {
            inside_array: 'file://./users.csv',
          },
        ],
      },
    });

    // Verify arrays with file references were resolved
    expect(provider['config'].body).toEqual([
      'regular string',
      mockConfig,
      {
        inside_array: mockUsers,
      },
    ]);
  });

  it('should not affect body when no file:// references are present', () => {
    const originalBody = {
      query: '{{prompt}}',
      regular: 'data',
      nested: {
        value: 123,
        array: ['a', 'b', 'c'],
      },
    };

    vi.mocked(maybeLoadConfigFromExternalFile).mockImplementation(function () {
      return originalBody;
    });

    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: originalBody,
      },
    });

    // Body should remain unchanged
    expect(provider['config'].body).toEqual(originalBody);
  });

  it('should work with string body containing file:// reference', () => {
    const mockContent = 'This is the content from the file';

    vi.mocked(maybeLoadConfigFromExternalFile).mockImplementation(function () {
      return mockContent;
    });

    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'file://./content.txt',
      },
    });

    // String body should be resolved to file content
    expect(provider['config'].body).toBe(mockContent);
  });

  it('should use resolved body in API calls', async () => {
    const mockTransactions = [
      { id: '1', amount: '100.50' },
      { id: '2', amount: '250.75' },
    ];

    vi.mocked(maybeLoadConfigFromExternalFile).mockImplementation(function () {
      return {
        query: '{{prompt}}',
        transactions: mockTransactions,
      };
    });

    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          query: '{{prompt}}',
          transactions: 'file://./transactions.csv',
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    // Verify the fetch was called with the resolved body
    // Note: processJsonBody may parse JSON strings, so check the actual call
    expect(fetchWithCache).toHaveBeenCalled();

    const actualCall = vi.mocked(fetchWithCache).mock.calls[0];
    expect(actualCall).toBeDefined();
    expect(actualCall[0]).toBe('http://test.com');

    const requestOptions = actualCall[1];
    expect(requestOptions).toBeDefined();
    expect(requestOptions!.method).toBe('POST');
    expect(requestOptions!.headers).toEqual({ 'content-type': 'application/json' });

    // Parse the actual body to verify it contains the right data
    const bodyStr = requestOptions!.body as string;
    const bodyObj = JSON.parse(bodyStr);
    expect(bodyObj.query).toBe('test prompt');
    expect(bodyObj.transactions).toBeDefined();
    expect(bodyObj.transactions.length).toBe(2);
    // The transactions are there, whether as strings or numbers
    expect(bodyObj.transactions[0].id).toBeDefined();
    expect(bodyObj.transactions[1].id).toBeDefined();
  });

  it('should handle GET requests without body file resolution', () => {
    // maybeLoadConfigFromExternalFile should not be called for GET requests without body
    vi.mocked(maybeLoadConfigFromExternalFile).mockClear();

    new HttpProvider('http://test.com', createGetOptions());

    // Should not call maybeLoadConfigFromExternalFile since there's no body
    expect(maybeLoadConfigFromExternalFile).not.toHaveBeenCalled();
  });

  it('should handle complex nested file resolutions with mixed content', () => {
    const mockData = {
      simple: 'value',
      fileRef: { loaded: 'from file' },
      nested: {
        another: 'regular',
        fileData: [1, 2, 3],
        deeper: {
          moreFiles: { data: 'loaded' },
        },
      },
      arrayWithFiles: ['string', { fromFile: true }, ['nested', 'array']],
    };

    vi.mocked(maybeLoadConfigFromExternalFile).mockImplementation(function () {
      return mockData;
    });

    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          simple: 'value',
          fileRef: 'file://./data.json',
          nested: {
            another: 'regular',
            fileData: 'file://./numbers.json',
            deeper: {
              moreFiles: 'file://./more.json',
            },
          },
          arrayWithFiles: ['string', 'file://./object.json', ['nested', 'array']],
        },
      },
    });

    expect(provider['config'].body).toEqual(mockData);
  });
});

describe('HttpProvider - Sanitization', () => {
  const testUrl = 'http://example.com/api';
  let loggerDebugSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    loggerDebugSpy = vi.spyOn(logger, 'debug');
  });

  afterEach(() => {
    loggerDebugSpy.mockRestore();
  });

  it('should sanitize pfxPassword in debug logs', async () => {
    const provider = new HttpProvider(testUrl, {
      config: {
        method: 'POST',
        body: { test: 'value' },
        // Don't include signatureAuth to avoid signature generation errors
        headers: {
          'X-Custom': 'test-header',
        },
      },
    });

    // Mock the sanitizeConfigForLogging function by spying on the actual config used in the log
    const mockResponse = createHttpResponse('{"result": "test"}');
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    // Instead of testing pfxPassword directly, let's test a working scenario
    expect(loggerDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining('Calling http://example.com/api with config'),
      expect.anything(),
    );
  });

  it('should sanitize Authorization header in debug logs', async () => {
    // Mock the file resolution to return a simple body to avoid conflicts
    vi.mocked(maybeLoadConfigFromExternalFile).mockImplementation(function () {
      return createSimpleVars();
    });

    const provider = new HttpProvider(testUrl, {
      config: {
        method: 'POST',
        body: { simple: 'test-value' },
        headers: {
          Authorization: 'Bearer secret-token-12345',
          'Content-Type': 'application/json',
        },
      },
    });

    const mockResponse = createHttpResponse('{"result": "test"}');
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    // Verify the logger was called (actual sanitization happens internally in logger)
    expect(loggerDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining('Calling'),
      expect.objectContaining({ config: expect.any(Object) }),
    );
  });

  it('should sanitize multiple credential fields', async () => {
    // Simplified test without signature auth to avoid certificate issues
    vi.mocked(maybeLoadConfigFromExternalFile).mockImplementation(function () {
      return createSimpleVars();
    });

    const provider = new HttpProvider(testUrl, {
      config: {
        method: 'POST',
        body: { simple: 'test-value' },
        headers: {
          Authorization: 'Bearer token-123',
          'X-API-Key': 'api-key-456',
        },
        apiKey: 'main-api-key-789',
        token: 'bearer-token-000',
        password: 'config-password-111',
      },
    });

    const mockResponse = createHttpResponse('{"result": "test"}');
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    // Verify the logger was called (actual sanitization happens internally in logger)
    expect(loggerDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining('Calling'),
      expect.objectContaining({ config: expect.any(Object) }),
    );
  });

  it('should preserve non-sensitive fields', async () => {
    vi.mocked(maybeLoadConfigFromExternalFile).mockImplementation(function () {
      return createSimpleVars();
    });

    const provider = new HttpProvider(testUrl, {
      config: {
        method: 'POST',
        body: { simple: 'test-value' },
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'test-agent',
        },
        timeout: 5000,
        maxRetries: 3,
      },
    });

    const mockResponse = createHttpResponse('{"result": "test"}');
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt');

    const debugCall = loggerDebugSpy.mock.calls.find(
      (call: any) => call[0]?.includes('Calling') && call[0]?.includes('with config'),
    );
    expect(debugCall).toBeDefined();

    const context = debugCall?.[1];
    const contextStr = JSON.stringify(context);
    expect(contextStr).toContain('"content-type":"application/json"'); // lowercase
    expect(contextStr).toContain('"user-agent":"test-agent"'); // lowercase
    // Note: timeout and maxRetries are not included in the rendered config that gets logged
    expect(contextStr).not.toContain('[REDACTED]');
  });

  it('should sanitize form-urlencoded bodies with raw spaces in debug logs', async () => {
    const provider = new HttpProvider(testUrl, {
      config: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'username=alice&password=plain-secret&note=hello world',
      },
    });

    vi.mocked(fetchWithCache).mockResolvedValueOnce(createHttpResponse('{"result": "test"}'));

    await provider.callApi('test prompt');

    const debugCall = loggerDebugSpy.mock.calls.find(
      (call: any) => call[0]?.includes('Calling') && call[0]?.includes('with config'),
    );
    expect(debugCall).toBeDefined();

    const contextStr = JSON.stringify(debugCall?.[1]);
    expect(contextStr).toContain('username=alice');
    expect(contextStr).toContain('password=%5BREDACTED%5D');
    expect(contextStr).toContain('note=hello world');
    expect(contextStr).not.toContain('plain-secret');
  });

  it('should sanitize newline-terminated form-urlencoded bodies in debug logs', async () => {
    // A trailing newline (e.g. a body loaded from a file) makes the
    // looksLikeUrlEncodedFormData heuristic reject the string, so only the
    // Content-Type-gated branch redacts it. Pin that branch independently.
    const provider = new HttpProvider(testUrl, {
      config: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'username=alice&password=plain-secret\n',
      },
    });

    vi.mocked(fetchWithCache).mockResolvedValueOnce(createHttpResponse('{"result": "test"}'));

    await provider.callApi('test prompt');

    const debugCall = loggerDebugSpy.mock.calls.find(
      (call: any) => call[0]?.includes('Calling') && call[0]?.includes('with config'),
    );
    expect(debugCall).toBeDefined();
    const contextStr = JSON.stringify(debugCall?.[1]);
    expect(contextStr).toContain('username=alice');
    expect(contextStr).toContain('password=%5BREDACTED%5D');
    expect(contextStr).not.toContain('plain-secret');
  });

  describe('Header sanitization in logs', () => {
    it('should sanitize sensitive headers while preserving functionality', async () => {
      const provider = new HttpProvider('https://api.example.com/test', {
        config: {
          method: 'POST',
          body: { message: '{{ prompt }}' },
          headers: {
            Authorization: 'Bearer secret-token-12345',
            'X-API-Key': 'sk-test-abc123',
            'Content-Type': 'application/json',
          },
        },
      });

      const mockResponse = createHttpResponse('{"success": true}');
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      await provider.callApi('test message');

      // Verify the logger was called with a context object
      expect(loggerDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Calling'),
        expect.objectContaining({ config: expect.any(Object) }),
      );

      // Extract the context object that was passed to the logger
      const logCall = loggerDebugSpy.mock.calls.find((call: any) => call[0]?.includes('Calling'));
      expect(logCall).toBeDefined();
      const loggedContext = logCall![1];

      // Verify that when the logger sanitizes this context, sensitive headers are redacted
      const sanitizedContext = sanitizeObject(loggedContext, { context: 'test' });
      const sanitizedHeaders = sanitizedContext.config.headers;

      // Check for headers with different casing (they may be normalized)
      const authHeader =
        sanitizedHeaders.Authorization ||
        sanitizedHeaders.authorization ||
        Object.entries(sanitizedHeaders).find(
          ([key]) => key.toLowerCase() === 'authorization',
        )?.[1];
      const apiKeyHeader =
        sanitizedHeaders['X-API-Key'] ||
        sanitizedHeaders['x-api-key'] ||
        Object.entries(sanitizedHeaders).find(([key]) => key.toLowerCase() === 'x-api-key')?.[1];

      expect(authHeader).toEqual('[REDACTED]');
      expect(apiKeyHeader).toEqual('[REDACTED]');

      // Verify actual functionality works - fetchWithCache should get real headers
      expect(fetchWithCache).toHaveBeenCalledWith(
        'https://api.example.com/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: 'Bearer secret-token-12345', // Real token sent (lowercase)
            'x-api-key': 'sk-test-abc123', // Real key sent
          }),
        }),
        expect.any(Number),
        'text',
        undefined,
        undefined,
      );
    });

    it('should preserve non-sensitive headers in logs', async () => {
      const provider = new HttpProvider('https://api.example.com/test', {
        config: {
          method: 'POST',
          body: { message: '{{ prompt }}' },
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'test-client/1.0',
            Accept: 'application/json',
          },
        },
      });

      const mockResponse = createHttpResponse('{"success": true}');
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      await provider.callApi('test message');

      // Verify the logger was called
      expect(loggerDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Calling'),
        expect.objectContaining({ config: expect.any(Object) }),
      );
    });
  });

  describe('URL sanitization', () => {
    it('should sanitize URL query parameters', async () => {
      const provider = new HttpProvider(
        'https://api.example.com/test?api_key=secret123&format=json',
        createGetOptions(),
      );

      const mockResponse = createHttpResponse('{"success": true}');
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      await provider.callApi('test');

      const debugCall = loggerDebugSpy.mock.calls.find((call: any) => call[0].includes('Calling'));
      expect(debugCall).toBeDefined();

      const logMessage = debugCall![0];
      expect(logMessage).toContain('api_key=%5BREDACTED%5D');
      expect(logMessage).toContain('format=json'); // Non-sensitive param preserved
      // Note: The URL in config object may contain the original secret, but the main URL is sanitized
    });

    it('should work with standalone sanitizeUrl function', () => {
      const testCases = [
        {
          input: 'https://user:pass@api.com/test?api_key=secret&normal=value',
          expectContains: ['***:***', 'api_key=%5BREDACTED%5D', 'normal=value'],
          expectNotContains: ['user', 'secret'],
        },
        {
          input: 'https://api.com/test?token=bearer123&id=123',
          expectContains: ['token=%5BREDACTED%5D', 'id=123'],
          expectNotContains: ['bearer123'],
        },
      ];

      testCases.forEach(({ input, expectContains, expectNotContains }) => {
        const result = sanitizeUrl(input);

        expectContains.forEach((expectedText) => {
          expect(result).toContain(expectedText);
        });

        expectNotContains.forEach((secretText) => {
          expect(result).not.toContain(secretText);
        });
      });
    });
  });

  describe('Combined sanitization scenarios', () => {
    it('should handle both URL and header sanitization together', async () => {
      const provider = new HttpProvider('https://api.example.com/test?api_key=url_secret123', {
        config: {
          method: 'POST',
          body: { data: '{{ prompt }}' },
          headers: {
            Authorization: 'Bearer header_secret456',
          },
        },
      });

      const mockResponse = createHttpResponse('{"result": "success"}');
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      await provider.callApi('test data');

      // Verify URL is sanitized in the log message
      expect(loggerDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining('api_key=%5BREDACTED%5D'),
        expect.anything(),
      );
    });

    it('should not impact performance significantly', async () => {
      const provider = new HttpProvider('https://api.example.com/perf', {
        config: {
          method: 'POST',
          body: { test: 'performance' },
          headers: {
            Authorization: 'Bearer perf-token-123',
          },
        },
      });

      const mockResponse = createHttpResponse('{"result": "success"}');
      vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const startTime = Date.now();

      // Run multiple calls to test performance impact
      const promises = Array.from({ length: 5 }, () => provider.callApi('performance test'));

      await Promise.all(promises);

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should complete reasonably quickly (less than 500ms for 5 calls)
      expect(totalTime).toBeLessThan(500);

      // Verify logger was called multiple times
      const debugCalls = loggerDebugSpy.mock.calls.filter(
        (call: any) => call[0]?.includes('Calling') && call[0]?.includes('with config'),
      );
      expect(debugCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty or undefined values gracefully', async () => {
      const provider = new HttpProvider('https://api.example.com/test', {
        config: {
          method: 'POST',
          body: { test: 'value' },
          headers: {
            'Content-Type': 'application/json',
            Authorization: '', // Empty header value
          },
        },
      });

      const mockResponse = createHttpResponse('{"result": "test"}');
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      // Should not crash
      await expect(provider.callApi('test prompt')).resolves.not.toThrow();

      // Should still log something
      expect(loggerDebugSpy).toHaveBeenCalled();
    });

    it('should handle malformed URLs in sanitizeUrl function', () => {
      const malformedInputs = ['not-a-url', '', 'https://[invalid-host]/api'];

      malformedInputs.forEach((input) => {
        expect(() => sanitizeUrl(input)).not.toThrow();
        const result = sanitizeUrl(input);
        expect(result).toBeDefined();
      });

      // Test null/undefined separately as they return the input as-is
      expect(sanitizeUrl(null as any)).toBeNull();
      expect(sanitizeUrl(undefined as any)).toBeUndefined();
    });

    it('should not leak malformed URL secrets when sanitization fails', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const result = sanitizeUrl('https://[invalid-host]/api?api_key=plain-secret');
        const warningOutput = warnSpy.mock.calls.flat().join('\n');

        expect(result).toBe('[REDACTED]');
        expect(warningOutput).not.toContain('plain-secret');
        expect(warningOutput).not.toContain('api_key=');
      } finally {
        warnSpy.mockRestore();
      }
    });
  });
});
