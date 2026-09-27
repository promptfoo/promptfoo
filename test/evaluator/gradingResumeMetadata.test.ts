import './setup';

import { randomUUID } from 'node:crypto';

import { afterEach, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { evaluate } from '../../src/evaluator';
import { runExtensionHook } from '../../src/evaluatorHelpers';
import Eval from '../../src/models/eval';
import { createDeferred } from '../util/utils';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { ApiProvider, ProviderResponse, TestSuite } from '../../src/types/index';

describeEvaluator('interrupted grading after metadata hooks', () => {
  afterEach(() => {
    vi.mocked(runExtensionHook).mockReset();
  });

  it.each([
    'nested response mutation',
    'response replacement',
    'top-level mutation',
    'redaction',
    'unchanged',
    'reordered keys',
    'absent metadata',
    'score-only',
  ])('handles %s without replaying projected inputs', async (mode) => {
    const changed = [
      'nested response mutation',
      'response replacement',
      'top-level mutation',
      'redaction',
    ].includes(mode);
    const controller = new AbortController();
    const started = createDeferred<void>();
    const pending = createDeferred<ProviderResponse>();
    let resuming = false;
    const grader: ApiProvider = {
      id: () => 'offline-metadata-grader',
      callApi: vi.fn(async () => {
        started.resolve();
        return resuming ? { output: '{"pass":true,"score":1,"reason":"graded"}' } : pending.promise;
      }),
    };
    const target: ApiProvider = {
      id: () => 'offline-metadata-target',
      callApi: vi.fn(async () => ({
        output: 'retained target output',
        ...(mode !== 'absent metadata' && {
          metadata: { nested: { count: 0, remove: 'fixture-private-value' }, other: true },
        }),
      })),
    };
    const hookCalls = vi.fn();
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hook, context) => {
      if (hook !== 'afterEach' || !('result' in context)) {
        return context;
      }
      hookCalls();
      const { result } = context;
      const metadata = result.response!.metadata!;
      switch (mode) {
        case 'nested response mutation':
          (metadata.nested as { count: number }).count++;
          break;
        case 'response replacement':
          result.response!.metadata = { nested: { count: 1 } };
          break;
        case 'top-level mutation':
          result.metadata!.hookCount = Number(result.metadata!.hookCount ?? 0) + 1;
          break;
        case 'redaction':
          delete (metadata.nested as { remove?: string }).remove;
          break;
        case 'reordered keys':
          result.response!.metadata = { other: metadata.other, nested: metadata.nested };
          break;
        case 'score-only':
          result.namedScores = { hookScore: result.score };
          break;
      }
      return context;
    });
    const suite: TestSuite = {
      providers: [target],
      prompts: [toPrompt('hello')],
      extensions: ['file://offline-metadata-hook.js'],
      tests: [
        {
          assert: [
            {
              type: 'javascript',
              value: 'context.metadata?.nested?.count === 0 || !context.metadata?.nested',
            },
            { type: 'llm-rubric', value: 'fixture', provider: grader },
          ],
        },
      ],
    };
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    const evaluation = evaluate(suite, record, {
      maxConcurrency: 1,
      abortSignal: controller.signal,
    });
    try {
      await started.promise;
      controller.abort();
      await evaluation;
      pending.resolve({ output: 'late result' });
      const [interrupted] = await record.getResults();
      const savedMetadata = JSON.stringify({
        metadata: interrupted.metadata,
        response: interrupted.response?.metadata,
      });
      expect(interrupted.gradingResult?.metadata?.__promptfoo?.assertionGradingInterrupted).toBe(
        true,
      );
      resuming = true;
      cliState.resume = true;
      const saved = (await Eval.findById(record.id))!;
      await evaluate(suite, saved, { maxConcurrency: 1 });
      const [result] = await saved.getResults();
      expect(result.id).toBe(interrupted.id);
      expect(result.response?.output).toBe('retained target output');
      if (changed) {
        expect(result.error).toContain(
          'Cannot resume assertion grading: afterEach changed metadata',
        );
        expect(result.error).toContain('Rerun the test');
        expect(result.success).toBe(false);
        expect(result.score).toBe(0);
        expect(saved.getStats()).toMatchObject({ successes: 0, failures: 0, errors: 1 });
        expect(
          JSON.stringify({ metadata: result.metadata, response: result.response?.metadata }),
        ).toBe(savedMetadata);
        expect(grader.callApi).toHaveBeenCalledOnce();
        expect(hookCalls).toHaveBeenCalledOnce();
      } else {
        expect(result).toMatchObject({ success: true, score: 1 });
        expect(result.error).toBeFalsy();
        expect(saved.getStats()).toMatchObject({ successes: 1, failures: 0, errors: 0 });
        expect(grader.callApi).toHaveBeenCalledTimes(2);
        expect(hookCalls).toHaveBeenCalledTimes(2);
      }
      if (mode === 'redaction') {
        expect(JSON.stringify(result)).not.toContain('fixture-private-value');
      }
      expect(
        result.gradingResult?.metadata?.__promptfoo?.assertionGradingInterrupted,
      ).toBeUndefined();
      const finalRow = JSON.stringify(result);
      await evaluate(suite, saved, { maxConcurrency: 1 });
      expect(JSON.stringify((await saved.getResults())[0])).toBe(finalRow);
      expect(target.callApi).toHaveBeenCalledOnce();
      expect(grader.callApi).toHaveBeenCalledTimes(changed ? 1 : 2);
      expect(hookCalls).toHaveBeenCalledTimes(changed ? 1 : 2);
    } finally {
      pending.resolve({ output: 'late result' });
      await evaluation;
      cliState.resume = false;
    }
  });
});
