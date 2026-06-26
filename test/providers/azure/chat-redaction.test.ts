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
  let sawSilentHeader = false;
  const requestCounts = new Map<string, number>();

  beforeAll(async () => {
    server = http.createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks).toString('utf8');
      sawSilentHeader ||= request.headers['x-promptfoo-silent'] !== undefined;
      const mode = [
        'success',
        'malformed',
        'malformed-choice',
        'structured-error',
        'server-error',
        'stream',
        'refusal',
        'audio',
        'content-filter',
        'prompt-filter-error',
        'soft-rate-limit',
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
      if (mode === 'malformed-choice') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            choices: [{}],
            private: 'malformed-choice-body-secret-sentinel',
          }),
        );
        return;
      }
      if (mode === 'server-error') {
        response.statusCode = 502;
        response.statusMessage = 'server-status-secret-sentinel';
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'server-error-body-secret-sentinel',
                },
              },
            ],
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
      if (mode === 'refusal') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: null,
                  refusal: 'safe refusal output',
                },
                finish_reason: 'stop',
              },
            ],
            usage: { total_tokens: 3, prompt_tokens: 2, completion_tokens: 1 },
          }),
        );
        return;
      }
      if (mode === 'audio') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: null,
                  refusal: null,
                  audio: {
                    id: 'audio-id',
                    expires_at: 1_800_000_000,
                    data: 'audio-data',
                    transcript: 'safe audio transcript',
                    format: 'mp3',
                  },
                },
                finish_reason: 'stop',
              },
            ],
            usage: { total_tokens: 3, prompt_tokens: 2, completion_tokens: 1 },
          }),
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
      if (mode === 'prompt-filter-error') {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            choices: [
              {
                message: { role: 'assistant', content: 'safe prompt-filter output' },
                finish_reason: 'stop',
              },
            ],
            prompt_filter_results: [
              {
                prompt_index: 0,
                content_filter_results: {
                  error: {
                    code: 'prompt-filter-code-secret-sentinel',
                    message: 'prompt-filter-message-secret-sentinel',
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
      if (mode === 'soft-rate-limit') {
        response.writeHead(200, {
          'content-type': 'application/json',
          'x-ratelimit-remaining-requests': '0',
        });
        response.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'soft-rate-limit-body-secret-sentinel',
                },
              },
            ],
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

  const createProvider = (passthrough?: object, headers?: Record<string, string>) =>
    new AzureChatCompletionProvider('redaction-test', {
      config: {
        apiBaseUrl,
        apiKey: 'azure-api-key-secret-sentinel',
        headers,
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
    const previousRequests = requestCounts.get('success') ?? 0;

    const [first, second] = await withCacheEnabled(true, () =>
      withCacheNamespace(namespace, async () => {
        const firstResult = await provider.callApi('success-prompt-secret-sentinel');
        const secondResult = await provider.callApi('success-prompt-secret-sentinel');
        return [firstResult, secondResult];
      }),
    );

    expect(first).toMatchObject({ output: 'safe success output', cached: false });
    expect(second).toMatchObject({ output: 'safe success output', cached: true });
    expect(requestCounts.get('success')).toBe(previousRequests + 1);
    expect(sawSilentHeader).toBe(false);
    expect(getLogs()).not.toContain('secret-sentinel');
  });

  it('preserves and caches documented refusal and audio responses', async () => {
    const getLogs = captureLogs();
    const provider = createProvider();
    const previousRefusals = requestCounts.get('refusal') ?? 0;
    const previousAudio = requestCounts.get('audio') ?? 0;

    const [firstRefusal, cachedRefusal, firstAudio, cachedAudio] = await withCacheEnabled(
      true,
      () =>
        withCacheNamespace(`azure-redaction-multimodal-${Date.now()}`, async () => [
          await provider.callApi('refusal-prompt-secret-sentinel'),
          await provider.callApi('refusal-prompt-secret-sentinel'),
          await provider.callApi('audio-prompt-secret-sentinel'),
          await provider.callApi('audio-prompt-secret-sentinel'),
        ]),
    );

    expect(firstRefusal).toMatchObject({
      output: 'safe refusal output',
      isRefusal: true,
      cached: false,
      guardrails: { flagged: true, flaggedInput: false, flaggedOutput: true },
    });
    expect(cachedRefusal).toMatchObject({
      output: 'safe refusal output',
      isRefusal: true,
      cached: true,
    });
    expect(firstAudio).toMatchObject({
      output: 'safe audio transcript',
      cached: false,
      audio: {
        id: 'audio-id',
        expiresAt: 1_800_000_000,
        data: 'audio-data',
        transcript: 'safe audio transcript',
        format: 'mp3',
      },
    });
    expect(cachedAudio).toMatchObject({
      output: 'safe audio transcript',
      cached: true,
    });
    expect(requestCounts.get('refusal')).toBe(previousRefusals + 1);
    expect(requestCounts.get('audio')).toBe(previousAudio + 1);
    expect(getLogs()).not.toContain('secret-sentinel');
  });

  it('cannot disable silent diagnostics with a differently cased custom header', async () => {
    const getLogs = captureLogs();
    const provider = createProvider(undefined, { 'X-Promptfoo-Silent': 'false' });
    const previousRequests = requestCounts.get('success') ?? 0;

    const result = await withCacheNamespace(`azure-redaction-header-${Date.now()}`, () =>
      provider.callApi('success-prompt-secret-sentinel'),
    );

    expect(result.output).toBe('safe success output');
    expect(requestCounts.get('success')).toBe(previousRequests + 1);
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

  it('rejects malformed choices and non-2xx success-shaped bodies without caching them', async () => {
    const getLogs = captureLogs();
    const provider = createProvider();
    const malformedChoiceResults = await withCacheEnabled(true, () =>
      withCacheNamespace(`azure-redaction-choice-${Date.now()}`, async () => [
        await provider.callApi('malformed-choice-prompt-secret-sentinel'),
        await provider.callApi('malformed-choice-prompt-secret-sentinel'),
      ]),
    );
    const serverErrorResults = await withCacheEnabled(true, () =>
      withCacheNamespace(`azure-redaction-server-error-${Date.now()}`, async () => [
        await provider.callApi('server-error-prompt-secret-sentinel'),
        await provider.callApi('server-error-prompt-secret-sentinel'),
      ]),
    );

    expect(requestCounts.get('malformed-choice')).toBe(2);
    expect(requestCounts.get('server-error')).toBe(2);
    for (const result of [...malformedChoiceResults, ...serverErrorResults]) {
      expect(result.error).toMatch(/API response error \(status (200|502)\)/);
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
    const filterResults = await withCacheEnabled(true, () =>
      withCacheNamespace(`azure-redaction-filter-${Date.now()}`, async () => [
        await provider.callApi('content-filter-prompt-secret-sentinel'),
        await provider.callApi('content-filter-prompt-secret-sentinel'),
      ]),
    );

    expect(streamResult.error).toContain('invalid JSON response');
    expect(filterResults.map((result) => result.output)).toEqual([
      'safe content-filter output',
      'safe content-filter output',
    ]);
    expect(requestCounts.get('content-filter')).toBe(2);
    expect(JSON.stringify([streamResult, filterResults])).not.toContain('secret-sentinel');
    expect(getLogs()).not.toContain('secret-sentinel');
  });

  it('does not cache prompt-filter system errors', async () => {
    const getLogs = captureLogs();
    const provider = createProvider();
    const previousRequests = requestCounts.get('prompt-filter-error') ?? 0;

    const results = await withCacheEnabled(true, () =>
      withCacheNamespace(`azure-redaction-prompt-filter-${Date.now()}`, async () => [
        await provider.callApi('prompt-filter-error-prompt-secret-sentinel'),
        await provider.callApi('prompt-filter-error-prompt-secret-sentinel'),
      ]),
    );

    expect(results.map((result) => result.output)).toEqual([
      'safe prompt-filter output',
      'safe prompt-filter output',
    ]);
    expect(results.map((result) => result.cached)).toEqual([false, false]);
    expect(requestCounts.get('prompt-filter-error')).toBe(previousRequests + 2);
    expect(JSON.stringify(results)).not.toContain('secret-sentinel');
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

  it('preserves scheduler-visible context for header-only throttling', async () => {
    const getLogs = captureLogs();
    const provider = createProvider();

    const result = await withFetchRetryContext(0, () =>
      withCacheNamespace(`azure-redaction-soft-rate-${Date.now()}`, () =>
        provider.callApi('soft-rate-limit-prompt-secret-sentinel'),
      ),
    );

    expect(result).toMatchObject({
      error: 'Rate limit exceeded: HTTP 200',
      metadata: {
        rateLimitKind: 'rate_limit',
        http: {
          status: 200,
          statusText: 'Rate Limited',
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain('secret-sentinel');
    expect(getLogs()).not.toContain('secret-sentinel');
  });
});
