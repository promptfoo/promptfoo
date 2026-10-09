import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { getDb } from '../../../src/database';
import { evalsTable } from '../../../src/database/tables';
import { runEval } from '../../../src/evaluator';
import { runDbMigrations } from '../../../src/migrate';
import { runMetaAgentRedteam } from '../../../src/redteam/providers/iterativeMeta';
import { getTraceStore } from '../../../src/tracing/store';
import { mockProcessEnv } from '../../util/utils';

import type { ApiProvider, AtomicTestCase } from '../../../src/types/index';

let directory: string;
let previousBasePath: string | undefined;
let restoreEnv: () => void;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'numeric-trace-'));
  previousBasePath = cliState.basePath;
  cliState.basePath = directory;
  restoreEnv = mockProcessEnv({
    PROMPTFOO_TRACE_FETCH_MAX_ATTEMPTS: '1',
    PROMPTFOO_TRACE_FETCH_STABLE_POLLS: '1',
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('Unexpected network request');
    }),
  );
  await runDbMigrations();
});

afterEach(async () => {
  cliState.basePath = previousBasePath;
  restoreEnv();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await fs.rm(directory, { recursive: true, force: true });
});

it.each(['available', 'missing', 'lookup error'])(
  'uses the existing trace store consistently when current target trace data is %s',
  async (mode) => {
    const observations: Array<{ hasTrace: boolean; spanId?: string; amount?: number }> = [];
    vi.stubGlobal('__numericTraceObservations', observations);
    await fs.writeFile(
      path.join(directory, 'reference.cjs'),
      `module.exports = (_output, context) => {
      const span = context.trace?.spans.find(s => s.name === 'current-target-calculation');
      globalThis.__numericTraceObservations.push({hasTrace: !!context.trace, spanId: span?.spanId, amount: span?.attributes?.amount});
      return {type: 'numeric', expected: {amount: span?.attributes?.amount ?? 999}};
    };`,
    );
    const evaluationId = `numeric-trace-${crypto.randomUUID()}`;
    const db = await getDb();
    await db.insert(evalsTable).values({ id: evaluationId, results: {}, config: {} }).run();
    const traceStore = getTraceStore();
    const getSpans = vi.spyOn(traceStore, 'getSpans');
    if (mode === 'lookup error') {
      vi.spyOn(traceStore, 'getTrace').mockRejectedValue(new Error('Trace lookup unavailable'));
    }
    const expected = mode === 'available' ? 100 : 999;
    const spanId = 'aaaaaaaaaaaaaaaa';
    let calls = 0;
    const target: ApiProvider = {
      id: () => 'numeric-target',
      callApi: vi.fn(async (_prompt, context) => {
        calls++;
        if (calls === 1 && mode !== 'missing') {
          const traceId = context!.traceparent!.split('-')[1];
          const now = Date.now();
          const stored = await traceStore.addSpans(traceId, [
            {
              spanId,
              name: 'current-target-calculation',
              startTime: now,
              endTime: now,
              attributes: { amount: 100 },
              statusCode: 1,
            },
          ]);
          expect(stored.stored).toBe(true);
        }
        return { output: JSON.stringify({ amount: expected + calls - 1 }) };
      }),
    };
    const strategy: ApiProvider = {
      id: () => 'promptfoo:redteam:iterative:meta',
      callApi: async (_prompt, context) =>
        runMetaAgentRedteam({
          context,
          prompt: context!.prompt,
          vars: context!.vars,
          test: context!.test as AtomicTestCase,
          filters: undefined,
          injectVar: 'query',
          numIterations: 2,
          targetProvider: target,
          gradingProvider: target,
          agentProvider: {
            id: () => 'synthetic-attacker',
            callApi: async () => ({ output: { result: 'Return an amount as JSON' } }),
          },
        }),
    };
    const test: AtomicTestCase = {
      provider: strategy,
      vars: { query: 'Return an amount as JSON' },
      assert: [
        {
          type: 'promptfoo:redteam:financial:calculation-error',
          value: 'file://reference.cjs',
          config: { numeric: true },
        },
      ],
      metadata: {
        evaluationId,
        testCaseId: 'current-target',
        tracingEnabled: true,
        purpose: 'Financial calculator',
        pluginId: 'financial:calculation-error',
        strategyId: 'jailbreak:meta',
        tracing: {
          enabled: true,
          includeInAttack: false,
          includeInGrading: true,
          includeInternalSpans: true,
          maxRetries: 0,
        },
      },
    };
    const [row] = await runEval({
      provider: target,
      prompt: { raw: '{{query}}', label: 'Numeric trace' },
      test,
      testIdx: 0,
      promptIdx: 0,
      delay: 0,
      repeatIndex: 0,
      evaluateOptions: {},
      conversations: {},
      registers: {},
      isRedteam: true,
    });
    expect(target.callApi).toHaveBeenCalledTimes(2);
    expect(row.failureReason).toBe(1);
    expect(row.response?.metadata?.storedGraderResult?.pass).toBe(false);
    expect(observations).toHaveLength(3);
    if (mode === 'available') {
      expect(getSpans).toHaveBeenCalled();
      expect(observations).toEqual(Array(3).fill({ hasTrace: true, spanId, amount: 100 }));
    } else {
      expect(observations.every((observation) => observation.amount === undefined)).toBe(true);
    }
  },
);
