import './setup';

import { randomUUID } from 'node:crypto';

import { expect, it, vi } from 'vitest';
import * as assertions from '../../src/assertions';
import cliState from '../../src/cliState';
import { evaluate } from '../../src/evaluator';
import { runExtensionHook } from '../../src/evaluatorHelpers';
import Eval from '../../src/models/eval';
import {
  asEvaluateResult,
  getStripFlags,
  sanitizeResultForJsonlArtifact,
} from '../../src/models/evalResult';
import { ResultFailureReason } from '../../src/types/index';
import { createDeferred } from '../util/utils';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { ApiProvider, ProviderResponse, TestSuite } from '../../src/types/index';

describeEvaluator('resuming interrupted grouped assertion grading', () => {
  it.each([
    {
      pass: true,
      interruptAgain: false,
      termination: 'pause',
      concurrency: 2,
      initialTermination: 'deadline',
    },
    {
      pass: true,
      interruptAgain: false,
      termination: 'pause',
      concurrency: 1,
      initialTermination: 'step timeout',
    },
    { pass: true, interruptAgain: false, termination: 'pause', concurrency: 2 },
    { pass: false, interruptAgain: false, termination: 'pause', concurrency: 2 },
    ...[true, false].flatMap((pass) =>
      [true, false].map((interruptAgain) => ({
        pass,
        interruptAgain,
        termination: 'pause',
        concurrency: 1,
      })),
    ),
    { pass: true, interruptAgain: true, termination: 'deadline', concurrency: 1 },
    { pass: true, interruptAgain: true, termination: 'step timeout', concurrency: 1 },
  ])(
    'retries grading without repeating the target, pass=$pass repeated=$interruptAgain termination=$termination concurrency=$concurrency initial=$initialTermination',
    async ({ pass, interruptAgain, termination, concurrency, initialTermination = 'pause' }) => {
      vi.useFakeTimers();
      const runAssertions = vi.spyOn(assertions, 'runAssertions');
      const controller = new AbortController();
      const started = createDeferred<void>();
      const response = createDeferred<ProviderResponse>();
      let resumeAttempt = 0;
      const retryStarted = createDeferred<void>();
      const retryResponse = createDeferred<ProviderResponse>();
      const grader: ApiProvider = {
        id: () => 'offline-resume-assertion-grader',
        callApi: vi.fn(async () => {
          started.resolve();
          if (resumeAttempt === 0) {
            return response.promise;
          }
          if (resumeAttempt === 1 && interruptAgain) {
            retryStarted.resolve();
            return retryResponse.promise;
          }
          return {
            output: JSON.stringify({ pass, score: pass ? 0.75 : 0.25, reason: 'finished grading' }),
          };
        }),
      };
      const target: ApiProvider = {
        id: () => 'offline-resume-assertion-target',
        transform: 'output + "-provider"',
        callApi: vi.fn(async () => ({
          output: 'original target output',
          tokenUsage: { total: 3, prompt: 2, completion: 1 },
          cost: 0.1,
        })),
      };
      const suite: TestSuite = {
        providers: [target],
        prompts: [toPrompt('hello {{name}}')],
        extensions: ['file://offline-resume-hook.js'],
        tests: [
          { vars: { name: 'Ada' }, assert: [{ type: 'javascript', value: () => true }] },
          {
            vars: { name: 'Ada' },
            options: { transform: 'output + "-test"' },
            assert: [{ type: 'llm-rubric', value: 'fixture', provider: grader }],
          },
        ],
      };
      const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
      const evaluation = evaluate(suite, record, {
        abortSignal: controller.signal,
        maxConcurrency: concurrency,
        timeoutMs: initialTermination === 'step timeout' ? 10 : 0,
        maxEvalTimeMs: initialTermination === 'deadline' ? 10 : 0,
      });
      try {
        await vi.advanceTimersByTimeAsync(1);
        await started.promise;
        if (initialTermination === 'pause') {
          controller.abort();
        }
        await vi.advanceTimersByTimeAsync(20);
        await evaluation;
        const first = await record.getResults();
        expect(first).toHaveLength(2);
        const interrupted = first.find((row) => row.testIdx === 1)!;
        const completed = first.find((row) => row.testIdx === 0)!;
        expect(interrupted).toMatchObject({
          failureReason: ResultFailureReason.ERROR,
          response: {
            output: 'original target output-provider-test',
            providerTransformedOutput: 'original target output-provider',
          },
        });
        const stripFlags = getStripFlags({ PROMPTFOO_STRIP_RESPONSE_OUTPUT: 'true' });
        for (const projection of [
          asEvaluateResult(interrupted, stripFlags),
          sanitizeResultForJsonlArtifact(asEvaluateResult(interrupted), stripFlags),
        ]) {
          expect(projection.response?.output).toBe('[output stripped]');
          expect(projection.response).not.toHaveProperty('providerTransformedOutput');
        }
        response.resolve({ output: '{"pass":false,"score":0,"reason":"late response"}' });
        await vi.advanceTimersByTimeAsync(0);
        expect((await record.getResults()).find((row) => row.testIdx === 1)).toMatchObject({
          id: interrupted.id,
          gradingResult: { metadata: { __promptfoo: { assertionGradingInterrupted: true } } },
        });
        expect(
          vi
            .mocked(runExtensionHook)
            .mock.calls.filter(
              ([, hook, context]) =>
                hook === 'afterEach' && 'result' in context && context.result.testIdx === 1,
            ),
        ).toHaveLength(1);
        resumeAttempt = 1;
        cliState.resume = true;
        if (interruptAgain) {
          const retryController = new AbortController();
          const retryRecord = await Eval.findById(record.id);
          const retry = evaluate(suite, retryRecord!, {
            abortSignal: retryController.signal,
            maxConcurrency: 1,
            timeoutMs: termination === 'step timeout' ? 10 : 0,
            maxEvalTimeMs: termination === 'deadline' ? 10 : 0,
          });
          await vi.advanceTimersByTimeAsync(1);
          await retryStarted.promise;
          if (termination === 'pause') {
            retryController.abort();
          }
          await vi.advanceTimersByTimeAsync(20);
          await retry;
          expect((await retryRecord!.getResults()).find((row) => row.testIdx === 1)).toMatchObject({
            id: interrupted.id,
            failureReason: ResultFailureReason.ERROR,
            ...(termination === 'step timeout' && { error: 'Evaluation timed out after 10ms' }),
            gradingResult: { metadata: { __promptfoo: { assertionGradingInterrupted: true } } },
          });
          retryResponse.resolve({ output: 'late retry' });
          await vi.advanceTimersByTimeAsync(0);
          resumeAttempt = 2;
        }
        const saved = await Eval.findById(record.id);
        await cliState.withEnv(
          { PROMPTFOO_STRIP_PROMPT_TEXT: 'true', PROMPTFOO_STRIP_TEST_VARS: 'true' },
          () => evaluate(suite, saved!, { maxConcurrency: 1, timeoutMs: 0, maxEvalTimeMs: 0 }),
        );
        expect(runAssertions).toHaveBeenLastCalledWith(
          expect.objectContaining({
            prompt: 'hello Ada',
            vars: { name: 'Ada' },
            providerResponse: expect.objectContaining({
              output: 'original target output-provider-test',
              providerTransformedOutput: 'original target output-provider',
            }),
          }),
        );
        const rows = await saved!.getResults();
        expect(rows).toHaveLength(2);
        expect(rows.find((row) => row.testIdx === 0)).toMatchObject({
          id: completed.id,
          success: true,
          score: 1,
          gradingResult: completed.gradingResult,
        });
        const retried = rows.find((row) => row.testIdx === 1)!;
        expect(retried).toMatchObject({
          id: interrupted.id,
          success: pass,
          score: pass ? 0.75 : 0.25,
          failureReason: pass ? ResultFailureReason.NONE : ResultFailureReason.ASSERT,
        });
        expect(retried.error ?? '').not.toContain('Aborted:');
        expect(retried.gradingResult?.componentResults?.[0].reason).toBe('finished grading');
        expect(target.callApi).toHaveBeenCalledTimes(2);
        expect(grader.callApi).toHaveBeenCalledTimes(interruptAgain ? 3 : 2);
        expect(JSON.stringify(retried.gradingResult)).not.toContain('assertionGradingInterrupted');
        expect(saved!.getStats()).toMatchObject({
          successes: pass ? 2 : 1,
          failures: pass ? 0 : 1,
          errors: 0,
        });
        expect(saved!.prompts[0].metrics).toMatchObject({
          testPassCount: pass ? 2 : 1,
          testFailCount: pass ? 0 : 1,
          testErrorCount: 0,
          assertPassCount: pass ? 2 : 1,
          assertFailCount: pass ? 0 : 1,
          score: pass ? 1.75 : 1.25,
          cost: 0.2,
        });
        expect(saved!.prompts[0].metrics?.tokenUsage).toMatchObject({
          total: 6,
          prompt: 4,
          completion: 2,
        });
      } finally {
        retryResponse.resolve({ output: 'late retry' });
        response.resolve({ output: 'late response' });
        await evaluation;
        cliState.resume = false;
        runAssertions.mockRestore();
      }
    },
  );
});
