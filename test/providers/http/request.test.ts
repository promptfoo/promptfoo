// Request lifecycle tests: body determination, session handling, validation, transforms, token estimation, abort signals.
import './setup';

import path from 'path';

import dedent from 'dedent';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import cliState from '../../../src/cliState';
import { importModule } from '../../../src/esm';
import {
  createSessionParser,
  createValidateStatus,
  determineRequestBody,
  estimateTokenCount,
  HttpProvider,
} from '../../../src/providers/http';
import { REQUEST_TIMEOUT_MS } from '../../../src/providers/shared';

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

  describe('stringified JSON body handling', () => {
    it('should parse stringified JSON body when content type is JSON', () => {
      // This simulates the bug case where body was saved as a string
      const stringifiedBody = '{"message":"{{prompt}}"}';
      const result = determineRequestBody(true, 'test prompt', stringifiedBody, {
        prompt: 'test prompt',
      });

      expect(result).toEqual({
        message: 'test prompt',
      });
    });

    it('should parse stringified JSON body with nested objects', () => {
      const stringifiedBody = '{"outer":{"inner":"{{prompt}}"}}';
      const result = determineRequestBody(true, 'test prompt', stringifiedBody, {
        prompt: 'test prompt',
      });

      expect(result).toEqual({
        outer: {
          inner: 'test prompt',
        },
      });
    });

    it('should parse stringified JSON array body', () => {
      const stringifiedBody = '["{{prompt}}", "static"]';
      const result = determineRequestBody(true, 'test prompt', stringifiedBody, {
        prompt: 'test prompt',
      });

      expect(result).toEqual(['test prompt', 'static']);
    });

    it('should handle stringified JSON body that fails to parse as a template string', () => {
      // This is a template string that looks like JSON but has invalid syntax after templating
      const templateString = 'Message: {{prompt}}';
      const result = determineRequestBody(true, 'test prompt', templateString, {
        prompt: 'test prompt',
      });

      expect(result).toBe('Message: test prompt');
    });

    it('should not parse stringified body when content type is not JSON', () => {
      const stringifiedBody = '{"message":"{{prompt}}"}';
      const result = determineRequestBody(false, 'test prompt', stringifiedBody, {
        prompt: 'test prompt',
      });

      // Should be treated as a template string, not parsed
      expect(result).toBe('{"message":"test prompt"}');
    });

    it('should handle object body normally (backward compatibility)', () => {
      // Ensure object bodies still work as before
      const objectBody = { message: '{{prompt}}' };
      const result = determineRequestBody(true, 'test prompt', objectBody, {
        prompt: 'test prompt',
      });

      expect(result).toEqual({
        message: 'test prompt',
      });
    });

    it('should merge parsed prompt with stringified JSON body', () => {
      const stringifiedBody = '{"configField":"value"}';
      const result = determineRequestBody(
        true,
        { promptField: 'prompt value' },
        stringifiedBody,
        {},
      );

      expect(result).toEqual({
        configField: 'value',
        promptField: 'prompt value',
      });
    });
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
    }).toThrow(/expected string, received number/i);
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
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

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
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

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
    vi.clearAllMocks();

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
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('TEST');

    expect(fetchWithCache).toHaveBeenCalledWith(
      'http://test.com',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'value', transformed: 'test' }),
      },
      REQUEST_TIMEOUT_MS,
      'text',
      undefined,
      undefined,
    );
  });

  it('should handle function-based request transform', async () => {
    vi.clearAllMocks();

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
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

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
      headers: {},
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('test');
    expect(result.output).toEqual({ result: 'success' });
  });

  it('should handle non-JSON response', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: '{{ prompt }}',
      },
    });

    const mockResponse = {
      data: 'success',
      status: 200,
      statusText: 'OK',
      cached: false,
      headers: { 'Content-Type': 'text/plain' },
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('test');
    expect(result.output).toBe('success');
  });

  it('should include debug information when requested', async () => {
    const mockUrl = 'http://example.com/api';
    const mockHeaders = { 'content-type': 'application/json' };
    const mockData = { result: 'success' };

    // Mock the fetchWithCache response
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: mockData,
      status: 200,
      headers: mockHeaders,
      statusText: 'OK',
      cached: false,
    });

    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'GET',
      },
    });

    const result = await provider.callApi('test', {
      debug: true,
      prompt: { raw: 'test', label: 'test' },
      vars: {},
    });

    expect(result.metadata).toEqual({
      http: {
        headers: mockHeaders,
        requestHeaders: {},
        status: 200,
        statusText: 'OK',
      },
      finalRequestBody: undefined,
      transformedRequest: 'test',
    });
    expect(result.raw).toEqual(mockData);
  });

  it('should handle plain text non-JSON responses', async () => {
    const mockUrl = 'http://example.com/api';
    const mockData = 'Not a JSON response';

    // Mock the fetchWithCache response
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: mockData,
      status: 200,
      headers: {},
      statusText: 'OK',
      cached: false,
    });

    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'GET',
      },
    });

    const result = await provider.callApi('test');
    expect(result.output).toEqual(mockData);
  });

  it('should handle non-JSON responses with debug mode', async () => {
    const mockUrl = 'http://example.com/api';
    const mockHeaders = { 'content-type': 'text/plain' };
    const mockData = 'text response';

    // Mock the fetchWithCache response
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: mockData,
      status: 200,
      headers: mockHeaders,
      statusText: 'OK',
      cached: false,
    });

    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'GET',
        transformResponse: () => ({ foo: 'bar' }),
      },
    });

    const result = await provider.callApi('test', {
      debug: true,
      prompt: { raw: 'test', label: 'test' },
      vars: {},
    });

    expect(result.raw).toEqual(mockData);
    expect(result.metadata).toHaveProperty('http', {
      headers: mockHeaders,
      requestHeaders: {},
      status: 200,
      statusText: 'OK',
    });
    expect(result.output).toEqual({ foo: 'bar' });
  });

  it('should handle transformResponse returning a simple string value', async () => {
    const mockUrl = 'http://example.com/api';
    const mockData = { result: 'success' };

    // Mock the fetchWithCache response
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: mockData,
      status: 200,
      headers: {},
      statusText: 'OK',
      cached: false,
    });

    // Create a transform that returns a simple string
    const transformResponse = () => 'transformed result';

    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'GET',
        transformResponse,
      },
    });

    const result = await provider.callApi('test');

    // Verify the result is correctly structured
    expect(result.output).toBe('transformed result');
  });

  it('should handle non-JSON responses with debug mode and transform without output property', async () => {
    const mockUrl = 'http://example.com/api';
    const mockHeaders = { 'content-type': 'text/plain' };
    const mockData = 'text response';

    // Mock the fetchWithCache response
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: mockData,
      status: 200,
      headers: mockHeaders,
      statusText: 'OK',
      cached: false,
    });

    // Setup provider with transform that doesn't return an output property
    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'GET',
        transformResponse: () => ({ transformed: true }),
      },
    });

    // Call with debug mode
    const result = await provider.callApi('test', {
      debug: true,
      prompt: { raw: 'test', label: 'test' },
      vars: {},
    });

    // Verify transformed response and debug info
    expect(result.output).toEqual({ transformed: true });
    expect(result.raw).toEqual(mockData);
    expect(result.metadata).toHaveProperty('http', {
      headers: mockHeaders,
      requestHeaders: {},
      status: 200,
      statusText: 'OK',
    });
  });
});

