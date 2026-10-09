import { randomUUID } from 'crypto';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../src/assertions/index';
import { runEval } from '../../src/evaluator';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import EvalResult from '../../src/models/evalResult';
import { RedteamGraderBase } from '../../src/redteam/plugins/base';
import { runMetaAgentRedteam } from '../../src/redteam/providers/iterativeMeta';
import { ProviderGroupedCallQueue } from '../../src/scheduler/providerCallQueue';

import type { ApiProvider, Assertion, AtomicTestCase } from '../../src/types/index';

const raw = '{"amount":9007199254740993}';
const rounded = '{"amount":9007199254740992}';
const prompt = { raw: '{{query}}', label: 'numeric replay lineage' };
const numeric = (expected: string): Assertion => ({
  type: 'promptfoo:redteam:financial:calculation-error',
  value: { type: 'numeric', expected: { amount: expected } },
});

function createProviders(wrapped: boolean, lossy: boolean) {
  const originalResponse = { output: raw, metadata: { redteamOutputIsText: true } };
  const target: ApiProvider = {
    id: () => 'synthetic-calculator',
    callApi: vi.fn(async () => originalResponse),
    ...(lossy ? { transform: 'JSON.parse(output)' } : {}),
  };
  const strategy: ApiProvider = {
    id: () => 'promptfoo:redteam:iterative:meta',
    callApi: (_prompt, context) =>
      runMetaAgentRedteam({
        context,
        prompt: context!.prompt,
        filters: undefined,
        vars: context!.vars,
        test: context!.test as AtomicTestCase,
        targetProvider: target,
        gradingProvider: target,
        injectVar: 'query',
        numIterations: 1,
        agentProvider: {
          id: () => 'synthetic-attacker',
          callApi: async () => ({ output: { result: 'Return an amount' } }),
        },
      }),
  };
  return { target, testProvider: wrapped ? strategy : undefined, originalResponse };
}

async function runCase(wrapped: boolean, lossy: boolean, assertions: Assertion[]) {
  const { target, testProvider, originalResponse } = createProviders(wrapped, lossy);
  const test: AtomicTestCase = {
    ...(testProvider ? { provider: testProvider } : {}),
    vars: { query: 'Return an amount' },
    assert: assertions,
    ...(lossy ? { options: { transform: 'JSON.stringify(output)' } } : {}),
    metadata: { purpose: 'A financial calculator', pluginId: 'synthetic:unmatched' },
  };
  const record = await Eval.create({}, [prompt], { id: randomUUID(), author: null });
  const deferGrading = assertions.some((assertion) =>
    assertion.type?.startsWith('promptfoo:redteam:'),
  );
  const [row] = await runEval({
    provider: target,
    prompt,
    test,
    testIdx: 0,
    promptIdx: 0,
    delay: 0,
    repeatIndex: 0,
    evaluateOptions: {},
    conversations: {},
    registers: {},
    isRedteam: true,
    evalId: record.id,
    deferGrading,
    ...(deferGrading ? { providerCallQueue: new ProviderGroupedCallQueue() } : {}),
  });
  if (deferGrading) {
    await vi.waitFor(() => expect(row.gradingResult || row.error).toBeTruthy());
  }
  const saved = await EvalResult.createFromEvaluateResult(record.id, row, { persist: true });
  const stored = (await EvalResult.findById(saved.id))!;
  expect(target.callApi).toHaveBeenCalledTimes(1);
  expect(originalResponse).toEqual({ output: raw, metadata: { redteamOutputIsText: true } });
  return {
    row,
    stored,
    test: { provider: testProvider?.id() ?? target.id(), metadata: test.metadata },
  };
}

describe('saved output transform provenance', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });
  beforeEach(() => {
    vi.stubEnv('PROMPTFOO_DISABLE_TELEMETRY', 'true');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Unexpected network request');
      }),
    );
    vi.spyOn(RedteamGraderBase.prototype, 'getResult').mockRejectedValue(
      new Error('No LLM grading'),
    );
  });
  afterEach(() => {
    expect(fetch).not.toHaveBeenCalled();
    expect(RedteamGraderBase.prototype.getResult).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each(
    [false, true].flatMap((wrapped) =>
      [false, true].flatMap((lossy) =>
        [false, true].map((numericInitially) => ({ wrapped, lossy, numericInitially })),
      ),
    ),
  )(
    'retains saved lineage (wrapped=$wrapped lossy=$lossy numericInitially=$numericInitially)',
    async ({ wrapped, lossy, numericInitially }) => {
      // A non-redteam first assertion preserves the original strategy-selection fallback.
      // The numeric sibling is graded by the actual deferred evaluator path.
      const assertions: Assertion[] = [{ type: 'is-json' }];
      if (numericInitially) {
        assertions.push(numeric('9007199254740992'));
      }
      const { row, stored, test } = await runCase(wrapped, lossy, assertions);
      expect(row.response?.output).toBe(lossy ? rounded : raw);
      if (numericInitially) {
        expect(row.success).toBe(false);
        expect(row.failureReason).toBe(lossy ? 2 : 1);
        if (lossy) {
          expect(row.error).toContain('requires raw JSON text');
        }
      } else {
        expect(row.success).toBe(true);
      }
      for (const metadata of [
        row.response?.metadata,
        row.metadata,
        stored.response?.metadata,
        stored.metadata,
      ]) {
        expect(metadata?.redteamOutputIsText).toBe(!lossy);
      }
      for (const response of [JSON.parse(JSON.stringify(row.response)), stored.response]) {
        for (const replayTest of [test, { metadata: test.metadata }]) {
          const result = runAssertion({
            prompt: 'Return an amount',
            assertion: numeric('9007199254740992'),
            test: replayTest,
            providerResponse: response!,
          });
          if (lossy) {
            await expect(result).rejects.toThrow(/requires raw JSON text/);
          } else {
            expect(await result).toMatchObject({ pass: false, score: 0 });
            expect(
              await runAssertion({
                prompt: 'Return an amount',
                assertion: numeric('9007199254740993'),
                test: replayTest,
                providerResponse: response!,
              }),
            ).toMatchObject({ pass: true, score: 1 });
          }
        }
      }
    },
  );

  it.each([false, true])(
    'does not taint saved raw text with an assertion-local transform (wrapped=%s)',
    async (wrapped) => {
      const { row, stored, test } = await runCase(wrapped, false, [
        { type: 'is-json' },
        {
          type: 'javascript',
          transform: 'JSON.parse(output)',
          value: 'typeof output === "object"',
        },
        { ...numeric('9007199254740992'), transform: 'JSON.parse(output)' },
      ]);
      expect(row.failureReason).toBe(2);
      expect(row.error).toContain('requires raw JSON text');
      expect(stored.response?.output).toBe(raw);
      expect(stored.response?.metadata?.redteamOutputIsText).toBe(true);
      expect(
        await runAssertion({
          prompt: 'Return an amount',
          assertion: numeric('9007199254740993'),
          test,
          providerResponse: stored.response!,
        }),
      ).toMatchObject({ pass: true, score: 1 });
      await expect(
        runAssertion({
          prompt: 'Return an amount',
          assertion: { ...numeric('9007199254740992'), transform: 'JSON.parse(output)' },
          test,
          providerResponse: stored.response!,
        }),
      ).rejects.toThrow(/requires raw JSON text/);
    },
  );
});
