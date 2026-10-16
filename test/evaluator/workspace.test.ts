import './setup';

import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { evaluate, runEval } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { isAgentWorkspace } from '../../src/providers/agentWorkspace';
import { mockProcessEnv } from '../util/utils';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { ApiProvider, TestSuite } from '../../src/types/index';

describeEvaluator('evaluator copy_working_dir workspaces', () => {
  let fixture: string;
  let workspaces: string[];
  let existedDuringGrading: boolean[];
  let liveWorkspaceCounts: number[];

  // Writes into the working directory it is given and reports which workspace it used.
  const createTarget = (config: Record<string, unknown>): ApiProvider => ({
    id: () => 'workspace-target',
    config,
    callApi: vi.fn<ApiProvider['callApi']>(async (_prompt, context) => {
      const dir = context?.prompt.config?.working_dir as string;
      fs.writeFileSync(path.join(dir, 'run.txt'), `repeat ${context?.repeatIndex}\n`);
      workspaces.push(dir);
      liveWorkspaceCounts.push(workspaces.filter((workspace) => fs.existsSync(workspace)).length);
      return { output: `workspace-${workspaces.length - 1}` };
    }),
  });

  // An llm-rubric grader that checks the workspace of the output it grades.
  const createGrader = (): ApiProvider => ({
    id: () => 'workspace-grader',
    callApi: vi.fn<ApiProvider['callApi']>(async (prompt) => {
      const index = Number(/workspace-(\d+)/.exec(prompt)?.[1]);
      const exists = fs.existsSync(path.join(workspaces[index], 'run.txt'));
      existedDuringGrading.push(exists);
      return { output: JSON.stringify({ pass: exists, score: exists ? 1 : 0, reason: 'checked' }) };
    }),
  });

  beforeEach(() => {
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluator-workspace-fixture-'));
    fs.writeFileSync(path.join(fixture, 'README.md'), 'fixture\n');
    workspaces = [];
    existedDuringGrading = [];
    liveWorkspaceCounts = [];
  });

  afterEach(() => {
    fs.rmSync(fixture, { recursive: true, force: true });
  });

  // With concurrency 1 the evaluator defers model-graded assertions until after the step.
  it.each([
    ['inline', 3],
    ['deferred', 1],
  ])(
    'runs each repeat in its own workspace until its %s grading finishes',
    async (_label, maxConcurrency) => {
      const testSuite: TestSuite = {
        providers: [createTarget({ working_dir: fixture, copy_working_dir: true })],
        prompts: [toPrompt('Change the fixture')],
        tests: [
          {
            assert: [{ type: 'llm-rubric', value: 'The workspace was changed' }],
            options: { provider: createGrader() },
          },
        ],
      };
      const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

      await evaluate(testSuite, evalRecord, { maxConcurrency, repeat: 3 });
      const summary = await evalRecord.toEvaluateSummary();

      expect(summary.stats.successes).toBe(3);
      expect(new Set(workspaces).size).toBe(3);
      expect(existedDuringGrading).toEqual([true, true, true]);
      expect(Math.max(...liveWorkspaceCounts)).toBeLessThanOrEqual(maxConcurrency);
      expect(workspaces.filter((dir) => fs.existsSync(dir))).toEqual([]);
      expect(fs.readdirSync(fixture)).toEqual(['README.md']);
      expect(
        new Set(summary.results.map((result) => result.response?.metadata?.workingDir)),
      ).toEqual(new Set(workspaces));
      // The workspace is passed to the call, not saved as the prompt's config.
      expect(summary.results.map((result) => result.prompt.config)).not.toContainEqual(
        expect.objectContaining({ working_dir: expect.anything() }),
      );
    },
  );

  it('keeps the workspace until concurrent grading stops after an assertion fails', async () => {
    const restoreEnv = mockProcessEnv({
      PROMPTFOO_ASSERTIONS_MAX_CONCURRENCY: '2',
      PROMPTFOO_SHORT_CIRCUIT_TEST_FAILURES: 'true',
    });
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const grader: ApiProvider = {
      id: () => 'openai:codex-sdk',
      callApi: vi.fn<ApiProvider['callApi']>(async (_prompt, context) => {
        const dir = context?.prompt.config?.working_dir as string;
        expect(dir).toBe(workspaces[0]);
        signalStarted();
        await held;
        existedDuringGrading.push(fs.existsSync(path.join(dir, 'run.txt')));
        return { output: JSON.stringify({ pass: true, score: 1, reason: 'checked' }) };
      }),
    };
    let settled = false;
    const result = runEval({
      provider: createTarget({ working_dir: fixture, copy_working_dir: 'copy' }),
      prompt: toPrompt('Change the fixture'),
      test: {
        vars: {},
        assert: [
          {
            type: 'javascript',
            value: async () => {
              await started;
              return { pass: false, score: 0, reason: 'first failure' };
            },
          },
          { type: 'agent-rubric', value: 'The workspace was changed', provider: grader },
        ],
      },
      testIdx: 0,
      promptIdx: 0,
      delay: 0,
      repeatIndex: 0,
      isRedteam: false,
      evaluateOptions: {},
    }).then((rows) => {
      settled = true;
      return rows;
    });

    try {
      await started;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(settled).toBe(false);
      expect(fs.existsSync(workspaces[0])).toBe(true);
      expect(isAgentWorkspace(workspaces[0])).toBe(true);
    } finally {
      release();
      await result;
      restoreEnv();
    }

    expect(existedDuringGrading).toEqual([true]);
    expect(fs.existsSync(workspaces[0])).toBe(false);
    expect((await result)[0].error).toContain('first failure');
  });

  it('merges copy_working_dir from the prompt config', async () => {
    const target = createTarget({ working_dir: fixture });
    const testSuite: TestSuite = {
      providers: [target],
      prompts: [{ ...toPrompt('Change the fixture'), config: { copy_working_dir: 'copy' } }],
      tests: [{}],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, {});

    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]).not.toBe(fixture);
    expect(fs.existsSync(workspaces[0])).toBe(false);
    expect(fs.readdirSync(fixture)).toEqual(['README.md']);
  });

  it('reports a workspace that cannot be created without calling the provider', async () => {
    const target = createTarget({
      working_dir: path.join(fixture, 'missing'),
      copy_working_dir: true,
    });
    const testSuite: TestSuite = {
      providers: [target],
      prompts: [toPrompt('Change the fixture')],
      tests: [{}],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(target.callApi).not.toHaveBeenCalled();
    expect(summary.stats.errors).toBe(1);
    expect(summary.results[0].error).toContain('copy_working_dir: working_dir does not exist');
  });

  it('removes the workspace of a timed-out step once its call stops', async () => {
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const target: ApiProvider = {
      id: () => 'slow-target',
      config: { working_dir: fixture, copy_working_dir: 'copy' },
      callApi: vi.fn<ApiProvider['callApi']>(async (_prompt, context, options) => {
        workspaces.push(context?.prompt.config?.working_dir as string);
        signalStarted();
        // Like a real provider, stop as soon as the call is aborted, including before it starts,
        // and reject with an AbortError, which the scheduler does not retry.
        if (!options?.abortSignal?.aborted) {
          await new Promise((resolve) => options?.abortSignal?.addEventListener('abort', resolve));
        }
        throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
      }),
    };
    const testSuite: TestSuite = {
      providers: [target],
      prompts: [toPrompt('Change the fixture')],
      tests: [{}],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    const evaluation = evaluate(testSuite, evalRecord, { timeoutMs: 100 });
    await started;
    expect(fs.existsSync(workspaces[0])).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    await evaluation;
    const summary = await evalRecord.toEvaluateSummary();

    expect(summary.results[0].error).toContain('timed out');
    await vi.waitFor(
      () => {
        expect(workspaces).toHaveLength(1);
        expect(fs.existsSync(workspaces[0])).toBe(false);
      },
      { timeout: 5000 },
    );
  });
});
