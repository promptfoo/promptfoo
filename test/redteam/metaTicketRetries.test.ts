import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { runEval } from '../../src/evaluator';
import { HttpProvider } from '../../src/providers/http';
import { RateLimitRegistry } from '../../src/scheduler';
import { ResultFailureReason } from '../../src/types/index';

const pluginId = 'agentic:private-to-public-disclosure';
afterEach(() => vi.unstubAllEnvs());

async function attempt(
  status: number | 'truncated body',
  options: { scheduler?: 'on' | 'disabled'; basic?: boolean; maxRetries?: number } = {},
) {
  // A target might commit before returning 429/503. A second send with the
  // same ID would replace that effect with a different trial's observation.
  const ids: string[] = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }
    ids.push(
      body
        ? JSON.parse(body).caseId
        : (new URL(req.url ?? '/', 'http://localhost').searchParams.get('caseId') ?? ''),
    );
    if (status === 'truncated body' && ids.length === 1) {
      res.writeHead(200, { 'content-length': '1000', connection: 'close' });
      res.end('incomplete');
      return;
    }
    const code = ids.length === 1 && typeof status === 'number' ? status : 200;
    res.writeHead(code, {
      'content-type': 'text/plain',
      location: '/redirected',
      'retry-after-ms': '1',
    });
    res.end(code === 200 ? 'unexpected replay' : 'first response');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  onTestFinished(async () => {
    server.close();
    server.closeAllConnections();
    await once(server, 'close');
  });
  vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', String(options.scheduler === 'disabled'));
  vi.stubEnv('PROMPTFOO_REQUEST_BACKOFF_MS', '1');
  vi.stubEnv('PROMPTFOO_RETRY_5XX', 'true');
  const registry = options.scheduler ? new RateLimitRegistry({ maxConcurrency: 1 }) : undefined;
  onTestFinished(() => registry?.dispose());
  const agentOutcome = {
    pluginId,
    caseId: 'one-trial',
    mode: 'indirect',
    variant: 'attack',
    ...(!options.basic && { metaTicketRevision: 'blind' }),
  };
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/trial`;
  const [result] = await runEval({
    provider: new HttpProvider(url, {
      config: {
        // PUT responses have a separate body retry budget. Node fetch itself
        // can retry a GET on 421 even after all explicit retries are disabled.
        ...(status === 421
          ? { method: 'GET', queryParams: { caseId: '{{agentOutcome.caseId}}' } }
          : {
              method: status === 'truncated body' ? 'PUT' : 'POST',
              body: { caseId: '{{agentOutcome.caseId}}' },
            }),
        maxRetries: options.maxRetries,
      },
    }),
    prompt: { raw: '{{prompt}}', label: 'Owner' },
    test: {
      metadata: { agentOutcome },
      vars: { prompt: 'Triage the ticket.', artifact: 'Sync failed', agentOutcome },
    },
    rateLimitRegistry: registry,
    delay: 0,
    testIdx: 0,
    promptIdx: 0,
    repeatIndex: 0,
    isRedteam: true,
    evaluateOptions: {},
  });
  return { ids, result };
}

describe('single-dispatch Meta ticket trials', () => {
  it.each([
    [429, { scheduler: 'on' }],
    [503, { scheduler: 'on', maxRetries: 2 }],
    [429, { scheduler: 'disabled' }],
    [503, {}],
    [307, { scheduler: 'on' }],
    [421, { scheduler: 'on' }],
    ['truncated body', { scheduler: 'on', maxRetries: 3 }],
  ] as const)('sends one target request on HTTP %s with %j', async (status, options) => {
    const { ids, result } = await attempt(status, options);
    expect(ids).toEqual(['one-trial']);
    expect(result.failureReason).toBe(ResultFailureReason.ERROR);
  });

  it('leaves configured retries intact for a basic trial', async () => {
    const { ids, result } = await attempt(503, { basic: true, maxRetries: 1, scheduler: 'on' });
    expect(ids).toEqual(['one-trial', 'one-trial']);
    expect(result.failureReason).toBe(ResultFailureReason.NONE);
  });
});
