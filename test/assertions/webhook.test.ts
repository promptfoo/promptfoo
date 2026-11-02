import { createServer, type Server } from 'http';
import { AddressInfo } from 'net';

import { afterEach, describe, expect, it } from 'vitest';
import { handleWebhook } from '../../src/assertions/webhook';
import { mockProcessEnv } from '../util/utils';

import type { AssertionParams } from '../../src/types/index';

const servers: Server[] = [];

afterEach(async () => {
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
    const restoreEnv = mockProcessEnv({ WEBHOOK_TIMEOUT: '1000' });
    try {
      const url = await startServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        // Send the headers and a partial body, then never finish the response.
        res.write('{"pass":');
      });

      const startedAt = Date.now();
      const result = await Promise.race([
        handleWebhook(webhookParams(url)),
        new Promise<never>((_, reject) => {
          const watchdog = setTimeout(
            () => reject(new Error('handleWebhook did not honor WEBHOOK_TIMEOUT')),
            5000,
          );
          watchdog.unref();
        }),
      ]);
      const elapsed = Date.now() - startedAt;

      expect(result.pass).toBe(false);
      expect(result.reason).toBe('Webhook error: Request timed out after 1000 ms');
      expect(elapsed).toBeGreaterThanOrEqual(900);
      expect(elapsed).toBeLessThan(4000);
    } finally {
      restoreEnv();
    }
  });
});
