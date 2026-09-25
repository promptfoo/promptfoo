import './setup';

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { disableCache } from '../../src/cache';
import { importModule } from '../../src/esm';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import { ClaudeCodeSDKProvider } from '../../src/providers/claude-agent-sdk';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';
import type { Query, SDKMessage } from '@anthropic-ai/claude-agent-sdk';

import type { ApiProvider, TestSuite } from '../../src/types/index';

vi.mock('../../src/esm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/esm')>()),
  importModule: vi.fn(),
  resolvePackageEntryPoint: vi.fn(() => '@anthropic-ai/claude-agent-sdk'),
}));

const mockQuery = vi.fn();
const sources: string[] = [];
const graders: ClaudeCodeSDKProvider[] = [];
const workspacesToClean: string[] = [];

function graderResult(result = '{"pass":true,"score":1}'): Query {
  return (async function* () {
    yield {
      type: 'result',
      subtype: 'success',
      session_id: 'grader-copy-test',
      result,
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      total_cost_usd: 0,
      duration_ms: 1,
      duration_api_ms: 1,
      num_turns: 1,
      permission_denials: [],
    } as unknown as SDKMessage;
  })() as unknown as Query;
}

async function createSuite(testCount: number) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-grader-copy-test-'));
  sources.push(root);
  const source = path.join(root, 'fixture');
  await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'seed.txt'), 'fixture');
  const grader = new ClaudeCodeSDKProvider({
    config: { apiKey: 'test', working_dir: source, copy_working_dir: true },
  });
  graders.push(grader);
  const target: ApiProvider = {
    id: () => 'fixture-target',
    callApi: async () => ({ output: 'done' }),
  };
  const suite: TestSuite = {
    providers: [target],
    prompts: [toPrompt('edit fixture')],
    tests: Array.from({ length: testCount }, () => ({
      assert: [{ type: 'agent-rubric', value: 'Verify the fixture', provider: grader }],
    })),
  };
  return { suite, grader, source };
}

describeEvaluator('Claude grader working directory copy', () => {
  beforeEach(() => {
    disableCache();
    mockQuery.mockReset();
    vi.mocked(importModule).mockResolvedValue({ query: mockQuery });
    mockQuery.mockImplementation(() => graderResult());
  });

  afterEach(async () => {
    await Promise.all(graders.splice(0).map((grader) => grader.cleanup()));
    await Promise.all(
      workspacesToClean
        .splice(0)
        .map((dir) => fs.rm(path.dirname(dir), { recursive: true, force: true })),
    );
    await Promise.all(
      sources.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
    );
  });

  it('releases a real agent-rubric grader copy after ordinary grading', async () => {
    const { suite, grader, source } = await createSuite(1);
    const workspaces: string[] = [];
    mockQuery.mockImplementation(({ options }) => {
      workspaces.push(options.cwd);
      return graderResult();
    });
    const graderCall = vi.spyOn(grader, 'callApi');
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    await evaluate(suite, record, { maxConcurrency: 2, timeoutMs: 1000 });
    const summary = await record.toEvaluateSummary();
    expect(summary.stats.successes).toBe(1);
    expect(summary.results[0].testCase.metadata?.evaluationId).toBeUndefined();
    expect(graderCall.mock.calls[0][1]?.evaluationId).toBe(record.id);
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]).not.toBe(source);
    await expect(fs.stat(workspaces[0])).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('releases copies made by deferred agent-rubric grading', async () => {
    const { suite, grader } = await createSuite(2);
    const workspaces: string[] = [];
    mockQuery.mockImplementation(({ options }) => {
      workspaces.push(options.cwd);
      return graderResult();
    });
    const graderCall = vi.spyOn(grader, 'callApi');
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    await evaluate(suite, record, { maxConcurrency: 1 });
    expect((await record.toEvaluateSummary()).stats.successes).toBe(2);
    expect(graderCall.mock.calls.map(([, context]) => context?.evaluationId)).toEqual([
      record.id,
      record.id,
    ]);
    expect(new Set(workspaces).size).toBe(2);
    for (const workspace of workspaces) {
      await expect(fs.stat(workspace)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });

  it('releases a select-best grader copy at the end of the evaluation', async () => {
    const { suite, source } = await createSuite(1);
    suite.prompts = [toPrompt('first'), toPrompt('second')];
    suite.tests = [
      {
        options: {
          provider: {
            id: 'anthropic:claude-agent-sdk',
            config: { apiKey: 'test', working_dir: source, copy_working_dir: true },
          },
        },
        assert: [{ type: 'select-best', value: 'Choose the best answer' }],
      },
    ];
    const workspaces: string[] = [];
    mockQuery.mockImplementation(({ options }) => {
      workspaces.push(options.cwd);
      workspacesToClean.push(options.cwd);
      return graderResult('0');
    });
    const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
    await evaluate(suite, record, { maxConcurrency: 2 });
    expect(workspaces).toHaveLength(1);
    await expect(fs.stat(workspaces[0])).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps an in-flight grader copy until its SDK call settles after timeout', async () => {
    vi.useFakeTimers();
    try {
      const { suite } = await createSuite(1);
      let started!: (dir: string) => void;
      const startedPromise = new Promise<string>((resolve) => {
        started = resolve;
      });
      let finish!: () => void;
      const finishPromise = new Promise<void>((resolve) => {
        finish = resolve;
      });
      mockQuery.mockImplementation(
        ({ options }) =>
          (async function* () {
            started(options.cwd);
            await finishPromise;
            yield* graderResult();
          })() as unknown as Query,
      );
      const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
      const evaluation = evaluate(suite, record, { timeoutMs: 100 });
      const workspace = await startedPromise;
      await vi.advanceTimersByTimeAsync(100);
      await evaluation;
      expect((await fs.stat(workspace)).isDirectory()).toBe(true);
      finish();
      await vi.waitFor(async () => {
        await expect(fs.stat(workspace)).rejects.toMatchObject({ code: 'ENOENT' });
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
