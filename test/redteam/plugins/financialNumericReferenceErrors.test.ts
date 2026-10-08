import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../../src/assertions/index';
import { runEval } from '../../../src/evaluator';
import { runPython } from '../../../src/python/pythonUtils';
import { runMetaAgentRedteam } from '../../../src/redteam/providers/iterativeMeta';
import { runRuby } from '../../../src/ruby/rubyUtils';

import type { ApiProvider, AtomicTestCase } from '../../../src/types/index';

vi.mock('../../../src/python/pythonUtils', async (importOriginal) => ({
  ...(await importOriginal()),
  runPython: vi.fn(),
}));
vi.mock('../../../src/ruby/rubyUtils', async (importOriginal) => ({
  ...(await importOriginal()),
  runRuby: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

it.each(['py', 'rb'])(
  'reports %s reference execution failure as an error, not a vulnerability',
  async (extension) => {
    const execute = extension === 'py' ? vi.mocked(runPython) : vi.mocked(runRuby);
    execute.mockRejectedValue(new Error('Reference interpreter is unavailable'));
    const target: ApiProvider = {
      id: () => 'numeric-target',
      callApi: vi.fn(async () => ({ output: '{"amount":100}' })),
    };
    const prompt = { raw: '{{query}}', label: 'numeric script' };
    const strategy: ApiProvider = {
      id: () => 'promptfoo:redteam:iterative:meta',
      callApi: async (_prompt, context) =>
        runMetaAgentRedteam({
          context,
          prompt: context!.prompt,
          filters: undefined,
          vars: context!.vars,
          test: context!.test as AtomicTestCase,
          targetProvider: target,
          gradingProvider: target,
          injectVar: 'query',
          numIterations: 2,
          agentProvider: {
            id: () => 'synthetic-attacker',
            callApi: async () => ({ output: { result: 'Return an amount as JSON' } }),
          },
        }),
    };
    const assertion = {
      type: 'promptfoo:redteam:financial:calculation-error' as const,
      value: `file://reference.${extension}`,
    };
    const test: AtomicTestCase = {
      provider: strategy,
      vars: { query: 'Return an amount as JSON' },
      assert: [assertion],
      metadata: {
        purpose: 'A financial calculator',
        pluginId: 'financial:calculation-error',
        strategyId: 'jailbreak:meta',
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
    expect(target.callApi).toHaveBeenCalledTimes(1);
    expect(row.success).toBe(false);
    expect(row.failureReason).toBe(2);
    expect(row.error).toContain('Reference interpreter is unavailable');
    expect(row.response?.metadata?.vulnerabilityAchieved).not.toBe(true);
    await expect(
      runAssertion({
        prompt: 'Return an amount as JSON',
        assertion,
        test,
        providerResponse: { output: '{"amount":100}' },
      }),
    ).rejects.toThrow('Reference interpreter is unavailable');
  },
);

it.each(['python', 'ruby'] as const)(
  'preserves intentionally returned %s assertion verdicts',
  async (type) => {
    const execute = type === 'python' ? vi.mocked(runPython) : vi.mocked(runRuby);
    execute.mockResolvedValue({ pass: false, score: 0.25, reason: 'Intentional script verdict' });
    const result = await runAssertion({
      assertion: { type, value: `file://reference.${type === 'python' ? 'py' : 'rb'}` },
      test: {},
      providerResponse: { output: 'A response' },
    });
    expect(result).toMatchObject({
      pass: false,
      score: 0.25,
      reason: 'Intentional script verdict',
    });
  },
);
