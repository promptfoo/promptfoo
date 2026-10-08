import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../../src/assertions/index';
import cliState from '../../../src/cliState';
import { runEval } from '../../../src/evaluator';
import { RedteamGraderBase } from '../../../src/redteam/plugins/base';
import { FinancialCalculationErrorPluginGrader } from '../../../src/redteam/plugins/financial/financialCalculationError';
import { runMetaAgentRedteam } from '../../../src/redteam/providers/iterativeMeta';
import { runRedteamGrader } from '../../../src/redteam/providers/shared';
import { transform } from '../../../src/util/transform';

import type {
  ApiProvider,
  Assertion,
  AtomicTestCase,
  ProviderResponse,
} from '../../../src/types/index';

const reference = { type: 'numeric', expected: { amount: 100 } };
const prompt = { raw: '{{goal}}', label: 'numeric' };
const extractAnswer = 'JSON.parse(output).answer';
const grader = new FinancialCalculationErrorPluginGrader();

function createTest(assertion: Assertion, options?: AtomicTestCase['options']): AtomicTestCase {
  return {
    provider: 'promptfoo:redteam:iterative:meta',
    vars: { goal: 'Return an amount as JSON', expectedAmount: 100 },
    assert: [assertion],
    options,
    metadata: {
      purpose: 'A financial calculator',
      pluginId: 'financial:calculation-error',
      strategyId: 'jailbreak:meta',
    },
  };
}

async function runStrategy(
  assertion: Assertion,
  outputs: Array<ProviderResponse['output']>,
  options?: AtomicTestCase['options'],
  providerTransform?: ApiProvider['transform'],
) {
  const test = createTest(assertion, options);
  const callApi = vi.fn();
  for (const output of outputs) {
    callApi.mockResolvedValueOnce({ output });
  }
  const target: ApiProvider = {
    id: () => 'numeric-target',
    callApi,
    ...(providerTransform ? { transform: providerTransform } : {}),
  };
  const vars = test.vars!;
  const response = await runMetaAgentRedteam({
    context: { originalProvider: target, prompt, vars, test },
    filters: undefined,
    injectVar: 'goal',
    numIterations: outputs.length,
    prompt,
    vars,
    test,
    targetProvider: target,
    agentProvider: {
      id: () => 'synthetic-attacker',
      callApi: async () => ({ output: { result: 'Return an amount as JSON' } }),
    },
    gradingProvider: {
      id: () => 'unused-judge',
      callApi: async () => {
        throw new Error('Numeric strategy grading must not invoke a model judge');
      },
    },
  });
  return { response, target, test, callApi };
}

