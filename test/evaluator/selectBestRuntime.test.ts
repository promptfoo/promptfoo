import './setup';

import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inspect } from 'node:util';

import { expect, it, vi } from 'vitest';
import { runCompareAssertion } from '../../src/assertions';
import cliState from '../../src/cliState';
import { evaluate } from '../../src/evaluator';
import { runExtensionHook } from '../../src/evaluatorHelpers';
import logger, { getLogLevel, setLogLevel } from '../../src/logger';
import Eval from '../../src/models/eval';
import EvalResult, { sanitizeResultForJsonlArtifact } from '../../src/models/evalResult';
import { EchoProvider } from '../../src/providers/echo';
import { HttpProvider } from '../../src/providers/http';
import telemetry from '../../src/telemetry';
import { ResultFailureReason } from '../../src/types/index';
import { sanitizeProviderIdForLog } from '../../src/util/provider';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { ApiProvider, Assertion, EnvOverrides, TestSuite } from '../../src/types/index';

const secret = 'select-best-grader-secret';

function makeSuite() {
  const seenKeys: string[] = [];
  const grader: ApiProvider = {
    id: () => 'select-best-grader',
    config: { apiKey: secret },
    callApi: vi.fn(async () => {
      seenKeys.push(grader.config?.apiKey as string);
      return { output: '0' };
    }),
  };
  const target: ApiProvider = {
    id: () => 'select-best-target',
    callApi: vi.fn(async () => ({ output: 'candidate' })),
  };
  const suite: TestSuite = {
    providers: [target],
    prompts: [toPrompt('first'), toPrompt('second')],
    tests: [
      {
        assert: [
          {
            type: 'select-best',
            value: 'choose the best',
            provider: grader,
            config: { apiKey: secret },
          },
        ],
      },
    ],
  };
  return { grader, seenKeys, suite, target };
}

// These fixtures exercise restoration for pending comparisons, not regrading completed work.
async function markComparisonPending(record: Eval) {
  for (const row of await record.fetchResultsByTestIdx(0)) {
    if (row.gradingResult) {
      if (row.gradingResult.assertion?.type === 'select-best') {
        delete row.gradingResult.assertion;
      }
      row.gradingResult.componentResults = row.gradingResult.componentResults?.filter(
        (component) => component.assertion?.type !== 'select-best',
      );
      await row.save();
    }
  }
}

