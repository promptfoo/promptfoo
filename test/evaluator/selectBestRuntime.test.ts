import './setup';

import { randomUUID } from 'node:crypto';

import { expect, it, vi } from 'vitest';
import { runCompareAssertion } from '../../src/assertions';
import cliState from '../../src/cliState';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { sanitizeResultForJsonlArtifact } from '../../src/models/evalResult';
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
