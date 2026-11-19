import './setup';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import { runExtensionHook } from '../../src/evaluatorHelpers';
import Eval from '../../src/models/eval';
import { HttpProvider } from '../../src/providers/http';
import { OpenAiRealtimeProvider } from '../../src/providers/openai/realtime';
import { toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

import type { ApiProvider, Assertion, TestCase } from '../../src/types/index';

describeEvaluator('Bayes@N review regressions', () => {
  it('rejects a beforeEach input change when the per-step timeout is enabled', async () => {
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hook, context) => {
      if (hook === 'beforeEach' && 'test' in context) {
        context.test.vars = { question: 'changed' };
      }
      return context;
    });
    const callApi = vi.fn(async () => ({ output: 'answer' }));
    await expect(
      evaluate(
        {
          providers: [{ id: () => 'target', callApi }],
          prompts: [toPrompt('{{ question }}')],
          tests: [{ vars: { question: 'original' } }],
          extensions: ['test-hook'],
        },
        new Eval({}),
        { bayesAtN: true, repeat: 2, cache: false, timeoutMs: 30_000 },
      ),
    ).rejects.toThrow('unchanged question and grading inputs after beforeEach');
    expect(callApi).not.toHaveBeenCalled();
  });

  it('reuses the prepared render with a timeout while keeping file inputs and trial vars intact', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bayes-media-repeats-'));
    const file = path.join(directory, 'question.png');
    const bytes = Buffer.from('question image');
    fs.writeFileSync(file, bytes);
    const expectedMedia = `data:image/png;base64,${bytes.toString('base64')}`;
    const seen: { prompt: string; media: unknown; repeat: unknown; step: unknown }[] = [];
    const callApi: ApiProvider['callApi'] = async (prompt, context) => {
      seen.push({
        prompt,
        media: context?.vars.media,
        repeat: context?.vars.__repeatIndex,
        step: context?.vars.__evalStepId,
      });
      if (context) {
        context.vars.media = 'provider-local change';
      }
      return { output: 'answer' };
    };
    const render = vi.fn(async () => 'Question image: {{ media }}');
    const record = new Eval({});
    try {
      await evaluate(
        {
          providers: [{ id: () => 'target', callApi }],
          prompts: [{ ...toPrompt('image question'), function: render }],
          tests: [{ vars: { media: `file://${file}` }, options: { disableVarExpansion: true } }],
        },
        record,
        { bayesAtN: true, repeat: 4, cache: false, maxConcurrency: 1, timeoutMs: 30_000 },
      );
      expect(render).toHaveBeenCalledTimes(4);
      expect(seen).toEqual(
        [0, 1, 2, 3].map((repeat) => ({
          prompt: `Question image: ${expectedMedia}`,
          media: expectedMedia,
          repeat,
          step: `test-${repeat}-prompt-0-repeat-${repeat}`,
        })),
      );
      expect((await record.getRepeatStability())?.bayesAtN?.[0].mean).toBe(5 / 6);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('isolates each result provider record from afterEach mutations in other repeats', async () => {
    const labels: (string | undefined)[] = [];
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hook, context) => {
      if (hook === 'afterEach' && 'result' in context) {
        labels.push(context.result.provider.label);
        if (labels.length === 1) {
          context.result.provider.label = 'first result only';
        }
      }
      return context;
    });
    await evaluate(
      {
        providers: [
          {
            id: () => 'target',
            label: 'target label',
            callApi: async () => ({ output: 'answer' }),
          },
        ],
        prompts: [toPrompt('question')],
        tests: [{}],
        extensions: ['test-hook'],
      },
      new Eval({}),
      { bayesAtN: true, repeat: 3, cache: false, maxConcurrency: 1 },
    );
    expect(labels).toEqual(['target label', 'target label', 'target label']);
  });

  it.each(['conversation', 0])(
    'rejects Realtime conversation reuse with ID %j',
    async (conversationId) => {
      const provider = new OpenAiRealtimeProvider('gpt-realtime', { id: 'aliased-realtime' });
      const call = vi.spyOn(provider, 'callApi').mockResolvedValue({ output: 'answer' });
      await expect(
        evaluate(
          {
            providers: [provider],
            prompts: [toPrompt('question')],
            tests: [{ metadata: { conversationId } }],
          },
          new Eval({}),
          { bayesAtN: true, repeat: 2, cache: false },
        ),
      ).rejects.toThrow('shared provider sessions');
      expect(call).not.toHaveBeenCalled();
    },
  );

  it.each([
    { maintainContext: false, conversationId: 'conversation' },
    { maintainContext: true, conversationId: '' },
    { maintainContext: true, conversationId: undefined },
  ])('allows one-shot Realtime calls: %j', async ({ maintainContext, conversationId }) => {
    const provider = new OpenAiRealtimeProvider('gpt-realtime', { config: { maintainContext } });
    const call = vi.spyOn(provider, 'callApi').mockResolvedValue({ output: 'answer' });
    const record = new Eval({});
    await evaluate(
      {
        providers: [provider],
        prompts: [toPrompt('question')],
        tests: [{ metadata: { conversationId } }],
      },
      record,
      { bayesAtN: true, repeat: 2, cache: false },
    );
    expect(call).toHaveBeenCalledTimes(2);
    expect((await record.getRepeatStability())?.bayesAtN?.[0].mean).toBe(3 / 4);
  });

  it('rejects a Realtime conversation enabled by beforeEach', async () => {
    const provider = new OpenAiRealtimeProvider('gpt-realtime');
    const call = vi.spyOn(provider, 'callApi').mockResolvedValue({ output: 'answer' });
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hook, context) => {
      if (hook === 'beforeEach' && 'test' in context) {
        context.test.metadata = { conversationId: 'activated' };
      }
      return context;
    });
    await expect(
      evaluate(
        {
          providers: [provider],
          prompts: [toPrompt('question')],
          tests: [{}],
          extensions: ['test-hook'],
        },
        new Eval({}),
        { bayesAtN: true, repeat: 2, cache: false },
      ),
    ).rejects.toThrow('shared provider sessions');
    expect(call).not.toHaveBeenCalled();
  });

  it.each(['options', 'typed options', 'assertion', 'nested assertion'])(
    'rejects undeclared native grader files in %s before generation',
    async (location) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bayes-inline-grader-'));
      const file = path.join(directory, 'grading.txt');
      fs.writeFileSync(file, 'original');
      const grader = {
        id: 'http://localhost:1/grade',
        config: {
          multipart: {
            parts: [{ name: 'file', kind: 'file', source: { type: 'path', path: file } }],
          },
        },
      };
      const assertion: Assertion = { type: 'llm-rubric', value: 'correct' };
      const test: TestCase = { assert: [assertion] };
      if (location === 'options' || location === 'typed options') {
        test.options = { provider: location === 'options' ? grader : { text: grader } };
      } else {
        assertion.provider = grader;
        if (location === 'nested assertion') {
          test.assert = [{ type: 'assert-set', assert: [assertion] }];
        }
      }
      const callApi = vi.fn(async () => ({ output: 'answer' }));
      vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hook, context) => {
        if (hook === 'beforeEach') {
          fs.writeFileSync(file, 'changed');
        }
        return context;
      });
      try {
        await expect(
          evaluate(
            {
              providers: [{ id: () => 'target', callApi }],
              prompts: [toPrompt('question')],
              tests: [test],
              extensions: ['test-hook'],
            },
            new Eval({}),
            { bayesAtN: true, repeat: 2, cache: false },
          ),
        ).rejects.toThrow('declared native file inputs');
        expect(callApi).not.toHaveBeenCalled();
        expect(runExtensionHook).not.toHaveBeenCalledWith(
          expect.anything(),
          'beforeEach',
          expect.anything(),
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it.each(['json', 'yaml', 'yml'])(
    'rejects deferred %s grader configurations before generation',
    async (extension) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bayes-file-grader-'));
      const upload = path.join(directory, 'grading.txt');
      fs.writeFileSync(upload, 'original');
      const declaration = {
        id: 'http://localhost:1/grade',
        config: {
          multipart: {
            parts: [{ name: 'file', kind: 'file', source: { type: 'path', path: upload } }],
          },
        },
      };
      const configPath = path.join(directory, `grader.${extension}`);
      fs.writeFileSync(configPath, JSON.stringify(declaration));
      const reference = `file://${configPath}`;
      const callApi = vi.fn(async () => ({ output: 'answer' }));
      try {
        for (const provider of [reference, { id: reference }, { text: reference }]) {
          await expect(
            evaluate(
              {
                providers: [{ id: () => 'target', callApi }],
                prompts: [toPrompt('question')],
                tests: [
                  { options: { provider }, assert: [{ type: 'llm-rubric', value: 'correct' }] },
                ],
              },
              new Eval({}),
              { bayesAtN: true, repeat: 2, cache: false },
            ),
          ).rejects.toThrow('loaded grading providers for config-file references');
        }
        expect(callApi).not.toHaveBeenCalled();
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it.each([false, true])(
    'validates native file inputs of a loaded grader (changed=%s)',
    async (changed) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bayes-loaded-grader-'));
      const file = path.join(directory, 'grading.txt');
      fs.writeFileSync(file, 'original');
      const grader = new HttpProvider('http://localhost:1/grade', {
        config: {
          multipart: {
            parts: [{ name: 'file', kind: 'file', source: { type: 'path', path: file } }],
          },
        },
      });
      const grade = vi
        .spyOn(grader, 'callApi')
        .mockResolvedValue({ output: '{"pass":true,"score":1,"reason":"correct"}' });
      const callApi = vi.fn(async () => ({ output: 'answer' }));
      vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hook, context) => {
        if (changed && hook === 'beforeEach') {
          fs.writeFileSync(file, 'changed');
        }
        return context;
      });
      const record = new Eval({});
      try {
        const run = evaluate(
          {
            providers: [{ id: () => 'target', callApi }],
            prompts: [toPrompt('question')],
            extensions: ['test-hook'],
            tests: [
              { options: { provider: grader }, assert: [{ type: 'llm-rubric', value: 'correct' }] },
            ],
          },
          record,
          { bayesAtN: true, repeat: 2, cache: false },
        );
        if (changed) {
          await expect(run).rejects.toThrow(
            'unchanged question and grading inputs after beforeEach',
          );
          expect(callApi).not.toHaveBeenCalled();
          expect(grade).not.toHaveBeenCalled();
        } else {
          await run;
          expect(grade).toHaveBeenCalledTimes(2);
          expect((await record.getRepeatStability())?.bayesAtN?.[0].mean).toBe(3 / 4);
        }
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it.each([
    { response: { error: 'grader unavailable' }, failed: true },
    { response: { output: 'invalid verdict' }, failed: true },
    { response: { output: '{"pass":false,"score":0,"reason":"incorrect"}' }, failed: false },
  ])(
    'distinguishes failed graders from valid negative verdicts: $response',
    async ({ response, failed }) => {
      const record = new Eval({});
      const grader = { id: () => 'grader', callApi: vi.fn(async () => response) };
      await evaluate(
        {
          providers: [{ id: () => 'target', callApi: vi.fn(async () => ({ output: 'answer' })) }],
          prompts: [toPrompt('question')],
          tests: [
            {
              options: { provider: grader },
              assert: [{ type: 'assert-set', assert: [{ type: 'llm-rubric', value: 'correct' }] }],
            },
          ],
        },
        record,
        { bayesAtN: true, repeat: 2, cache: false },
      );
      const cohort = (await record.getRepeatStability())?.bayesAtN?.[0];
      if (failed) {
        expect(cohort?.unavailableReason).toContain('grading errors');
        expect(cohort?.mean).toBeUndefined();
        expect(cohort?.posteriorStd).toBeUndefined();
      } else {
        expect(cohort?.mean).toBe(1 / 4);
        expect(cohort?.posteriorStd).toBeCloseTo(Math.sqrt(3 / 80), 14);
      }
    },
  );
});
