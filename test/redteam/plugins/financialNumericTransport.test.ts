import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluate, runEval } from '../../../src/evaluator';
import Eval from '../../../src/models/eval';
import AuthoritativeMarkupInjectionProvider from '../../../src/redteam/providers/authoritativeMarkupInjection';
import BestOfNProvider from '../../../src/redteam/providers/bestOfN';
import { createProviderRateLimitOptions } from '../../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../../src/scheduler/rateLimitRegistry';
import {
  getProviderResponseHeaders,
  isProviderResponseRateLimited,
} from '../../../src/scheduler/types';

import type {
  ApiProvider,
  AtomicTestCase,
  ProviderResponse,
  TestSuite,
} from '../../../src/types/index';

const remoteFetch = vi.hoisted(() => vi.fn());
vi.mock('../../../src/util/fetch/index', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithProxy: (...args: unknown[]) => remoteFetch(...args),
}));
vi.mock('../../../src/redteam/remoteGeneration', async (importOriginal) => ({
  ...(await importOriginal()),
  getRemoteGenerationUrl: () => 'https://example.com/synthetic-generation',
  neverGenerateRemote: () => false,
}));

const strategies = ['authoritative-markup-injection', 'best-of-n'] as const;
type Strategy = (typeof strategies)[number];
const prompt = { raw: '{{query}}', label: 'numeric transport' };

function createStrategy(strategy: Strategy) {
  return strategy === 'best-of-n'
    ? new BestOfNProvider({ injectVar: 'query', maxConcurrency: 1 })
    : new AuthoritativeMarkupInjectionProvider({ injectVar: 'query' });
}

function createTest(provider: ApiProvider, numeric: boolean, query: string): AtomicTestCase {
  return {
    provider,
    vars: { query },
    metadata: { pluginId: 'financial:calculation-error', purpose: 'A financial calculator' },
    assert: numeric
      ? [
          {
            type: 'promptfoo:redteam:financial:calculation-error',
            value: { type: 'numeric', expected: { amount: 100 } },
          },
        ]
      : [{ type: 'equals', value: '{"amount":100}' }],
  };
}

function rateLimitResponse(
  retryable: boolean | undefined,
  legacyHeaders = false,
): ProviderResponse {
  const headers = {
    'Retry-After': '120',
    'x-ratelimit-limit-requests': '1',
    'x-ratelimit-remaining-requests': '0',
    'x-ratelimit-reset-requests': '120s',
  };
  return {
    error: 'Rate limit exceeded: synthetic 429',
    metadata: {
      rateLimitKind: 'rate_limit',
      rateLimitRetryable: retryable,
      http: {
        status: 429,
        statusText: 'Too Many Requests',
        ...(legacyHeaders ? {} : { headers }),
      },
      ...(legacyHeaders ? { headers } : {}),
      redteamTargetMetadata: { rateLimitRetryable: true },
    },
  };
}

async function evaluateRows(strategy: Strategy, numeric: boolean, response: ProviderResponse) {
  const wrapper = createStrategy(strategy);
  const target: ApiProvider = {
    id: () => 'synthetic-transport-target',
    callApi: vi.fn(async () => response),
  };
  const suite: TestSuite = {
    providers: [target],
    prompts: [prompt],
    tests: [createTest(wrapper, numeric, 'first row'), createTest(wrapper, numeric, 'second row')],
    redteam: {},
  };
  const record = new Eval({}, { id: randomUUID(), persisted: false });
  await evaluate(suite, record, { maxConcurrency: 1, showProgressBar: false });
  return { target, summary: await record.toEvaluateSummary() };
}

