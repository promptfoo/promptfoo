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
import { type Assertion, type EvaluateSummaryV3, type TestSuite } from '../../src/types/index';
import { processConfigFileReferences } from '../../src/util/fileReference';
import { mockProcessEnv } from '../util/utils';
import { mockApiProvider, mockReasoningApiProvider, toPrompt } from './helpers';
import { describeEvaluator } from './lifecycle';

const createVariableTest = () => ({
  vars: { var1: 'value1', var2: 'value2' },
});
describeEvaluator('evaluator basic flows', () => {
  it.each(['resume', 'retry'] as const)(
    'rejects Bayes@N %s before preparing inputs or invoking hooks',
    async (mode) => {
      const callApi = vi.fn(async () => ({ output: 'answer' }));
      const render = vi.fn(async () => 'question');
      const suite: TestSuite = {
        providers: [{ id: () => 'fresh-target', callApi }],
        prompts: [{ ...toPrompt('question'), function: render }],
        extensions: ['test-hook'],
        tests: [{}],
      };
      cliState.resume = mode === 'resume';
      cliState.retryMode = mode === 'retry';
      await expect(
        evaluate(suite, new Eval({}), { bayesAtN: true, repeat: 2, cache: false }),
      ).rejects.toThrow('fresh evaluations only');
      expect(render).not.toHaveBeenCalled();
      expect(callApi).not.toHaveBeenCalled();
      expect(runExtensionHook).not.toHaveBeenCalled();
    },
  );

  it.each(['resume', 'retry'] as const)(
    'rejects %s of a stored count-only or legacy Bayes@N plan when the option is omitted',
    async (mode) => {
      for (const legacy of [false, true]) {
        const plan = {
          version: 1,
          groups: [
            {
              repeatGroupId: 'question',
              promptIdx: 0,
              provider: { id: 'stored-target' },
              repetitions: 2,
              ...(legacy && { inputHash: 'sha256:' + 'a'.repeat(64) }),
            },
          ],
        };
        const record = new Eval({ metadata: { bayesAtNPlan: plan } });
        const callApi = vi.fn(async () => ({ output: 'answer' }));
        cliState.resume = mode === 'resume';
        cliState.retryMode = mode === 'retry';
        await expect(
          evaluate(
            {
              providers: [{ id: () => 'stored-target', callApi }],
              prompts: [toPrompt('question')],
              tests: [{}],
            },
            record,
            { cache: false },
          ),
        ).rejects.toThrow('fresh evaluations only');
        expect(callApi).not.toHaveBeenCalled();
        expect(record.config.metadata?.bayesAtNPlan).toEqual(plan);
      }
    },
  );

  it.each(['resume', 'retry'] as const)(
    'rejects %s of runtime-only Bayes@N records',
    async (mode) => {
      const record = new Eval({});
      record.runtimeOptions = { bayesAtN: true };
      const callApi = vi.fn(async () => ({ output: 'answer' }));
      cliState.resume = mode === 'resume';
      cliState.retryMode = mode === 'retry';
      await expect(
        evaluate(
          {
            providers: [{ id: () => 'runtime-target', callApi }],
            prompts: [toPrompt('question')],
            tests: [{}],
          },
          record,
          { bayesAtN: false },
        ),
      ).rejects.toThrow('fresh evaluations only');
      expect(callApi).not.toHaveBeenCalled();
    },
  );

  it('requires an empty record for a fresh Bayes@N evaluation', async () => {
    const callApi = vi.fn(async () => ({ output: 'answer' }));
    const suite: TestSuite = {
      providers: [{ id: () => 'empty-target', callApi }],
      prompts: [toPrompt('question')],
      tests: [{}],
    };
    const record = new Eval({});
    await evaluate(suite, record, { bayesAtN: true, repeat: 2, cache: false });
    const originalPlan = structuredClone(record.config.metadata?.bayesAtNPlan);
    await expect(
      evaluate(suite, record, { bayesAtN: true, repeat: 2, cache: false }),
    ).rejects.toThrow('new empty evaluation record');
    expect(callApi).toHaveBeenCalledTimes(2);
    expect(record.results).toHaveLength(2);
    expect(record.config.metadata?.bayesAtNPlan).toEqual(originalPlan);
    expect(JSON.stringify(originalPlan)).not.toContain('inputHash');
  });

  it.each([
    'value array',
    'contextTransform',
    'assertion rubric',
    'rubric array',
    'default rubric',
    'ENV rubric',
  ])('rejects changed grading file bytes before provider calls: %s', async (field) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bayes-grading-'));
    const file = path.join(directory, 'rubric.txt');
    fs.writeFileSync(file, 'original grading input');
    const reference = `file://${file}`;
    const restoreEnv = mockProcessEnv({ PROMPTFOO_TEST_BAYES_RUBRIC: directory });
    const callApi = vi.fn(async () => ({ output: 'answer' }));
    const assertion: Assertion =
      field === 'value array'
        ? { type: 'contains-any' as const, value: [reference] }
        : {
            type:
              field === 'contextTransform' || field === 'rubric array'
                ? 'context-faithfulness'
                : 'llm-rubric',
            ...(field === 'contextTransform' && { contextTransform: reference }),
            ...(field === 'assertion rubric' && { rubricPrompt: reference }),
            ...(field === 'ENV rubric' && {
              rubricPrompt: 'file://{{ env.PROMPTFOO_TEST_BAYES_RUBRIC }}/rubric.txt',
            }),
            ...(field === 'rubric array' && {
              rubricPrompt: [{ role: 'user' as const, content: reference }],
            }),
          };
    vi.mocked(runExtensionHook).mockImplementation(async (_extensions, hook, context) => {
      if (hook === 'beforeEach') {
        fs.writeFileSync(file, 'changed grading input');
      }
      return context;
    });
    try {
      await expect(
        evaluate(
          {
            providers: [{ id: () => 'grading-files', callApi }],
            prompts: [toPrompt('question')],
            extensions: ['test-hook'],
            defaultTest: field === 'default rubric' ? { options: { rubricPrompt: reference } } : {},
            tests: [{ assert: [{ type: 'assert-set', assert: [assertion] }] }],
          },
          new Eval({}),
          { bayesAtN: true, repeat: 2, cache: false },
        ),
      ).rejects.toThrow('unchanged question and grading inputs after beforeEach');
      expect(callApi).not.toHaveBeenCalled();
    } finally {
      restoreEnv();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('uses the assertion rubric override without opening an unused inherited file', async () => {
    const callApi = vi.fn(async () => ({ output: 'answer' }));
    const grade = vi.fn(async () => ({ output: '{"pass":true,"score":1,"reason":"correct"}' }));
    const record = new Eval({});
    await evaluate(
      {
        providers: [{ id: () => 'rubric-override', callApi }],
        prompts: [toPrompt('question')],
        defaultTest: {
          options: {
            rubricPrompt: 'file://missing-unused-rubric.txt',
            provider: { id: () => 'grader', callApi: grade },
          },
        },
        tests: [
          { assert: [{ type: 'llm-rubric', rubricPrompt: 'Grade {{output}}', value: 'correct' }] },
        ],
      },
      record,
      { bayesAtN: true, repeat: 2, cache: false },
    );
    expect(callApi).toHaveBeenCalledTimes(2);
    expect(grade).toHaveBeenCalledTimes(2);
    expect((await record.getRepeatStability())?.bayesAtN?.[0].mean).toBe(3 / 4);
  });

  it('persists the same count-only plan for different credentials without a verifier', async () => {
    const plans = [];
    for (const password of ['0001', '0042']) {
      const record = await Eval.create({}, [toPrompt('question')], { id: randomUUID() });
      await evaluate(
        {
          providers: [
            {
              id: () => 'credential-target',
              config: { auth: { type: 'basic', username: 'account', password } },
              callApi: async () => ({ output: 'answer' }),
            },
          ],
          prompts: [toPrompt('question')],
          tests: [{}],
        },
        record,
        { bayesAtN: true, repeat: 2, cache: false },
      );
      const restored = (await Eval.findById(record.id))!;
      plans.push(restored.config.metadata?.bayesAtNPlan);
      expect(JSON.stringify(plans.at(-1))).not.toMatch(/inputHash|sha256|password|0001|0042/);
    }
    expect(plans[0]).toEqual(plans[1]);
  });

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

  it('isolates model-grader mutations between repeated trials and restores completed summaries', async () => {
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
    expect(await restored.getRepeatStability()).toEqual(await record.getRepeatStability());
  });

  it('prepares each structured prompt once and rejects resume before rerendering', async () => {
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
    await expect(
      evaluate(suite(), restored, { bayesAtN: true, repeat: 2, cache: false }),
    ).rejects.toThrow('fresh evaluations only');
    expect(render).toHaveBeenCalledTimes(2);
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

  it.each([
    { session_id: 'shared' },
    { persist_sessions: true },
    { thread_id: 'shared' },
    { persist_threads: true },
    { continue: true },
    { resume: 'shared' },
    { sessionId: 'shared' },
    { session_key: 'shared' },
    { session: { type: 'memory' } },
    { runOptions: { session: { type: 'memory' } } },
    { headers: { 'X-OpenClaw-Session-Key': 'shared' } },
    ...['resume', 'r', 'continue', 'c', 'session-id', 'fork-session'].map((key) => ({
      extra_args: { [key]: null },
    })),
  ])('rejects shared session config with a custom provider ID: %j', async (config) => {
    const callApi = vi.fn(async () => ({ output: 'answer' }));
    const record = new Eval({});
    await expect(
      evaluate(
        {
          providers: [{ id: () => 'aliased-agent', config, callApi }],
          prompts: [toPrompt('question')],
          tests: [{}],
        },
        record,
        { bayesAtN: true, repeat: 2, cache: false },
      ),
    ).rejects.toThrow('shared provider sessions');
    expect(callApi).not.toHaveBeenCalled();
    expect(record.config.metadata?.bayesAtNPlan).toBeUndefined();
  });

  it.each([
    'prompt config',
    'test options',
    'prompt function',
    'target override',
    'grader',
    'typed grader',
    'nested grader',
  ])('rejects shared sessions from effective %s', async (location) => {
    const callApi = vi.fn(async () => ({ output: 'answer' }));
    const shared = { id: () => 'aliased-agent', config: { session_id: 'shared' }, callApi };
    const test: NonNullable<TestSuite['tests']>[number] = {};
    if (location === 'test options') {
      test.options = { session_id: 'shared' };
    } else if (location === 'target override') {
      test.provider = shared;
    } else if (location === 'grader' || location === 'typed grader') {
      test.options = { provider: location === 'grader' ? shared : { text: shared } };
    } else if (location === 'nested grader') {
      test.assert = [{ type: 'assert-set', assert: [{ type: 'llm-rubric', provider: shared }] }];
    }
    await expect(
      evaluate(
        {
          providers: [{ id: () => 'fresh-target', callApi }],
          prompts: [
            {
              ...toPrompt('question'),
              ...(location === 'prompt config' && { config: shared.config }),
              ...(location === 'prompt function' && {
                function: async () => ({ prompt: 'question', config: shared.config }),
              }),
            },
          ],
          tests: [test],
        },
        new Eval({}),
        { bayesAtN: true, repeat: 2, cache: false },
      ),
    ).rejects.toThrow('shared provider sessions');
    expect(callApi).not.toHaveBeenCalled();
  });

  it('allows fresh sessions and explicitly disabled persistence', async () => {
    const callApi = vi.fn(async () => ({ output: 'answer' }));
    await evaluate(
      {
        providers: [
          {
            id: () => 'fresh-agent',
            config: {
              persist_session: true,
              parent_session_id: 'fixed-parent',
              persist_sessions: false,
              thread_id: '',
              persistSession: false,
            },
            callApi,
          },
        ],
        prompts: [toPrompt('question')],
        tests: [{ options: { persist_sessions: false } }],
      },
      new Eval({}),
      { bayesAtN: true, repeat: 2, cache: false },
    );
    expect(callApi).toHaveBeenCalledTimes(2);
  });

  it.each(['persistSession', 'session', 'sessionId'])(
    'does not mask base %s with a per-test false value',
    async (key) => {
      const callApi = vi.fn(async () => ({ output: 'answer' }));
      await expect(
        evaluate(
          {
            providers: [{ id: () => 'aliased-agent', config: { [key]: 'shared' }, callApi }],
            prompts: [toPrompt('question')],
            tests: [{ options: { [key]: false } }],
          },
          new Eval({}),
          { bayesAtN: true, repeat: 2, cache: false },
        ),
      ).rejects.toThrow('shared provider sessions');
      expect(callApi).not.toHaveBeenCalled();
    },
  );

  it('keeps shared session configurations available when Bayes@N is disabled', async () => {
    const callApi = vi.fn(async () => ({ output: 'answer' }));
    await evaluate(
      {
        providers: [{ id: () => 'opencode:sdk', config: { persist_sessions: true }, callApi }],
        prompts: [toPrompt('question')],
        tests: [{}],
      },
      new Eval({}),
      { repeat: 2, cache: false },
    );
    expect(callApi).toHaveBeenCalledTimes(2);
  });

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
        await expect(
          evaluate(testSuite, restored, { repeat: 2, bayesAtN: true, cache: false }),
        ).rejects.toThrow('fresh evaluations only');
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