describeEvaluator('select-best runtime grading configuration', () => {
  it.each([0, 10000])('grades the replacement test with timeoutMs=%s', async (timeoutMs) => {
    const { grader, suite } = makeSuite();
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hookName, context) => {
      if (hookName !== 'beforeEach' || !('test' in context)) {
        return context;
      }
      return {
        ...context,
        test: {
          ...context.test,
          assert: [{ type: 'select-best', value: 'Use the updated criteria', provider: grader }],
        },
      };
    });
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });

    await evaluate(suite, record, { maxConcurrency: 1, timeoutMs });

    expect(grader.callApi).toHaveBeenCalledTimes(1);
    expect(vi.mocked(grader.callApi).mock.calls[0][0]).toContain('Use the updated criteria');
    expect(vi.mocked(grader.callApi).mock.calls[0][0]).not.toContain('choose the best');
  });

  it('uses the first result’s criteria when a later column removes the comparison', async () => {
    const { grader, suite } = makeSuite();
    let column = 0;
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hookName, context) => {
      if (hookName !== 'beforeEach' || !('test' in context)) {
        return context;
      }
      return {
        ...context,
        test: {
          ...context.test,
          assert:
            column++ === 0
              ? [{ type: 'select-best', value: 'Use the first column criteria', provider: grader }]
              : [],
        },
      };
    });
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });

    await evaluate(suite, record, { maxConcurrency: 1 });

    expect(grader.callApi).toHaveBeenCalledTimes(1);
    expect(vi.mocked(grader.callApi).mock.calls[0][0]).toContain('Use the first column criteria');
  });

  it.each(['assertion', 'options'])(
    'resumes saved hook criteria and vars with a live %s grader',
    async (location) => {
      const { grader, seenKeys, suite, target } = makeSuite();
      if (location === 'options') {
        delete (suite.tests![0].assert![0] as Assertion).provider;
        suite.tests![0].options = { provider: grader };
      }
      const beforeEach = vi.fn();
      vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hookName, context) => {
        if (hookName !== 'beforeEach' || !('test' in context)) {
          return context;
        }
        beforeEach();
        return {
          ...context,
          test: {
            ...context.test,
            vars: { preference: 'hook-adjusted preference' },
            options: { ...context.test.options, rubricPrompt: '{{criteria}}: {{preference}}' },
            assert: context.test.assert!.map((assertion) => ({
              ...assertion,
              value: 'Use the saved criteria',
            })),
          },
        };
      });
      const record = await Eval.create({}, suite.prompts, { id: randomUUID() });

      await evaluate(suite, record, { maxConcurrency: 1 });
      await markComparisonPending(record);
      cliState.resume = true;
      await evaluate(suite, record, { maxConcurrency: 1 });

      expect(beforeEach).toHaveBeenCalledTimes(2);
      expect(target.callApi).toHaveBeenCalledTimes(2);
      expect(grader.callApi).toHaveBeenCalledTimes(2);
      expect(seenKeys).toEqual([secret, secret]);
      for (const [prompt] of vi.mocked(grader.callApi).mock.calls) {
        expect(prompt).toBe('Use the saved criteria: hook-adjusted preference');
      }
    },
  );

  it.each(['assertion', 'options'])(
    'preserves a hook-selected %s grader on resume',
    async (location) => {
      const { grader, suite } = makeSuite();
      if (location === 'options') {
        delete (suite.tests![0].assert![0] as Assertion).provider;
        suite.tests![0].options = { provider: grader };
      }
      const changedGrader = vi
        .spyOn(EchoProvider.prototype, 'callApi')
        .mockResolvedValue({ output: '0' });
      vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hookName, context) => {
        if (hookName !== 'beforeEach' || !('test' in context)) {
          return context;
        }
        return {
          ...context,
          test: {
            ...context.test,
            ...(location === 'options'
              ? { options: { ...context.test.options, provider: { id: 'echo' } } }
              : {
                  assert: context.test.assert!.map((assertion) => ({
                    ...assertion,
                    provider: 'echo',
                  })),
                }),
          },
        };
      });
      const record = await Eval.create({}, suite.prompts, { id: randomUUID() });

      try {
        await evaluate(suite, record, { maxConcurrency: 1 });
        const [saved] = await record.fetchResultsByTestIdx(0);
        expect(
          location === 'options'
            ? saved.testCase.options?.provider
            : (saved.testCase.assert![0] as Assertion).provider,
        ).toEqual(location === 'options' ? { id: 'echo' } : 'echo');
        await markComparisonPending(record);
        cliState.resume = true;
        await evaluate(suite, record, { maxConcurrency: 1 });

        expect(grader.callApi).not.toHaveBeenCalled();
        expect(changedGrader).toHaveBeenCalledTimes(2);
      } finally {
        changedGrader.mockRestore();
      }
    },
  );

  it('keeps each persisted column snapshot when hooks mutate shared test objects', async () => {
    const { grader, suite } = makeSuite();
    const otherGrader: ApiProvider = {
      id: () => 'other-column-grader',
      callApi: vi.fn(async () => ({ output: '0' })),
    };
    suite.tests![0].vars = { preference: 'original' };
    suite.tests![0].options = { rubricPrompt: '{{criteria}}: {{preference}}' };
    let column = 0;
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hookName, context) => {
      if (hookName === 'beforeEach' && 'test' in context) {
        const assertion = context.test.assert![0] as Assertion;
        assertion.value = `criteria-${column}`;
        assertion.provider = column === 0 ? grader : otherGrader;
        context.test.vars!.preference = `var-${column++}`;
      }
      return context;
    });
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });

    await evaluate(suite, record, { maxConcurrency: 1, timeoutMs: 10000 });

    const saved = (await record.fetchResultsByTestIdx(0)).find((result) => result.promptIdx === 0)!;
    expect((saved.testCase.assert![0] as Assertion).value).toBe('criteria-0');
    expect(saved.testCase.vars?.preference).toBe('var-0');
    expect(grader.callApi).toHaveBeenCalledTimes(1);
    expect(vi.mocked(grader.callApi).mock.calls[0][0]).toBe('criteria-0: var-0');
    expect(otherGrader.callApi).not.toHaveBeenCalled();
  });

  it('restores only credentials while retaining saved grader overrides and removed settings', async () => {
    const { suite } = makeSuite();
    const initialConfig = {
      temperature: 0,
      apiBaseUrl: 'https://original.example/v1',
      apiKey: secret,
      max_tokens: 100,
      nested: { setting: 'original', apiKey: secret, removed: true },
      tools: [{ name: 'original', apiKey: secret }],
    };
    const hookConfig = {
      temperature: 1,
      apiBaseUrl: 'https://hook.example/v1',
      apiKey: secret,
      nested: { setting: 'hook', apiKey: secret },
      tools: [{ name: 'hook', apiKey: secret }],
    };
    (suite.tests![0].assert![0] as Assertion).provider = { id: 'echo', config: initialConfig };
    const seenConfigs: Record<string, unknown>[] = [];
    const call = vi.spyOn(EchoProvider.prototype, 'callApi').mockImplementation(async function (
      this: EchoProvider,
    ) {
      seenConfigs.push(this.config);
      return { output: '0' };
    });
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hookName, context) => {
      if (hookName !== 'beforeEach' || !('test' in context)) {
        return context;
      }
      return {
        ...context,
        test: {
          ...context.test,
          assert: [
            {
              type: 'select-best',
              value: 'choose the best',
              provider: { id: 'echo', config: hookConfig },
            },
          ],
        },
      };
    });
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });

    try {
      await evaluate(suite, record, { maxConcurrency: 1 });
      await markComparisonPending(record);
      cliState.resume = true;
      await evaluate(suite, record, { maxConcurrency: 1 });
      for (const row of await record.fetchResultsByTestIdx(0)) {
        expect(row.success).toBe(false);
        expect(row.error).toContain('Supply a grader configuration matching the saved result');
      }
      expect(seenConfigs).toHaveLength(1);
      (suite.tests![0].assert![0] as Assertion).provider = { id: 'echo', config: hookConfig };
      await evaluate(suite, record, { maxConcurrency: 1 });

      expect(seenConfigs).toHaveLength(2);
      for (const config of seenConfigs) {
        expect(config).toMatchObject(hookConfig);
        expect(config.max_tokens).toBeUndefined();
        expect(config.nested).not.toHaveProperty('removed');
      }
      expect(JSON.stringify(await record.fetchResultsByTestIdx(0))).not.toContain(secret);
      expect(initialConfig.temperature).toBe(0);
      expect(initialConfig.nested.removed).toBe(true);
    } finally {
      call.mockRestore();
    }
  });

  it('does not replace a saved grader with a different provider sharing its label', async () => {
    const { grader, suite } = makeSuite();
    grader.label = 'shared-label';
    const changedGrader = vi
      .spyOn(EchoProvider.prototype, 'callApi')
      .mockResolvedValue({ output: '0' });
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hookName, context) => {
      if (hookName !== 'beforeEach' || !('test' in context)) {
        return context;
      }
      return {
        ...context,
        test: {
          ...context.test,
          assert: [
            {
              type: 'select-best',
              value: 'choose the best',
              provider: { id: 'echo', label: 'shared-label' },
            },
          ],
        },
      };
    });
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });

    try {
      await evaluate(suite, record, { maxConcurrency: 1 });
      await markComparisonPending(record);
      cliState.resume = true;
      await evaluate(suite, record, { maxConcurrency: 1 });

      expect(grader.callApi).not.toHaveBeenCalled();
      expect(changedGrader).toHaveBeenCalledTimes(2);
    } finally {
      changedGrader.mockRestore();
    }
  });

  it.each([0, 10000])(
    'snapshots shared inline grader keys with timeoutMs=%s',
    async (timeoutMs) => {
      const { suite } = makeSuite();
      const provider = { id: 'echo', config: { apiKey: 'initial' } };
      (suite.tests![0].assert![0] as Assertion).provider = provider;
      let column = 0;
      vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hookName, context) => {
        if (hookName === 'beforeEach' && 'test' in context) {
          provider.config.apiKey = `column-key-${column++}`;
        }
        return context;
      });
      const keys: string[] = [];
      const call = vi.spyOn(EchoProvider.prototype, 'callApi').mockImplementation(async function (
        this: EchoProvider,
      ) {
        keys.push(this.config.apiKey);
        return { output: '0' };
      });
      const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
      try {
        await evaluate(suite, record, { maxConcurrency: 1, timeoutMs });
        expect(keys).toEqual(['column-key-0']);
        expect(provider.config.apiKey).toBe('column-key-1');
      } finally {
        call.mockRestore();
      }
    },
  );

  it.each(['changed endpoint', 'redacted credential'])(
    'refuses credential restoration with a %s',
    async (change) => {
      const { suite } = makeSuite();
      const assertion = suite.tests![0].assert![0] as Assertion;
      assertion.provider = {
        id: 'echo',
        config: { apiBaseUrl: 'https://old.example/v1', apiKey: 'old-key' },
      };
      const call = vi.spyOn(EchoProvider.prototype, 'callApi').mockResolvedValue({ output: '0' });
      const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
      try {
        await evaluate(suite, record, { maxConcurrency: 1 });
        assertion.provider = {
          id: 'echo',
          config:
            change === 'changed endpoint'
              ? { apiBaseUrl: 'https://new.example/v1', apiKey: 'new-key' }
              : { apiBaseUrl: 'https://old.example/v1', apiKey: '[REDACTED]' },
        };
        await markComparisonPending(record);
        cliState.resume = true;
        await evaluate(suite, record, { maxConcurrency: 1 });
        for (const row of await record.fetchResultsByTestIdx(0)) {
          expect(row.success).toBe(false);
          expect(row.error).toContain('Supply a grader configuration matching the saved result');
        }
        expect(call).toHaveBeenCalledTimes(1);
      } finally {
        call.mockRestore();
      }
    },
  );

  it('retains nonsecret hook overrides without inheriting removed settings on resume', async () => {
    const { suite } = makeSuite();
    (suite.tests![0].assert![0] as Assertion).provider = {
      id: 'echo',
      config: { temperature: 0, apiBaseUrl: 'https://original.example/v1', max_tokens: 100 },
    };
    const configs: Record<string, unknown>[] = [];
    const call = vi.spyOn(EchoProvider.prototype, 'callApi').mockImplementation(async function (
      this: EchoProvider,
    ) {
      configs.push(this.config);
      return { output: '0' };
    });
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hookName, context) => {
      if (hookName !== 'beforeEach' || !('test' in context)) {
        return context;
      }
      return {
        ...context,
        test: {
          ...context.test,
          assert: [
            {
              type: 'select-best',
              value: 'choose the best',
              provider: {
                id: 'echo',
                config: { temperature: 1, apiBaseUrl: 'https://hook.example/v1' },
              },
            },
          ],
        },
      };
    });
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    try {
      await evaluate(suite, record, { maxConcurrency: 1 });
      await markComparisonPending(record);
      cliState.resume = true;
      await evaluate(suite, record, { maxConcurrency: 1 });
      expect(configs).toHaveLength(2);
      for (const config of configs) {
        expect(config).toMatchObject({ temperature: 1, apiBaseUrl: 'https://hook.example/v1' });
        expect(config.max_tokens).toBeUndefined();
      }
    } finally {
      call.mockRestore();
    }
  });

  it('persists a hook-selected runtime grader identity and requires its handle to resume', async () => {
    const { grader, suite } = makeSuite();
    const hookGrader: ApiProvider = {
      id: () => 'hook-runtime-grader',
      config: { apiKey: secret },
      callApi: vi.fn(async () => ({ output: '0' })),
    };
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hookName, context) => {
      if (hookName !== 'beforeEach' || !('test' in context)) {
        return context;
      }
      return {
        ...context,
        test: {
          ...context.test,
          assert: [{ type: 'select-best', value: 'choose the best', provider: hookGrader }],
        },
      };
    });
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    await evaluate(suite, record, { maxConcurrency: 1 });
    const [saved] = await record.fetchResultsByTestIdx(0);
    expect((saved.testCase.assert![0] as Assertion).provider).toMatchObject({
      id: 'hook-runtime-grader',
      config: { apiKey: '[REDACTED]' },
    });
    await markComparisonPending(record);
    cliState.resume = true;
    await evaluate(suite, record, { maxConcurrency: 1 });
    for (const row of await record.fetchResultsByTestIdx(0)) {
      expect(row.success).toBe(false);
      expect(row.error).toContain('hook-runtime-grader');
      expect(row.error).toContain('Supply a grader configuration matching the saved result');
    }
    expect(grader.callApi).not.toHaveBeenCalled();
    expect(hookGrader.callApi).toHaveBeenCalledTimes(1);
    (suite.tests![0].assert![0] as Assertion).provider = hookGrader;
    await evaluate(suite, record, { maxConcurrency: 1 });
    expect(hookGrader.callApi).toHaveBeenCalledTimes(2);
    expect(grader.callApi).not.toHaveBeenCalled();
  });

  it('recovers a grader exception without retaining a failed comparison verdict', async () => {
    const { grader, suite, target } = makeSuite();
    vi.mocked(grader.callApi).mockRejectedValueOnce(new Error('temporary grader failure'));
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    // The cause is logged only when debug output was asked for, as with --verbose.
    const previousLogLevel = getLogLevel();
    const debug = vi.spyOn(logger, 'debug').mockImplementation(() => logger);
    setLogLevel('debug');
    try {
      await evaluate(suite, record, { maxConcurrency: 1 });

      expect(debug).toHaveBeenCalledWith('[Evaluator] select-best grading failed', {
        error: expect.stringContaining('temporary grader failure'),
        graderId: 'select-best-grader',
        testIdx: 0,
      });
    } finally {
      setLogLevel(previousLogLevel);
      debug.mockRestore();
    }
    // Saved rows say how to find the cause instead of carrying it.
    const failed = await record.fetchResultsByTestIdx(0);
    expect(failed).toHaveLength(2);
    for (const row of failed) {
      expect(row.failureReason).toBe(ResultFailureReason.ERROR);
      expect(row.error).toContain('Check the grader configuration and credentials');
      expect(row.error).toContain('Run with --verbose to log the underlying error');
      expect(row.error).not.toContain('temporary grader failure');
      expect(row.gradingResult?.pass).toBe(true);
      expect(row.gradingResult?.componentResults).toEqual([]);
    }
    expect(record.getStats()).toMatchObject({ successes: 0, failures: 0, errors: 2 });
    expect(await EvalResult.getCompletedIndexPairs(record.id, { excludeErrors: true })).toEqual(
      new Set(),
    );

    await markComparisonPending(record);

    cliState.resume = true;
    await evaluate(suite, record, { maxConcurrency: 1 });

    const recovered = await record.fetchResultsByTestIdx(0);
    expect(recovered.filter((row) => row.success)).toHaveLength(1);
    expect(recovered.find((row) => row.success)?.error).toBeFalsy();
    expect(recovered.every((row) => row.metadata?.__promptfoo?.comparisonError === undefined)).toBe(
      true,
    );
    expect(recovered.every((row) => row.failureReason !== ResultFailureReason.ERROR)).toBe(true);
    expect(record.getStats()).toMatchObject({ successes: 1, failures: 1, errors: 0 });
    expect(target.callApi).toHaveBeenCalledTimes(2);
    expect(grader.callApi).toHaveBeenCalledTimes(2);
  });

  it.each(['malformed YAML', 'Error', 'string'])(
    'keeps secrets in a grader %s out of persisted errors and recovers on resume',
    async (failure) => {
      const { grader, suite, target } = makeSuite();
      const errorSecret = 'fixture-non-url-grader-secret';
      const directory = await mkdtemp(path.join(tmpdir(), 'comparison-error-'));
      const outputPath = path.join(directory, 'results.jsonl');
      const graderPath = path.join(directory, 'grader.yaml');
      const call = vi.spyOn(EchoProvider.prototype, 'callApi').mockResolvedValue({ output: '0' });
      const debug = vi.spyOn(logger, 'debug').mockImplementation(() => logger);
      try {
        if (failure === 'malformed YAML') {
          await writeFile(graderPath, `id: echo\nconfig:\n  apiKey: ${errorSecret}: invalid\n`);
          (suite.tests![0].assert![0] as Assertion).provider = `file://${graderPath}`;
        } else {
          vi.mocked(grader.callApi).mockRejectedValueOnce(
            failure === 'Error' ? new Error(errorSecret) : errorSecret,
          );
        }
        const record = await Eval.create({ outputPath }, suite.prompts, { id: randomUUID() });
        await evaluate(suite, record, { maxConcurrency: 1 });
        const rows = await record.fetchResultsByTestIdx(0);
        expect(rows).toHaveLength(2);
        for (const serialized of [
          JSON.stringify(rows),
          JSON.stringify(await record.toResultsFile()),
          await readFile(outputPath, 'utf8'),
        ]) {
          expect(serialized).not.toContain(errorSecret);
        }
        for (const row of rows) {
          expect(row.failureReason).toBe(ResultFailureReason.ERROR);
          expect(row.error).toContain('Check the grader configuration and credentials');
          expect(row.error).toContain(failure === 'malformed YAML' ? graderPath : grader.id());
        }
        expect(record.getStats()).toMatchObject({ successes: 0, failures: 0, errors: 2 });
        // The run's log file records debug messages on every run, so without debug output
        // enabled the cause must not be logged at all.
        expect(getLogLevel()).not.toBe('debug');
        expect(debug).not.toHaveBeenCalledWith(
          '[Evaluator] select-best grading failed',
          expect.anything(),
        );
        expect(inspect(debug.mock.calls, { depth: null })).not.toContain(errorSecret);

        await writeFile(graderPath, 'id: echo\n');
        await markComparisonPending(record);
        cliState.resume = true;
        await evaluate(suite, record, { maxConcurrency: 1 });
        expect(record.getStats()).toMatchObject({ successes: 1, failures: 1, errors: 0 });
        expect(
          (await record.fetchResultsByTestIdx(0)).find((row) => row.success)?.error,
        ).toBeNull();
        expect(target.callApi).toHaveBeenCalledTimes(2);
      } finally {
        debug.mockRestore();
        call.mockRestore();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  it('compares only replacement rows during an error-only retry', async () => {
    const { grader, suite, target } = makeSuite();
    suite.tests![0].options = { rubricPrompt: '{{ outputs | dump }}' };
    vi.mocked(grader.callApi).mockRejectedValueOnce(new Error('temporary grader failure'));
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    await evaluate(suite, record, { maxConcurrency: 1 });
    const previousIds = (await record.fetchResultsByTestIdx(0)).map((row) => row.id);
    await markComparisonPending(record);
    cliState.resume = true;
    cliState.retryMode = true;
    cliState._retryErrorResultIds = previousIds;
    try {
      await evaluate(suite, record, { maxConcurrency: 1 });
      expect(target.callApi).toHaveBeenCalledTimes(4);
      const calls = vi.mocked(grader.callApi).mock.calls;
      expect(calls).toHaveLength(2);
      expect(JSON.parse(calls[1][0])).toHaveLength(2);
      const allRows = await record.fetchResultsByTestIdx(0);
      const replacements = allRows.filter((row) => !previousIds.includes(row.id));
      expect(replacements).toHaveLength(2);
      expect(replacements.filter((row) => row.success)).toHaveLength(1);
      expect(
        allRows
          .filter((row) => previousIds.includes(row.id))
          .every((row) => row.failureReason === ResultFailureReason.ERROR),
      ).toBe(true);
    } finally {
      delete cliState._retryErrorResultIds;
    }
  });

  it.each(['target unavailable', 'Error grading select-best: target unavailable'])(
    'preserves the target error %s when the comparison recovers',
    async (targetMessage) => {
      const { grader, suite, target } = makeSuite();
      suite.tests![0].options = { rubricPrompt: '{{ outputs | dump }}' };
      vi.mocked(target.callApi).mockImplementation(async (prompt) =>
        prompt === 'first'
          ? {
              error: targetMessage,
              metadata: {
                __promptfoo: {
                  comparisonError: {
                    success: true,
                    score: 1,
                    failureReason: ResultFailureReason.NONE,
                  },
                  retained: true,
                },
              },
            }
          : { output: prompt },
      );
      vi.mocked(grader.callApi)
        .mockImplementation(async (prompt) => ({
          output: String(JSON.parse(prompt).indexOf('second')),
        }))
        .mockRejectedValueOnce(new Error('temporary grader failure'));
      const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
      await evaluate(suite, record, { maxConcurrency: 1 });
      await markComparisonPending(record);
      cliState.resume = true;
      await evaluate(suite, record, { maxConcurrency: 1 });

      const results = await record.fetchResultsByTestIdx(0);
      const targetError = results.find((row) => row.promptIdx === 0)!;
      expect(targetError.failureReason).toBe(ResultFailureReason.ERROR);
      expect(targetError.error).toContain(targetMessage);
      expect(targetError.metadata?.__promptfoo).toEqual({ retained: true });
      expect(targetError.success).toBe(false);
      expect(results.find((row) => row.promptIdx === 1)?.success).toBe(true);
      expect(record.getStats()).toMatchObject({ successes: 1, failures: 0, errors: 1 });
    },
  );

  it.each(['removed', 'changed'])(
    'ignores an overridden default grader that was %s',
    async (change) => {
      const { grader, suite } = makeSuite();
      suite.tests![0].options = {
        provider: {
          id: 'echo',
          config: { apiKey: secret, apiBaseUrl: 'https://original.example' },
        },
      };
      const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
      await evaluate(suite, record, { maxConcurrency: 1 });
      suite.tests![0].options =
        change === 'removed'
          ? {}
          : {
              provider: {
                id: 'echo',
                config: { apiKey: secret, apiBaseUrl: 'https://changed.example' },
              },
            };
      await markComparisonPending(record);
      cliState.resume = true;
      await evaluate(suite, record, { maxConcurrency: 1 });

      expect(grader.callApi).toHaveBeenCalledTimes(2);
      expect(
        (await record.fetchResultsByTestIdx(0)).every(
          (row) => !row.error?.includes('Cannot resume'),
        ),
      ).toBe(true);
    },
  );

  it.each(['OPENAI_BASE_URL', 'OPENAI_ORGANIZATION'] as const)(
    'checks runtime %s before restoring a live grader',
    async (key) => {
      const { grader, suite } = makeSuite();
      const runtimeGrader = grader as ApiProvider & { env: EnvOverrides };
      const original = {
        OPENAI_BASE_URL: 'https://original.example/v1',
        OPENAI_ORGANIZATION: 'original-org',
        OPENAI_API_KEY: secret,
      };
      runtimeGrader.env = { ...original };
      suite.tests![0].options = { rubricPrompt: '{{ outputs | dump }}' };
      vi.mocked(suite.providers[0].callApi).mockImplementation(async (prompt) => ({
        output: prompt,
      }));
      vi.mocked(grader.callApi).mockImplementation(async (prompt) => ({
        output: String(JSON.parse(prompt).indexOf('first')),
      }));
      const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
      await evaluate(suite, record, { maxConcurrency: 1 });
      const savedProvider = (await record.fetchResultsByTestIdx(0))[0].testCase
        .assert![0] as Assertion;
      expect(savedProvider.provider).toMatchObject({
        env: { ...original, OPENAI_API_KEY: '[REDACTED]' },
      });
      expect(JSON.stringify(savedProvider)).not.toContain(secret);
      runtimeGrader.env = { ...original, [key]: 'changed', OPENAI_API_KEY: 'rotated-key' };
      await markComparisonPending(record);
      cliState.resume = true;
      await evaluate(suite, record, { maxConcurrency: 1 });
      expect(grader.callApi).toHaveBeenCalledTimes(1);
      expect(record.getStats()).toMatchObject({ successes: 0, failures: 0, errors: 2 });

      runtimeGrader.env = { ...original, OPENAI_API_KEY: 'rotated-key' };
      await evaluate(suite, record, { maxConcurrency: 1 });
      expect(grader.callApi).toHaveBeenCalledTimes(2);
      expect(record.getStats()).toMatchObject({ successes: 1, failures: 1, errors: 0 });
      const recovered = await record.fetchResultsByTestIdx(0);
      expect(recovered.find((row) => row.promptIdx === 0)?.success).toBe(true);
      expect(recovered.find((row) => row.promptIdx === 0)?.error).toBeFalsy();
    },
  );

  it('uses the original grader key without exposing it in returned grading results', async () => {
    const { grader, seenKeys, suite } = makeSuite();
    const [result] = await runCompareAssertion(
      suite.tests![0],
      suite.tests![0].assert![0] as Assertion,
      ['first answer', 'second answer'],
    );
    expect(grader.callApi).toHaveBeenCalledTimes(1);
    expect(seenKeys).toEqual([secret]);
    expect(JSON.stringify(result.assertion)).not.toContain(secret);
    expect(result.assertion).toMatchObject({ type: 'select-best', value: 'choose the best' });
    expect(result.assertion?.provider).toBeUndefined();
    expect(result.assertion?.config).toBeUndefined();
    expect(grader.config?.apiKey).toBe(secret);
  });

  it('grades with a live provider whose SDK client contains a cycle', async () => {
    const { grader, seenKeys, suite } = makeSuite();
    const client: { parent?: unknown } = {};
    client.parent = client;
    Object.assign(grader.config!, { sdkClient: client });

    const [result] = await runCompareAssertion(
      suite.tests![0],
      suite.tests![0].assert![0] as Assertion,
      ['first answer', 'second answer'],
    );

    expect(seenKeys).toEqual([secret]);
    expect(result.pass).toBe(true);
    expect(JSON.stringify(result.assertion)).not.toContain(secret);
  });

  it('keeps the grader key out of persisted comparison results', async () => {
    const { grader, seenKeys, suite } = makeSuite();
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    await evaluate(suite, record, { maxConcurrency: 1 });
    const persisted = await record.fetchResultsByTestIdx(0);
    expect(grader.callApi).toHaveBeenCalledTimes(1);
    expect(seenKeys).toEqual([secret]);
    expect(persisted).toHaveLength(2);
    expect(JSON.stringify(persisted.map((row) => row.gradingResult))).not.toContain(secret);
    expect(persisted[0].gradingResult?.componentResults?.[0].assertion?.provider).toBeUndefined();
    expect(persisted[0].gradingResult?.componentResults?.[0].assertion?.config).toBeUndefined();
  });

  it.each([
    ['runtime', 'query'],
    ['runtime', 'quoted query'],
    ['runtime', 'spaced query'],
    ['runtime', 'parenthesized query'],
    ['runtime', 'basic'],
    ['declarative', 'query'],
    ['declarative', 'basic'],
    ['string', 'query'],
    ['string', 'basic'],
    ['typed', 'query'],
  ])('keeps %s HTTP grader %s credentials live and out of saved results', async (kind, auth) => {
    const { suite, target } = makeSuite();
    const originalKey = 'fixture-url-original-secret';
    const rotatedKey = 'fixture-url-rotated-secret';
    const makeUrl = (key: string, host = 'grader.example') => {
      const query =
        auth === 'parenthesized query'
          ? `${key} (${key})`
          : auth === 'quoted query'
            ? `${key}'${key}`
            : auth === 'spaced query'
              ? `${key} ${key}`
              : key;
      return auth === 'basic'
        ? `https://fixture-user:${key}@${host}/grade`
        : `https://${host}/grade?api_key=${query}`;
    };
    const provider = (url: string) => {
      const options = { id: url, config: { method: 'GET' } };
      if (kind === 'runtime') {
        return new HttpProvider(url, options);
      }
      if (kind === 'string') {
        suite.providers = [target, new HttpProvider(url, options)];
        suite.providerPromptMap = { [url]: [] };
        return url;
      }
      return kind === 'typed' ? { text: options } : options;
    };
    const setProvider = (url: string) => {
      (suite.tests![0].assert![0] as Assertion).provider = provider(url);
    };
    setProvider(makeUrl(originalKey));
    const calls: string[] = [];
    const call = vi.spyOn(HttpProvider.prototype, 'callApi').mockImplementation(async function (
      this: HttpProvider,
    ) {
      calls.push(this.id());
      return { output: '0' };
    });
    const directory = await mkdtemp(path.join(tmpdir(), 'comparison-http-'));
    const outputPath = path.join(directory, 'results.jsonl');
    const record = await Eval.create({ outputPath }, suite.prompts, { id: randomUUID() });
    const expectRedacted = async () => {
      const rows = await record.fetchResultsByTestIdx(0);
      for (const serialized of [
        JSON.stringify(rows),
        JSON.stringify(await record.toResultsFile()),
        await readFile(outputPath, 'utf8'),
      ]) {
        expect(serialized).not.toContain(originalKey);
        expect(serialized).not.toContain(rotatedKey);
        expect(serialized).not.toContain('fixture-user');
      }
      return rows;
    };

    try {
      await evaluate(suite, record, { maxConcurrency: 1 });
      expect(calls).toEqual([makeUrl(originalKey)]);
      await expectRedacted();

      setProvider(makeUrl(rotatedKey));
      await markComparisonPending(record);
      cliState.resume = true;
      await evaluate(suite, record, { maxConcurrency: 1 });
      expect(calls).toEqual([makeUrl(originalKey), makeUrl(rotatedKey)]);
      await expectRedacted();

      await markComparisonPending(record);
      for (const url of [
        makeUrl(rotatedKey, 'different.example'),
        sanitizeProviderIdForLog(makeUrl(rotatedKey)),
      ]) {
        setProvider(url);
        await evaluate(suite, record, { maxConcurrency: 1 });
        for (const row of await expectRedacted()) {
          expect(row.failureReason).toBe(ResultFailureReason.ERROR);
          expect(row.error).toContain('Supply a grader configuration matching the saved result');
        }
        expect(calls).toHaveLength(2);
      }

      setProvider(makeUrl(rotatedKey));
      call.mockRejectedValue(
        new Error(
          `Request failed for ${makeUrl(rotatedKey)}; retried ${makeUrl(rotatedKey)}\nOther endpoint ${makeUrl(rotatedKey, 'other.example')}`,
        ),
      );
      await evaluate(suite, record, { maxConcurrency: 1 });
      for (const row of await expectRedacted()) {
        expect(row.error).toContain('Check the grader configuration and credentials');
      }
      expect(target.callApi).toHaveBeenCalledTimes(2);
    } finally {
      call.mockRestore();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each([
    'Prefer answers that replace PII with [REDACTED]',
    '[REDACTED]',
    '/path/[REDACTED]',
    'https://example.com/[REDACTED]',
  ])('allows literal redaction text in the grader prompt: %s', async (systemPrompt) => {
    const { grader, seenKeys, suite, target } = makeSuite();
    grader.config!.custom_system_prompt = systemPrompt;
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });

    await evaluate(suite, record, { maxConcurrency: 1 });
    await markComparisonPending(record);
    cliState.resume = true;
    await evaluate(suite, record, { maxConcurrency: 1 });

    expect(grader.callApi).toHaveBeenCalledTimes(2);
    expect(seenKeys).toEqual([secret, secret]);
    expect(target.callApi).toHaveBeenCalledTimes(2);
    for (const row of await record.fetchResultsByTestIdx(0)) {
      expect(row.failureReason).not.toBe(ResultFailureReason.ERROR);
      expect((row.testCase.assert![0] as Assertion).provider).toMatchObject({
        config: { custom_system_prompt: systemPrompt },
      });
    }
  });

  it.each(['config', 'env', 'headers'])(
    'rejects credential placeholders in %s while retaining literal prompt markers',
    async (location) => {
      const { grader, suite } = makeSuite();
      const credentials = { apiKey: secret };
      if (location === 'config') {
        grader.config = credentials;
      } else if (location === 'env') {
        Object.assign(grader, { env: { OPENAI_API_KEY: secret } });
      } else {
        grader.config!.headers = { 'x-gateway-auth': secret };
      }
      grader.config!.custom_system_prompt = '[REDACTED]';
      const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
      await evaluate(suite, record, { maxConcurrency: 1 });
      if (location === 'config') {
        credentials.apiKey = '[REDACTED]';
      } else if (location === 'env') {
        Object.assign(grader, { env: { OPENAI_API_KEY: '[REDACTED]' } });
      } else {
        grader.config!.headers['x-gateway-auth'] = '[REDACTED]';
      }
      await markComparisonPending(record);
      cliState.resume = true;
      await evaluate(suite, record, { maxConcurrency: 1 });
      expect(grader.callApi).toHaveBeenCalledTimes(1);
      for (const row of await record.fetchResultsByTestIdx(0)) {
        expect(row.failureReason).toBe(ResultFailureReason.ERROR);
        expect(row.error).toContain('Supply a grader configuration matching the saved result');
      }
    },
  );

  it('counts comparison errors for fresh siblings whose hook removed select-best', async () => {
    const { grader, suite } = makeSuite();
    vi.mocked(grader.callApi).mockRejectedValueOnce(new Error('grader unavailable'));
    let column = 0;
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hookName, context) => {
      if (hookName === 'beforeEach' && 'test' in context && column++ === 1) {
        return { ...context, test: { ...context.test, assert: [] } };
      }
      return context;
    });
    const recordEvent = vi.spyOn(telemetry, 'record');
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    try {
      await evaluate(suite, record, { maxConcurrency: 1 });
      expect(record.getStats()).toMatchObject({ successes: 0, failures: 0, errors: 2 });
      expect(
        recordEvent.mock.calls.filter(([event]) => event === 'eval_ran').at(-1)?.[1],
      ).toMatchObject({
        numPasses: 0,
        numFails: 0,
        numErrors: 2,
      });
      await markComparisonPending(record);
      cliState.resume = true;
      await evaluate(suite, record, { maxConcurrency: 1 });
      expect(
        recordEvent.mock.calls.filter(([event]) => event === 'eval_ran').at(-1)?.[1],
      ).toMatchObject({
        numTests: 0,
        numPasses: 0,
        numFails: 0,
        numErrors: 0,
      });
    } finally {
      recordEvent.mockRestore();
    }
  });

  it('preserves a comparison error through max-score and recovers it on resume', async () => {
    const { grader, suite, target } = makeSuite();
    suite.tests![0].assert = [
      { type: 'contains', value: 'first' },
      suite.tests![0].assert![0],
      { type: 'max-score' },
    ];
    suite.tests![0].options = { rubricPrompt: '{{ outputs | dump }}' };
    vi.mocked(target.callApi).mockImplementation(async (prompt) => ({ output: prompt }));
    vi.mocked(grader.callApi)
      .mockImplementation(async (prompt) => ({
        output: String(JSON.parse(prompt).indexOf('first')),
      }))
      .mockRejectedValueOnce(new Error('grader unavailable'));
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });

    await evaluate(suite, record, { maxConcurrency: 1 });
    for (const row of await record.fetchResultsByTestIdx(0)) {
      expect(row.success).toBe(false);
      expect(row.failureReason).toBe(ResultFailureReason.ERROR);
      expect(row.error).toContain('Check the grader configuration and credentials');
    }
    expect(record.getStats()).toMatchObject({ successes: 0, failures: 0, errors: 2 });

    await markComparisonPending(record);

    cliState.resume = true;
    await evaluate(suite, record, { maxConcurrency: 1 });
    expect(record.getStats()).toMatchObject({ successes: 1, failures: 1, errors: 0 });
    const rows = await record.fetchResultsByTestIdx(0);
    expect(rows.find((row) => row.success)?.error).toBeNull();
    expect(rows.every((row) => !row.metadata?.__promptfoo?.comparisonError)).toBe(true);
    expect(target.callApi).toHaveBeenCalledTimes(2);
    expect(grader.callApi).toHaveBeenCalledTimes(2);
  });

  it('redacts a raw grader key when updating an existing result', async () => {
    const { suite } = makeSuite();
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    await evaluate(suite, record, { maxConcurrency: 1 });
    const [result] = await record.fetchResultsByTestIdx(0);
    result.gradingResult!.componentResults![0].assertion = {
      type: 'select-best',
      value: 'choose the best',
      provider: { id: 'grader', config: { apiKey: secret } },
    };
    await result.save();

    const [persisted] = await record.fetchResultsByTestIdx(0);
    expect(JSON.stringify(persisted.gradingResult)).not.toContain(secret);
    expect(persisted.gradingResult?.componentResults?.[0].assertion?.provider).toMatchObject({
      config: { apiKey: '[REDACTED]' },
    });
  });

  it('redacts grader keys at every JSONL assertion depth without mutating the result', () => {
    const raw = {
      gradingResult: {
        pass: true,
        score: 1,
        assertion: {
          type: 'select-best',
          value: 'choose the best',
          provider: { id: 'grader', config: { apiKey: secret } },
        },
        componentResults: [
          {
            componentResults: [
              {
                assertion: {
                  type: 'select-best',
                  value: 'choose the best',
                  provider: { id: 'grader', config: { apiKey: secret } },
                },
              },
            ],
          },
        ],
      },
    };
    const artifact = sanitizeResultForJsonlArtifact(raw);
    expect(JSON.stringify(artifact)).not.toContain(secret);
    expect(artifact.gradingResult.assertion.provider.config.apiKey).toBe('[REDACTED]');
    expect(
      artifact.gradingResult.componentResults[0].componentResults[0].assertion.provider.config
        .apiKey,
    ).toBe('[REDACTED]');
    expect(raw.gradingResult.assertion.provider.config.apiKey).toBe(secret);
    expect(
      raw.gradingResult.componentResults[0].componentResults[0].assertion.provider.config.apiKey,
    ).toBe(secret);
  });

  it('uses the live grader when a resumed comparison row has no pending eval options', async () => {
    const { grader, seenKeys, suite, target } = makeSuite();
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    await evaluate(suite, record, { maxConcurrency: 1 });
    expect(seenKeys).toEqual([secret]);
    await markComparisonPending(record);
    cliState.resume = true;
    await evaluate(suite, record, { maxConcurrency: 1 });
    expect(target.callApi).toHaveBeenCalledTimes(2);
    expect(grader.callApi).toHaveBeenCalledTimes(2);
    expect(seenKeys).toEqual([secret, secret]);
  });
});