describe('session handling', () => {
  it('should extract session ID from headers when configured', async () => {
    const sessionParser = vi.fn().mockReturnValue('test-session');
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
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('test');
    expect(result.sessionId).toBe('test-session');
    expect(sessionParser).toHaveBeenCalledWith({
      headers: mockResponse.headers,
      body: { result: 'success' },
    });
  });

  it('should include sessionId in response when returned by parser', async () => {
    const mockUrl = 'http://example.com/api';
    const mockSessionId = 'test-session-123';

    // Mock the fetchWithCache response
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: { result: 'success' },
      status: 200,
      headers: { 'session-id': mockSessionId },
      statusText: 'OK',
      cached: false,
    });

    // Create a session parser that returns the session ID
    const sessionParser = () => mockSessionId;

    const provider = new HttpProvider(mockUrl, {
      config: {
        method: 'GET',
        sessionParser,
      },
    });

    const result = await provider.callApi('test');

    // Verify the sessionId is included in the response
    expect(result.sessionId).toBe(mockSessionId);
  });
});

describe('session endpoint', () => {
  it('should fetch session from endpoint on first call', async () => {
    const provider = new HttpProvider('http://test.com/api', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { query: '{{ prompt }}', session: '{{ sessionId }}' },
        session: {
          url: 'http://test.com/auth/session',
          method: 'POST',
          headers: { Authorization: 'Bearer test-token' },
          responseParser: 'data.body.sessionId',
        },
      },
    });

    // First call: session endpoint
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: JSON.stringify({ sessionId: 'session-abc-123' }),
      status: 200,
      statusText: 'OK',
      cached: false,
      headers: {},
    });

    // Second call: main API
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
      headers: {},
    });

    const result = await provider.callApi('test query');

    // Verify session endpoint was called
    expect(fetchWithCache).toHaveBeenCalledTimes(2);
    const sessionCall = vi.mocked(fetchWithCache).mock.calls[0];
    expect(sessionCall).toBeDefined();
    expect(sessionCall?.[0]).toBe('http://test.com/auth/session');
    expect(sessionCall?.[1]?.method).toBe('POST');
    const sessionHeaders = sessionCall?.[1]?.headers as Record<string, string>;
    expect(sessionHeaders?.authorization).toBe('Bearer test-token');

    // Verify main API was called with sessionId in body
    const mainCall = vi.mocked(fetchWithCache).mock.calls[1];
    expect(mainCall).toBeDefined();
    expect(mainCall?.[0]).toBe('http://test.com/api');
    const mainBody = JSON.parse(mainCall?.[1]?.body as string);
    expect(mainBody.session).toBe('session-abc-123');

    // Verify sessionId is returned in response
    expect(result.sessionId).toBe('session-abc-123');
  });

  it('should reuse session when context contains our fetched sessionId (Hydra pattern)', async () => {
    const provider = new HttpProvider('http://test.com/api', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { query: '{{ prompt }}', session: '{{ sessionId }}' },
        session: {
          url: 'http://test.com/auth/session',
          method: 'POST',
          responseParser: 'data.body.sessionId',
        },
      },
    });

    // First call: fetch session
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: JSON.stringify({ sessionId: 'session-hydra-1' }),
      status: 200,
      statusText: 'OK',
      cached: false,
      headers: {},
    });
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: JSON.stringify({ result: 'turn 1' }),
      status: 200,
      statusText: 'OK',
      cached: false,
      headers: {},
    });

    const result1 = await provider.callApi('turn 1');
    expect(result1.sessionId).toBe('session-hydra-1');

    // Second call: pass the sessionId we got back (simulating Hydra behavior)
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: JSON.stringify({ result: 'turn 2' }),
      status: 200,
      statusText: 'OK',
      cached: false,
      headers: {},
    });

    const result2 = await provider.callApi('turn 2', {
      vars: { sessionId: 'session-hydra-1' },
    } as any);

    // Should NOT call session endpoint again (only 3 total calls, not 4)
    expect(fetchWithCache).toHaveBeenCalledTimes(3);

    // Verify same sessionId is used
    const mainCall2 = vi.mocked(fetchWithCache).mock.calls[2];
    expect(mainCall2).toBeDefined();
    const mainBody2 = JSON.parse(mainCall2?.[1]?.body as string);
    expect(mainBody2.session).toBe('session-hydra-1');
    expect(result2.sessionId).toBe('session-hydra-1');
  });

  it('should fetch fresh session when context contains unknown sessionId (Meta-agent pattern)', async () => {
    const provider = new HttpProvider('http://test.com/api', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { query: '{{ prompt }}', session: '{{ sessionId }}' },
        session: {
          url: 'http://test.com/auth/session',
          method: 'POST',
          responseParser: 'data.body.sessionId',
        },
      },
    });

    // First call with client-generated UUID
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: JSON.stringify({ sessionId: 'session-meta-1' }),
      status: 200,
      statusText: 'OK',
      cached: false,
      headers: {},
    });
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: JSON.stringify({ result: 'turn 1' }),
      status: 200,
      statusText: 'OK',
      cached: false,
      headers: {},
    });

    const result1 = await provider.callApi('turn 1', {
      vars: { sessionId: 'client-uuid-111' }, // Client-generated UUID
    } as any);
    expect(result1.sessionId).toBe('session-meta-1');

    // Second call with different client-generated UUID
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: JSON.stringify({ sessionId: 'session-meta-2' }),
      status: 200,
      statusText: 'OK',
      cached: false,
      headers: {},
    });
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: JSON.stringify({ result: 'turn 2' }),
      status: 200,
      statusText: 'OK',
      cached: false,
      headers: {},
    });

    const result2 = await provider.callApi('turn 2', {
      vars: { sessionId: 'client-uuid-222' }, // Different client-generated UUID
    } as any);

    // Should call session endpoint again (4 total calls)
    expect(fetchWithCache).toHaveBeenCalledTimes(4);
    expect(result2.sessionId).toBe('session-meta-2');
  });

  it('should throw error when session endpoint fails', async () => {
    const provider = new HttpProvider('http://test.com/api', {
      config: {
        method: 'POST',
        body: { query: '{{ prompt }}' },
        session: {
          url: 'http://test.com/auth/session',
          responseParser: 'data.body.sessionId',
        },
      },
    });

    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: 'Unauthorized',
      status: 401,
      statusText: 'Unauthorized',
      cached: false,
      headers: {},
    });

    await expect(provider.callApi('test')).rejects.toThrow(
      'Session endpoint request failed with status 401 Unauthorized',
    );
  });

  it('should throw error when session endpoint returns no sessionId', async () => {
    const provider = new HttpProvider('http://test.com/api', {
      config: {
        method: 'POST',
        body: { query: '{{ prompt }}' },
        session: {
          url: 'http://test.com/auth/session',
          responseParser: 'data.body.sessionId',
        },
      },
    });

    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: JSON.stringify({ error: 'no session created' }),
      status: 200,
      statusText: 'OK',
      cached: false,
      headers: {},
    });

    await expect(provider.callApi('test')).rejects.toThrow(
      'Session endpoint did not return a session ID',
    );
  });

  it('should support GET method for session endpoint', async () => {
    const provider = new HttpProvider('http://test.com/api', {
      config: {
        method: 'POST',
        body: { query: '{{ prompt }}' },
        session: {
          url: 'http://test.com/auth/session?client_id=123',
          method: 'GET',
          responseParser: 'data.body.session_token',
        },
      },
    });

    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: JSON.stringify({ session_token: 'get-session-xyz' }),
      status: 200,
      statusText: 'OK',
      cached: false,
      headers: {},
    });
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
      headers: {},
    });

    await provider.callApi('test');

    const sessionCall = vi.mocked(fetchWithCache).mock.calls[0];
    expect(sessionCall).toBeDefined();
    expect(sessionCall?.[1]?.method).toBe('GET');
    expect(sessionCall?.[1]?.body).toBeUndefined();
  });

  it('should render template variables in session endpoint config', async () => {
    const provider = new HttpProvider('http://test.com/api', {
      config: {
        method: 'POST',
        body: { query: '{{ prompt }}' },
        session: {
          url: 'http://test.com/auth/session',
          method: 'POST',
          headers: { Authorization: 'Bearer {{ api_key }}' },
          body: { client_id: '{{ client_id }}' },
          responseParser: 'data.body.sessionId',
        },
      },
    });

    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: JSON.stringify({ sessionId: 'templated-session' }),
      status: 200,
      statusText: 'OK',
      cached: false,
      headers: {},
    });
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
      headers: {},
    });

    await provider.callApi('test', {
      vars: { api_key: 'secret-key', client_id: 'my-client' },
    } as any);

    const sessionCall = vi.mocked(fetchWithCache).mock.calls[0];
    expect(sessionCall).toBeDefined();
    const sessionHeaders = sessionCall?.[1]?.headers as Record<string, string>;
    expect(sessionHeaders?.authorization).toBe('Bearer secret-key');
    expect(JSON.parse(sessionCall?.[1]?.body as string)).toEqual({ client_id: 'my-client' });
  });

  it('should extract session from headers using responseParser', async () => {
    const provider = new HttpProvider('http://test.com/api', {
      config: {
        method: 'POST',
        body: { query: '{{ prompt }}' },
        session: {
          url: 'http://test.com/auth/session',
          responseParser: 'data.headers["x-session-token"]',
        },
      },
    });

    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: '',
      status: 200,
      statusText: 'OK',
      cached: false,
      headers: { 'x-session-token': 'header-session-456' },
    });
    vi.mocked(fetchWithCache).mockResolvedValueOnce({
      data: JSON.stringify({ result: 'success' }),
      status: 200,
      statusText: 'OK',
      cached: false,
      headers: {},
    });

    const result = await provider.callApi('test');
    expect(result.sessionId).toBe('header-session-456');
  });
});

