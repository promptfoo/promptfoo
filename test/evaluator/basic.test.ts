import './setup';

import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { evaluate } from '../../src/evaluator';
import { runExtensionHook } from '../../src/evaluatorHelpers';
import Eval from '../../src/models/eval';
import { type EvaluateSummaryV3, type TestSuite } from '../../src/types/index';
import { processConfigFileReferences } from '../../src/util/fileReference';
import { mockApiProvider, mockReasoningApiProvider, toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

const createVariableTest = () => ({
  vars: { var1: 'value1', var2: 'value2' },
});
describeEvaluator('evaluator basic flows', () => {
  it.each([
    'expanded vars',
    'beforeAll vars',
    'threshold',
    'rubric',
    'assertion',
    'transform',
    'scoring function',
    'provider config',
  ])('rejects changed concrete Bayes@N inputs on resume: %s', async (change) => {
    let changed = false;
    const callApi = vi.fn(async () => ({ output: 'answer' }));
    const suite = (): TestSuite => ({
      ...(change === 'beforeAll vars' && { extensions: ['test-hook'] }),
      providers: [
        {
          id: () => 'input-target',
          callApi,
          config: { temperature: changed && change === 'provider config' ? 1 : 0 },
        },
      ],
      prompts: [toPrompt('{{question}}')],
      defaultTest: {
        threshold: changed && change === 'threshold' ? 0.5 : 1,
        options: {
          rubricPrompt: changed && change === 'rubric' ? 'changed rubric' : 'original rubric',
          transform:
            changed && change === 'transform' ? (output) => `${output}!` : (output) => output,
        },
        assertScoringFunction:
          changed && change === 'scoring function'
            ? () => ({ pass: false, score: 0, reason: 'changed' })
            : () => ({ pass: true, score: 1, reason: 'original' }),
      },
      tests: [
        {
          vars: { question: [changed && change === 'expanded vars' ? 'changed' : 'original'] },
          assert: [
            { type: 'equals', value: changed && change === 'assertion' ? 'other' : 'answer' },
          ],
        },
      ],
    });
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hook, context) => {
      if (hook === 'beforeAll' && changed && change === 'beforeAll vars' && 'suite' in context) {
        context.suite.tests![0].vars = { question: ['hook question'] };
      }
      return context;
    });
    const record = await Eval.create({}, suite().prompts, { id: randomUUID() });
    await evaluate(suite(), record, { bayesAtN: true, repeat: 2, cache: false });
    const originalPlan = structuredClone(record.config.metadata?.bayesAtNPlan);
    const originalRows = await record.getResultsCount();
    changed = true;
    callApi.mockClear();
    cliState.resume = true;
    await expect(
      evaluate(suite(), record, { bayesAtN: true, repeat: 2, cache: false }),
    ).rejects.toThrow('original questions, grading inputs');
    expect(callApi).not.toHaveBeenCalled();
    expect(record.config.metadata?.bayesAtNPlan).toEqual(originalPlan);
    expect(await record.getResultsCount()).toBe(originalRows);
  });

  it('rejects regenerated transformVars UUIDs on Bayes@N resume', async () => {
    const callApi = vi.fn(async () => ({ output: 'answer' }));
    const suite = (): TestSuite => ({
      providers: [{ id: () => 'uuid-target', callApi }],
      prompts: [toPrompt('{{id}}')],
      tests: [{ options: { transformVars: 'return { id: context.uuid };' } }],
    });
    const record = new Eval({});
    await evaluate(suite(), record, { bayesAtN: true, repeat: 2, cache: false });
    cliState.resume = true;
    callApi.mockClear();
    await expect(
      evaluate(suite(), record, { bayesAtN: true, repeat: 2, cache: false }),
    ).rejects.toThrow('original questions, grading inputs');
    expect(callApi).not.toHaveBeenCalled();
  });

  it.each(['prompt function', 'file variable', 'grading file'])(
    'binds Bayes@N resume to rendered content: %s',
    async (source) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bayes-input-'));
      const file = path.join(directory, source === 'grading file' ? 'grade.js' : 'question.txt');
      fs.writeFileSync(
        file,
        source === 'grading file' ? 'module.exports = () => true;' : 'original question',
      );
      let question = 'original question';
      const callApi = vi.fn(async (prompt: string) => ({ output: prompt }));
      const promptFunction = vi.fn(async () => question);
      const suite = (): TestSuite => ({
        providers: [{ id: () => 'render-target', callApi }],
        prompts: [
          {
            ...toPrompt('{{question}}'),
            ...(source === 'prompt function' && { function: promptFunction }),
          },
        ],
        tests: [
          {
            options: { disableVarExpansion: true },
            vars: { question: source === 'file variable' ? `file://${file}` : 'original question' },
            ...(source === 'grading file' && {
              assert: [{ type: 'javascript', value: `file://${file}` }],
            }),
          },
        ],
      });
      try {
        const record = new Eval({});
        await evaluate(suite(), record, { bayesAtN: true, repeat: 2, cache: false });
        if (source === 'prompt function') {
          expect(promptFunction).toHaveBeenCalledTimes(2);
        }
        expect(callApi).toHaveBeenCalledTimes(2);
        expect(callApi.mock.calls.every(([prompt]) => prompt === question)).toBe(true);
        question = 'changed question';
        fs.writeFileSync(
          file,
          source === 'grading file' ? 'module.exports = () => false;' : question,
        );
        cliState.resume = true;
        callApi.mockClear();
        await expect(
          evaluate(suite(), record, { bayesAtN: true, repeat: 2, cache: false }),
        ).rejects.toThrow('original questions, grading inputs');
        expect(callApi).not.toHaveBeenCalled();
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it('rejects prompt functions that change the question between repeats before provider calls', async () => {
    const callApi = vi.fn(async () => ({ output: 'answer' }));
    const record = new Eval({});
    let question = 0;
    await expect(
      evaluate(
        {
          providers: [{ id: () => 'changing-prompt', callApi }],
          prompts: [{ ...toPrompt('question'), function: async () => String(question++) }],
          tests: [{}],
        },
        record,
        { bayesAtN: true, repeat: 2, cache: false },
      ),
    ).rejects.toThrow('identical question and grading inputs');
    expect(callApi).not.toHaveBeenCalled();
    expect(record.config.metadata?.bayesAtNPlan).toBeUndefined();
  });

  it('checks file references inside assertion value arrays on resume', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bayes-grading-'));
    const file = path.join(directory, 'answer.txt');
    fs.writeFileSync(file, 'answer');
    const callApi = vi.fn(async () => ({ output: 'answer' }));
    const suite = (): TestSuite => ({
      providers: [{ id: () => 'array-target', callApi }],
      prompts: [toPrompt('question')],
      tests: [{ assert: [{ type: 'contains-any', value: [`file://${file}`] }] }],
    });
    try {
      const record = await Eval.create({}, suite().prompts, { id: randomUUID() });
      await evaluate(suite(), record, { bayesAtN: true, repeat: 2, cache: false });
      const originalPlan = structuredClone(record.config.metadata?.bayesAtNPlan);
      const originalSummary = await record.getRepeatStability();
      expect(originalSummary?.bayesAtN?.[0]).toMatchObject({ mean: 3 / 4 });
      fs.writeFileSync(file, 'different answer');
      cliState.resume = true;
      await expect(
        evaluate(suite(), record, { bayesAtN: true, repeat: 2, cache: false }),
      ).rejects.toThrow('original questions, grading inputs');
      expect(callApi).toHaveBeenCalledTimes(2);
      expect(record.config.metadata?.bayesAtNPlan).toEqual(originalPlan);
      fs.writeFileSync(file, 'answer');
      await evaluate(suite(), record, { bayesAtN: true, repeat: 2, cache: false });
      expect(callApi).toHaveBeenCalledTimes(2);
      expect(await record.getRepeatStability()).toEqual(originalSummary);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('isolates model-grader mutations between repeated trials and accepts an unchanged resume', async () => {
    const callApi = vi.fn(async () => ({ output: 'answer' }));
    const grade = vi.fn(async () => ({ output: '{"pass":true,"score":1,"reason":"correct"}' }));
    const rubricPrompt = [{ role: 'user', content: 'Grade {{output}}' }];
    const assertion = { type: 'llm-rubric' as const };
    const suite = (): TestSuite => ({
      providers: [{ id: () => 'graded-target', callApi }],
      prompts: [toPrompt('question')],
      defaultTest: {
        options: { rubricPrompt, provider: { id: () => 'grader', callApi: grade } },
        assert: [assertion],
      },
      tests: [{}],
    });
    const record = await Eval.create({}, suite().prompts, { id: randomUUID() });
    await evaluate(suite(), record, { bayesAtN: true, repeat: 3, maxConcurrency: 1, cache: false });
    expect(callApi).toHaveBeenCalledTimes(3);
    expect(grade).toHaveBeenCalledTimes(3);
    expect(assertion).not.toHaveProperty('value');
    expect(rubricPrompt).toEqual([{ role: 'user', content: 'Grade {{output}}' }]);
    expect((await record.getRepeatStability())?.bayesAtN?.[0]).toMatchObject({ mean: 4 / 5 });
    const restored = (await Eval.findById(record.id))!;
    cliState.resume = true;
    await evaluate(suite(), restored, {
      bayesAtN: true,
      repeat: 3,
      maxConcurrency: 1,
      cache: false,
    });
    expect(callApi).toHaveBeenCalledTimes(3);
    expect(grade).toHaveBeenCalledTimes(3);
    expect(await restored.getRepeatStability()).toEqual(await record.getRepeatStability());
  });

  it('reuses structured prompt renders and accepts unchanged effective config on resume', async () => {
    const callApi = vi.fn(async (prompt: string) => ({ output: prompt }));
    const render = vi.fn(async () => ({
      prompt: 'prepared question',
      config: { temperature: 0.5 },
    }));
    const suite = (): TestSuite => ({
      providers: [{ id: () => 'structured-target', config: { temperature: 0 }, callApi }],
      prompts: [{ ...toPrompt('template'), function: render }],
      tests: [{}],
    });
    const record = await Eval.create({}, suite().prompts, { id: randomUUID() });
    await evaluate(suite(), record, { bayesAtN: true, repeat: 2, cache: false });
    expect(render).toHaveBeenCalledTimes(2);
    expect(callApi.mock.calls.map(([prompt]) => prompt)).toEqual([
      'prepared question',
      'prepared question',
    ]);
    const restored = (await Eval.findById(record.id))!;
    cliState.resume = true;
    await evaluate(suite(), restored, { bayesAtN: true, repeat: 2, cache: false });
    expect(render).toHaveBeenCalledTimes(4);
    expect(callApi).toHaveBeenCalledTimes(2);
    expect(await restored.getRepeatStability()).toEqual(await record.getRepeatStability());
  });

  it('treats file-like rendered text and metadata as data', async () => {
    const callApi = vi.fn(async (prompt: string) => ({ output: prompt }));
    const record = new Eval({});
    await evaluate(
      {
        providers: [{ id: () => 'literal-target', callApi }],
        prompts: [{ ...toPrompt('question'), function: async () => 'file://literal-question' }],
        tests: [
          {
            description: 'file://literal-description',
            metadata: { source: 'file://nonlocal/provenance' },
          },
        ],
      },
      record,
      { bayesAtN: true, repeat: 2, cache: false },
    );
    expect(callApi.mock.calls.map(([prompt]) => prompt)).toEqual([
      'file://literal-question',
      'file://literal-question',
    ]);
    expect((await record.getRepeatStability())?.bayesAtN?.[0]).toMatchObject({ mean: 3 / 4 });
  });

  it('stops preparing Bayes@N prompts when the caller cancels', async () => {
    const abort = new AbortController();
    const callApi = vi.fn(async () => ({ output: 'answer' }));
    const render = vi.fn(async () => {
      abort.abort();
      return 'question';
    });
    await evaluate(
      {
        providers: [{ id: () => 'cancel-target', callApi }],
        prompts: [{ ...toPrompt('question'), function: render }],
        tests: [{}],
      },
      new Eval({}),
      { bayesAtN: true, repeat: 3, cache: false, abortSignal: abort.signal },
    ).catch(() => undefined);
    expect(render).toHaveBeenCalledTimes(1);
    expect(callApi).not.toHaveBeenCalled();
  });

  it('rejects changes made by beforeEach after Bayes@N input preparation', async () => {
    const callApi = vi.fn(async () => ({ output: 'answer' }));
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hook, context) => {
      if (hook === 'beforeEach' && 'test' in context) {
        context.test.threshold = 0.5;
      }
      return context;
    });
    await expect(
      evaluate(
        {
          providers: [{ id: () => 'hook-target', callApi }],
          prompts: [toPrompt('question')],
          extensions: ['test-hook'],
          tests: [{}],
        },
        new Eval({}),
        { bayesAtN: true, repeat: 2, cache: false },
      ),
    ).rejects.toThrow('unchanged question and grading inputs after beforeEach');
    expect(callApi).not.toHaveBeenCalled();
  });

  it.each([new Map([['question', 'answer']]), new Set(['question'])])(
    'rejects unsupported concrete input objects instead of changing them: %s',
    async (question) => {
      const callApi = vi.fn(async () => ({ output: 'answer' }));
      await expect(
        evaluate(
          {
            providers: [{ id: () => 'object-target', callApi }],
            prompts: [toPrompt('{{question}}')],
            tests: [{ vars: { question }, options: { disableVarExpansion: true } }],
          },
          new Eval({}),
          { bayesAtN: true, cache: false },
        ),
      ).rejects.toThrow('serializable question and grading inputs');
      expect(callApi).not.toHaveBeenCalled();
    },
  );

  it.each(['answer', { answer: 'precomputed' }, ''])(
    'rejects precomputed Bayes@N providerOutput before execution: %j',
    async (providerOutput) => {
      const callApi = vi.fn(async () => ({ output: 'fresh answer' }));
      const record = new Eval({});
      await expect(
        evaluate(
          {
            providers: [{ id: () => 'precomputed', callApi }],
            prompts: [toPrompt('question')],
            tests: [{ providerOutput }],
          },
          record,
          { bayesAtN: true, repeat: 2, cache: false },
        ),
      ).rejects.toThrow('precomputed providerOutput');
      expect(callApi).not.toHaveBeenCalled();
      expect(record.config.metadata?.bayesAtNPlan).toBeUndefined();
    },
  );

  it.each(['select-best', 'max-score'] as const)(
    'rejects %s inside assertion sets before Bayes@N execution',
    async (type) => {
      const callApi = vi.fn(async () => ({ output: 'answer' }));
      const record = new Eval({});
      await expect(
        evaluate(
          {
            providers: [{ id: () => 'nested-comparison', callApi }],
            prompts: [toPrompt('question')],
            defaultTest: {
              assert: [
                { type: 'assert-set', assert: [{ type: 'equals', value: 'answer' }, { type }] },
              ],
            },
            tests: [{}],
          },
          record,
          { bayesAtN: true, repeat: 2, cache: false },
        ),
      ).rejects.toThrow('comparison assertions');
      expect(callApi).not.toHaveBeenCalled();
      expect(record.config.metadata?.bayesAtNPlan).toBeUndefined();
    },
  );

  it('keeps the sampling plan out of inherited test and result metadata', async () => {
    const metadata = {
      bayesAtNPlan: { version: 1, groups: Array(100).fill({}) },
      label: 'retained',
    };
    const record = new Eval({ metadata });
    await evaluate(
      {
        providers: [{ id: () => 'metadata-target', callApi: async () => ({ output: 'answer' }) }],
        prompts: [toPrompt('question')],
        defaultTest: { metadata },
        tests: [{}, {}],
      },
      record,
      { bayesAtN: true, repeat: 2, cache: false },
    );
    const summary = await record.toEvaluateSummary();
    expect(record.config.metadata?.bayesAtNPlan).toBeDefined();
    expect(metadata.bayesAtNPlan.groups).toHaveLength(100);
    for (const result of summary.results) {
      expect(result.testCase.metadata).toEqual({ label: 'retained' });
      expect(result.metadata).not.toHaveProperty('bayesAtNPlan');
    }
  });

  it.each([
    undefined,
    {},
    { version: 1, groups: [] },
    { version: 2, groups: [] },
    {
      version: 1,
      groups: [
        {
          repeatGroupId: 'test-0-vars-0',
          promptIdx: 0,
          provider: { id: 'resume-target' },
          repetitions: 1,
        },
      ],
    },
  ])('rejects Bayes@N resume without a valid original plan: %j', async (bayesAtNPlan) => {
    const callApi = vi.fn(async () => ({ output: 'answer' }));
    const testSuite: TestSuite = {
      providers: [{ id: () => 'resume-target', callApi }],
      prompts: [toPrompt('question')],
      tests: [{}],
    };
    cliState.resume = true;
    await expect(
      evaluate(testSuite, new Eval({ metadata: { bayesAtNPlan } }), { bayesAtN: true }),
    ).rejects.toThrow('original valid sampling plan');
    expect(callApi).not.toHaveBeenCalled();
  });

  it.each(['question removed', 'repeat changed', 'Bayes disabled'])(
    'preserves the original Bayes@N experiment on resume: %s',
    async (change) => {
      const callApi = vi.fn(async () => ({ output: 'answer' }));
      const testSuite: TestSuite = {
        providers: [{ id: () => 'resume-target', callApi }],
        prompts: [toPrompt('question')],
        tests: [{}, {}],
      };
      const record = new Eval({});
      await evaluate(testSuite, record, { bayesAtN: true, repeat: 2, cache: false });
      const originalPlan = structuredClone(record.config.metadata?.bayesAtNPlan);
      callApi.mockClear();
      cliState.resume = true;
      if (change === 'question removed') {
        testSuite.tests = [{}];
      }
      await expect(
        evaluate(testSuite, record, {
          bayesAtN: change !== 'Bayes disabled',
          repeat: change === 'repeat changed' ? 3 : 2,
          cache: false,
        }),
      ).rejects.toThrow(
        change === 'Bayes disabled' ? 'requires evaluateOptions.bayesAtN' : 'original questions',
      );
      expect(callApi).not.toHaveBeenCalled();
      expect(record.config.metadata?.bayesAtNPlan).toEqual(originalPlan);
    },
  );

  it.each([
    { enabled: false, persisted: false },
    { enabled: true, persisted: false },
    { enabled: false, persisted: true },
    { enabled: true, persisted: true },
  ])(
    'replaces stale Bayes@N plans for a new run (enabled=$enabled, persisted=$persisted)',
    async ({ enabled, persisted }) => {
      let record: Eval;
      let observedPlan: unknown;
      const testSuite: TestSuite = {
        providers: [
          {
            id: () => 'fresh-target',
            callApi: async () => {
              if (persisted) {
                const stored = (await Eval.findById(record.id))!;
                observedPlan = stored.config.metadata?.bayesAtNPlan;
              }
              return { output: 'answer' };
            },
          },
        ],
        prompts: [toPrompt('question')],
        tests: [{}],
      };
      const metadata = { bayesAtNPlan: { stale: true }, label: 'retained' };
      record = persisted
        ? await Eval.create({ metadata }, testSuite.prompts, { id: randomUUID() })
        : new Eval({ metadata });
      await evaluate(testSuite, record, { bayesAtN: enabled, cache: false });
      if (persisted) {
        expect(observedPlan).toEqual(record.config.metadata?.bayesAtNPlan);
        expect(observedPlan).not.toEqual({ stale: true });
      }
      expect(record.config.metadata?.label).toBe('retained');
      expect(metadata.bayesAtNPlan).toEqual({ stale: true });
      expect((await record.getRepeatStability())?.bayesAtN?.[0].mean).toBe(
        enabled ? 2 / 3 : undefined,
      );
      if (enabled) {
        expect(record.config.metadata?.bayesAtNPlan).toMatchObject({ version: 1 });
      } else {
        expect(record.config.metadata?.bayesAtNPlan).toBeUndefined();
      }
    },
  );

  it('rejects Bayes@N when the runtime marks a run as redteam', async () => {
    const callApi = vi.fn(async () => ({ output: 'answer' }));
    const testSuite: TestSuite = {
      providers: [{ id: () => 'redteam-target', callApi }],
      prompts: [toPrompt('question')],
      tests: [{}],
    };
    await expect(
      evaluate(testSuite, new Eval({}), {
        bayesAtN: true,
        isRedteam: true,
      }),
    ).rejects.toThrow('Bayes@N does not support redteam runs');
    expect(callApi).not.toHaveBeenCalled();
  });

  it.each(['conversation', 'output register', 'persistent browser session'])(
    'rejects Bayes@N for state shared across trials: %s',
    async (feature) => {
      const callApi = vi.fn(async () => ({ output: 'answer' }));
      const testSuite: TestSuite = {
        providers: [
          {
            id: () => (feature === 'persistent browser session' ? 'browser-provider' : 'stateful'),
            config: { persistSession: feature === 'persistent browser session' },
            callApi,
          },
        ],
        prompts: [toPrompt(feature === 'conversation' ? '{{_conversation}} question' : 'question')],
        tests: [
          { options: { storeOutputAs: feature === 'output register' ? 'answer' : undefined } },
        ],
      };
      await expect(
        evaluate(testSuite, new Eval({}), {
          bayesAtN: true,
          repeat: 2,
          maxConcurrency: 1,
        }),
      ).rejects.toThrow('Bayes@N does not support conversation history');
      expect(callApi).not.toHaveBeenCalled();
    },
  );

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid Bayes@N repeat counts before scheduling: %s',
    async (repeat) => {
      const callApi = vi.fn(async () => ({ output: 'answer' }));
      const testSuite: TestSuite = {
        providers: [{ id: () => 'repeat-validation', callApi }],
        prompts: [toPrompt('question')],
        tests: [{}],
      };
      await expect(evaluate(testSuite, new Eval({}), { bayesAtN: true, repeat })).rejects.toThrow(
        'positive safe integer repeat count',
      );
      testSuite.tests = [{ options: { repeat } }];
      await expect(evaluate(testSuite, new Eval({}), { bayesAtN: true })).rejects.toThrow(
        'positive safe integer repeat count',
      );
      expect(callApi).not.toHaveBeenCalled();
    },
  );

  it('rejects an empty Bayes@N schedule', async () => {
    const testSuite: TestSuite = {
      providers: [],
      prompts: [toPrompt('question')],
      tests: [{}],
    };
    await expect(evaluate(testSuite, new Eval({}), { bayesAtN: true })).rejects.toThrow(
      'at least one scheduled question',
    );
  });

  it.each([false, true])(
    'exports Bayes@N through the normal evaluator (persisted=%s)',
    async (persisted) => {
      const providers = ['first-provider', 'second-provider'].map((id) => ({
        id: () => id,
        callApi: vi.fn(async (prompt: string) => ({ output: prompt })),
      }));
      const testSuite: TestSuite = {
        providers,
        prompts: [toPrompt('{{answer}}')],
        tests: [
          { vars: { answer: ['wrong', 'right'] }, assert: [{ type: 'equals', value: 'right' }] },
        ],
      };
      const evalRecord = persisted
        ? await Eval.create({}, testSuite.prompts, { id: randomUUID() })
        : new Eval({});
      await evaluate(testSuite, evalRecord, { repeat: 2, bayesAtN: true, cache: false });
      const summary = (await evalRecord.toEvaluateSummary()) as EvaluateSummaryV3;
      expect(summary.results).toHaveLength(8);
      expect(summary.repeatStability?.bayesAtN).toHaveLength(2);
      for (const cohort of summary.repeatStability!.bayesAtN!) {
        expect(cohort).toMatchObject({ questions: 2, trials: 2, mean: 1 / 2 });
        expect(cohort.posteriorStd).toBeCloseTo(Math.sqrt(3 / 160), 14);
      }
      expect(await evalRecord.getObservedRepeatStability()).toEqual(summary.repeatStability);
      if (persisted) {
        const restored = (await Eval.findById(evalRecord.id))!;
        expect(await restored.getRepeatStability()).toEqual(summary.repeatStability);
        cliState.resume = true;
        await evaluate(testSuite, restored, { repeat: 2, bayesAtN: true, cache: false });
        expect(await restored.getRepeatStability()).toEqual(summary.repeatStability);
        expect(providers[0].callApi).toHaveBeenCalledTimes(4);
      }
    },
  );

  it('keeps question identities when Bayes@N uses one trial', async () => {
    const testSuite: TestSuite = {
      providers: [{ id: () => 'single-trial', callApi: async () => ({ output: 'right' }) }],
      prompts: [toPrompt('question')],
      tests: [{ assert: [{ type: 'equals', value: 'right' }] }],
    };
    const evalRecord = new Eval({});
    await evaluate(testSuite, evalRecord, { bayesAtN: true, cache: false });
    const summary = (await evalRecord.toEvaluateSummary()) as EvaluateSummaryV3;
    expect(summary.results[0]).toMatchObject({ repeatIndex: 0, repeatGroupId: 'test-0-vars-0' });
    expect(summary.repeatStability?.bayesAtN?.[0]).toMatchObject({
      questions: 1,
      trials: 1,
      mean: 2 / 3,
    });
  });

  it('reports an unavailable posterior for per-test repeat overrides with unequal N', async () => {
    const testSuite: TestSuite = {
      providers: [{ id: () => 'ragged', callApi: async () => ({ output: 'right' }) }],
      prompts: [toPrompt('question')],
      tests: [{ options: { repeat: 2 } }, { options: { repeat: 3 } }],
    };
    const evalRecord = new Eval({});
    await evaluate(testSuite, evalRecord, { bayesAtN: true, cache: false });
    expect((await evalRecord.getRepeatStability())?.bayesAtN?.[0]).toMatchObject({
      questions: 2,
      unavailableReason: 'Questions have different repeat counts',
    });
  });

  it('rejects Bayes@N for comparison grading before calling providers', async () => {
    const callApi = vi.fn(async () => ({ output: 'right' }));
    const testSuite: TestSuite = {
      providers: [{ id: () => 'comparison', callApi }],
      prompts: [toPrompt('question')],
      tests: [{ assert: [{ type: 'max-score' }] }],
    };
    await expect(evaluate(testSuite, new Eval({}), { bayesAtN: true })).rejects.toThrow(
      'Bayes@N does not support',
    );
    expect(callApi).not.toHaveBeenCalled();
  });

  it('reports final comparison verdicts for repeated tests', async () => {
    const provider = {
      id: () => 'repeated-comparison',
      callApi: async (prompt: string, context: { repeatIndex?: number } | undefined) => ({
        output: (prompt === 'first') === (context?.repeatIndex === 0) ? 'hello' : 'no match',
      }),
    };
    const testSuite: TestSuite = {
      providers: [provider],
      prompts: [toPrompt('first'), toPrompt('second')],
      tests: [
        {
          assert: [
            { type: 'javascript', value: 'output === "hello" ? 0.9 : 0.8' },
            { type: 'max-score' },
          ],
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, { repeat: 2 });
    const summary = (await evalRecord.toEvaluateSummary()) as EvaluateSummaryV3;
    expect(summary.repeatStability?.unstableGroups).toBe(2);
    expect(await evalRecord.getObservedRepeatStability()).toEqual(summary.repeatStability);
  });

  it('evaluate with vars', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ var1 }} {{ var2 }}')],
      tests: [createVariableTest()],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(mockApiProvider.callApi).toHaveBeenCalledWith(
      'Test prompt value1 value2',
      expect.objectContaining({
        vars: expect.objectContaining({ var1: 'value1', var2: 'value2' }),
        test: testSuite.tests![0],
        prompt: expect.any(Object),
      }),
      expect.any(Object),
    );
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({
      total: 10,
      prompt: 5,
      completion: 5,
      cached: 0,
      numRequests: 1,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      assertions: {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        },
      },
    });
    expect(summary.results[0].prompt.raw).toBe('Test prompt value1 value2');
    expect(summary.results[0].prompt.label).toBe('Test prompt {{ var1 }} {{ var2 }}');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with vars - no escaping', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ var1 }} {{ var2 }}')],
      tests: [
        {
          vars: { var1: '1 < 2', var2: 'he said "hello world"...' },
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({
      total: 10,
      prompt: 5,
      completion: 5,
      cached: 0,
      numRequests: 1,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      assertions: {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        },
      },
    });
    expect(summary.results[0].prompt.raw).toBe('Test prompt 1 < 2 he said "hello world"...');
    expect(summary.results[0].prompt.label).toBe('Test prompt {{ var1 }} {{ var2 }}');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with vars as object', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ var1.prop1 }} {{ var2 }}')],
      tests: [
        {
          vars: { var1: { prop1: 'value1' }, var2: 'value2' },
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({
      total: 10,
      prompt: 5,
      completion: 5,
      cached: 0,
      numRequests: 1,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      assertions: {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        },
      },
    });
    expect(summary.results[0].prompt.raw).toBe('Test prompt value1 value2');
    expect(summary.results[0].prompt.label).toBe('Test prompt {{ var1.prop1 }} {{ var2 }}');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with vars from file', async () => {
    const originalReadFileSync = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((path) => {
      if (typeof path === 'string' && path.includes('test_file.txt')) {
        return '<h1>Sample Report</h1><p>This is a test report with some data for the year 2023.</p>';
      }
      return originalReadFileSync(path);
    });

    const evalHelpers = await import('../../src/evaluatorHelpers');
    const originalRenderPrompt = evalHelpers.renderPrompt;

    const mockRenderPrompt = vi.spyOn(evalHelpers, 'renderPrompt');
    mockRenderPrompt.mockImplementation(async (prompt, vars) => {
      if (prompt.raw.includes('{{ var1 }}')) {
        return 'Test prompt <h1>Sample Report</h1><p>This is a test report with some data for the year 2023.</p>';
      }
      return originalRenderPrompt(prompt, vars);
    });

    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ var1 }}')],
      tests: [
        {
          vars: { var1: 'file://test/fixtures/test_file.txt' },
        },
      ],
    };

    try {
      const processedTestSuite = await processConfigFileReferences(testSuite);
      const evalRecord = await Eval.create({}, processedTestSuite.prompts, { id: randomUUID() });
      await evaluate(processedTestSuite, evalRecord, {});
      const summary = await evalRecord.toEvaluateSummary();

      expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
      expect(mockApiProvider.callApi).toHaveBeenCalledWith(
        'Test prompt <h1>Sample Report</h1><p>This is a test report with some data for the year 2023.</p>',
        expect.anything(),
        expect.any(Object),
      );

      expect(summary.stats.successes).toBe(1);
      expect(summary.stats.failures).toBe(0);
      expect(summary.results[0].prompt.raw).toBe(
        'Test prompt <h1>Sample Report</h1><p>This is a test report with some data for the year 2023.</p>',
      );
      expect(summary.results[0].prompt.label).toBe('Test prompt {{ var1 }}');
      expect(summary.results[0].response?.output).toBe('Test output');
    } finally {
      mockRenderPrompt.mockRestore();
      fs.readFileSync = originalReadFileSync;
    }
  });

  it('evaluate with named prompt', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [{ raw: 'Test prompt {{ var1 }} {{ var2 }}', label: 'test display name' }],
      tests: [createVariableTest()],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({
      total: 10,
      prompt: 5,
      completion: 5,
      cached: 0,
      numRequests: 1,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      assertions: {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        },
      },
    });
    expect(summary.results[0].prompt.raw).toBe('Test prompt value1 value2');
    expect(summary.results[0].prompt.label).toBe('test display name');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with multiple vars', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ var1 }} {{ var2 }}')],
      tests: [
        {
          vars: { var1: ['value1', 'value3'], var2: ['value2', 'value4'] },
        },
      ],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(4);
    expect(summary.stats.successes).toBe(4);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({
      total: 40,
      prompt: 20,
      completion: 20,
      cached: 0,
      numRequests: 4,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      assertions: {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        },
      },
    });
    expect(summary.results[0].prompt.raw).toBe('Test prompt value1 value2');
    expect(summary.results[0].prompt.label).toBe('Test prompt {{ var1 }} {{ var2 }}');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate with multiple providers', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider, mockApiProvider],
      prompts: [toPrompt('Test prompt {{ var1 }} {{ var2 }}')],
      tests: [createVariableTest()],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);
    expect(summary.stats.successes).toBe(2);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({
      total: 20,
      prompt: 10,
      completion: 10,
      cached: 0,
      numRequests: 2,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      assertions: {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        },
      },
    });
    expect(summary.results[0].prompt.raw).toBe('Test prompt value1 value2');
    expect(summary.results[0].prompt.label).toBe('Test prompt {{ var1 }} {{ var2 }}');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate without tests', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({
      total: 10,
      prompt: 5,
      completion: 5,
      cached: 0,
      numRequests: 1,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      assertions: {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        },
      },
    });
    expect(summary.results[0].prompt.raw).toBe('Test prompt');
    expect(summary.results[0].prompt.label).toBe('Test prompt');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate without tests with multiple providers', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider, mockApiProvider, mockApiProvider],
      prompts: [toPrompt('Test prompt')],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(3);
    expect(summary.stats.successes).toBe(3);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({
      total: 30,
      prompt: 15,
      completion: 15,
      cached: 0,
      numRequests: 3,
      completionDetails: {
        reasoning: 0,
        acceptedPrediction: 0,
        rejectedPrediction: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      assertions: {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        },
      },
    });
    expect(summary.results[0].prompt.raw).toBe('Test prompt');
    expect(summary.results[0].prompt.label).toBe('Test prompt');
    expect(summary.results[0].response?.output).toBe('Test output');
  });

  it('evaluate for reasoning', async () => {
    const testSuite: TestSuite = {
      providers: [mockReasoningApiProvider],
      prompts: [toPrompt('Test prompt')],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });
    await evaluate(testSuite, evalRecord, {});
    const summary = await evalRecord.toEvaluateSummary();

    expect(mockReasoningApiProvider.callApi).toHaveBeenCalledTimes(1);
    expect(summary.stats.successes).toBe(1);
    expect(summary.stats.failures).toBe(0);
    expect(summary.stats.tokenUsage).toEqual({
      total: 21,
      prompt: 9,
      completion: 12,
      cached: 0,
      numRequests: 1,
      completionDetails: {
        reasoning: 11,
        acceptedPrediction: 12,
        rejectedPrediction: 13,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      assertions: {
        total: 0,
        prompt: 0,
        completion: 0,
        cached: 0,
        numRequests: 0,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
        },
      },
    });
    expect(summary.results[0].prompt.raw).toBe('Test prompt');
    expect(summary.results[0].prompt.label).toBe('Test prompt');
    expect(summary.results[0].response?.output).toBe('Test output');
  });
  it('allows test case repeat to override global repeat option', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          options: {
            repeat: 3,
          },
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, {
      id: randomUUID(),
    });

    await evaluate(testSuite, evalRecord, { repeat: 2 });

    const summary = (await evalRecord.toEvaluateSummary()) as EvaluateSummaryV3;

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(3);
    expect(
      vi.mocked(mockApiProvider.callApi).mock.calls.map(([, context]) => context?.repeatIndex),
    ).toEqual([0, 1, 2]);
    expect(summary.results).toHaveLength(3);
    expect(summary.results.map(({ repeatIndex }) => repeatIndex)).toEqual([0, 1, 2]);
    expect(new Set(summary.results.map(({ repeatGroupId }) => repeatGroupId))).toEqual(
      new Set(['test-0-vars-0']),
    );
    expect(summary.repeatStability).toMatchObject({
      totalGroups: 1,
      unstableGroups: 0,
      groups: [{ repetitions: 3, passed: 3, failed: 0, errors: 0 }],
    });
    expect(await evalRecord.getObservedRepeatStability()).toEqual(summary.repeatStability);
  });

  it('keeps expanded variable combinations in separate repeat groups', async () => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt {{ value }}')],
      tests: [{ vars: { value: ['first', 'second'] } }],
    };
    const evalRecord = await Eval.create({}, testSuite.prompts, { id: randomUUID() });

    await evaluate(testSuite, evalRecord, { repeat: 2 });

    const summary = (await evalRecord.toEvaluateSummary()) as EvaluateSummaryV3;
    const groups = new Map<string | undefined, EvaluateSummaryV3['results']>();
    for (const result of summary.results) {
      groups.set(result.repeatGroupId, [...(groups.get(result.repeatGroupId) ?? []), result]);
    }

    expect(groups.size).toBe(2);
    for (const results of groups.values()) {
      expect(results).toHaveLength(2);
      expect(results.map(({ repeatIndex }) => repeatIndex).sort()).toEqual([0, 1]);
    }
    expect(summary.repeatStability).toMatchObject({
      totalGroups: 2,
      groups: [{ repetitions: 2 }, { repetitions: 2 }],
    });
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5],
    ['NaN', Number.NaN],
    ['infinite', Number.POSITIVE_INFINITY],
    ['unsafe', Number.MAX_SAFE_INTEGER + 1],
  ])('falls back to global repeat for a %s per-test repeat', async (_label, repeat) => {
    const testSuite: TestSuite = {
      providers: [mockApiProvider],
      prompts: [toPrompt('Test prompt')],
      tests: [
        {
          options: {
            repeat,
          },
        },
      ],
    };

    const evalRecord = await Eval.create({}, testSuite.prompts, {
      id: randomUUID(),
    });

    await evaluate(testSuite, evalRecord, { repeat: 2 });

    expect(mockApiProvider.callApi).toHaveBeenCalledTimes(2);
  });
});
