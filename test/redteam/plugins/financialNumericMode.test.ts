import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../../src/assertions/index';
import cliState from '../../../src/cliState';
import { runEval } from '../../../src/evaluator';
import { RedteamGraderBase } from '../../../src/redteam/plugins/base';
import { runMetaAgentRedteam } from '../../../src/redteam/providers/iterativeMeta';

import type {
  ApiProvider,
  Assertion,
  AssertionOrSet,
  AtomicTestCase,
} from '../../../src/types/index';

const reference = { type: 'numeric', expected: { amount: 100 } };
const prompt = { raw: '{{query}}', label: 'Original prompt' };
const type = 'promptfoo:redteam:financial:calculation-error';
const wrapped = ['{"answer":"{\\"amount\\":100}"}', '{"answer":"{\\"amount\\":101}"}'];

async function evaluate(
  assertions: AssertionOrSet[],
  outputs: string[],
  options?: AtomicTestCase['options'],
  providerTransform?: ApiProvider['transform'],
  metadata?: AtomicTestCase['metadata'],
) {
  const callApi = vi.fn();
  for (const output of outputs) {
    callApi.mockResolvedValueOnce({ output, metadata: { encoding: 'wrapped' } });
  }
  const target: ApiProvider = { id: () => 'numeric-target', callApi, transform: providerTransform };
  const strategy: ApiProvider = {
    id: () => 'promptfoo:redteam:iterative:meta',
    callApi: async (_prompt, context) =>
      runMetaAgentRedteam({
        context,
        prompt: context!.prompt,
        vars: context!.vars,
        test: context!.test as AtomicTestCase,
        filters: undefined,
        targetProvider: target,
        gradingProvider: target,
        injectVar: 'query',
        numIterations: outputs.length,
        agentProvider: {
          id: () => 'synthetic-attacker',
          callApi: async () => ({ output: { result: 'Attack prompt' } }),
        },
      }),
  };
  const test: AtomicTestCase = {
    provider: strategy,
    vars: { query: 'Original prompt' },
    assert: assertions,
    options,
    metadata: {
      purpose: 'Financial calculator',
      pluginId: 'financial:calculation-error',
      strategyId: 'jailbreak:meta',
      ...metadata,
    },
  };
  const [row] = await runEval({
    provider: target,
    prompt,
    test,
    testIdx: 0,
    promptIdx: 0,
    delay: 0,
    repeatIndex: 0,
    evaluateOptions: {},
    conversations: {},
    registers: {},
    isRedteam: true,
  });
  return { row, target, test };
}

function legacyGrade() {
  return vi.spyOn(RedteamGraderBase.prototype, 'getResult').mockResolvedValue({
    grade: { pass: true, score: 1, reason: 'Legacy rubric passed' },
    rubric: 'Legacy rubric',
  });
}