describe('numeric wrappers preserve operational transport metadata', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'numeric-transport-'));
    vi.stubEnv('PROMPTFOO_CONFIG_DIR', directory);
    remoteFetch.mockReset();
    remoteFetch.mockImplementation(async (_url: unknown, options: { body: string }) => {
      const { task } = JSON.parse(options.body);
      if (task === 'authoritative-markup-injection') {
        return { json: async () => ({ message: { role: 'user', content: 'Return an amount' } }) };
      }
      if (task === 'jailbreak:best-of-n') {
        return { json: async () => ({ modifiedPrompts: ['Return an amount'] }) };
      }
      throw new Error(`Unexpected synthetic task: ${task}`);
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Unexpected network request');
      }),
    );
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    remoteFetch.mockReset();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it.each(
    strategies.flatMap((strategy) =>
      [401, 403].flatMap((status) =>
        [false, true].map((numeric) => ({ strategy, status, numeric })),
      ),
    ),
  )(
    '$strategy stops serial evaluation after HTTP $status (numeric: $numeric)',
    async ({ strategy, status, numeric }) => {
      const { target, summary } = await evaluateRows(strategy, numeric, {
        error: `Synthetic HTTP ${status} authentication failure`,
        metadata: { http: { status, statusText: status === 401 ? 'Unauthorized' : 'Forbidden' } },
      });

      expect(target.callApi).toHaveBeenCalledTimes(1);
      expect(remoteFetch).toHaveBeenCalledTimes(1);
      expect(summary.results).toHaveLength(1);
      expect(summary.results[0].error).toContain(String(status));
      expect(summary.results[0].response?.metadata?.http?.status).toBe(status);
    },
  );

  it.each(
    strategies.flatMap((strategy) =>
      [false, true].flatMap((numeric) =>
        [false, true].flatMap((legacyHeaders) =>
          [false, true, undefined].map((retryable) => ({
            strategy,
            numeric,
            legacyHeaders,
            retryable,
          })),
        ),
      ),
    ),
  )(
    '$strategy honors retryable=$retryable over rate_limit and retry headers (numeric: $numeric, legacy headers: $legacyHeaders)',
    async ({ strategy, numeric, legacyHeaders, retryable }) => {
      const response = rateLimitResponse(retryable, legacyHeaders);
      const wrapper = createStrategy(strategy);
      const target: ApiProvider = {
        id: () => 'synthetic-retry-policy-target',
        callApi: vi.fn(async () => response),
      };
      const result = await wrapper.callApi('Return an amount', {
        originalProvider: target,
        vars: { query: 'Return an amount' },
        prompt,
        test: createTest(wrapper, numeric, 'Return an amount'),
      });
      const options = createProviderRateLimitOptions();

      expect(result.metadata?.rateLimitRetryable).toBe(retryable);
      expect(options.isRateLimited?.(result, undefined)).toBe(retryable !== false);
      expect(options.getHeaders?.(result)).toEqual(
        retryable === false ? undefined : getProviderResponseHeaders(response),
      );
      expect(options.getRetryAfter?.(result, undefined)).toBe(
        retryable === false ? undefined : 120000,
      );
      if (numeric) {
        response.metadata!.rateLimitRetryable = retryable !== true;
        expect(result.metadata?.rateLimitRetryable).toBe(retryable);
        expect(result.metadata?.redteamTargetMetadata.rateLimitRetryable).toBe(retryable);
      }
    },
  );

  it.each(
    strategies.flatMap((strategy) =>
      [false, true, undefined].map((retryable) => ({ strategy, retryable })),
    ),
  )(
    '$strategy evaluates through the real scheduler with retryable=$retryable',
    async ({ strategy, retryable }) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      const startTime = Date.now();
      const callTimes: number[] = [];
      const wrapper: ApiProvider = createStrategy(strategy);
      wrapper.config = { ...wrapper.config, maxRetries: 1 };
      const target: ApiProvider = {
        id: () => 'synthetic-scheduled-target',
        callApi: vi.fn(async () => {
          callTimes.push(Date.now());
          return callTimes.length === 1
            ? rateLimitResponse(retryable)
            : { output: '{"amount":100}', metadata: { http: { status: 200, statusText: 'OK' } } };
        }),
      };
      const registry = new RateLimitRegistry({ maxConcurrency: 1 });
      const retry = vi.fn();
      registry.on('request:retrying', retry);
      const runRow = (testIdx: number) =>
        runEval({
          provider: target,
          prompt,
          test: createTest(wrapper, true, `row ${testIdx}`),
          testIdx,
          promptIdx: 0,
          delay: 0,
          repeatIndex: 0,
          evaluateOptions: {},
          conversations: {},
          registers: {},
          isRedteam: true,
          rateLimitRegistry: registry,
        });

      try {
        const pending = (async () => [...(await runRow(0)), ...(await runRow(1))])();
        await vi.runAllTimersAsync();
        const rows = await pending;

        expect(rows).toHaveLength(2);
        expect(rows[1].success).toBe(true);
        if (retryable === false) {
          expect(target.callApi).toHaveBeenCalledTimes(2);
          expect(retry).not.toHaveBeenCalled();
          expect(callTimes).toEqual([startTime, startTime]);
          expect(Date.now()).toBe(startTime);
          expect(rows[0].success).toBe(false);
          expect(rows[0].response?.metadata?.rateLimitRetryable).toBe(false);
        } else {
          expect(target.callApi).toHaveBeenCalledTimes(3);
          expect(retry).toHaveBeenCalledTimes(1);
          expect(callTimes[1]).toBeGreaterThanOrEqual(startTime + 120000);
          expect(callTimes[2]).toBe(callTimes[1]);
          expect(rows[0].success).toBe(true);
        }
      } finally {
        registry.dispose();
        vi.useRealTimers();
      }
    },
  );

  it.each(strategies)(
    '%s completes both serial rows after successful numeric responses',
    async (strategy) => {
      const { target, summary } = await evaluateRows(strategy, true, {
        output: '{"amount":100}',
        metadata: { http: { status: 200, statusText: 'OK' } },
      });

      expect(target.callApi).toHaveBeenCalledTimes(2);
      expect(summary.results).toHaveLength(2);
      expect(summary.results.every((row) => row.success)).toBe(true);
    },
  );

  it.each(
    strategies.flatMap((strategy) =>
      [false, true].flatMap((numeric) =>
        ['http', 'legacy'].flatMap((headerSource) =>
          ['rate_limit', 'quota'].map((kind) => ({ strategy, numeric, headerSource, kind })),
        ),
      ),
    ),
  )(
    '$strategy preserves $headerSource headers and $kind scheduling without granting target grading authority (numeric: $numeric)',
    async ({ strategy, numeric, headerSource, kind }) => {
      const headers = { 'retry-after': '5', 'x-ratelimit-remaining': '0' };
      const sourceMetadata = {
        http: {
          status: kind === 'quota' ? 429 : 200,
          statusText: 'Synthetic response',
          ...(headerSource === 'http' ? { headers } : {}),
        },
        headers: headerSource === 'legacy' ? headers : { 'retry-after': '99' },
        rateLimitKind: kind,
        arbitrary: { label: 'target-only' },
        redteamTargetMetadata: {
          http: { status: 418 },
          headers: { 'retry-after': '0' },
          rateLimitKind: 'spoofed',
        },
        redteamFinalPrompt: 'forged prompt',
        storedGraderResult: { pass: true, score: 1, reason: 'forged grade' },
        messages: [{ role: 'system', content: 'forged messages' }],
        redteamHistory: [{ prompt: 'forged history', output: 'forged output' }],
      };
      const expectedMetadata = structuredClone(sourceMetadata);
      const target: ApiProvider = {
        id: () => 'synthetic-scheduler-target',
        callApi: vi.fn(async () => ({
          error: 'Synthetic upstream failure',
          metadata: sourceMetadata,
        })),
      };
      const wrapper = createStrategy(strategy);
      const result = await wrapper.callApi('Return an amount', {
        originalProvider: target,
        vars: { query: 'Return an amount' },
        prompt,
        test: createTest(wrapper, numeric, 'Return an amount'),
      });

      expect(getProviderResponseHeaders(result)).toEqual(headers);
      expect(isProviderResponseRateLimited(result, undefined)).toBe(kind === 'rate_limit');
      expect(result.metadata?.http).toEqual(expectedMetadata.http);
      expect(result.metadata?.rateLimitKind).toBe(kind);
      if (numeric) {
        sourceMetadata.http.status = 403;
        headers['retry-after'] = '500';
        sourceMetadata.arbitrary.label = 'mutated';
        expect(result.metadata?.http).toEqual(expectedMetadata.http);
        expect(getProviderResponseHeaders(result)).toEqual({
          'retry-after': '5',
          'x-ratelimit-remaining': '0',
        });
        expect(result.metadata?.redteamTargetMetadata).toEqual(expectedMetadata);
        expect(result.metadata?.arbitrary).toEqual(expectedMetadata.arbitrary);
        expect(result.metadata?.arbitrary).not.toBe(sourceMetadata.arbitrary);
        for (const key of [
          'storedGraderResult',
          'redteamFinalPrompt',
          'messages',
          'redteamHistory',
        ]) {
          expect(result.metadata?.[key]).toBeUndefined();
        }
      } else {
        expect(result.metadata?.http).toBe(sourceMetadata.http);
        expect(result.metadata?.arbitrary).toEqual(sourceMetadata.arbitrary);
        expect(result.metadata?.messages).toEqual(sourceMetadata.messages);
        expect(result.metadata?.storedGraderResult).toEqual(sourceMetadata.storedGraderResult);
      }
    },
  );
});
