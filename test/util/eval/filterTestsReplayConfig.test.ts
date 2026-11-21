import { afterEach, describe, expect, it, vi } from 'vitest';
import Eval from '../../../src/models/eval';
import { filterTestsByResults } from '../../../src/util/eval/filterTestsUtil';
import { TransformInputType, transform } from '../../../src/util/transform';

import type { EvaluateResult, TestCase, Vars } from '../../../src/types/index';

vi.mock('../../../src/models/eval', () => ({ default: { findById: vi.fn() } }));

function mockHistory(testCase: TestCase, vars: Vars = testCase.vars ?? {}) {
  const row = {
    success: false,
    provider: { id: 'echo' },
    vars,
    testCase,
  } as EvaluateResult;
  vi.mocked(Eval.findById).mockResolvedValue({
    toEvaluateSummary: async () => ({ results: [row] }),
  } as unknown as Eval);
}

async function applyTransform(test: TestCase) {
  test.vars = (await transform(
    test.options!.transformVars!,
    { ...test.vars },
    { prompt: {}, uuid: 'replay-config-test' },
    true,
    TransformInputType.VARS,
  )) as Vars;
}

afterEach(() => {
  vi.resetAllMocks();
});

describe('historical test replay configuration', () => {
  it('retains extracted input before a non-idempotent runtime transform', async () => {
    const transformVars = (value: unknown) => {
      const vars = value as Vars;
      return { ...vars, input: String(vars.input) + '|next' };
    };
    const history: TestCase = {
      description: 'generated',
      vars: { input: 'seed', _conversation: ['old'] },
      provider: 'historical-provider',
      options: { transformVars },
    };
    mockHistory(history);
    const configs = new WeakMap<TestCase, TestCase>();
    const selected = await filterTestsByResults(
      { providers: [], prompts: [], tests: [{ vars: { input: 'different' } }] },
      'eval-history',
      (result) => !result.success,
      undefined,
      configs,
    );
    const runtime = selected[0];
    const replay = configs.get(runtime)!;

    await applyTransform(runtime);

    expect(runtime.vars).toEqual({ input: 'seed|next' });
    expect(replay.vars).toEqual({ input: 'seed' });
    expect(replay.options?.transformVars).toBe(transformVars);
    expect(replay.provider).toBeUndefined();
  });

  it('isolates nested extracted variables while retaining function-valued options', async () => {
    const transformVars = (value: unknown) => {
      const vars = value as Vars;
      (vars.payload as { items: string[] }).items.push('next');
      return vars;
    };
    const history: TestCase = {
      vars: { payload: { items: ['seed'] } },
      options: { transformVars },
    };
    mockHistory(history);
    const configs = new WeakMap<TestCase, TestCase>();
    const [runtime] = await filterTestsByResults(
      { providers: [], prompts: [], tests: [] },
      'eval-history',
      () => true,
      undefined,
      configs,
    );
    const replay = configs.get(runtime)!;

    await applyTransform(runtime);

    expect(runtime.vars?.payload).toEqual({ items: ['seed', 'next'] });
    expect(replay.vars?.payload).toEqual({ items: ['seed'] });
    expect(replay.options?.transformVars).toBe(transformVars);
  });

  it('isolates restored nested runtime variables from the matched replay config', async () => {
    const transformVars = (value: unknown) => {
      const vars = value as Vars;
      (vars._conversation as string[]).push('next');
      return vars;
    };
    const provider = { id: () => 'echo', callApi: async () => ({ output: '' }) };
    const parsed: TestCase = { vars: { input: 'expanded' }, provider, options: { transformVars } };
    const raw: TestCase = {
      vars: { input: 'file://input.txt' },
      provider,
      options: { transformVars },
    };
    mockHistory(parsed, { input: 'expanded', _conversation: ['prior'], sessionId: 'session' });
    const configs = new WeakMap<TestCase, TestCase>([[parsed, raw]]);
    const [runtime] = await filterTestsByResults(
      { providers: [], prompts: [], tests: [parsed] },
      'eval-history',
      () => true,
      undefined,
      configs,
    );
    const replay = configs.get(runtime)!;

    await applyTransform(runtime);

    expect(runtime.vars?._conversation).toEqual(['prior', 'next']);
    expect(replay.vars).toEqual({
      input: 'file://input.txt',
      _conversation: ['prior'],
      sessionId: 'session',
    });
    expect(replay.provider).toBe(provider);
    expect(replay.options).toBe(raw.options);
  });

  it('retains the existing raw mapping when no runtime variables need restoration', async () => {
    const parsed: TestCase = { vars: { input: 'expanded' } };
    const raw: TestCase = { vars: { input: 'file://input.txt' } };
    mockHistory(parsed);
    const configs = new WeakMap<TestCase, TestCase>([[parsed, raw]]);
    const selected = await filterTestsByResults(
      { providers: [], prompts: [], tests: [parsed] },
      'eval-history',
      () => true,
      undefined,
      configs,
    );
    expect(selected).toEqual([parsed]);
    expect(configs.get(selected[0])).toBe(raw);
  });

  it('keeps extracting historical tests when replay mapping is not requested', async () => {
    const history: TestCase = {
      vars: { input: 'seed', _conversation: ['prior'] },
      provider: 'old',
    };
    mockHistory(history);
    const selected = await filterTestsByResults(
      { providers: [], prompts: [], tests: [] },
      'eval-history',
      () => true,
    );
    expect(selected).toHaveLength(1);
    expect(selected[0].vars).toEqual({ input: 'seed' });
    expect(selected[0].provider).toBeUndefined();
  });
});