describe('error handling', () => {
  it('should throw error for responses that fail validateStatus check', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: '{{ prompt }}' },
        validateStatus: 'status >= 200 && status < 300', // Only accept 2xx responses
      },
    });

    const mockResponse = {
      data: 'Error message',
      status: 400,
      statusText: 'Bad Request',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await expect(provider.callApi('test')).rejects.toThrow(
      'HTTP call failed with status 400 Bad Request: Error message',
    );
  });

  it('should throw session parsing errors', async () => {
    const sessionParser = vi.fn().mockImplementation(function () {
      throw new Error('Session parsing failed');
    });
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
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await expect(provider.callApi('test')).rejects.toThrow('Session parsing failed');
  });

  it('should throw error for raw request with non-200 response', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        request: dedent`
          GET /api/data HTTP/1.1
          Host: example.com
        `,
        validateStatus: (status: number) => status < 500,
      },
    });

    const mockResponse = {
      data: 'Error occurred',
      status: 500,
      statusText: 'Internal Server Error',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await expect(provider.callApi('test')).rejects.toThrow(
      'HTTP call failed with status 500 Internal Server Error: Error occurred',
    );
  });
});

describe('validateStatus', () => {
  describe('default behavior', () => {
    it('should accept all status codes when validateStatus is not provided', async () => {
      const provider = new HttpProvider('http://test.com', {
        config: {
          method: 'POST',
          body: { key: 'value' },
        },
      });

      // Test various status codes
      const testCases = [
        { status: 200, statusText: 'OK' },
        { status: 400, statusText: 'Bad Request' },
        { status: 500, statusText: 'Server Error' },
      ];

      for (const { status, statusText } of testCases) {
        const mockResponse = {
          data: JSON.stringify({ result: 'success' }),
          status,
          statusText,
          cached: false,
        };
        vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

        const result = await provider.callApi('test');
        expect(result.output).toEqual({ result: 'success' });
      }
    });
  });

  describe('string-based validators', () => {
    it('should handle expression format', async () => {
      const provider = new HttpProvider('http://test.com', {
        config: {
          method: 'POST',
          body: { key: 'value' },
          validateStatus: 'status >= 200 && status < 300',
        },
      });

      // Test successful case
      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        status: 201,
        statusText: 'Created',
        cached: false,
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test');
      expect(result.output).toEqual({ result: 'success' });

      // Test failure case
      const errorResponse = {
        data: 'Error message',
        status: 400,
        statusText: 'Bad Request',
        cached: false,
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce(errorResponse);

      await expect(provider.callApi('test')).rejects.toThrow(
        'HTTP call failed with status 400 Bad Request: Error message',
      );
    });

    it('should handle arrow function format with parameter', async () => {
      const provider = new HttpProvider('http://test.com', {
        config: {
          method: 'POST',
          body: { key: 'value' },
          validateStatus: '(s) => s < 500',
        },
      });

      // Test accepting 4xx status
      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        status: 404,
        statusText: 'Not Found',
        cached: false,
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test');
      expect(result.output).toEqual({ result: 'success' });

      // Test rejecting 5xx status
      const errorResponse = {
        data: 'Error message',
        status: 500,
        statusText: 'Server Error',
        cached: false,
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce(errorResponse);

      await expect(provider.callApi('test')).rejects.toThrow(
        'HTTP call failed with status 500 Server Error: Error message',
      );
    });

    it('should handle arrow function format without parameter', async () => {
      const provider = new HttpProvider('http://test.com', {
        config: {
          method: 'POST',
          body: { key: 'value' },
          validateStatus: '() => true',
        },
      });

      // Test accepting all status codes
      const responses = [
        { status: 200, statusText: 'OK' },
        { status: 404, statusText: 'Not Found' },
        { status: 500, statusText: 'Server Error' },
      ];

      for (const { status, statusText } of responses) {
        const mockResponse = {
          data: JSON.stringify({ result: 'success' }),
          status,
          statusText,
          cached: false,
        };
        vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

        const result = await provider.callApi('test');
        expect(result.output).toEqual({ result: 'success' });
      }
    });

    it('should handle regular function format', async () => {
      const provider = new HttpProvider('http://test.com', {
        config: {
          method: 'POST',
          body: { key: 'value' },
          validateStatus: 'function(status) { return status < 500; }',
        },
      });

      // Test accepting 4xx status
      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        status: 404,
        statusText: 'Not Found',
        cached: false,
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test');
      expect(result.output).toEqual({ result: 'success' });

      // Test rejecting 5xx status
      const errorResponse = {
        data: 'Error message',
        status: 500,
        statusText: 'Server Error',
        cached: false,
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce(errorResponse);

      await expect(provider.callApi('test')).rejects.toThrow(
        'HTTP call failed with status 500 Server Error: Error message',
      );
    });
  });

  describe('error handling', () => {
    it('should handle malformed string expressions', async () => {
      const provider = new HttpProvider('http://test.com', {
        config: {
          method: 'POST',
          body: { key: 'value' },
          validateStatus: 'invalid[syntax',
        },
      });

      const mockResponse = {
        data: 'response',
        status: 200,
        statusText: 'OK',
        cached: false,
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      await expect(provider.callApi('test')).rejects.toThrow('Invalid status validator expression');
    });

    it('should throw error for malformed file-based validator', async () => {
      vi.mocked(importModule).mockRejectedValueOnce(new Error('Module not found'));

      await expect(createValidateStatus('file://invalid-validator.js')).rejects.toThrow(
        /Status validator malformed/,
      );
    });

    it('should throw error for unsupported validator type', async () => {
      await expect(createValidateStatus(123 as any)).rejects.toThrow(
        'Unsupported status validator type: number',
      );
    });
  });

  describe('file-based validators', () => {
    it('should handle file-based validateStatus', async () => {
      const mockValidator = vi.fn((status) => status < 500);
      vi.mocked(importModule).mockResolvedValueOnce(mockValidator);

      const provider = new HttpProvider('http://test.com', {
        config: {
          method: 'POST',
          body: { key: 'value' },
          validateStatus: 'file://validator.js',
        },
      });

      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        status: 404,
        statusText: 'Not Found',
        cached: false,
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test');
      expect(result.output).toEqual({ result: 'success' });
      expect(importModule).toHaveBeenCalledWith(
        path.resolve('/mock/base/path', 'validator.js'),
        undefined,
      );
      expect(mockValidator).toHaveBeenCalledWith(404);
    });

    it('should handle file-based validateStatus with specific function', async () => {
      const mockValidator = vi.fn((status) => status < 500);
      vi.mocked(importModule).mockResolvedValueOnce(mockValidator);

      const provider = new HttpProvider('http://test.com', {
        config: {
          method: 'POST',
          body: { key: 'value' },
          validateStatus: 'file://validator.js:validateStatus',
        },
      });

      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        status: 404,
        statusText: 'Not Found',
        cached: false,
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test');
      expect(result.output).toEqual({ result: 'success' });
      expect(importModule).toHaveBeenCalledWith(
        path.resolve('/mock/base/path', 'validator.js'),
        'validateStatus',
      );
      expect(mockValidator).toHaveBeenCalledWith(404);
    });
  });
});

describe('session parser', () => {
  it('should handle string-based session parser', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'GET',
        sessionParser: 'data.headers["x-session-id"]',
      },
    });

    const mockResponse = {
      data: 'response',
      status: 200,
      statusText: 'OK',
      cached: false,
      headers: { 'x-session-id': 'test-session' },
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('test');
    expect(result.sessionId).toBe('test-session');
  });

  it('should throw error for unsupported session parser type', async () => {
    await expect(createSessionParser(123 as any)).rejects.toThrow(
      'Unsupported response transform type: number',
    );
  });
});

describe('transform response error handling', () => {
  it('should handle errors in response transform function', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'GET',
        transformResponse: () => {
          throw new Error('Transform failed');
        },
      },
    });

    const mockResponse = {
      data: 'response',
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await expect(provider.callApi('test')).rejects.toThrow('Transform failed');
  });

  it('should handle errors in string-based transform', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'GET',
        transformResponse: 'invalid.syntax[',
      },
    });

    const mockResponse = {
      data: 'response',
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await expect(provider.callApi('test')).rejects.toThrow('Failed to transform response');
  });
});

