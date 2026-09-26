import './setup';

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import { runExtensionHook } from '../../src/evaluatorHelpers';
import Eval from '../../src/models/eval';
import {
  copyWorkingDirectory,
  releaseWorkingDirectoryCopies,
} from '../../src/providers/workingDirectoryCopies';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { ApiProvider, TestSuite } from '../../src/types/index';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-eval-copy-test-'));
  roots.push(root);
  const source = path.join(root, 'fixture');
  await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'seed.txt'), 'initial');
  return source;
}

describeEvaluator('copied working directory lifecycle', () => {
  it('keeps each repeat copy through javascript grading and afterEach, then removes it', async () => {
    const source = await fixture();
    const asserted: string[] = [];
    const hooked: string[] = [];
    const graded: string[] = [];
    const grader: ApiProvider = {
      id: () => 'openai:codex-sdk',
      config: {},
      callApi: async (_prompt, context) => {
        const dir = context?.prompt.config?.working_dir as string;
        expect(await fs.readFile(path.join(dir, 'agent.txt'), 'utf8')).toBe('result');
        graded.push(dir);
        return { output: '{"pass":true,"score":1}' };
      },
    };
    const provider: ApiProvider = {
      id: () => 'anthropic:claude-agent-sdk',
      callApi: async (_prompt, context) => {
        const copy = await copyWorkingDirectory(source, context!.evaluationId!);
        await fs.writeFile(path.join(copy.workingDir, 'agent.txt'), 'result');
        await copy.settle(true);
        return { output: 'done', metadata: { workingDir: copy.workingDir } };
      },
    };
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hook, context) => {
      if (hook === 'afterEach' && 'result' in context) {
        const dir = context.result?.response?.metadata?.workingDir as string;
        expect(await fs.readFile(path.join(dir, 'agent.txt'), 'utf8')).toBe('result');
        hooked.push(dir);
      }
      return context;
    });
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('edit fixture')],
      extensions: ['file://copy-test-hook.js'],
      tests: [
        {
          assert: [
            {
              type: 'javascript',
              value: async (_output, context) => {
                const dir = context.metadata?.workingDir as string;
                expect(await fs.readFile(path.join(dir, 'agent.txt'), 'utf8')).toBe('result');
                asserted.push(dir);
                return true;
              },
            },
            {
              type: 'agent-rubric',
              value: 'Check the written file',
              provider: grader,
            },
          ],
        },
      ],
    };
    const record = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, record, { repeat: 3, maxConcurrency: 3 });
    const summary = await record.toEvaluateSummary();
    expect(summary.stats.successes).toBe(3);
    expect(new Set(asserted).size).toBe(3);
    expect(new Set(hooked).size).toBe(3);
    expect(new Set(graded).size).toBe(3);
    for (const dir of asserted) {
      await expect(fs.stat(dir)).rejects.toMatchObject({ code: 'ENOENT' });
    }
    await expect(fs.readFile(path.join(source, 'agent.txt'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('waits for an SDK call after an actual eval timeout before removing its copy', async () => {
    vi.useFakeTimers();
    try {
      const source = await fixture();
      let started!: (dir: string) => void;
      const startedPromise = new Promise<string>((resolve) => {
        started = resolve;
      });
      let finish!: () => void;
      const finishPromise = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const provider: ApiProvider = {
        id: () => 'anthropic:claude-agent-sdk',
        callApi: async (_prompt, context) => {
          const copy = await copyWorkingDirectory(source, context!.evaluationId!);
          started(copy.workingDir);
          await finishPromise;
          await copy.settle(true);
          return { output: 'late', metadata: { workingDir: copy.workingDir } };
        },
      };
      const suite: TestSuite = {
        providers: [provider],
        prompts: [toPrompt('edit fixture')],
        tests: [{}],
      };
      const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
      const evaluation = evaluate(suite, record, { timeoutMs: 100 });
      const dir = await startedPromise;
      await vi.advanceTimersByTimeAsync(100);
      await evaluation;
      expect((await fs.stat(dir)).isDirectory()).toBe(true);
      finish();
      await vi.waitFor(async () => {
        await expect(fs.stat(dir)).rejects.toMatchObject({ code: 'ENOENT' });
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('defers removal of a timed-out in-flight call until the call settles', async () => {
    const source = await fixture();
    const copy = await copyWorkingDirectory(source, 'timed-out-eval');
    await releaseWorkingDirectoryCopies('timed-out-eval');
    expect((await fs.stat(copy.workingDir)).isDirectory()).toBe(true);
    await copy.settle(true);
    await expect(fs.stat(copy.workingDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
