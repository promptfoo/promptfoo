import { callApi } from '@app/utils/api';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfigAgent } from './useConfigAgent';

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

const mockCallApi = vi.mocked(callApi);

function apiResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('useConfigAgent', () => {
  beforeEach(() => {
    mockCallApi.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts a session, polls it to completion, and exposes final config', async () => {
    mockCallApi
      .mockResolvedValueOnce(
        apiResponse({
          success: true,
          data: {
            sessionId: 'session-1',
            messages: [{ id: 'm1', type: 'info', content: 'started', timestamp: 1 }],
          },
        }),
      )
      .mockResolvedValueOnce(
        apiResponse({
          success: true,
          data: {
            messages: [{ id: 'm2', type: 'success', content: 'done', timestamp: 2 }],
            session: {
              id: 'session-1',
              baseUrl: 'https://api.example.com',
              phase: 'complete',
              verified: true,
              finalConfig: {
                apiType: 'openai_compatible',
                method: 'POST',
                headers: { Authorization: 'Bearer sk-test' },
                body: {},
                transformResponse: 'json.text',
              },
            },
          },
        }),
      );

    const { result } = renderHook(() => useConfigAgent());

    await act(async () => {
      await expect(result.current.startSession('https://api.example.com')).resolves.toBe(true);
    });

    await waitFor(() => expect(result.current.isComplete).toBe(true));
    expect(result.current.sessionId).toBe('session-1');
    expect(result.current.messages[result.current.messages.length - 1]?.content).toBe('done');
    expect(result.current.finalConfig?.headers.Authorization).toBe('Bearer sk-test');
    expect(mockCallApi).toHaveBeenNthCalledWith(1, '/redteam/config-agent/start', {
      method: 'POST',
      body: JSON.stringify({ baseUrl: 'https://api.example.com' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(mockCallApi).toHaveBeenNthCalledWith(2, '/redteam/config-agent/session/session-1');
  });

  it('returns false and stores API errors when start fails', async () => {
    mockCallApi.mockResolvedValueOnce(apiResponse({ error: 'blocked url' }, false));

    const { result } = renderHook(() => useConfigAgent());

    await act(async () => {
      await expect(result.current.startSession('http://localhost')).resolves.toBe(false);
    });

    expect(result.current.error).toBe('blocked url');
    expect(result.current.isLoading).toBe(false);
  });

  it('submits messages, options, confirmations, and restores masked API-key headers', async () => {
    mockCallApi
      .mockResolvedValueOnce(
        apiResponse({ success: true, data: { sessionId: 'session-1', messages: [] } }),
      )
      .mockResolvedValueOnce(
        apiResponse({
          success: true,
          data: {
            messages: [],
            session: {
              id: 'session-1',
              baseUrl: 'https://api.example.com',
              phase: 'confirming',
              verified: false,
              finalConfig: null,
            },
          },
        }),
      )
      .mockResolvedValue(
        apiResponse({
          success: true,
          data: {
            messages: [{ id: 'm3', type: 'success', content: 'authed', timestamp: 3 }],
            session: {
              id: 'session-1',
              baseUrl: 'https://api.example.com',
              phase: 'complete',
              verified: true,
              finalConfig: {
                apiType: 'openai_compatible',
                method: 'POST',
                headers: { Authorization: 'Bearer ••••cret' },
                body: {},
                transformResponse: 'json.text',
                auth: { type: 'bearer', location: 'header', headerName: 'Authorization' },
              },
            },
          },
        }),
      );

    const { result } = renderHook(() => useConfigAgent());

    await act(async () => {
      await result.current.startSession('https://api.example.com');
    });

    await act(async () => {
      await result.current.sendMessage('hello', 'azureDeployment');
      await result.current.selectOption('have_key');
      await result.current.confirm(true);
      await result.current.submitApiKey('sk-secret');
    });

    expect(mockCallApi).toHaveBeenCalledWith('/redteam/config-agent/input', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: 'session-1',
        type: 'message',
        value: 'hello',
        field: 'azureDeployment',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(mockCallApi).toHaveBeenCalledWith('/redteam/config-agent/input', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: 'session-1',
        type: 'api_key',
        value: 'sk-secret',
        field: 'apiKey',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(result.current.finalConfig?.headers.Authorization).toBe('Bearer sk-secret');
  });

  it('ignores send operations before a session exists', async () => {
    const { result } = renderHook(() => useConfigAgent());

    await act(async () => {
      await result.current.sendMessage('hello');
      await result.current.selectOption('openai');
      await result.current.confirm(false);
      await result.current.submitApiKey('sk-secret');
    });

    expect(mockCallApi).not.toHaveBeenCalled();
  });

  it('handles input failures, cancellation, reset, and unmount cleanup', async () => {
    mockCallApi.mockResolvedValueOnce(
      apiResponse({ success: true, data: { sessionId: 'session-1', messages: [] } }),
    );
    mockCallApi.mockResolvedValueOnce(
      apiResponse({
        success: true,
        data: {
          messages: [{ id: 'm1', type: 'question', content: 'wait', timestamp: 1 }],
          session: {
            id: 'session-1',
            baseUrl: 'https://api.example.com',
            phase: 'confirming',
            verified: false,
            finalConfig: null,
          },
        },
      }),
    );
    mockCallApi.mockResolvedValueOnce(apiResponse({ error: 'bad input' }, false));
    mockCallApi.mockRejectedValueOnce(new Error('delete failed'));

    const { result, unmount } = renderHook(() => useConfigAgent());

    await act(async () => {
      await result.current.startSession('https://api.example.com');
    });
    await act(async () => {
      await result.current.sendMessage('bad');
    });
    expect(result.current.error).toBe('bad input');

    await act(async () => {
      await result.current.cancelSession();
    });
    expect(result.current.sessionId).toBeNull();
    expect(result.current.messages).toEqual([]);

    await act(async () => {
      result.current.reset();
    });
    expect(result.current.isLoading).toBe(false);

    unmount();
    expect(result.current.sessionId).toBeNull();
  });
});
