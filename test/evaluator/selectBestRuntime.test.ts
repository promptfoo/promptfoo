import './setup';

import { randomUUID } from 'node:crypto';

import { expect, it, vi } from 'vitest';
import { runCompareAssertion } from '../../src/assertions';
import cliState from '../../src/cliState';
import { evaluate } from '../../src/evaluator';
import { runExtensionHook } from '../../src/evaluatorHelpers';
import Eval from '../../src/models/eval';
import { sanitizeResultForJsonlArtifact } from '../../src/models/evalResult';
import { EchoProvider } from '../../src/providers/echo';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { ApiProvider, Assertion, TestSuite } from '../../src/types/index';

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
        cliState.resume = true;
        await evaluate(suite, record, { maxConcurrency: 1 });

        expect(grader.callApi).not.toHaveBeenCalled();
        expect(changedGrader).toHaveBeenCalledTimes(2);
      } finally {
        changedGrader.mockRestore();
      }
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
    cliState.resume = true;
    await evaluate(suite, record, { maxConcurrency: 1 });
    expect(target.callApi).toHaveBeenCalledTimes(2);
    expect(grader.callApi).toHaveBeenCalledTimes(2);
    expect(seenKeys).toEqual([secret, secret]);
  });
});
