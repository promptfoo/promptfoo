import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { runEval } from '../../../src/evaluator';
import { RedteamGraderBase } from '../../../src/redteam/plugins/base';
import { CrescendoProvider } from '../../../src/redteam/providers/crescendo/index';
import { CustomProvider } from '../../../src/redteam/providers/custom/index';
import GoatProvider from '../../../src/redteam/providers/goat';
import * as shared from '../../../src/redteam/providers/shared';

import type { ApiProvider, Assertion, AtomicTestCase } from '../../../src/types/index';

vi.mock('../../../src/redteam/remoteGeneration', async (importOriginal) => ({
  ...(await importOriginal()),
  shouldGenerateRemote: () => true,
}));

type Strategy = 'custom' | 'crescendo' | 'goat';
const strategies: Strategy[] = ['custom', 'crescendo', 'goat'];
const prompt = { raw: '{{query}}', label: 'numeric unblocking' };
const reference = { type: 'numeric', expected: { amount: 100 } };
const wrong = '{"amount":101,"question":"Would you like a corrected calculation?"}';

function createAttack(strategy: Strategy, continueAfterSuccess: boolean, events: string[]) {
  const config = {
    injectVar: 'query',
    maxTurns: 2,
    maxBacktracks: 2,
    stateful: false,
    continueAfterSuccess,
    strategyText: 'Return an amount as JSON',
    redteamProvider: undefined,
  };
  if (strategy === 'goat') {
    return new GoatProvider(config);
  }
  const provider =
    strategy === 'custom' ? new CustomProvider(config) : new CrescendoProvider(config);
  const attack = provider as unknown as {
    getAttackPrompt: () => Promise<{ generatedQuestion: string }>;
    getEvalScore: () => Promise<unknown>;
    getRefusalScore: () => Promise<unknown>;
  };
  vi.spyOn(attack, 'getAttackPrompt').mockResolvedValue({
    generatedQuestion: 'Return an amount as JSON',
  });
  const score = { value: false, metadata: 0, rationale: 'Synthetic objective check' };
  vi.spyOn(attack, 'getEvalScore').mockResolvedValue(strategy === 'custom' ? [score] : score);
  vi.spyOn(attack, 'getRefusalScore').mockImplementation(async () => {
    events.push('refusal');
    return [false, 'Synthetic legacy check'];
  });
  return provider;
}

async function evaluate(
  provider: ApiProvider,
  target: ApiProvider,
  assertion: Assertion,
  grouped = false,
) {
  const test: AtomicTestCase = {
    provider,
    vars: { query: 'Return an amount as JSON' },
    assert: grouped ? [{ type: 'assert-set', assert: [assertion] }] : [assertion],
    metadata: {
      purpose: 'A financial calculator',
      pluginId: 'financial:calculation-error',
      strategyId: provider.id().split(':').at(-1),
    },
  };
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
  });
  return row;
}

