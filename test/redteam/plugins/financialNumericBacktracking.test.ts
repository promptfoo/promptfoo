import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { runEval } from '../../../src/evaluator';
import { CrescendoProvider } from '../../../src/redteam/providers/crescendo/index';
import { CustomProvider } from '../../../src/redteam/providers/custom/index';
import { GoblinProvider } from '../../../src/redteam/providers/goblin/index';
import { HydraProvider } from '../../../src/redteam/providers/hydra/index';

import type { ApiProvider, Assertion, AtomicTestCase } from '../../../src/types/index';

vi.mock('../../../src/redteam/remoteGeneration', async (importOriginal) => ({
  ...(await importOriginal()),
  shouldGenerateRemote: () => true,
}));

const prompt = { raw: '{{query}}', label: 'numeric backtracking' };
const reference = { type: 'numeric', expected: { amount: 100 } };

describe('numeric checks before refusal shortcuts', () => {
  let directory: string;
  let previousBasePath: string | undefined;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'numeric-backtracking-'));
    previousBasePath = cliState.basePath;
    cliState.basePath = directory;
    vi.stubGlobal('__numericReferenceCalls', 0);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Unexpected network request');
      }),
    );
  });

  afterEach(async () => {
    cliState.basePath = previousBasePath;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it.each(
    ['hydra', 'goblin', 'custom', 'crescendo'].flatMap((strategy) =>
      ['inline', 'json', 'cjs', 'grouped'].map((kind) => [strategy, kind]),
    ),
  )(
    '%s retains a numeric failure with refusal-like prose using a %s reference',
    async (strategy, kind) => {
      const config = {
        injectVar: 'query',
        maxTurns: 3,
        maxBacktracks: 3,
        stateful: false,
        strategyText: 'Return an amount as JSON',
        redteamProvider: undefined,
      };
      const provider =
        strategy === 'hydra'
          ? new HydraProvider(config)
          : strategy === 'goblin'
            ? new GoblinProvider(config)
            : strategy === 'custom'
              ? new CustomProvider(config)
              : new CrescendoProvider(config);
      if (strategy === 'hydra' || strategy === 'goblin') {
        const attack = provider as unknown as { agentProvider: ApiProvider };
        attack.agentProvider = {
          id: () => 'synthetic-attacker',
          callApi: vi.fn(async () => ({ output: 'Return an amount as JSON' })),
        };
      } else {
        const attack = provider as unknown as {
          getAttackPrompt: () => Promise<{ generatedQuestion: string }>;
          getEvalScore: () => Promise<unknown>;
          getRefusalScore: (...args: unknown[]) => Promise<unknown>;
        };
        vi.spyOn(attack, 'getAttackPrompt').mockResolvedValue({
          generatedQuestion: 'Return an amount as JSON',
        });
        vi.spyOn(attack, 'getEvalScore').mockRejectedValue(
          new Error('Numeric failure must stop before an LLM judge'),
        );
        vi.spyOn(attack, 'getRefusalScore').mockRejectedValue(
          new Error('Explicit numeric checks must bypass refusal heuristics'),
        );
      }
      const assertion: Assertion = {
        type: 'promptfoo:redteam:financial:calculation-error',
        value: reference,
      };
      if (kind !== 'inline' && kind !== 'grouped') {
        await fs.writeFile(
          path.join(directory, `reference.${kind}`),
          kind === 'json'
            ? JSON.stringify(reference)
            : 'module.exports = () => { globalThis.__numericReferenceCalls++; return { type: "numeric", expected: { amount: 100 } }; };',
        );
        assertion.value = `file://reference.${kind}`;
        assertion.config = { numeric: true };
      }
      const wrong = JSON.stringify({
        amount: 101,
        note: 'As an AI, I cannot provide financial advice.',
      });
      const target: ApiProvider = {
        id: () => 'numeric-target',
        callApi: vi
          .fn()
          .mockResolvedValueOnce({ output: wrong })
          .mockResolvedValueOnce({ output: '{"amount":100}' }),
      };
      const test: AtomicTestCase = {
        provider,
        vars: { query: 'Return an amount as JSON' },
        assert: kind === 'grouped' ? [{ type: 'assert-set', assert: [assertion] }] : [assertion],
        metadata: {
          purpose: 'A financial calculator',
          pluginId: 'financial:calculation-error',
          strategyId: strategy,
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
      expect(target.callApi).toHaveBeenCalledTimes(1);
      expect(row.success).toBe(false);
      expect(row.failureReason).toBe(1);
      expect(row.response?.output).toBe(wrong);
      expect(row.response?.metadata?.storedGraderResult?.pass).toBe(false);
      if (kind === 'cjs') {
        expect(
          (globalThis as typeof globalThis & { __numericReferenceCalls: number })
            .__numericReferenceCalls,
        ).toBe(2);
      }
    },
  );
});
