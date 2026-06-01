import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/util/fetch/index', async () => {
  const actual = await vi.importActual<typeof import('../../../src/util/fetch/index')>(
    '../../../src/util/fetch/index',
  );
  return {
    ...actual,
    fetchWithProxy: vi.fn(),
    fetchWithTimeout: vi.fn(),
  };
});

vi.mock('../../../src/util/time', async () => {
  const actual =
    await vi.importActual<typeof import('../../../src/util/time')>('../../../src/util/time');
  return {
    ...actual,
    sleep: vi.fn().mockResolvedValue(undefined),
  };
});

import { loadApiProvider } from '../../../src/providers';
import { A2AProvider } from '../../../src/providers/a2a';
import { fetchWithProxy, fetchWithTimeout } from '../../../src/util/fetch/index';
import { sleep } from '../../../src/util/time';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/a2a+json' },
    status: 200,
    statusText: 'OK',
    ...init,
  });
}

function sseResponse(events: unknown[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
        controller.close();
      },
    }),
    {
      headers: { 'Content-Type': 'text/event-stream' },
      status: 200,
      statusText: 'OK',
    },
  );
}

function provider(config: Record<string, unknown> = {}) {
  return new A2AProvider('a2a:https://agent.example.com/a2a/v1', { config });
}

describe('A2AProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(sleep).mockResolvedValue(undefined);
  });

  it('loads from the provider registry with a bare id and shorthand url', async () => {
    await expect(loadApiProvider('a2a')).resolves.toBeInstanceOf(A2AProvider);
    const loaded = await loadApiProvider('a2a:https://agent.example.com/a2a/v1');
    expect(loaded).toBeInstanceOf(A2AProvider);
    expect(loaded.config.url).toBe('https://agent.example.com/a2a/v1');
  });

  it('uses the shorthand url when config.url is blank', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        message: {
          role: 'ROLE_AGENT',
          parts: [{ text: 'blank url response' }],
        },
      }),
    );

    const result = await provider({ url: '' }).callApi('hi');

    expect(result.output).toBe('blank url response');
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://agent.example.com/a2a/v1/message:send',
      expect.objectContaining({ method: 'POST' }),
      expect.any(Number),
    );
  });

  it('sends a non-streaming message and extracts the direct message text', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        message: {
          role: 'ROLE_AGENT',
          parts: [{ text: 'hello from a2a' }],
        },
      }),
    );

    const result = await provider({
      headers: { Authorization: 'Bearer {{token}}' },
      message: { role: 'ROLE_USER', parts: [{ text: 'Question: {{prompt}}' }] },
    }).callApi('hi', {
      prompt: { raw: '{{prompt}}', label: 'prompt' },
      vars: { token: 'secret-token', sessionId: 'session-1' },
      testCaseId: 'case-1',
    });

    expect(result.output).toBe('hello from a2a');
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://agent.example.com/a2a/v1/message:send',
      expect.objectContaining({
        body: expect.stringContaining('Question: hi'),
        headers: expect.objectContaining({
          Authorization: 'Bearer secret-token',
          'A2A-Version': '1.0',
          'Content-Type': 'application/a2a+json',
        }),
        method: 'POST',
      }),
      expect.any(Number),
    );
    const requestBody = JSON.parse(vi.mocked(fetchWithTimeout).mock.calls[0]?.[1]?.body as string);
    expect(requestBody.message.contextId).toBe('session-1');
    expect(requestBody.message.messageId).toMatch(/^promptfoo-/);
  });

  it('discovers an HTTP+JSON interface from the agent card', async () => {
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(
        jsonResponse({
          capabilities: { streaming: false },
          supportedInterfaces: [
            {
              protocolBinding: 'JSONRPC',
              url: 'https://agent.example.com/jsonrpc',
            },
            {
              protocolBinding: 'HTTP+JSON',
              protocolVersion: '1.0',
              tenant: 'tenant-a',
              url: 'https://agent.example.com/a2a/http',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          message: {
            role: 'ROLE_AGENT',
            parts: [{ text: 'card response' }],
          },
        }),
      );

    const result = await new A2AProvider('a2a', {
      config: {
        agentCardUrl: 'https://agent.example.com/.well-known/agent-card.json',
      },
    }).callApi('hello');

    expect(result.output).toBe('card response');
    expect(fetchWithTimeout).toHaveBeenNthCalledWith(
      2,
      'https://agent.example.com/a2a/http/message:send',
      expect.objectContaining({
        body: expect.stringContaining('"tenant":"tenant-a"'),
        headers: expect.objectContaining({ 'A2A-Version': '1.0' }),
      }),
      expect.any(Number),
    );
  });

  it('discovers HTTP+JSON from legacy additionalInterfaces agent cards', async () => {
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(
        jsonResponse({
          preferredTransport: 'JSONRPC',
          url: 'https://agent.example.com/jsonrpc',
          additionalInterfaces: [
            {
              transport: 'HTTP+JSON',
              protocolVersion: '1.0',
              tenant: 'tenant-a',
              url: 'https://agent.example.com/a2a/http',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          message: {
            role: 'ROLE_AGENT',
            parts: [{ text: 'legacy card response' }],
          },
        }),
      );

    const result = await new A2AProvider('a2a', {
      config: {
        agentCardUrl: 'https://agent.example.com/.well-known/agent-card.json',
      },
    }).callApi('hello');

    expect(result.output).toBe('legacy card response');
    expect(fetchWithTimeout).toHaveBeenNthCalledWith(
      2,
      'https://agent.example.com/a2a/http/message:send',
      expect.objectContaining({
        body: expect.stringContaining('"tenant":"tenant-a"'),
      }),
      expect.any(Number),
    );
  });

  it('fails fast when an agent card only advertises JSON-RPC', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        preferredTransport: 'JSONRPC',
        url: 'https://agent.example.com/jsonrpc',
      }),
    );

    const result = await new A2AProvider('a2a', {
      config: {
        agentCardUrl: 'https://agent.example.com/.well-known/agent-card.json',
      },
    }).callApi('hello');

    expect(result.error).toContain('does not advertise a supported HTTP+JSON interface');
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
  });

  it('applies bearer auth to agent card and operation requests', async () => {
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(
        jsonResponse({
          supportedInterfaces: [
            {
              protocolBinding: 'HTTP+JSON',
              url: 'https://agent.example.com/a2a/http',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          message: {
            role: 'ROLE_AGENT',
            parts: [{ text: 'authenticated response' }],
          },
        }),
      );

    const result = await new A2AProvider('a2a', {
      config: {
        agentCardUrl: 'https://agent.example.com/.well-known/agent-card.json',
        auth: { type: 'bearer', token: '{{A2A_TOKEN}}' },
      },
    }).callApi('hello', {
      prompt: { raw: '{{prompt}}', label: 'prompt' },
      vars: { A2A_TOKEN: 'secret-token' },
    });

    expect(result.output).toBe('authenticated response');
    expect(fetchWithTimeout).toHaveBeenNthCalledWith(
      1,
      'https://agent.example.com/.well-known/agent-card.json',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer secret-token' }),
        method: 'GET',
      }),
      expect.any(Number),
    );
    expect(fetchWithTimeout).toHaveBeenNthCalledWith(
      2,
      'https://agent.example.com/a2a/http/message:send',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer secret-token' }),
        method: 'POST',
      }),
      expect.any(Number),
    );
  });

  it('supports basic auth headers', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        message: {
          role: 'ROLE_AGENT',
          parts: [{ text: 'basic auth response' }],
        },
      }),
    );

    const result = await provider({
      auth: { type: 'basic', username: 'user', password: 'pass' },
    }).callApi('hi');

    expect(result.output).toBe('basic auth response');
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://agent.example.com/a2a/v1/message:send',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('user:pass').toString('base64')}`,
        }),
      }),
      expect.any(Number),
    );
  });

  it('supports api key auth in query parameters', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        message: {
          role: 'ROLE_AGENT',
          parts: [{ text: 'query auth response' }],
        },
      }),
    );

    const result = await provider({
      auth: {
        keyName: 'api_key',
        placement: 'query',
        type: 'api_key',
        value: '{{A2A_API_KEY}}',
      },
    }).callApi('hi', {
      prompt: { raw: '{{prompt}}', label: 'prompt' },
      vars: { A2A_API_KEY: 'query-secret' },
    });

    expect(result.output).toBe('query auth response');
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://agent.example.com/a2a/v1/message:send?api_key=query-secret',
      expect.objectContaining({ method: 'POST' }),
      expect.any(Number),
    );
  });

  it('fetches OAuth client credentials tokens for operation requests', async () => {
    vi.mocked(fetchWithProxy).mockResolvedValueOnce(
      jsonResponse({
        access_token: 'oauth-token',
        expires_in: 3600,
      }),
    );
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        message: {
          role: 'ROLE_AGENT',
          parts: [{ text: 'oauth response' }],
        },
      }),
    );

    const result = await provider({
      auth: {
        clientId: '{{clientId}}',
        clientSecret: '{{clientSecret}}',
        grantType: 'client_credentials',
        scopes: ['a2a.send'],
        tokenUrl: 'https://auth.example.com/oauth/token',
        type: 'oauth',
      },
    }).callApi('hi', {
      prompt: { raw: '{{prompt}}', label: 'prompt' },
      vars: { clientId: 'client-1', clientSecret: 'client-secret' },
    });

    expect(result.output).toBe('oauth response');
    expect(fetchWithProxy).toHaveBeenCalledWith(
      'https://auth.example.com/oauth/token',
      expect.objectContaining({
        body: expect.stringContaining('client_id=client-1'),
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
        method: 'POST',
      }),
    );
    expect(fetchWithProxy).toHaveBeenCalledWith(
      'https://auth.example.com/oauth/token',
      expect.objectContaining({
        body: expect.stringContaining('scope=a2a.send'),
      }),
    );
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://agent.example.com/a2a/v1/message:send',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer oauth-token' }),
      }),
      expect.any(Number),
    );
  });

  it('extracts output from a completed task artifact', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        task: {
          id: 'task-1',
          status: { state: 'TASK_STATE_COMPLETED' },
          artifacts: [{ parts: [{ text: 'artifact text' }] }],
        },
      }),
    );

    const result = await provider().callApi('hi');

    expect(result.output).toBe('artifact text');
    expect(result.metadata?.a2a).toMatchObject({
      mode: 'send',
      taskId: 'task-1',
      taskState: 'TASK_STATE_COMPLETED',
    });
  });

  it('prefers completed task artifacts over status messages', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        task: {
          id: 'task-1',
          status: {
            state: 'TASK_STATE_COMPLETED',
            message: { parts: [{ text: 'Completed lifecycle status' }] },
          },
          artifacts: [{ parts: [{ text: 'Final artifact text' }] }],
        },
      }),
    );

    const result = await provider().callApi('hi');

    expect(result.output).toBe('Final artifact text');
  });

  it('falls back to completed task status text when artifacts are absent', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        task: {
          id: 'task-1',
          status: {
            state: 'TASK_STATE_COMPLETED',
            message: { parts: [{ text: 'Completed fallback text' }] },
          },
        },
      }),
    );

    const result = await provider().callApi('hi');

    expect(result.output).toBe('Completed fallback text');
  });

  it('accepts bare task responses from message:send', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        id: 'task-1',
        status: { state: 'TASK_STATE_COMPLETED' },
        artifacts: [{ parts: [{ text: 'bare task text' }] }],
      }),
    );

    const result = await provider().callApi('hi');

    expect(result.output).toBe('bare task text');
  });

  it('polls non-terminal tasks until completion', async () => {
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(
        jsonResponse({
          task: {
            id: 'task-1',
            status: { state: 'TASK_STATE_WORKING' },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'task-1',
          status: { state: 'TASK_STATE_COMPLETED' },
          artifacts: [{ parts: [{ text: 'done later' }] }],
        }),
      );

    const result = await provider({ polling: { intervalMs: 0, timeoutMs: 1000 } }).callApi('hi');

    expect(result.output).toBe('done later');
    expect(fetchWithTimeout).toHaveBeenNthCalledWith(
      2,
      'https://agent.example.com/a2a/v1/tasks/task-1',
      expect.objectContaining({ method: 'GET' }),
      expect.any(Number),
    );
  });

  it('includes tenant query parameter when polling tasks', async () => {
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(
        jsonResponse({
          task: {
            id: 'task-1',
            status: { state: 'TASK_STATE_WORKING' },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'task-1',
          status: { state: 'TASK_STATE_COMPLETED' },
          artifacts: [{ parts: [{ text: 'tenant done' }] }],
        }),
      );

    const result = await provider({
      polling: { intervalMs: 0, timeoutMs: 1000 },
      tenant: 'tenant-a',
    }).callApi('hi');

    expect(result.output).toBe('tenant done');
    expect(fetchWithTimeout).toHaveBeenNthCalledWith(
      2,
      'https://agent.example.com/a2a/v1/tasks/task-1?tenant=tenant-a',
      expect.objectContaining({ method: 'GET' }),
      expect.any(Number),
    );
  });

  it('recognizes standard completed task state spelling', async () => {
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(
        jsonResponse({
          task: {
            id: 'task-1',
            status: { state: 'working' },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'task-1',
          status: { state: 'completed' },
          artifacts: [{ parts: [{ text: 'standard done' }] }],
        }),
      );

    const result = await provider({ polling: { intervalMs: 0, timeoutMs: 1000 } }).callApi('hi');

    expect(result.output).toBe('standard done');
    expect(sleep).not.toHaveBeenCalled();
  });

  it.each([
    ['TASK_STATE_FAILED', 'failed'],
    ['TASK_STATE_CANCELED', 'canceled'],
    ['TASK_STATE_REJECTED', 'rejected'],
    ['TASK_STATE_INPUT_REQUIRED', 'requires additional input'],
    ['TASK_STATE_AUTH_REQUIRED', 'requires additional authentication'],
  ])('returns an error for %s tasks', async (state, expected) => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        task: {
          id: 'task-1',
          status: {
            state,
            message: { parts: [{ text: 'state detail' }] },
          },
        },
      }),
    );

    const result = await provider().callApi('hi');

    expect(result.error).toContain(expected);
    expect(result.error).toContain('state detail');
  });

  it.each([
    ['failed', 'failed'],
    ['canceled', 'canceled'],
    ['rejected', 'rejected'],
    ['input-required', 'requires additional input'],
    ['auth-required', 'requires additional authentication'],
  ])('returns an error for standard %s tasks', async (state, expected) => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        task: {
          id: 'task-1',
          status: {
            state,
            message: { parts: [{ text: 'state detail' }] },
          },
        },
      }),
    );

    const result = await provider().callApi('hi');

    expect(result.error).toContain(expected);
    expect(result.error).toContain('state detail');
  });

  it('filters user messages from history fallback output', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        task: {
          id: 'task-1',
          status: { state: 'completed' },
          history: [
            { role: 'ROLE_USER', parts: [{ text: 'user prompt' }] },
            { role: 'ROLE_AGENT', parts: [{ text: 'agent answer' }] },
          ],
        },
      }),
    );

    const result = await provider().callApi('hi');

    expect(result.output).toBe('agent answer');
  });

  it('falls back to raw JSON when history only contains user messages', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        task: {
          id: 'task-1',
          status: { state: 'completed' },
          history: [{ role: 'ROLE_USER', parts: [{ text: 'user prompt' }] }],
        },
      }),
    );

    const result = await provider().callApi('hi');

    expect(result.output).toContain('"history"');
    expect(result.output).toContain('"user prompt"');
  });

  it('consumes a message-only SSE stream', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      sseResponse([
        {
          message: {
            role: 'ROLE_AGENT',
            parts: [{ text: 'streamed text' }],
          },
        },
      ]),
    );

    const result = await provider({ mode: 'stream' }).callApi('hi');

    expect(result.output).toBe('streamed text');
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://agent.example.com/a2a/v1/message:stream',
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'text/event-stream' }),
      }),
      expect.any(Number),
    );
  });

  it('accumulates task lifecycle SSE events', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      sseResponse([
        {
          task: {
            id: 'task-1',
            status: { state: 'TASK_STATE_WORKING' },
          },
        },
        {
          artifactUpdate: {
            taskId: 'task-1',
            artifact: { parts: [{ text: 'partial artifact' }] },
          },
        },
        {
          statusUpdate: {
            taskId: 'task-1',
            status: { state: 'TASK_STATE_COMPLETED' },
          },
        },
      ]),
    );

    const result = await provider({ mode: 'stream' }).callApi('hi');

    expect(result.output).toBe('partial artifact');
    expect(result.metadata?.a2a).toMatchObject({
      mode: 'stream',
      taskId: 'task-1',
      taskState: 'TASK_STATE_COMPLETED',
    });
  });

  it('returns a provider error for malformed SSE events', async () => {
    const encoder = new TextEncoder();
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('data: {not-json}\n\n'));
            controller.close();
          },
        }),
        { status: 200, statusText: 'OK' },
      ),
    );

    const result = await provider({ mode: 'stream' }).callApi('hi');

    expect(result.error).toContain('A2A Provider error');
  });

  it('forwards abort signals to requests', async () => {
    const controller = new AbortController();
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        message: {
          role: 'ROLE_AGENT',
          parts: [{ text: 'ok' }],
        },
      }),
    );

    await provider().callApi('hi', undefined, { abortSignal: controller.signal });

    expect(fetchWithTimeout).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
      expect.any(Number),
    );
  });

  it('applies a custom transformResponse', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        message: {
          role: 'ROLE_AGENT',
          parts: [{ text: 'original' }],
        },
      }),
    );

    const result = await provider({
      transformResponse: '(result, text, context) => ({ output: `${context.mode}:${text}` })',
    }).callApi('hi');

    expect(result.output).toBe('send:original');
  });

  it('supports HTTP-style json variable in string transformResponse', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        task: {
          id: 'task-1',
          status: { state: 'TASK_STATE_COMPLETED' },
          artifacts: [{ parts: [{ text: 'artifact text' }] }],
        },
      }),
    );

    const result = await provider({
      transformResponse: '({ output: `${json.task.id}:${text}` })',
    }).callApi('hi');

    expect(result.output).toBe('task-1:artifact text');
  });

  it('keeps result as an alias in string transformResponse', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        task: {
          id: 'task-1',
          status: { state: 'TASK_STATE_COMPLETED' },
          artifacts: [{ parts: [{ text: 'artifact text' }] }],
        },
      }),
    );

    const result = await provider({
      transformResponse: '({ output: result.task.id })',
    }).callApi('hi');

    expect(result.output).toBe('task-1');
  });
});