describe('arrow function parsing in transformResponse', () => {
  it('should handle arrow function with explicit body', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'GET',
        transformResponse: '(json, text) => { return json.data }',
      },
    });

    const mockResponse = {
      data: JSON.stringify({ data: 'test value' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('test');
    expect(result.output).toBe('test value');
  });

  it('should handle regular function with explicit body', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'GET',
        transformResponse: 'function(json, text) { return json.data }',
      },
    });

    const mockResponse = {
      data: JSON.stringify({ data: 'test value' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('test');
    expect(result.output).toBe('test value');
  });

  it('should handle arrow function with implicit return', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'GET',
        transformResponse: '(json) => json.data',
      },
    });

    const mockResponse = {
      data: JSON.stringify({ data: 'test value' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('test');
    expect(result.output).toBe('test value');
  });

  it('should handle arrow function with context parameter', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'GET',
        transformResponse: '(json, text, context) => context.response.status',
      },
    });

    const mockResponse = {
      data: 'response',
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('test');
    expect(result.output).toBe(200);
  });

  it('should handle simple expression without function', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'GET',
        transformResponse: 'json.data',
      },
    });

    const mockResponse = {
      data: JSON.stringify({ data: 'test value' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('test');
    expect(result.output).toBe('test value');
  });

  it('should handle multiline arrow function', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'GET',
        transformResponse: `(json, text) => {
          const value = json.data;
          return value.toUpperCase();
        }`,
      },
    });

    const mockResponse = {
      data: JSON.stringify({ data: 'test value' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('test');
    expect(result.output).toBe('TEST VALUE');
  });
});

