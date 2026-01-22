import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { createN8nProvider, N8nProvider } from '../../src/providers/n8n';

vi.mock('../../src/cache');
vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Helper to create mock fetch responses with required fields
function createMockResponse(data: any, options: { cached?: boolean; latencyMs?: number } = {}) {
  return {
    data,
    cached: options.cached ?? false,
    latencyMs: options.latencyMs ?? 50,
    status: 200,
    statusText: 'OK',
  };
}

describe('N8nProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with url', () => {
      const provider = new N8nProvider('https://n8n.example.com/webhook/agent');
      expect(provider.id()).toBe('n8n:https://n8n.example.com/webhook/agent');
    });

    it('should create instance with custom id', () => {
      const provider = new N8nProvider('https://n8n.example.com/webhook/agent', {
        id: 'my-n8n-agent',
      });
      expect(provider.id()).toBe('my-n8n-agent');
    });

    it('should create instance with url in config', () => {
      const provider = new N8nProvider('', {
        config: { url: 'https://n8n.example.com/webhook/agent' },
      });
      expect(provider.toString()).toBe('[n8n Provider https://n8n.example.com/webhook/agent]');
    });

    it('should throw error when no url provided', () => {
      expect(() => new N8nProvider('')).toThrow('n8n provider requires a webhook URL');
    });
  });

  describe('id', () => {
    it('should return n8n provider id', () => {
      const provider = new N8nProvider('https://n8n.example.com/webhook/agent');
      expect(provider.id()).toBe('n8n:https://n8n.example.com/webhook/agent');
    });
  });

  describe('toString', () => {
    it('should return string representation', () => {
      const provider = new N8nProvider('https://n8n.example.com/webhook/agent');
      expect(provider.toString()).toBe('[n8n Provider https://n8n.example.com/webhook/agent]');
    });
  });

  describe('callApi', () => {
    it('should call n8n webhook with default body structure', async () => {
      const mockResponse = createMockResponse({ output: 'Hello from n8n!' }, { latencyMs: 100 });
      vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const provider = new N8nProvider('https://n8n.example.com/webhook/agent');
      const result = await provider.callApi('Hello');

      expect(fetchWithCache).toHaveBeenCalledWith(
        'https://n8n.example.com/webhook/agent',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'Hello' }),
        },
        expect.any(Number),
        'json',
      );

      expect(result).toEqual({
        output: 'Hello from n8n!',
        cached: false,
        latencyMs: 100,
        raw: { output: 'Hello from n8n!' },
      });
    });

    it('should handle n8n response array format', async () => {
      const mockResponse = createMockResponse([{ json: { output: 'Array response' } }]);
      vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const provider = new N8nProvider('https://n8n.example.com/webhook/agent');
      const result = await provider.callApi('Test');

      expect(result.output).toBe('Array response');
    });

    it('should handle n8n AI agent response format', async () => {
      const mockResponse = createMockResponse(
        { response: 'AI agent says hello' },
        { latencyMs: 75 },
      );
      vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const provider = new N8nProvider('https://n8n.example.com/webhook/agent');
      const result = await provider.callApi('Test');

      expect(result.output).toBe('AI agent says hello');
    });

    it('should handle n8n message.content format', async () => {
      const mockResponse = createMockResponse(
        { message: { content: 'Message content response' } },
        { latencyMs: 60 },
      );
      vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const provider = new N8nProvider('https://n8n.example.com/webhook/agent');
      const result = await provider.callApi('Test');

      expect(result.output).toBe('Message content response');
    });

    it('should use custom body template', async () => {
      const mockResponse = createMockResponse({ output: 'Response' });
      vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const provider = new N8nProvider('https://n8n.example.com/webhook/agent', {
        config: {
          body: {
            message: '{{prompt}}',
            user_id: '{{userId}}',
          },
        },
      });

      await provider.callApi('Hello', {
        vars: { userId: 'user-123' },
        prompt: { raw: 'Hello', label: 'test' },
      });

      expect(fetchWithCache).toHaveBeenCalledWith(
        'https://n8n.example.com/webhook/agent',
        expect.objectContaining({
          body: JSON.stringify({
            message: 'Hello',
            user_id: 'user-123',
          }),
        }),
        expect.any(Number),
        'json',
      );
    });

    it('should use custom headers', async () => {
      const mockResponse = createMockResponse({ output: 'Response' });
      vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const provider = new N8nProvider('https://n8n.example.com/webhook/agent', {
        config: {
          headers: {
            Authorization: 'Bearer token123',
            'X-Custom-Header': 'custom-value',
          },
        },
      });

      await provider.callApi('Hello');

      expect(fetchWithCache).toHaveBeenCalledWith(
        'https://n8n.example.com/webhook/agent',
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer token123',
            'X-Custom-Header': 'custom-value',
          },
        }),
        expect.any(Number),
        'json',
      );
    });

    it('should use custom HTTP method', async () => {
      const mockResponse = createMockResponse({ output: 'Response' });
      vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const provider = new N8nProvider('https://n8n.example.com/webhook/agent', {
        config: { method: 'PUT' },
      });

      await provider.callApi('Hello');

      expect(fetchWithCache).toHaveBeenCalledWith(
        'https://n8n.example.com/webhook/agent',
        expect.objectContaining({
          method: 'PUT',
        }),
        expect.any(Number),
        'json',
      );
    });

    it('should use custom transformResponse', async () => {
      const mockResponse = createMockResponse({ nested: { deep: { value: 'Extracted value' } } });
      vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const provider = new N8nProvider('https://n8n.example.com/webhook/agent', {
        config: {
          transformResponse: 'json.nested.deep.value',
        },
      });

      const result = await provider.callApi('Hello');

      expect(result.output).toBe('Extracted value');
    });

    it('should handle tool calls in response', async () => {
      const mockResponse = createMockResponse(
        {
          output: 'I will look that up for you',
          tool_calls: [
            { name: 'search', arguments: { query: 'weather' } },
            { name: 'get_user', arguments: { id: '123' } },
          ],
        },
        { latencyMs: 100 },
      );
      vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const provider = new N8nProvider('https://n8n.example.com/webhook/agent');
      const result = await provider.callApi('What is the weather?');

      expect(result.metadata?.toolCalls).toEqual([
        { name: 'search', arguments: { query: 'weather' } },
        { name: 'get_user', arguments: { id: '123' } },
      ]);
    });

    it('should handle n8n actions format for tool calls', async () => {
      const mockResponse = createMockResponse(
        {
          output: 'Looking up order',
          actions: [{ tool: 'order_lookup', input: { order_id: '12345' } }],
        },
        { latencyMs: 80 },
      );
      vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const provider = new N8nProvider('https://n8n.example.com/webhook/agent');
      const result = await provider.callApi('Check my order');

      expect(result.metadata?.toolCalls).toEqual([
        { name: 'order_lookup', arguments: { order_id: '12345' } },
      ]);
    });

    it('should extract and store session ID from response', async () => {
      const mockResponse = createMockResponse({
        output: 'Hello!',
        sessionId: 'session-abc-123',
      });
      vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const provider = new N8nProvider('https://n8n.example.com/webhook/agent');
      const result = await provider.callApi('Hello');

      expect(result.sessionId).toBe('session-abc-123');
      expect(provider.getSessionId()).toBe('session-abc-123');
    });

    it('should include session ID in subsequent requests', async () => {
      const mockResponse1 = createMockResponse({ output: 'Hello!', sessionId: 'session-abc-123' });
      const mockResponse2 = createMockResponse({ output: 'Follow-up response' });

      vi.mocked(fetchWithCache)
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      const provider = new N8nProvider('https://n8n.example.com/webhook/agent');

      // First call - session is established
      await provider.callApi('Hello');

      // Second call - should include session ID
      await provider.callApi('Follow-up');

      expect(fetchWithCache).toHaveBeenLastCalledWith(
        'https://n8n.example.com/webhook/agent',
        expect.objectContaining({
          body: JSON.stringify({
            prompt: 'Follow-up',
            sessionId: 'session-abc-123',
          }),
        }),
        expect.any(Number),
        'json',
      );
    });

    it('should use session header when configured', async () => {
      const mockResponse = createMockResponse({ output: 'Hello!' });
      vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const provider = new N8nProvider('https://n8n.example.com/webhook/agent', {
        config: { sessionHeader: 'X-Session-ID' },
      });

      provider.setSessionId('my-session-123');
      await provider.callApi('Hello');

      expect(fetchWithCache).toHaveBeenCalledWith(
        'https://n8n.example.com/webhook/agent',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Session-ID': 'my-session-123',
          }),
        }),
        expect.any(Number),
        'json',
      );
    });

    it('should handle fetch errors', async () => {
      vi.mocked(fetchWithCache).mockRejectedValue(new Error('Network error'));

      const provider = new N8nProvider('https://n8n.example.com/webhook/agent');
      const result = await provider.callApi('Hello');

      expect(result).toEqual({
        error: 'n8n webhook call error: Network error',
      });
    });

    it('should handle empty response', async () => {
      const mockResponse = createMockResponse(null);
      vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const provider = new N8nProvider('https://n8n.example.com/webhook/agent');
      const result = await provider.callApi('Hello');

      expect(result.output).toBe('');
    });

    it('should handle string response', async () => {
      const mockResponse = createMockResponse('Plain string response');
      vi.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const provider = new N8nProvider('https://n8n.example.com/webhook/agent');
      const result = await provider.callApi('Hello');

      expect(result.output).toBe('Plain string response');
    });
  });

  describe('session management', () => {
    it('should allow setting session ID manually', () => {
      const provider = new N8nProvider('https://n8n.example.com/webhook/agent');
      provider.setSessionId('manual-session-id');
      expect(provider.getSessionId()).toBe('manual-session-id');
    });

    it('should allow clearing session', () => {
      const provider = new N8nProvider('https://n8n.example.com/webhook/agent');
      provider.setSessionId('session-to-clear');
      expect(provider.getSessionId()).toBe('session-to-clear');

      provider.clearSession();
      expect(provider.getSessionId()).toBe('');
    });
  });
});

describe('createN8nProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should create provider from n8n:url format', () => {
    const provider = createN8nProvider('n8n:https://n8n.example.com/webhook/agent');
    expect(provider.id()).toBe('n8n:https://n8n.example.com/webhook/agent');
  });

  it('should create provider with url in config', () => {
    const provider = createN8nProvider('n8n', {
      config: { url: 'https://n8n.example.com/webhook/agent' },
    });
    expect(provider.toString()).toContain('https://n8n.example.com/webhook/agent');
  });

  it('should throw error when no url provided', () => {
    expect(() => createN8nProvider('n8n')).toThrow('n8n provider requires a webhook URL');
  });

  it('should pass config options to provider', () => {
    const provider = createN8nProvider('n8n:https://n8n.example.com/webhook/agent', {
      id: 'custom-id',
      config: {
        method: 'PUT',
        headers: { 'X-Custom': 'value' },
      },
    });
    expect(provider.id()).toBe('custom-id');
  });
});
