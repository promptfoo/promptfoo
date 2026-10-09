import { randomUUID } from 'crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import {
  type InMemoryEvaluation,
  InMemoryEvaluationStore,
} from '../../src/evaluator/inMemoryStore';
import { RedteamGradingConfigError } from '../../src/redteam/grading/errors';
import { RedteamGraderBase } from '../../src/redteam/plugins/base';
import { runMetaAgentRedteam } from '../../src/redteam/providers/iterativeMeta';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import telemetry from '../../src/telemetry';
import { ResultFailureReason } from '../../src/types/index';

import type { ApiProvider, Assertion, AtomicTestCase } from '../../src/types/index';

const prompt = { raw: '{{query}}', label: 'numeric retry' };
const numeric: Assertion = {
  type: 'promptfoo:redteam:financial:calculation-error',
  value: { type: 'numeric', expected: { amount: 100 } },
};
const baseTest: AtomicTestCase = {
  vars: { query: 'Return an amount as JSON' },
  metadata: { purpose: 'A financial calculator', pluginId: 'financial:calculation-error' },
  assert: [numeric],
};

async function evaluateTarget(target: ApiProvider, test: AtomicTestCase) {
  const memory: InMemoryEvaluation = {
    id: randomUUID(),
    config: {},
    persisted: false,
    prompts: [],
    results: [],
    vars: [],
    resultPersistenceFailed: false,
    finalResults: [],
    failedResults: [],
  };
  const pending = evaluate(
    { providers: [target], prompts: [prompt], tests: [test] },
    memory,
    { maxConcurrency: 1, cache: false, showProgressBar: false },
    {
      createEvaluationStore: (evaluation) => new InMemoryEvaluationStore(evaluation),
      createResultWriters: () => [],
    },
  );
  await vi.runAllTimersAsync();
  await pending;
  expect(memory.results).toHaveLength(1);
  return memory.results[0];
}

describe('fatal numeric preparation through the evaluator scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', 'false');
    vi.stubEnv('PROMPTFOO_DISABLE_REMOTE_GENERATION', 'true');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected network request')));
    vi.spyOn(telemetry, 'record').mockImplementation(() => {});
    vi.spyOn(RedteamGraderBase.prototype, 'getResult').mockRejectedValue(
      new Error('Numeric grading must not call the LLM grader'),
    );
  });

  afterEach(() => {
    try {
      expect(fetch).not.toHaveBeenCalled();
      expect(RedteamGraderBase.prototype.getResult).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  it.each(
    ['timeout', 'network'].flatMap((message) =>
      [false, true].map((disabled) => ({ message, disabled })),
    ),
  )(
    'keeps a numeric $message error after one target turn (scheduler disabled: $disabled)',
    async ({ message, disabled }) => {
      vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', String(disabled));
      const target: ApiProvider = {
        id: () => 'synthetic-numeric-target',
        callApi: vi
          .fn()
          .mockResolvedValueOnce({ output: '{"amount":101,"first":true}' })
          .mockResolvedValue({ output: '{"amount":100,"first":false}' }),
      };
      const attacker: ApiProvider = {
        id: () => 'synthetic-attacker',
        callApi: vi.fn(async () => ({ output: { result: 'Return an amount as JSON' } })),
      };
      const strategy: ApiProvider = {
        id: () => 'promptfoo:redteam:iterative:meta',
        callApi: (_request, context, options) =>
          runMetaAgentRedteam({
            context,
            options,
            prompt: context!.prompt,
            filters: undefined,
            vars: context!.vars,
            test: context!.test as AtomicTestCase,
            targetProvider: target,
            gradingProvider: target,
            injectVar: 'query',
            numIterations: 1,
            agentProvider: attacker,
          }),
      };
      const row = await evaluateTarget(target, {
        ...baseTest,
        provider: strategy,
        assert: [
          {
            ...numeric,
            transform: (output) => {
              if (JSON.parse(output as string).first) {
                throw new Error(`Synthetic ${message} in numeric preparation`);
              }
              return output;
            },
          },
        ],
      });
      expect(target.callApi).toHaveBeenCalledTimes(1);
      expect(attacker.callApi).toHaveBeenCalledTimes(1);
      expect(row).toMatchObject({
        success: false,
        score: 0,
        failureReason: ResultFailureReason.ERROR,
      });
      expect(row.error).toContain(`Synthetic ${message} in numeric preparation`);
    },
  );

  it.each([
    { message: 'timeout', disabled: false, maxRetries: undefined, calls: 2, success: true },
    { message: 'network', disabled: false, maxRetries: undefined, calls: 2, success: true },
    { message: 'timeout', disabled: true, maxRetries: undefined, calls: 1, success: false },
    { message: 'network', disabled: false, maxRetries: 0, calls: 1, success: false },
  ])(
    'preserves target $message retries (disabled: $disabled, maxRetries: $maxRetries)',
    async ({ message, disabled, maxRetries, calls, success }) => {
      vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', String(disabled));
      const target: ApiProvider = {
        id: () => 'synthetic-transport-target',
        ...(maxRetries === undefined ? {} : { config: { maxRetries } }),
        callApi: vi
          .fn()
          .mockRejectedValueOnce(new Error(`Synthetic ${message} from target transport`))
          .mockResolvedValue({ output: '{"amount":100}' }),
      };
      const row = await evaluateTarget(target, baseTest);
      expect(target.callApi).toHaveBeenCalledTimes(calls);
      expect(row).toMatchObject({
        success,
        score: success ? 1 : 0,
        failureReason: success ? ResultFailureReason.NONE : ResultFailureReason.ERROR,
      });
      if (!success) {
        expect(row.error).toContain(`Synthetic ${message} from target transport`);
      }
    },
  );

  it('preserves the original fatal error through the scheduler', async () => {
    const error = new RedteamGradingConfigError('Synthetic timeout in numeric preparation');
    const target: ApiProvider = {
      id: () => 'synthetic-fatal-target',
      callApi: vi.fn().mockRejectedValue(error),
    };
    const registry = new RateLimitRegistry({ maxConcurrency: 1 });
    try {
      const pending = registry.execute(target, () => target.callApi('Return an amount'));
      const rejected = expect(pending).rejects.toBe(error);
      await vi.runAllTimersAsync();
      await rejected;
      expect(target.callApi).toHaveBeenCalledTimes(1);
    } finally {
      registry.dispose();
    }
  });
});
