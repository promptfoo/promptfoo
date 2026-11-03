import { createServer, type Server } from 'http';
import { AddressInfo } from 'net';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleWebhook } from '../../src/assertions/webhook';
import { mockProcessEnv, PROXY_ENV_KEYS } from '../util/utils';

import type { AssertionParams } from '../../src/types/index';

const transport = vi.hoisted(() => vi.fn());
vi.mock('../../src/util/fetch/monkeyPatchFetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/util/fetch/monkeyPatchFetch')>()),
  monkeyPatchFetch: transport,
}));

const servers: Server[] = [];
let restoreProxyEnv = () => {};

beforeEach(() => {
  // Keep loopback requests off any developer/CI proxy that lacks a NO_PROXY
  // exemption for 127.0.0.1.
  restoreProxyEnv = mockProcessEnv(
    Object.fromEntries(PROXY_ENV_KEYS.map((key) => [key, undefined])),
  );
  transport.mockImplementation((url: RequestInfo, options?: RequestInit) => fetch(url, options));
});

afterEach(async () => {
  restoreProxyEnv();
  transport.mockReset();
  vi.useRealTimers();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

async function startServer(handler: Parameters<typeof createServer>[1]): Promise<string> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/webhook`;
}

function webhookParams(url: string): AssertionParams {
  const providerResponse = { output: 'Expected output' };
  return {
    assertion: { type: 'webhook', value: url },
    baseType: 'webhook',
    assertionValueContext: {
      prompt: 'Some prompt',
      vars: {},
      test: {},
      logProbs: undefined,
      provider: undefined,
      providerResponse,
    },
    inverse: false,
    output: 'Expected output',
    outputString: 'Expected output',
    prompt: 'Some prompt',
    providerResponse,
    renderedValue: url,
    test: {},
  };
}

describe('handleWebhook', () => {
  it('reads a completed webhook response body', async () => {
    const url = await startServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ pass: true, reason: 'ok' }));
    });

    await expect(handleWebhook(webhookParams(url))).resolves.toMatchObject({
      pass: true,
      score: 1,
      reason: 'ok',
    });
  });

  it('times out a webhook response whose body stalls after the headers', async () => {
    vi.useFakeTimers();
    const restoreEnv = mockProcessEnv({ WEBHOOK_TIMEOUT: '1000' });
    // Send a partial body and never close it: the deadline must cover the body
    // read rather than only the header exchange.
    const stalledBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"pass":'));
      },
    });
    transport.mockResolvedValue(
      new Response(stalledBody, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    try {
      const resultPromise = handleWebhook(webhookParams('http://127.0.0.1/webhook'));
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.pass).toBe(false);
      expect(result.reason).toBe('Webhook error: Request timed out after 1000 ms');
    } finally {
      restoreEnv();
      vi.useRealTimers();
    }
  });
});