describe('explicit numeric preparation mode', () => {
  let directory: string;
  let previousBasePath: string | undefined;
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'numeric-mode-'));
    previousBasePath = cliState.basePath;
    cliState.basePath = directory;
    vi.stubGlobal('__numericReferenceCalls', 0);
    vi.stubGlobal('__numericInlineCalls', 0);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Unexpected network request');
      }),
    );
  });
  afterEach(async () => {
    cliState.basePath = previousBasePath;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await fs.rm(directory, { recursive: true, force: true });
  });
  const calls = () =>
    (globalThis as typeof globalThis & { __numericReferenceCalls: number }).__numericReferenceCalls;

  it.each([undefined, false])(
    'preserves legacy script and transform timing with numeric=%s',
    async (numeric) => {
      legacyGrade();
      await fs.writeFile(
        path.join(directory, 'legacy.cjs'),
        'module.exports = () => { globalThis.__numericReferenceCalls++; return "Legacy rubric"; };',
      );
      const transform = vi.fn((output: unknown) => JSON.parse(String(output)).answer);
      const { row, target } = await evaluate(
        [{ type, value: 'file://legacy.cjs', config: { numeric } }],
        ['Plaintext refusal', wrapped[0]],
        { transform },
      );
      expect(row.success).toBe(true);
      expect(target.callApi).toHaveBeenCalledTimes(2);
      expect(transform).toHaveBeenCalledTimes(1);
      expect(calls()).toBe(1);
    },
  );

  it.each([undefined, false])(
    'requires opt-in only for adaptive external numeric references with numeric=%s',
    async (numeric) => {
      legacyGrade();
      await fs.writeFile(
        path.join(directory, 'reference.cjs'),
        `module.exports = () => { globalThis.__numericReferenceCalls++; return ${JSON.stringify(reference)}; };`,
      );
      const assertion: Assertion = { type, value: 'file://reference.cjs', config: { numeric } };
      const { row, target } = await evaluate([assertion], ['{"amount":100}', '{"amount":100}']);
      expect(target.callApi).toHaveBeenCalledTimes(2);
      expect(row.failureReason).toBe(2);
      expect(row.error).toContain('require config.numeric: true');
      expect(calls()).toBe(1);
      const baseline = await runAssertion({
        prompt: 'Original prompt',
        assertion,
        test: { assert: [assertion] },
        providerResponse: { output: '{"amount":100}' },
      });
      expect(baseline.pass).toBe(true);
    },
  );

  it.each(['true', 1, null])(
    'rejects malformed numeric option %s before running reference code',
    async (numeric) => {
      const judge = legacyGrade();
      await fs.writeFile(
        path.join(directory, 'reference.cjs'),
        'module.exports = () => { globalThis.__numericReferenceCalls++; return "Legacy rubric"; };',
      );
      const { row, target } = await evaluate(
        [{ type, value: 'file://reference.cjs', config: { numeric } }],
        ['{"amount":100}'],
      );
      expect(target.callApi).toHaveBeenCalledTimes(1);
      expect(row.failureReason).toBe(2);
      expect(row.error).toContain('config.numeric must be a boolean');
      expect(calls()).toBe(0);
      expect(judge).not.toHaveBeenCalled();
    },
  );

  it('rejects an explicitly numeric script that resolves a legacy value', async () => {
    const judge = legacyGrade();
    await fs.writeFile(
      path.join(directory, 'reference.cjs'),
      'module.exports = () => "Legacy rubric";',
    );
    const { row, target } = await evaluate(
      [{ type, value: 'file://reference.cjs', config: { numeric: true } }],
      ['{"amount":100}', '{"amount":100}'],
    );
    expect(target.callApi).toHaveBeenCalledTimes(1);
    expect(row.failureReason).toBe(2);
    expect(row.error).toContain('must resolve to value.type: numeric');
    expect(judge).not.toHaveBeenCalled();
  });

  it.each([undefined, 'unmatched-plugin', 'financial:calculation-error'])(
    'preserves the first top-level assertion with pluginId=%s',
    async (pluginId) => {
      legacyGrade();
      const { row, target } = await evaluate(
        [
          { type, value: 'Legacy rubric', metric: 'first' },
          { type, value: reference, metric: 'second' },
        ],
        ['{"amount":101}', '{"amount":100}'],
        undefined,
        undefined,
        { pluginId },
      );
      expect(target.callApi).toHaveBeenCalledTimes(2);
      expect(row.success).toBe(true);
      expect(row.response?.metadata?.storedGraderResult?.assertion?.metric).toBe('first');
    },
  );

  it.each(['provider', 'test'])(
    'preserves the original Prompt object for %s transforms',
    async (stage) => {
      const seen: unknown[] = [];
      const transform: NonNullable<ApiProvider['transform']> = (output, context) => {
        seen.push(context.prompt);
        const config =
          context.prompt && 'config' in context.prompt ? context.prompt.config : undefined;
        return config &&
          typeof config === 'object' &&
          'temperature' in config &&
          config.temperature === 0
          ? '{"amount":999}'
          : output;
      };
      const { row, target } = await evaluate(
        [{ type, value: reference }],
        ['{"amount":100}', '{"amount":101}'],
        { temperature: 0, ...(stage === 'test' ? { transform } : {}) },
        stage === 'provider' ? transform : undefined,
      );
      expect(target.callApi).toHaveBeenCalledTimes(2);
      expect(row.failureReason).toBe(1);
      expect(
        row.response?.metadata?.redteamHistory.map(
          (turn: { graderPassed: boolean }) => turn.graderPassed,
        ),
      ).toEqual([true, false]);
      expect(seen).toEqual([prompt, prompt, prompt]);
    },
  );

  it('keeps child configuration and parent threshold semantics when grouping numeric assertions', async () => {
    await fs.writeFile(
      path.join(directory, 'reference.cjs'),
      'module.exports = (_output, context) => ({type:"numeric",expected:{amount:context.config.amount}});',
    );
    const child: Assertion = {
      type,
      value: 'file://reference.cjs',
      config: { numeric: true, amount: 100 },
      transform: 'JSON.parse(output).answer',
    };
    const { row, target } = await evaluate(
      [{ type: 'assert-set', assert: [child], threshold: 0, config: { amount: 999 } }],
      wrapped,
    );
    expect(target.callApi).toHaveBeenCalledTimes(2);
    expect(row.response?.metadata?.storedGraderResult?.pass).toBe(false);
    expect(row.success).toBe(true);
    expect(row.gradingResult?.componentResults?.[0].componentResults?.[0].pass).toBe(false);
  });

  it.each(['provider', 'test', 'assertion'])(
    'safe mode blocks the %s inline transform before execution',
    async (stage) => {
      const transform = 'globalThis.__numericInlineCalls++; return JSON.parse(output).answer';
      const assertion: Assertion = {
        type,
        value: reference,
        ...(stage === 'assertion' ? { transform } : {}),
      };
      const { row, target } = await cliState.withSafeMode(true, () =>
        evaluate(
          [assertion],
          wrapped,
          stage === 'test' ? { transform } : undefined,
          stage === 'provider' ? transform : undefined,
        ),
      );
      expect(target.callApi).toHaveBeenCalledTimes(1);
      expect(row.failureReason).toBe(2);
      expect(row.error).toContain('disabled in safe mode');
      expect(
        (globalThis as typeof globalThis & { __numericInlineCalls: number }).__numericInlineCalls,
      ).toBe(0);
    },
  );

  it.each(['file', 'function'])('safe mode preserves permitted %s transforms', async (kind) => {
    await fs.writeFile(
      path.join(directory, 'transform.cjs'),
      'module.exports = output => JSON.parse(output).answer;',
    );
    const transform =
      kind === 'file'
        ? 'file://transform.cjs'
        : (output: unknown) => JSON.parse(String(output)).answer;
    const { row, target } = await cliState.withSafeMode(true, () =>
      evaluate([{ type, value: reference, transform }], wrapped),
    );
    expect(target.callApi).toHaveBeenCalledTimes(2);
    expect(row.failureReason).toBe(1);
    expect(row.response?.metadata?.storedGraderResult?.pass).toBe(false);
  });
});