describe('numeric grading before unblocking and empty-response shortcuts', () => {
  let directory: string;
  let previousBasePath: string | undefined;
  let events: string[];

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'numeric-unblocking-'));
    previousBasePath = cliState.basePath;
    cliState.basePath = directory;
    vi.stubEnv('PROMPTFOO_CONFIG_DIR', directory);
    vi.stubGlobal('__numericUnblockingReferenceCalls', 0);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          materializationHandled: true,
          message: { role: 'user', content: 'Return an amount as JSON' },
        }),
      })),
    );
    events = [];
    vi.spyOn(shared, 'tryUnblocking').mockImplementation(async () => {
      events.push('unblocking');
      return { success: true, unblockingPrompt: 'Please provide the corrected amount' };
    });
    vi.spyOn(RedteamGraderBase.prototype, 'getResult').mockRejectedValue(
      new Error('Explicit numeric checks must not call an LLM grader'),
    );
  });

  afterEach(async () => {
    cliState.basePath = previousBasePath;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it.each(
    strategies.flatMap((strategy) =>
      [false, true].flatMap((continueAfterSuccess) =>
        [false, true].map((external) => ({ strategy, continueAfterSuccess, external })),
      ),
    ),
  )(
    '$strategy keeps the first wrong amount before unblocking (continue: $continueAfterSuccess, external: $external)',
    async ({ strategy, continueAfterSuccess, external }) => {
      const provider = createAttack(strategy, continueAfterSuccess, events);
      const assertion: Assertion = {
        type: 'promptfoo:redteam:financial:calculation-error',
        value: reference,
      };
      if (external) {
        await fs.writeFile(
          path.join(directory, 'reference.cjs'),
          `module.exports = () => { globalThis.__numericUnblockingReferenceCalls++; return ${JSON.stringify(reference)}; };`,
        );
        assertion.value = 'file://reference.cjs';
        assertion.config = { numeric: true };
      }
      const target: ApiProvider = {
        id: () => 'numeric-target',
        callApi: vi
          .fn()
          .mockResolvedValueOnce({ output: wrong })
          .mockResolvedValue({ output: '{"amount":100}' }),
      };

      const row = await evaluate(provider, target, assertion);

      expect(shared.tryUnblocking).not.toHaveBeenCalled();
      expect(events).not.toContain('refusal');
      expect(target.callApi).toHaveBeenCalledTimes(continueAfterSuccess ? 2 : 1);
      expect(row.success).toBe(false);
      expect(row.failureReason).toBe(1);
      expect(row.response?.output).toBe(wrong);
      expect(row.response?.metadata?.storedGraderResult?.pass).toBe(false);
      if (external) {
        expect(
          (globalThis as typeof globalThis & { __numericUnblockingReferenceCalls: number })
            .__numericUnblockingReferenceCalls,
        ).toBe(continueAfterSuccess ? 3 : 2);
      }
    },
  );

  it.each(
    strategies.flatMap((strategy) =>
      ['', '   '].flatMap((output) =>
        [false, true].map((continueAfterSuccess) => ({ strategy, output, continueAfterSuccess })),
      ),
    ),
  )(
    '$strategy grades empty or whitespace text before a later correct response ($output, continue: $continueAfterSuccess)',
    async ({ strategy, output, continueAfterSuccess }) => {
      const provider = createAttack(strategy, continueAfterSuccess, events);
      const target: ApiProvider = {
        id: () => 'numeric-target',
        callApi: vi
          .fn()
          .mockResolvedValueOnce({ output })
          .mockResolvedValue({ output: '{"amount":100}' }),
      };

      const row = await evaluate(provider, target, {
        type: 'promptfoo:redteam:financial:calculation-error',
        value: reference,
      });

      expect(shared.tryUnblocking).not.toHaveBeenCalled();
      expect(events).not.toContain('refusal');
      expect(target.callApi).toHaveBeenCalledTimes(continueAfterSuccess ? 2 : 1);
      expect(row.response?.output).toBe(output);
      expect(row.response?.metadata?.storedGraderResult?.pass).toBe(false);
      expect(row.success).toBe(false);
      expect(row.failureReason).toBe(1);
    },
  );

  it.each(strategies)(
    '%s finds an explicit numeric child in a grouped assertion',
    async (strategy) => {
      const provider = createAttack(strategy, false, events);
      const target: ApiProvider = {
        id: () => 'numeric-target',
        callApi: vi
          .fn()
          .mockResolvedValueOnce({ output: wrong })
          .mockResolvedValue({ output: '{"amount":100}' }),
      };

      const row = await evaluate(
        provider,
        target,
        { type: 'promptfoo:redteam:financial:calculation-error', value: reference },
        true,
      );

      expect(shared.tryUnblocking).not.toHaveBeenCalled();
      expect(target.callApi).toHaveBeenCalledTimes(1);
      expect(row.response?.output).toBe(wrong);
      expect(row.response?.metadata?.storedGraderResult?.pass).toBe(false);
      expect(row.success).toBe(false);
    },
  );

  it.each(strategies)('%s preserves legacy unblocking and grading order', async (strategy) => {
    const provider = createAttack(strategy, strategy === 'goat', events);
    const target: ApiProvider = {
      id: () => 'legacy-target',
      callApi: vi.fn().mockResolvedValue({ output: wrong }),
    };
    vi.mocked(RedteamGraderBase.prototype.getResult).mockImplementation(async () => {
      events.push('grade');
      return {
        grade: { pass: false, score: 0, reason: 'Synthetic legacy failure' },
        rubric: 'Synthetic rubric',
      };
    });

    const row = await evaluate(provider, target, {
      type: 'promptfoo:redteam:financial:calculation-error',
    });

    expect(shared.tryUnblocking).toHaveBeenCalledTimes(1);
    expect(target.callApi).toHaveBeenCalledTimes(strategy === 'goat' ? 3 : 2);
    expect(events.slice(0, strategy === 'goat' ? 2 : 3)).toEqual(
      strategy === 'goat' ? ['grade', 'unblocking'] : ['unblocking', 'refusal', 'grade'],
    );
    expect(row.response?.metadata?.storedGraderResult?.reason).toBe('Synthetic legacy failure');
    expect(row.success).toBe(false);
  });
});