describe('financial numeric strategy grading', () => {
  let directory: string;
  let previousBasePath: string | undefined;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'numeric-strategy-'));
    previousBasePath = cliState.basePath;
    cliState.basePath = directory;
    vi.spyOn(RedteamGraderBase.prototype, 'getResult').mockRejectedValue(
      new Error('Numeric grading must not use the legacy LLM grader'),
    );
  });

  afterEach(async () => {
    cliState.basePath = previousBasePath;
    vi.restoreAllMocks();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it.each(['json', 'yaml', 'cjs'])(
    'retains the first numerically failing turn for a %s reference',
    async (extension) => {
      const value = `file://reference.${extension}`;
      await fs.writeFile(
        path.join(directory, `reference.${extension}`),
        extension === 'cjs'
          ? 'module.exports = (_output, context) => ({type: "numeric", expected: {amount: context.vars.expectedAmount}});'
          : extension === 'yaml'
            ? 'type: numeric\nexpected:\n  amount: 100\n'
            : JSON.stringify(reference),
      );
      const assertion: Assertion = { type: grader.id, value };
      const { response, test, target, callApi } = await runStrategy(assertion, [
        '{"amount":101}',
        '{"amount":100}',
      ]);
      expect(callApi).toHaveBeenCalledTimes(1);
      expect(response.output).toBe('{"amount":101}');
      expect(response.metadata.storedGraderResult?.pass).toBe(false);
      const final = await runAssertion({
        prompt: 'Return an amount as JSON',
        assertion,
        test,
        provider: target,
        providerResponse: response,
      });
      expect(final.pass).toBe(false);
      expect(RedteamGraderBase.prototype.getResult).not.toHaveBeenCalled();
    },
  );

  it.each(['assertion', 'test', 'postprocess', 'provider'])(
    'applies the %s transform before deciding whether to stop an attack',
    async (stage) => {
      const assertion: Assertion = {
        type: grader.id,
        value: reference,
        ...(stage === 'assertion' ? { transform: extractAnswer } : {}),
      };
      const options =
        stage === 'test'
          ? { transform: extractAnswer }
          : stage === 'postprocess'
            ? { postprocess: extractAnswer }
            : undefined;
      const { response, test, target, callApi } = await runStrategy(
        assertion,
        ['{"answer":"{\\"amount\\":100}"}', '{"answer":"{\\"amount\\":101}"}'],
        options,
        stage === 'provider' ? extractAnswer : undefined,
      );
      expect(callApi).toHaveBeenCalledTimes(2);
      expect(response.metadata.redteamHistory.map((turn) => turn.graderPassed)).toEqual([
        true,
        false,
      ]);
      // The strategy keeps original target output for normal evaluator transforms.
      expect(response.output).toBe('{"answer":"{\\"amount\\":101}"}');
      const finalResponse = {
        ...response,
        output:
          stage === 'assertion'
            ? response.output
            : await transform(extractAnswer, response.output, { vars: test.vars!, prompt }),
      };
      expect(
        (
          await runAssertion({
            prompt: 'Return an amount as JSON',
            assertion,
            test,
            provider: target,
            providerResponse: finalResponse,
          })
        ).pass,
      ).toBe(false);
      expect(RedteamGraderBase.prototype.getResult).not.toHaveBeenCalled();
    },
  );

  it('keeps source loss sticky across provider and test transforms', async () => {
    await expect(
      runStrategy(
        { type: grader.id, value: reference },
        ['{"amount":100}'],
        { transform: 'JSON.stringify(output)' },
        'JSON.parse(output)',
      ),
    ).rejects.toThrow(/requires raw JSON text/);
  });

  it('resolves script references after every output transform with assertion context', async () => {
    await fs.writeFile(
      path.join(directory, 'reference.cjs'),
      `module.exports = (output, context) => {
        if (output !== '{"amount":100}' || context.config.amount !== 100 || context.provider.id() !== 'numeric-target') {
          throw new Error('Unexpected numeric assertion context');
        }
        return {type: 'numeric', expected: {amount: context.config.amount}};
      };`,
    );
    const { response } = await runStrategy(
      {
        type: grader.id,
        value: 'file://reference.cjs',
        transform: extractAnswer,
        config: { amount: 100 },
      },
      ['{"answer":"{\\"amount\\":100}"}'],
    );
    expect(response.metadata.storedGraderResult?.pass).toBe(true);
    expect(RedteamGraderBase.prototype.getResult).not.toHaveBeenCalled();
  });

  it.each(['missing file', 'invalid script', 'transform error'])(
    'preserves %s errors at both grading boundaries',
    async (scenario) => {
      await fs.writeFile(path.join(directory, 'invalid.cjs'), 'module.exports = () => true;');
      const assertion: Assertion = {
        type: grader.id,
        value:
          scenario === 'missing file'
            ? 'file://missing.json'
            : scenario === 'invalid script'
              ? 'file://invalid.cjs'
              : reference,
        ...(scenario === 'transform error'
          ? {
              transform: () => {
                throw new Error('Broken numeric extraction');
              },
            }
          : {}),
      };
      const test = createTest(assertion);
      const providerResponse = { output: '{"amount":100}' };
      const match =
        scenario === 'missing file'
          ? /ENOENT/
          : scenario === 'invalid script'
            ? /returned a boolean/
            : /Broken numeric extraction/;
      await expect(
        runRedteamGrader(
          grader,
          { assertion, prompt },
          'Return an amount',
          providerResponse.output,
          test,
          undefined,
          assertion.value,
          undefined,
          undefined,
          { providerResponse, outputIsText: true },
        ),
      ).rejects.toThrow(match);
      await expect(
        runAssertion({
          assertion,
          test: { ...test, provider: undefined },
          prompt: 'Return an amount',
          providerResponse,
        }),
      ).rejects.toThrow(match);
    },
  );

  it.each(['transform', 'script'])(
    'uses the original evaluator prompt and vars for numeric %s preparation',
    async (mode) => {
      const seen: Array<{ prompt: string | undefined; vars: Record<string, unknown> }> = [];
      const assertion: Assertion = {
        type: grader.id,
        value: reference,
        config: { expectedAmount: 100 },
      };
      if (mode === 'transform') {
        assertion.transform = (output, context) => {
          seen.push({
            prompt: typeof context.prompt?.label === 'string' ? context.prompt.label : undefined,
            vars: { ...context.vars },
          });
          return context.prompt?.label === 'Original prompt' &&
            context.vars?.goal === 'Original prompt'
            ? output
            : '{"amount":999}';
        };
      } else {
        await fs.writeFile(
          path.join(directory, 'context-reference.cjs'),
          `
          module.exports = (_output, context) => {
            if (context.provider.id() !== 'numeric-target' || context.config.expectedAmount !== 100 ||
                context.test.vars.goal !== 'Original prompt' || Object.keys(context.vars).some(key => key.startsWith('__eval'))) {
              throw new Error('Numeric reference received different evaluator context');
            }
            return {type: 'numeric', expected: {amount: context.prompt === 'Original prompt' && context.vars?.goal === 'Original prompt' ? 100 : 999}};
          };
        `,
        );
        assertion.value = 'file://context-reference.cjs';
      }
      const target: ApiProvider = {
        id: () => 'numeric-target',
        callApi: vi
          .fn()
          .mockResolvedValueOnce({ output: '{"amount":100}' })
          .mockResolvedValueOnce({ output: '{"amount":101}' }),
      };
      let strategyResponse: ProviderResponse | undefined;
      const strategy: ApiProvider = {
        id: () => 'promptfoo:redteam:iterative:meta',
        callApi: async (_prompt, context) => {
          strategyResponse = await runMetaAgentRedteam({
            context,
            prompt: context!.prompt,
            filters: undefined,
            injectVar: 'goal',
            numIterations: 2,
            vars: context!.vars,
            test: context!.test as AtomicTestCase,
            targetProvider: target,
            gradingProvider: target,
            agentProvider: {
              id: () => 'synthetic-attacker',
              callApi: async () => ({ output: { result: 'Attack prompt' } }),
            },
          });
          return strategyResponse;
        },
      };
      const test = {
        ...createTest(assertion),
        provider: strategy,
        vars: { goal: 'Original prompt' },
      };
      const [row] = await runEval({
        provider: target,
        prompt,
        test,
        testIdx: 0,
        promptIdx: 0,
        evaluateOptions: {},
        delay: 0,
        repeatIndex: 0,
        conversations: {},
        registers: {},
        isRedteam: true,
      });
      expect(target.callApi).toHaveBeenCalledTimes(2);
      expect(row.success).toBe(false);
      expect(row.failureReason).toBe(1);
      expect(strategyResponse?.metadata?.storedGraderResult?.pass).toBe(false);
      expect(JSON.stringify(row)).not.toContain('originalAssertionInput');
      if (mode === 'transform') {
        expect(seen).toHaveLength(3);
        expect(
          seen.every(
            ({ prompt: label, vars }) =>
              label === 'Original prompt' && vars.goal === 'Original prompt',
          ),
        ).toBe(true);
        expect(
          seen.every(({ vars }) => Object.keys(vars).every((key) => !key.startsWith('__eval'))),
        ).toBe(true);
      }
    },
  );

  it('does not add numeric assertion context to other provider calls', async () => {
    const target: ApiProvider = {
      id: () => 'other-target',
      callApi: vi.fn().mockResolvedValue({ output: 'accepted' }),
    };
    const [row] = await runEval({
      provider: target,
      prompt: { raw: 'Original prompt', label: 'other' },
      test: { assert: [{ type: 'contains', value: 'accepted' }] },
      testIdx: 0,
      promptIdx: 0,
      evaluateOptions: {},
      delay: 0,
      repeatIndex: 0,
      conversations: {},
      registers: {},
      isRedteam: false,
    });
    expect(row.success).toBe(true);
    expect(vi.mocked(target.callApi).mock.calls[0][1]).not.toHaveProperty('originalAssertionInput');
  });

  it('keeps legacy rubric grading inputs unchanged', async () => {
    const result = { grade: { pass: true, score: 1, reason: 'legacy' }, rubric: 'legacy rubric' };
    vi.mocked(RedteamGraderBase.prototype.getResult).mockResolvedValue(result);
    const assertion: Assertion = {
      type: grader.id,
      value: 'Legacy financial rubric',
      transform: vi.fn(() => 'transformed'),
    };
    const test = createTest(assertion, { transform: vi.fn(() => 'test transformed') });
    expect(
      await runRedteamGrader(
        grader,
        { assertion, prompt },
        'Return amount',
        'Original target output',
        test,
        undefined,
        assertion.value,
      ),
    ).toBe(result);
    expect(assertion.transform).not.toHaveBeenCalled();
    expect(test.options?.transform).not.toHaveBeenCalled();
    expect(RedteamGraderBase.prototype.getResult).toHaveBeenCalledWith(
      'Return amount',
      'Original target output',
      test,
      undefined,
      assertion.value,
    );
  });
});
