import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { getGraderById } from '../../../src/redteam/graders';
import { FinancialCalculationErrorPluginGrader } from '../../../src/redteam/plugins/financial/financialCalculationError';
import RedteamIterativeTreeProvider from '../../../src/redteam/providers/iterativeTree';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';
import * as remoteGeneration from '../../../src/redteam/remoteGeneration';
import { createMockProvider, type MockApiProvider } from '../../factories/provider';

import type { Assertion, AtomicTestCase } from '../../../src/types/index';

const assertionType = 'promptfoo:redteam:financial:calculation-error';
const numericReference = { type: 'numeric', expected: { amount: 100 } };

describe('tree numeric grading order', () => {
  let target: MockApiProvider;
  let judge: MockApiProvider;
  let events: string[];
  let temporaryDirectory: string;
  let previousBasePath: string | undefined;

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-tree-numeric-'));
    previousBasePath = cliState.basePath;
    cliState.basePath = temporaryDirectory;
    events = [];
    const attacker = createMockProvider({
      id: 'synthetic-attacker',
      response: { output: JSON.stringify({ prompt: 'Return an amount', improvement: 'test' }) },
    });
    target = createMockProvider({ id: 'synthetic-target' });
    target.callApi.mockImplementation(async () => {
      events.push('target');
      return { output: '{"amount":100}' };
    });
    judge = createMockProvider({ id: 'synthetic-judge' });
    judge.callApi.mockImplementation(async () => {
      events.push('judge');
      return {
        output: JSON.stringify({
          currentResponse: { rating: 1, explanation: 'Continue' },
          previousBestResponse: { rating: 0 },
          pass: true,
          score: 1,
          reason: 'Synthetic legacy grade',
        }),
      };
    });
    const getResult = FinancialCalculationErrorPluginGrader.prototype.getResult;
    vi.spyOn(FinancialCalculationErrorPluginGrader.prototype, 'getResult').mockImplementation(
      function (this: FinancialCalculationErrorPluginGrader, ...args) {
        events.push('grader');
        return getResult.apply(this, args);
      },
    );
    vi.spyOn(remoteGeneration, 'shouldGenerateRemote').mockReturnValue(false);
    vi.spyOn(redteamProviderManager, 'getProvider').mockResolvedValue(attacker);
    vi.spyOn(redteamProviderManager, 'getGradingProvider').mockResolvedValue(judge);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network request'));
  });

  afterEach(() => {
    cliState.basePath = previousBasePath;
    expect(globalThis.fetch).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  function runTree(assertion: Assertion) {
    const provider = new RedteamIterativeTreeProvider({
      injectVar: 'query',
      maxDepth: 1,
      maxAttempts: 1,
      branchingFactor: 1,
      maxWidth: 1,
    });
    const test: AtomicTestCase = {
      vars: { query: 'Return an amount' },
      assert: [assertion],
      metadata: {
        pluginId: 'financial:calculation-error',
        strategyId: 'jailbreak:tree',
        purpose: 'synthetic calculator',
      },
    };
    return provider.callApi('', {
      originalProvider: target,
      vars: test.vars!,
      prompt: { raw: '{{query}}', label: 'synthetic calculation' },
      test,
    });
  }

  function externalReference(value: unknown): { assertion: Assertion; calls: () => string } {
    const script = path.join(temporaryDirectory, 'reference.cjs');
    const calls = path.join(temporaryDirectory, 'calls.txt');
    fs.writeFileSync(calls, '');
    fs.writeFileSync(
      script,
      `module.exports = () => {
        require('node:fs').appendFileSync(${JSON.stringify(calls)}, 'call\\n');
        return ${JSON.stringify(value)};
      };`,
    );
    return {
      assertion: { type: assertionType, value: 'file://reference.cjs', config: { numeric: true } },
      calls: () => fs.readFileSync(calls, 'utf8'),
    };
  }

  it.each([false, true])(
    'returns a numeric failure without the auxiliary judge (judge unavailable: %s)',
    async (judgeUnavailable) => {
      target.callApi.mockImplementation(async () => {
        events.push('target');
        return { output: '{"amount":101}' };
      });
      if (judgeUnavailable) {
        judge.callApi.mockRejectedValue(new Error('Synthetic judge unavailable'));
      }

      const result = await runTree({ type: assertionType, value: numericReference });

      expect(result).toMatchObject({
        output: '{"amount":101}',
        metadata: {
          stopReason: 'GRADER_FAILED',
          redteamOutputIsText: true,
          storedGraderResult: { pass: false, score: 0 },
          redteamTreeHistory: [{ output: '{"amount":101}', graderPassed: false }],
        },
      });
      expect(events).toEqual(['target', 'grader']);
      expect(judge.callApi).not.toHaveBeenCalled();
      expect(getGraderById(assertionType)!.getResult).toHaveBeenCalledOnce();
    },
  );

  it('grades a correct numeric result once before using the judge for search scoring', async () => {
    const result = await runTree({ type: assertionType, value: numericReference });

    expect(result).toMatchObject({
      output: '{"amount":100}',
      metadata: { stopReason: 'MAX_ATTEMPTS', storedGraderResult: { pass: true, score: 1 } },
    });
    expect(events).toEqual(['target', 'grader', 'judge']);
    expect(getGraderById(assertionType)!.getResult).toHaveBeenCalledOnce();
  });

  it('preserves judge errors after checking a correct numeric result', async () => {
    judge.callApi.mockImplementation(async () => {
      events.push('judge');
      return { error: 'Synthetic judge unavailable' };
    });

    await expect(runTree({ type: assertionType, value: numericReference })).rejects.toThrow(
      'Error from redteam (judge) provider: Synthetic judge unavailable',
    );
    expect(events).toEqual(['target', 'grader', 'judge']);
    expect(getGraderById(assertionType)!.getResult).toHaveBeenCalledOnce();
  });

  it.each([100, 101])('resolves an external reference only once for amount %s', async (amount) => {
    const reference = externalReference(numericReference);
    const transform = vi.fn(() => JSON.stringify({ amount }));
    target.transform = transform;

    const result = await runTree(reference.assertion);

    expect(result.metadata.storedGraderResult?.pass).toBe(amount === 100);
    expect(reference.calls()).toBe('call\n');
    expect(transform).toHaveBeenCalledOnce();
    expect(getGraderById(assertionType)!.getResult).toHaveBeenCalledOnce();
    expect(judge.callApi).toHaveBeenCalledTimes(amount === 100 ? 1 : 0);
  });

  it.each<[unknown, RegExp]>([
    [{ type: 'legacy' }, /must resolve to value.type: numeric/],
    [{ type: 'numeric', expected: {} }, /Invalid financial numeric reference/],
  ])(
    'surfaces an invalid external reference before an unavailable judge: %j',
    async (value, error) => {
      const reference = externalReference(value);
      judge.callApi.mockRejectedValue(new Error('Synthetic judge unavailable'));

      await expect(runTree(reference.assertion)).rejects.toMatchObject({
        name: 'RedteamGradingConfigError',
        message: expect.stringMatching(error),
      });
      expect(reference.calls()).toBe('call\n');
      expect(judge.callApi).not.toHaveBeenCalled();
    },
  );

  it('retains judge-first ordering for legacy financial grading', async () => {
    const result = await runTree({ type: assertionType });

    expect(result.metadata.storedGraderResult?.pass).toBe(true);
    expect(events).toEqual(['target', 'judge', 'grader', 'judge']);
  });

  it('retains legacy judge errors without invoking the plugin grader', async () => {
    judge.callApi.mockImplementation(async () => {
      events.push('judge');
      return { error: 'Synthetic judge unavailable' };
    });

    await expect(runTree({ type: assertionType })).rejects.toThrow(
      'Error from redteam (judge) provider: Synthetic judge unavailable',
    );
    expect(events).toEqual(['target', 'judge']);
    expect(getGraderById(assertionType)!.getResult).not.toHaveBeenCalled();
  });
});
