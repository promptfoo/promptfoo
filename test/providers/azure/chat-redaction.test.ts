import { once } from 'node:events';
import http from 'node:http';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled, withCacheNamespace } from '../../../src/cache';
import logger from '../../../src/logger';
import { AzureChatCompletionProvider } from '../../../src/providers/azure/chat';
import { withFetchRetryContext } from '../../../src/util/fetch/retryContext';

describe('Azure chat redaction integration', () => {
  let apiBaseUrl: string;
  let server: http.Server;
  const requestCounts = new Map<string, number>();

  beforeAll(async () => {
    server = http.createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks).toString('utf8');
      const mode = [
        'success',
        'malformed',
        'structured-error',
        'stream',
        'content-filter',
        'rate-limit',
      ].find((candidate) => body.includes(`${candidate}-prompt-secret-sentinel`));
      if (!mode) {
        response.writeHead(500);
        response.end('unknown test mode');
        return;
      }
      requestCounts.set(mode, (requestCounts.get(mode) ?? 0) + 1);

      if (mode === 'malformed') {
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.end('malformed-response-body-secret-sentinel');
        return;
      }
      if (mode === 'structured-error') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            error: {
              code: 'structured-error-code-secret-sentinel',
              message: 'structured-error-message-secret-sentinel',
            },
          }),
        );
        return;
      }
      if (mode === 'stream') {
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.end(
          'data: {"choices":[{"message":{"content":"stream-body-secret-sentinel"}}]}\n\n',
        );
        return;
      }
      if (mode === 'content-filter') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            choices: [
              {
                message: { content: 'safe content-filter output' },
                finish_reason: 'stop',
                content_filter_results: {
                  error: {
                    code: 'filter-code-secret-sentinel',
                    message: 'filter-message-secret-sentinel',
                  },
                },
              },
            ],
            usage: {},
          }),
        );
        return;
      }
      if (mode === 'rate-limit') {
        response.statusCode = 429;
        response.statusMessage = 'rate-status-secret-sentinel';
        response.setHeader('content-type', 'application/json');
        response.setHeader('x-secret-header', 'rate-header-secret-sentinel');
        response.end(
          JSON.stringify({
            error: {
              code: 'rate-code-secret-sentinel',
              message: 'rate-body-secret-sentinel',
            },
          }),
        );
        return;
      }

      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          choices: [{ message: { content: 'safe success output' }, finish_reason: 'stop' }],
          usage: { total_tokens: 3, prompt_tokens: 2, completion_tokens: 1 },
        }),
      );
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Loopback test server did not bind to a TCP port');
    }
    apiBaseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    server.close();
    await once(server, 'close');
  });

  const createProvider = (passthrough?: object) =>
    new AzureChatCompletionProvider('redaction-test', {
      config: {
        apiBaseUrl,
        apiKey: 'azure-api-key-secret-sentinel',
        passthrough,
      },
    });

  const captureLogs = () => {
    const debug = vi.spyOn(logger, 'debug').mockImplementation(() => undefined);
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    return () => JSON.stringify([...debug.mock.calls, ...warn.mock.calls, ...error.mock.calls]);
  };

  it('caches successful JSON while keeping prompts, credentials, and bodies out of logs', async () => {
    const getLogs = captureLogs();
    const provider = createProvider();
    const namespace = `azure-redaction-success-${Date.now()}`;

    const [first, second] = await withCacheEnabled(true, () =>
      withCacheNamespace(namespace, async () => {
        const firstResult = await provider.callApi('success-prompt-secret-sentinel');
        const secondResult = await provider.callApi('success-prompt-secret-sentinel');
        return [firstResult, secondResult];
      }),
    );

    expect(first).toMatchObject({ output: 'safe success output', cached: false });
    expect(second).toMatchObject({ output: 'safe success output', cached: true });
    expect(requestCounts.get('success')).toBe(1);
    expect(getLogs()).not.toContain('secret-sentinel');
  });

  it('never publishes malformed or structured error responses to cache', async () => {
    const getLogs = captureLogs();
    const provider = createProvider();

    const malformedResults = await withCacheEnabled(true, () =>
      withCacheNamespace(`azure-redaction-malformed-${Date.now()}`, async () => {
        const concurrent = await Promise.all([
          provider.callApi('malformed-prompt-secret-sentinel'),
          provider.callApi('malformed-prompt-secret-sentinel'),
        ]);
        return [...concurrent, await provider.callApi('malformed-prompt-secret-sentinel')];
      }),
    );
    const structuredResults = await withCacheEnabled(true, () =>
      withCacheNamespace(`azure-redaction-structured-${Date.now()}`, async () => [
        await provider.callApi('structured-error-prompt-secret-sentinel'),
        await provider.callApi('structured-error-prompt-secret-sentinel'),
      ]),
    );

    expect(requestCounts.get('malformed')).toBe(2);
    expect(requestCounts.get('structured-error')).toBe(2);
    for (const result of [...malformedResults, ...structuredResults]) {
      expect(result.error).toContain('status 200');
      expect(JSON.stringify(result)).not.toContain('secret-sentinel');
    }
    expect(getLogs()).not.toContain('secret-sentinel');
  });

  it('redacts forced streaming and content-filter response diagnostics', async () => {
    const getLogs = captureLogs();
    const streamingProvider = createProvider({ stream: true });
    const provider = createProvider();

    const streamResult = await withCacheNamespace(`azure-redaction-stream-${Date.now()}`, () =>
      streamingProvider.callApi('stream-prompt-secret-sentinel'),
    );
    const filterResult = await withCacheNamespace(`azure-redaction-filter-${Date.now()}`, () =>
      provider.callApi('content-filter-prompt-secret-sentinel'),
    );

    expect(streamResult.error).toContain('invalid JSON response');
    expect(filterResult.output).toBe('safe content-filter output');
    expect(JSON.stringify([streamResult, filterResult])).not.toContain('secret-sentinel');
    expect(getLogs()).not.toContain('secret-sentinel');
  });

  it('preserves safe 429 context without serializing peer-controlled fields', async () => {
    const getLogs = captureLogs();
    const provider = createProvider();

    const result = await withFetchRetryContext(0, () =>
      withCacheNamespace(`azure-redaction-rate-${Date.now()}`, () =>
        provider.callApi('rate-limit-prompt-secret-sentinel'),
      ),
    );

    expect(result).toMatchObject({
      error: 'Rate limit exceeded: HTTP 429',
      metadata: {
        rateLimitKind: 'rate_limit',
        http: {
          status: 429,
          statusText: 'Too Many Requests',
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain('secret-sentinel');
    expect(getLogs()).not.toContain('secret-sentinel');
  });
});
