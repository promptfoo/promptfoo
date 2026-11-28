import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAssertions } from '../../../src/assertions/index';
import { ResultFailureReason } from '../../../src/types/index';
import { filterTestsByResults } from '../../../src/util/eval/filterTestsUtil';
import { readOutput } from '../../../src/util/index';
import { createEvaluateResult, createEvaluateSummaryV2 } from '../../factories/eval';

import type { AtomicTestCase, TestSuite } from '../../../src/types/index';

// Mock only saved-result I/O; matching, extraction, and assertion grading stay real.
vi.mock('../../../src/util/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/util/index')>()),
  readOutput: vi.fn(),
}));

function createStoredTest(threshold: number | undefined, assertionPass = true): AtomicTestCase {
  return {
    description: 'Runtime-generated test',
    vars: {
      prompt: 'runtime-only',
      _conversation: [{ role: 'user', content: 'prior turn' }],
      sessionId: 'saved-session',
    },
    assert: [
      {
        type: 'javascript',
        value: `({ pass: ${assertionPass}, score: 0.8, reason: 'custom assertion' })`,
      },
    ],
    metadata: { pluginId: 'cipher-code' },
    options: { prefix: 'Test prefix' },
    ...(threshold === undefined ? {} : { threshold }),
  };
}

async function filterStoredTest(testCase: AtomicTestCase, tests: TestSuite['tests'] = []) {
  vi.mocked(readOutput).mockReturnValue({
    evalId: null,
    config: {},
    shareableUrl: null,
    results: createEvaluateSummaryV2({
      results: [
        createEvaluateResult({
          testCase,
          vars: testCase.vars,
          success: false,
          failureReason: ResultFailureReason.ERROR,
        }),
      ],
    }),
  });
  const selected = await filterTestsByResults(
    { prompts: [], providers: [], tests },
    'results.json',
    (result) => !result.success,
  );
  expect(selected).toHaveLength(1);
  return selected[0] as AtomicTestCase;
}

function grade(test: AtomicTestCase) {
  return runAssertions({ test, providerResponse: { output: 'saved response' } });
}

afterEach(() => {
  vi.mocked(readOutput).mockReset();
});

describe('filtered test thresholds', () => {
  it.each([0.9, 0, undefined])('preserves the extracted threshold %s', async (threshold) => {
    const selected = await filterStoredTest(createStoredTest(threshold));
    expect(selected.threshold).toBe(threshold);
  });

  it.each([
    { threshold: 0.9, assertionPass: true, expectedPass: false },
    { threshold: 0, assertionPass: false, expectedPass: true },
    { threshold: undefined, assertionPass: true, expectedPass: true },
    { threshold: undefined, assertionPass: false, expectedPass: false },
  ])(
    'keeps aggregate pass=$expectedPass with threshold=$threshold and assertion pass=$assertionPass',
    async ({ threshold, assertionPass, expectedPass }) => {
      const stored = createStoredTest(threshold, assertionPass);
      const selected = await filterStoredTest(stored);
      const originalGrading = await grade(stored);
      const rerunGrading = await grade(selected);
      expect(originalGrading).toMatchObject({ pass: expectedPass, score: 0.8 });
      expect(originalGrading.componentResults?.[0]).toMatchObject({
        pass: assertionPass,
        score: 0.8,
      });
      expect(rerunGrading).toEqual(originalGrading);
    },
  );

  it('keeps a matching config test threshold instead of the stored threshold', async () => {
    const stored = createStoredTest(0.9);
    const configured = { ...createStoredTest(0.7), vars: { prompt: 'runtime-only' } };
    const selected = await filterStoredTest(stored, [configured]);
    expect(selected.threshold).toBe(0.7);
    expect(selected.assert).toBe(configured.assert);
    expect(selected.vars).toEqual(stored.vars);
    expect(await grade(selected)).toMatchObject({ pass: true, score: 0.8 });
  });

  it('preserves other extracted fields while omitting provider and runtime vars', async () => {
    const stored = { ...createStoredTest(0.9), provider: 'echo' };
    const selected = await filterStoredTest(stored);
    expect(selected).toEqual({
      description: stored.description,
      vars: { prompt: 'runtime-only' },
      assert: stored.assert,
      threshold: 0.9,
      metadata: stored.metadata,
      options: stored.options,
    });
    expect(selected).not.toHaveProperty('provider');
    expect(stored.vars).toHaveProperty('_conversation');
    expect(stored).toHaveProperty('provider', 'echo');
  });
});