describe('transform request error handling', () => {
  it('should handle errors in string-based request transform', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        body: { key: 'value' },
        transformRequest: 'invalid.syntax[',
      },
    });

    await expect(provider.callApi('test')).rejects.toThrow('Unexpected token');
  });
});

describe('status validator error handling', () => {
  it('should throw error for invalid status validator expression', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'GET',
        validateStatus: 'invalid syntax[',
      },
    });

    const mockResponse = {
      data: 'response',
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await expect(provider.callApi('test')).rejects.toThrow('Invalid status validator expression');
  });

  it('should throw error for malformed file-based validator', async () => {
    vi.mocked(importModule).mockRejectedValueOnce(new Error('Module not found'));

    await expect(createValidateStatus('file://invalid-validator.js')).rejects.toThrow(
      /Status validator malformed/,
    );
  });

  it('should throw error for unsupported validator type', async () => {
    await expect(createValidateStatus(123 as any)).rejects.toThrow(
      'Unsupported status validator type: number',
    );
  });
});

describe('string-based validators', () => {
  it('should handle expression format', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        body: { key: 'value' },
        validateStatus: 'status >= 200 && status < 300',
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 201,
      statusText: 'Created',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('test');
    expect(result.output).toEqual({ result: 'success' });

    const errorResponse = {
      data: 'Error message',
      status: 400,
      statusText: 'Bad Request',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(errorResponse);

    await expect(provider.callApi('test')).rejects.toThrow(
      'HTTP call failed with status 400 Bad Request: Error message',
    );
  });

  it('should handle arrow function format with parameter', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        body: { key: 'value' },
        validateStatus: '(s) => s < 500',
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 404,
      statusText: 'Not Found',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('test');
    expect(result.output).toEqual({ result: 'success' });

    const errorResponse = {
      data: 'Error message',
      status: 500,
      statusText: 'Server Error',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(errorResponse);

    await expect(provider.callApi('test')).rejects.toThrow(
      'HTTP call failed with status 500 Server Error: Error message',
    );
  });

  it('should handle arrow function format without parameter', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        body: { key: 'value' },
        validateStatus: '() => true',
      },
    });

    const responses = [
      { status: 200, statusText: 'OK' },
      { status: 404, statusText: 'Not Found' },
      { status: 500, statusText: 'Server Error' },
    ];

    for (const { status, statusText } of responses) {
      const mockResponse = {
        data: JSON.stringify({ result: 'success' }),
        status,
        statusText,
        cached: false,
      };
      vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('test');
      expect(result.output).toEqual({ result: 'success' });
    }
  });

  it('should handle regular function format', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        body: { key: 'value' },
        validateStatus: 'function(status) { return status < 500; }',
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'success' }),
      status: 404,
      statusText: 'Not Found',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('test');
    expect(result.output).toEqual({ result: 'success' });

    const errorResponse = {
      data: 'Error message',
      status: 500,
      statusText: 'Server Error',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(errorResponse);

    await expect(provider.callApi('test')).rejects.toThrow(
      'HTTP call failed with status 500 Server Error: Error message',
    );
  });

  it('should handle malformed string expressions', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        body: { key: 'value' },
        validateStatus: 'invalid[syntax',
      },
    });

    const mockResponse = {
      data: 'response',
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await expect(provider.callApi('test')).rejects.toThrow('Invalid status validator expression');
  });
});

describe('HttpProvider with token estimation', () => {
  beforeEach(() => {
    cliState.config = {} as any;
  });
  afterEach(() => {
    delete cliState.config;
  });
  it('should not estimate tokens when disabled', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        body: { prompt: '{{prompt}}' },
        // tokenEstimation not configured, should be disabled by default
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'Hello world' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('Test prompt');

    expect(result.tokenUsage).toEqual(
      expect.objectContaining({
        numRequests: 1,
      }),
    );
  });

  it('should enable token estimation by default in redteam mode', async () => {
    cliState.config = { redteam: {} } as any;

    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        body: { prompt: '{{prompt}}' },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'Hello world' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('Test prompt');

    expect(result.tokenUsage).toBeDefined();
    expect(result.tokenUsage!.prompt).toBe(Math.ceil(2 * 1.3));
    expect(result.tokenUsage!.completion).toBe(Math.ceil(2 * 1.3));
    expect(result.tokenUsage!.total).toBe(
      result.tokenUsage!.prompt! + result.tokenUsage!.completion!,
    );
  });

  it('should estimate tokens when enabled with default settings', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        body: { prompt: '{{prompt}}' },
        tokenEstimation: {
          enabled: true,
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'Hello world response' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('Test prompt here');

    expect(result.tokenUsage).toBeDefined();
    expect(result.tokenUsage!.prompt).toBe(Math.ceil(3 * 1.3)); // "Test prompt here" = 3 words * 1.3
    expect(result.tokenUsage!.completion).toBe(Math.ceil(3 * 1.3)); // "Hello world response" = 3 words * 1.3
    expect(result.tokenUsage!.total).toBe(
      result.tokenUsage!.prompt! + result.tokenUsage!.completion!,
    );
    expect(result.tokenUsage!.numRequests).toBe(1);
  });

  it('should use custom multiplier', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        body: { prompt: '{{prompt}}' },
        tokenEstimation: {
          enabled: true,
          multiplier: 2.0,
        },
      },
    });

    const mockResponse = {
      data: 'Simple response', // Plain text response
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('Hello world');

    expect(result.tokenUsage!.prompt).toBe(Math.ceil(2 * 2.0)); // 2 words * 2.0 = 4
    expect(result.tokenUsage!.completion).toBe(Math.ceil(2 * 2.0)); // 2 words * 2.0 = 4
    expect(result.tokenUsage!.total).toBe(8);
  });

  it('should not override existing tokenUsage from transformResponse', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        body: { prompt: '{{prompt}}' },
        tokenEstimation: {
          enabled: true,
        },
        transformResponse: () => ({
          output: 'Test response',
          tokenUsage: {
            prompt: 100,
            completion: 200,
            total: 300,
          },
        }),
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'Hello world' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('Test prompt');

    // Should use the tokenUsage from transformResponse, not estimation
    expect(result.tokenUsage!.prompt).toBe(100);
    expect(result.tokenUsage!.completion).toBe(200);
    expect(result.tokenUsage!.total).toBe(300);
  });

  it('should work with raw request mode', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        request: dedent`
          POST /api HTTP/1.1
          Host: test.com
          Content-Type: application/json

          {"prompt": "{{prompt}}"}
        `,
        tokenEstimation: {
          enabled: true,
        },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ message: 'Success response' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('Hello world');

    expect(result.tokenUsage).toBeDefined();
    expect(result.tokenUsage!.prompt).toBeGreaterThan(0);
    expect(result.tokenUsage!.completion).toBeGreaterThan(0);
    expect(result.tokenUsage!.total).toBe(
      result.tokenUsage!.prompt! + result.tokenUsage!.completion!,
    );
  });

  it('should handle object output from transformResponse', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        body: { prompt: '{{prompt}}' },
        tokenEstimation: {
          enabled: true,
        },
        transformResponse: 'json.message',
      },
    });

    const mockResponse = {
      data: JSON.stringify({ message: 'Hello world' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('Test prompt');

    expect(result.tokenUsage).toBeDefined();
    // Should use raw text when output is not a string
    expect(result.tokenUsage!.completion).toBeGreaterThan(0);
  });

  it('should fall back to raw text when transformResponse returns an object', async () => {
    const provider = new HttpProvider('http://test.com', {
      config: {
        method: 'POST',
        body: { prompt: '{{prompt}}' },
        tokenEstimation: {
          enabled: true,
        },
        transformResponse: 'json', // returns the whole object, not a string
      },
    });

    const mockResponse = {
      data: JSON.stringify({ message: 'Hello world' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    const result = await provider.callApi('Test prompt');

    expect(result.tokenUsage).toBeDefined();
    // Should use raw text when output is not a string
    expect(result.tokenUsage!.completion).toBeGreaterThan(0);
  });
});

describe('createSessionParser', () => {
  it('should return empty string when no parser is provided', async () => {
    const parser = await createSessionParser(undefined);
    const result = parser({ headers: {}, body: {} });
    expect(result).toBe('');
  });

  it('should handle function parser', async () => {
    const functionParser = ({ headers }: { headers: Record<string, string> }) =>
      headers['session-id'];
    const parser = await createSessionParser(functionParser);
    const result = parser({ headers: { 'session-id': 'test-session' } });
    expect(result).toBe('test-session');
  });

  it('should handle header path expression', async () => {
    const parser = await createSessionParser('data.headers["x-session-id"]');
    const result = parser({
      headers: { 'x-session-id': 'test-session' },
      body: {},
    });
    expect(result).toBe('test-session');
  });

  it('should handle body path expression', async () => {
    const parser = await createSessionParser('data.body.session.id');
    const result = parser({
      headers: {},
      body: { session: { id: 'test-session' } },
    });
    expect(result).toBe('test-session');
  });

  it('should handle file:// parser', async () => {
    const mockParser = vi.fn(({ headers }) => headers['session-id']);
    vi.mocked(importModule).mockResolvedValueOnce(mockParser);

    const parser = await createSessionParser('file://session-parser.js');
    const result = parser({ headers: { 'session-id': 'test-session' } });

    expect(result).toBe('test-session');
    expect(importModule).toHaveBeenCalledWith(
      path.resolve('/mock/base/path', 'session-parser.js'),
      undefined,
    );
  });

  it('should handle file:// parser with specific function', async () => {
    const mockParser = vi.fn(({ body }) => body.sessionId);
    vi.mocked(importModule).mockResolvedValueOnce(mockParser);

    const parser = await createSessionParser('file://session-parser.js:parseSession');
    const result = parser({ headers: {}, body: { sessionId: 'test-session' } });

    expect(result).toBe('test-session');
    expect(importModule).toHaveBeenCalledWith(
      path.resolve('/mock/base/path', 'session-parser.js'),
      'parseSession',
    );
  });

  it('should throw error for malformed file:// parser', async () => {
    vi.mocked(importModule).mockResolvedValueOnce({});

    await expect(createSessionParser('file://invalid-parser.js')).rejects.toThrow(
      /Response transform malformed/,
    );
  });

  it('should handle complex body path expression', async () => {
    const parser = await createSessionParser('data.body.data.attributes.session.id');
    const result = parser({
      headers: {},
      body: {
        data: {
          attributes: {
            session: {
              id: 'test-session',
            },
          },
        },
      },
    });
    expect(result).toBe('test-session');
  });
});

describe('Token Estimation', () => {
  describe('estimateTokenCount', () => {
    it('should count tokens using word-based method', () => {
      const text = 'Hello world this is a test';
      const result = estimateTokenCount(text, 1.3);
      expect(result).toBe(Math.ceil(6 * 1.3)); // 6 words * 1.3 = 7.8, ceil = 8
    });

    it('should handle empty text', () => {
      expect(estimateTokenCount('', 1.3)).toBe(0);
      expect(estimateTokenCount(null as any, 1.3)).toBe(0);
      expect(estimateTokenCount(undefined as any, 1.3)).toBe(0);
    });

    it('should filter out empty words', () => {
      const text = 'hello   world    test'; // Multiple spaces
      const result = estimateTokenCount(text, 1.0);
      expect(result).toBe(3); // Should count 3 words, not split on every space
    });

    it('should use default multiplier when not provided', () => {
      const text = 'hello world';
      const result = estimateTokenCount(text);
      expect(result).toBe(Math.ceil(2 * 1.3)); // Default multiplier is 1.3
    });
  });
});

describe('HttpProvider - Abort Signal Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass abortSignal to fetchWithCache', async () => {
    const provider = new HttpProvider('http://example.com/api', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: '{{ prompt }}' },
      },
    });

    const abortController = new AbortController();
    const mockResponse = {
      data: JSON.stringify({ result: 'response text' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt', undefined, { abortSignal: abortController.signal });

    expect(fetchWithCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: abortController.signal }),
      expect.any(Number),
      expect.any(String),
      undefined,
      undefined,
    );
  });

  it('should pass abortSignal to fetchWithCache in raw request mode', async () => {
    const rawRequest = dedent`
      POST /api HTTP/1.1
      Host: example.com
      Content-Type: application/json

      {"key": "{{ prompt }}"}
    `;

    const provider = new HttpProvider('http://example.com', {
      config: {
        request: rawRequest,
      },
    });

    const abortController = new AbortController();
    const mockResponse = {
      data: JSON.stringify({ result: 'response text' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    await provider.callApi('test prompt', undefined, { abortSignal: abortController.signal });

    expect(fetchWithCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: abortController.signal }),
      expect.any(Number),
      expect.any(String),
      undefined,
      undefined,
    );
  });

  it('should work without abortSignal (backwards compatibility)', async () => {
    const provider = new HttpProvider('http://example.com/api', {
      config: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { key: '{{ prompt }}' },
      },
    });

    const mockResponse = {
      data: JSON.stringify({ result: 'response text' }),
      status: 200,
      statusText: 'OK',
      cached: false,
    };
    vi.mocked(fetchWithCache).mockResolvedValueOnce(mockResponse);

    // Call without options parameter
    await provider.callApi('test prompt');

    expect(fetchWithCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.not.objectContaining({ signal: expect.anything() }),
      expect.any(Number),
      expect.any(String),
      undefined,
      undefined,
    );
  });
});
