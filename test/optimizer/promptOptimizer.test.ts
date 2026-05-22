import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import Eval from '../../src/models/eval';
import {
  generateOptimizedPromptCandidates,
  optimizePromptTestSuite,
} from '../../src/optimizer/promptOptimizer';
import { getDefaultProviders } from '../../src/providers/defaults';
import { createMockProvider } from '../factories/provider';

import type { CompletedPrompt, EvaluateResult, TestSuite } from '../../src/types/index';

vi.mock('../../src/evaluator', () => ({
  evaluate: vi.fn(),
}));

vi.mock('../../src/providers/defaults', () => ({
  getDefaultProviders: vi.fn(),
}));

describe('prompt optimizer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('normalizes provider candidates and drops duplicates or unchanged prompts', async () => {
    const provider = createMockProvider({
      id: 'optimizer-provider',
      response: {
        output: JSON.stringify({
          candidates: [
            { hypothesis: 'same prompt', prompt: 'Original prompt' },
            { hypothesis: 'first', prompt: 'Improved prompt' },
            { hypothesis: 'duplicate', prompt: 'Improved prompt' },
            { hypothesis: 'second', prompt: 'Another improved prompt' },
          ],
        }),
      },
    });
    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: provider,
      gradingJsonProvider: provider,
      gradingProvider: provider,
      moderationProvider: provider,
      suggestionsProvider: provider,
      synthesizeProvider: provider,
    } as any);

    const candidates = await generateOptimizedPromptCandidates({
      prompt: '  Original prompt  ',
      failures: [],
      successes: [],
    });

    expect(candidates).toEqual([
      { hypothesis: 'first', prompt: 'Improved prompt' },
      { hypothesis: 'second', prompt: 'Another improved prompt' },
    ]);
  });

  it('sanitizes and bounds optimizer evidence before sending it to the suggestions provider', async () => {
    const provider = createMockProvider({
      id: 'optimizer-provider',
      response: optimizerResponse('Safer prompt'),
    });
    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: provider,
      gradingJsonProvider: provider,
      gradingProvider: provider,
      moderationProvider: provider,
      suggestionsProvider: provider,
      synthesizeProvider: provider,
    } as any);

    const failure = {
      ...evalResult(0, false, 'grading reason '.repeat(140)),
      vars: {
        apiKey: 'sk-proj-this-should-never-leak-12345678901234567890',
        largeContext: 'z'.repeat(1800),
      },
      response: {
        output: 'optimizer output '.repeat(140),
      },
      namedScores: {
        token: 'Bearer this-is-also-sensitive-12345678901234567890',
      },
    } as unknown as EvaluateResult;

    await generateOptimizedPromptCandidates({
      prompt: 'Original prompt',
      failures: [failure],
      successes: [],
    });

    const outerPayload = JSON.parse(String(vi.mocked(provider.callApi).mock.calls[0][0]));
    const content = JSON.parse(outerPayload[1].content);
    const evidence = content.failures[0];

    expect(evidence.vars).toContain('[REDACTED]');
    expect(evidence.vars).not.toContain('sk-proj-this-should-never-leak');
    expect(evidence.namedScores).toContain('[REDACTED]');
    expect(evidence.output).toMatch(/\[truncated]$/);
    expect(evidence.gradingReason).toMatch(/\[truncated]$/);
    expect(evidence.vars.length).toBeLessThanOrEqual(1214);
    expect(evidence.output.length).toBeLessThanOrEqual(1214);
    expect(evidence.gradingReason.length).toBeLessThanOrEqual(1214);
  });

  it('evaluates candidates from the selected prompt and provider', async () => {
    const provider = createMockProvider({
      id: 'optimizer-provider',
      response: {
        output: JSON.stringify({
          candidates: [{ hypothesis: 'Make the policy explicit.', prompt: 'Optimized B' }],
        }),
      },
    });
    vi.mocked(provider.callApi)
      .mockResolvedValueOnce(optimizerResponse('Optimized B'))
      .mockResolvedValueOnce(optimizerResponse('Alternative B 2'))
      .mockResolvedValueOnce(optimizerResponse('Alternative B 3'));
    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: provider,
      gradingJsonProvider: provider,
      gradingProvider: provider,
      moderationProvider: provider,
      suggestionsProvider: provider,
      synthesizeProvider: provider,
    } as any);

    const baselinePrompts = [completedPrompt('Prompt B', 'B', 0.8)];
    const baselineResults = [
      evalResult(0, false, 'Missed the required JSON format.'),
      evalResult(0, true, 'Matched the required JSON format.'),
    ];
    const baselineEval = evalWith(baselinePrompts, baselineResults);
    const candidateEval = evalWith(
      [
        completedPrompt('Prompt B', 'B', 0.8),
        completedPrompt('Optimized B', 'B [optimized 1]', 0.9),
      ],
      [],
    );

    vi.mocked(evaluate)
      .mockResolvedValueOnce(baselineEval)
      .mockResolvedValueOnce(candidateEval)
      .mockResolvedValueOnce(candidateEval)
      .mockResolvedValueOnce(candidateEval);

    const testSuite: TestSuite = {
      providers: [
        createMockProvider({ id: 'target-provider-a' }),
        createMockProvider({ id: 'target-provider-b' }),
      ],
      prompts: [
        { raw: 'Prompt A', label: 'A' },
        { raw: 'Prompt B', label: 'B' },
      ],
      tests: [{}],
    };

    const result = await optimizePromptTestSuite({}, testSuite, {
      promptIndex: 1,
      providerIndex: 1,
    });

    expect(result.improved).toBe(true);
    expect(result.baselinePrompt.label).toBe('B');
    expect(result.bestPrompt.label).toBe('B [optimized 1]');
    expect(vi.mocked(evaluate).mock.calls[0][0].prompts).toEqual([{ raw: 'Prompt B', label: 'B' }]);
    expect(vi.mocked(evaluate).mock.calls[0][0].providers[0].id()).toBe('target-provider-b');
    expect(provider.callApi).toHaveBeenCalledTimes(3);
    expect(String(vi.mocked(provider.callApi).mock.calls[0][0])).toContain(
      'Missed the required JSON format.',
    );
  });

  it('defaults to the first prompt and provider', async () => {
    const provider = createMockProvider({
      id: 'optimizer-provider',
      response: {
        output: JSON.stringify({
          candidates: [{ hypothesis: 'Tighten the wording.', prompt: 'Optimized A' }],
        }),
      },
    });
    vi.mocked(provider.callApi)
      .mockResolvedValueOnce(optimizerResponse('Optimized A'))
      .mockResolvedValueOnce(optimizerResponse('Alternative A 2'))
      .mockResolvedValueOnce(optimizerResponse('Alternative A 3'));
    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: provider,
      gradingJsonProvider: provider,
      gradingProvider: provider,
      moderationProvider: provider,
      suggestionsProvider: provider,
      synthesizeProvider: provider,
    } as any);

    const baselineEval = evalWith([completedPrompt('Prompt A', 'A', 0.6)], []);
    const candidateEval = evalWith(
      [
        completedPrompt('Prompt A', 'A', 0.6),
        completedPrompt('Optimized A', 'A [optimized 1]', 0.7),
      ],
      [],
    );

    vi.mocked(evaluate)
      .mockResolvedValueOnce(baselineEval)
      .mockResolvedValueOnce(candidateEval)
      .mockResolvedValueOnce(candidateEval)
      .mockResolvedValueOnce(candidateEval);

    const testSuite: TestSuite = {
      providers: [
        createMockProvider({ id: 'target-provider-a' }),
        createMockProvider({ id: 'target-provider-b' }),
      ],
      prompts: [
        { raw: 'Prompt A', label: 'A' },
        { raw: 'Prompt B', label: 'B' },
      ],
      tests: [{}],
    };

    await optimizePromptTestSuite({}, testSuite);

    expect(vi.mocked(evaluate).mock.calls[0][0].prompts).toEqual([{ raw: 'Prompt A', label: 'A' }]);
    expect(vi.mocked(evaluate).mock.calls[0][0].providers[0].id()).toBe('target-provider-a');
  });

  it('keeps the baseline when a search candidate only ties its score', async () => {
    const provider = createMockProvider({
      id: 'optimizer-provider',
      response: {
        output: JSON.stringify({
          candidates: [{ hypothesis: 'Equivalent quality.', prompt: 'Tied prompt' }],
        }),
      },
    });
    vi.mocked(provider.callApi)
      .mockResolvedValueOnce(optimizerResponse('Tied prompt'))
      .mockResolvedValueOnce(optimizerResponse('Alternative tie 2'))
      .mockResolvedValueOnce(optimizerResponse('Alternative tie 3'));
    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: provider,
      gradingJsonProvider: provider,
      gradingProvider: provider,
      moderationProvider: provider,
      suggestionsProvider: provider,
      synthesizeProvider: provider,
    } as any);

    const baselineEval = evalWith([completedPrompt('Base', 'Base', 0.8)], []);
    const candidateEval = evalWith(
      [
        completedPrompt('Base', 'Base', 0.8),
        completedPrompt('Tied prompt', 'Base [optimized 1]', 0.8),
      ],
      [],
    );

    vi.mocked(evaluate)
      .mockResolvedValueOnce(baselineEval)
      .mockResolvedValueOnce(candidateEval)
      .mockResolvedValueOnce(candidateEval)
      .mockResolvedValueOnce(candidateEval);

    const testSuite: TestSuite = {
      providers: [createMockProvider({ id: 'target-provider' })],
      prompts: [{ raw: 'Base', label: 'Base' }],
      tests: [{}],
    };

    const result = await optimizePromptTestSuite({}, testSuite);

    expect(result.bestPrompt.label).toBe('Base');
    expect(result.improved).toBe(false);
  });

  it('rejects provider indices outside the resolved provider list', async () => {
    const testSuite: TestSuite = {
      providers: [createMockProvider({ id: 'target-provider' })],
      prompts: [{ raw: 'Prompt A', label: 'A' }],
      tests: [{}],
    };

    await expect(optimizePromptTestSuite({}, testSuite, { providerIndex: 1 })).rejects.toThrow(
      'Provider index 1 is out of range. Available provider indices: 0-0.',
    );
  });

  it('preserves config evaluation runtime options for internal optimizer evals', async () => {
    const internalEvalOptions = await collectInternalEvalOptions({
      evaluateOptions: {
        cache: true,
        delay: 50,
        maxConcurrency: 1,
        repeat: 2,
        showProgressBar: true,
      },
    });

    expect(internalEvalOptions[0]).toEqual(
      expect.objectContaining({
        cache: false,
        delay: 50,
        eventSource: 'library',
        maxConcurrency: 1,
        repeat: 2,
        showProgressBar: false,
        silent: true,
      }),
    );
  });

  it('forces concurrency to 1 for internal evals when a delay is configured', async () => {
    // delay is set but maxConcurrency is not; the optimizer must still apply the
    // `eval` command rule that pins concurrency to 1 so the delay rate-limits.
    const internalEvalOptions = await collectInternalEvalOptions({
      evaluateOptions: {
        delay: 25,
      },
    });

    for (const options of internalEvalOptions) {
      expect(options).toEqual(
        expect.objectContaining({
          delay: 25,
          maxConcurrency: 1,
        }),
      );
    }
  });

  it('preserves configured concurrency when the internal eval delay is not positive', async () => {
    const internalEvalOptions = await collectInternalEvalOptions({
      evaluateOptions: {
        delay: -25,
        maxConcurrency: 4,
      },
    });

    for (const options of internalEvalOptions) {
      expect(options).toEqual(
        expect.objectContaining({
          delay: -25,
          maxConcurrency: 4,
        }),
      );
    }
  });

  it('marks internal optimizer evals as redteam when the config has a redteam block', async () => {
    const redteam = { plugins: [{ id: 'harmful' }] };
    const internalEvalOptions = await collectInternalEvalOptions({ redteam });

    for (const options of internalEvalOptions) {
      expect(options).toEqual(
        expect.objectContaining({
          isRedteam: true,
        }),
      );
    }
    for (const [suite] of vi.mocked(evaluate).mock.calls) {
      expect(suite.redteam).toEqual(redteam);
    }
  });

  it('marks internal optimizer evals as redteam when the test suite has a redteam block', async () => {
    const internalEvalOptions = await collectInternalEvalOptions(
      {},
      {
        redteam: { plugins: [{ id: 'harmful' }] },
      },
    );

    for (const options of internalEvalOptions) {
      expect(options).toEqual(
        expect.objectContaining({
          isRedteam: true,
        }),
      );
    }
  });

  it('does not mark internal optimizer evals as redteam for a non-redteam config', async () => {
    const internalEvalOptions = await collectInternalEvalOptions();

    expect(internalEvalOptions[0]).toEqual(
      expect.objectContaining({
        isRedteam: false,
      }),
    );
  });

  it('keeps optimized candidates eligible when provider prompt routing uses prompt ids', async () => {
    const provider = createMockProvider({
      id: 'optimizer-provider',
      response: {
        output: JSON.stringify({
          candidates: [{ hypothesis: 'Clarify the instruction.', prompt: 'Optimized Seed' }],
        }),
      },
    });
    vi.mocked(provider.callApi)
      .mockResolvedValueOnce(optimizerResponse('Optimized Seed'))
      .mockResolvedValueOnce(optimizerResponse('Alternative Seed 2'))
      .mockResolvedValueOnce(optimizerResponse('Alternative Seed 3'));
    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: provider,
      gradingJsonProvider: provider,
      gradingProvider: provider,
      moderationProvider: provider,
      suggestionsProvider: provider,
      synthesizeProvider: provider,
    } as any);

    const baselineEval = evalWith([completedPrompt('Seed', 'Seed', 0.5)], []);
    const candidateEval = evalWith(
      [
        completedPrompt('Seed', 'Seed', 0.5),
        completedPrompt('Optimized Seed', 'Seed [optimized 1]', 0.7),
      ],
      [],
    );

    vi.mocked(evaluate)
      .mockResolvedValueOnce(baselineEval)
      .mockResolvedValueOnce(candidateEval)
      .mockResolvedValueOnce(candidateEval)
      .mockResolvedValueOnce(candidateEval);

    const testSuite: TestSuite = {
      providers: [createMockProvider({ id: 'target-provider' })],
      prompts: [{ id: 'seed-id', raw: 'Seed', label: 'Seed' }],
      providerPromptMap: {
        'target-provider': ['seed-id'],
      },
      tests: [{}],
    };

    await optimizePromptTestSuite({}, testSuite);

    const candidateSuite = vi.mocked(evaluate).mock.calls[1][0];
    expect(candidateSuite.providerPromptMap).toEqual({
      'target-provider': ['seed-id', 'Seed', 'Seed [optimized 1]'],
    });
    expect(candidateSuite.prompts[0].id).toBe('seed-id');
    expect(candidateSuite.prompts[1].id).toEqual(expect.any(String));
    expect(candidateSuite.prompts[1].id).not.toBe('seed-id');
  });

  it('keeps exact-label provider prompt routing intact after adopting a candidate', async () => {
    const provider = createMockProvider({
      id: 'optimizer-provider',
      response: optimizerResponse('Optimized Seed'),
    });
    vi.mocked(provider.callApi)
      .mockResolvedValueOnce(optimizerResponse('Optimized Seed'))
      .mockResolvedValueOnce(optimizerResponse('Optimized Seed 2'))
      .mockResolvedValueOnce(optimizerResponse('Optimized Seed 3'));
    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: provider,
      gradingJsonProvider: provider,
      gradingProvider: provider,
      moderationProvider: provider,
      suggestionsProvider: provider,
      synthesizeProvider: provider,
    } as any);

    const baselineEval = evalWith([completedPrompt('Seed', 'Seed', 0.5)], []);
    const candidateEval = evalWith(
      [
        completedPrompt('Seed', 'Seed', 0.5),
        completedPrompt('Optimized Seed', 'Seed [optimized 1]', 0.8),
      ],
      [],
    );

    vi.mocked(evaluate)
      .mockResolvedValueOnce(baselineEval)
      .mockResolvedValueOnce(candidateEval)
      .mockResolvedValueOnce(candidateEval)
      .mockResolvedValueOnce(candidateEval);

    const testSuite: TestSuite = {
      providers: [createMockProvider({ id: 'target-provider' })],
      prompts: [{ raw: 'Seed', label: 'Seed' }],
      providerPromptMap: {
        'target-provider': ['Seed'],
      },
      tests: [{}],
    };

    await optimizePromptTestSuite({}, testSuite);

    expect(vi.mocked(evaluate).mock.calls[2][0].providerPromptMap).toEqual({
      'target-provider': ['Seed', 'Seed [optimized 1]', 'Seed [optimized 1] [optimized 1]'],
    });
  });

  it('extends prompt filters for explicit and default tests when candidates are added', async () => {
    const provider = createMockProvider({
      id: 'optimizer-provider',
      response: optimizerResponse('Optimized Seed'),
    });
    vi.mocked(provider.callApi)
      .mockResolvedValueOnce(optimizerResponse('Optimized Seed'))
      .mockResolvedValueOnce(optimizerResponse('Optimized Seed 2'))
      .mockResolvedValueOnce(optimizerResponse('Optimized Seed 3'));
    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: provider,
      gradingJsonProvider: provider,
      gradingProvider: provider,
      moderationProvider: provider,
      suggestionsProvider: provider,
      synthesizeProvider: provider,
    } as any);

    const baselineEval = evalWith([completedPrompt('Seed', 'Seed', 0.5)], []);
    const candidateEval = evalWith(
      [
        completedPrompt('Seed', 'Seed', 0.5),
        completedPrompt('Optimized Seed', 'Seed [optimized 1]', 0.8),
      ],
      [],
    );

    vi.mocked(evaluate)
      .mockResolvedValueOnce(baselineEval)
      .mockResolvedValueOnce(candidateEval)
      .mockResolvedValueOnce(candidateEval)
      .mockResolvedValueOnce(candidateEval);

    const testSuite: TestSuite = {
      providers: [createMockProvider({ id: 'target-provider' })],
      prompts: [{ raw: 'Seed', label: 'Seed' }],
      defaultTest: { prompts: ['Seed'] },
      tests: [{ prompts: ['Seed'] }],
    };

    await optimizePromptTestSuite({}, testSuite);

    const candidateSuite = vi.mocked(evaluate).mock.calls[1][0];
    expect(candidateSuite.tests?.[0].prompts).toEqual(['Seed', 'Seed [optimized 1]']);
    expect(
      candidateSuite.defaultTest && typeof candidateSuite.defaultTest === 'object'
        ? candidateSuite.defaultTest.prompts
        : undefined,
    ).toEqual(['Seed', 'Seed [optimized 1]']);
  });

  it('rejects validation splits for scenario-based optimization instead of pretending they are held out', async () => {
    const testSuite: TestSuite = {
      providers: [createMockProvider({ id: 'target-provider' })],
      prompts: [{ raw: 'Seed', label: 'Seed' }],
      scenarios: [
        {
          config: [{}],
          tests: [{}],
        },
      ],
    };

    await expect(
      optimizePromptTestSuite({}, testSuite, {
        validationSplit: 0.2,
      }),
    ).rejects.toThrow(
      'validationSplit is not supported for scenario-based prompt optimization; expand scenarios into explicit tests first.',
    );
  });

  it('clones mutable test suites before each evaluate call so default assertions do not stack', async () => {
    const provider = createMockProvider({
      id: 'optimizer-provider',
      response: optimizerResponse('Optimized Seed'),
    });
    vi.mocked(provider.callApi)
      .mockResolvedValueOnce(optimizerResponse('Optimized Seed'))
      .mockResolvedValueOnce(optimizerResponse('Optimized Seed 2'))
      .mockResolvedValueOnce(optimizerResponse('Optimized Seed 3'));
    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: provider,
      gradingJsonProvider: provider,
      gradingProvider: provider,
      moderationProvider: provider,
      suggestionsProvider: provider,
      synthesizeProvider: provider,
    } as any);

    const baselineEval = evalWith([completedPrompt('Seed', 'Seed', 0.5)], []);
    const candidateEval = evalWith(
      [
        completedPrompt('Seed', 'Seed', 0.5),
        completedPrompt('Optimized Seed', 'Seed [optimized 1]', 0.8),
      ],
      [],
    );
    const seenAssertCounts: number[] = [];
    let evaluateCallCount = 0;
    vi.mocked(evaluate).mockImplementation(async (suite) => {
      seenAssertCounts.push(suite.tests?.[0].assert?.length || 0);
      if (suite.tests?.[0] && suite.defaultTest && typeof suite.defaultTest === 'object') {
        suite.tests[0].assert = [
          ...(suite.defaultTest.assert || []),
          ...(suite.tests[0].assert || []),
        ];
      }
      evaluateCallCount += 1;
      return evaluateCallCount === 1 ? baselineEval : candidateEval;
    });

    const testSuite: TestSuite = {
      providers: [createMockProvider({ id: 'target-provider' })],
      prompts: [{ raw: 'Seed', label: 'Seed' }],
      defaultTest: {
        assert: [{ type: 'contains', value: 'default' }],
      },
      tests: [
        {
          assert: [{ type: 'contains', value: 'local' }],
        },
      ],
    };

    await optimizePromptTestSuite({}, testSuite);

    expect(seenAssertCounts).toEqual([1, 1, 1, 1]);
  });

  it('rejects prompt optimization when no tests or scenarios are configured', async () => {
    const testSuite: TestSuite = {
      providers: [createMockProvider({ id: 'target-provider' })],
      prompts: [{ raw: 'Seed', label: 'Seed' }],
    };

    await expect(optimizePromptTestSuite({}, testSuite)).rejects.toThrow(
      'Prompt optimization requires at least one configured test or scenario.',
    );
  });

  it('uses validation score to reject search-only overfitting when split is enabled', async () => {
    const provider = createMockProvider({
      id: 'optimizer-provider',
      response: {
        output: JSON.stringify({
          candidates: [{ hypothesis: 'Overfit the search set.', prompt: 'Overfit prompt' }],
        }),
      },
    });
    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: provider,
      gradingJsonProvider: provider,
      gradingProvider: provider,
      moderationProvider: provider,
      suggestionsProvider: provider,
      synthesizeProvider: provider,
    } as any);

    const baselineSearchEval = evalWith([completedPrompt('Base', 'Base', 0.6)], []);
    const baselineValidationEval = evalWith([completedPrompt('Base', 'Base', 0.7)], []);
    const candidateSearchEval = evalWith(
      [
        completedPrompt('Base', 'Base', 0.6),
        completedPrompt('Overfit prompt', 'Base [optimized 1]', 0.95),
      ],
      [],
    );
    const candidateValidationEval = evalWith(
      [
        completedPrompt('Base', 'Base', 0.7),
        completedPrompt('Overfit prompt', 'Base [optimized 1]', 0.4),
      ],
      [],
    );

    vi.mocked(evaluate)
      .mockResolvedValueOnce(baselineSearchEval)
      .mockResolvedValueOnce(baselineValidationEval)
      .mockResolvedValueOnce(candidateSearchEval)
      .mockResolvedValueOnce(candidateValidationEval)
      .mockResolvedValueOnce(candidateSearchEval)
      .mockResolvedValueOnce(candidateValidationEval)
      .mockResolvedValueOnce(candidateSearchEval)
      .mockResolvedValueOnce(candidateValidationEval);

    const testSuite: TestSuite = {
      providers: [createMockProvider({ id: 'target-provider' })],
      prompts: [{ raw: 'Base', label: 'Base' }],
      tests: [{}, {}, {}, {}, {}],
    };

    const result = await optimizePromptTestSuite({}, testSuite, { validationSplit: 0.4 });

    expect(result.validationTestCount).toBe(2);
    expect(result.searchTestCount).toBe(3);
    expect(result.bestPrompt.label).toBe('Base');
    expect(result.bestValidationPrompt?.label).toBe('Base');
    expect(result.improved).toBe(false);
  });

  it('applies filterRange once before splitting validation tests', async () => {
    const provider = createMockProvider({
      id: 'optimizer-provider',
      response: optimizerResponse('Filtered candidate'),
    });
    vi.mocked(provider.callApi)
      .mockResolvedValueOnce(optimizerResponse('Filtered candidate'))
      .mockResolvedValueOnce(optimizerResponse('Filtered candidate 2'))
      .mockResolvedValueOnce(optimizerResponse('Filtered candidate 3'));
    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: provider,
      gradingJsonProvider: provider,
      gradingProvider: provider,
      moderationProvider: provider,
      suggestionsProvider: provider,
      synthesizeProvider: provider,
    } as any);

    const baselineEval = evalWith([completedPrompt('Base', 'Base', 0.6)], []);
    const candidateEval = evalWith(
      [
        completedPrompt('Base', 'Base', 0.6),
        completedPrompt('Filtered candidate', 'Base [optimized 1]', 0.7),
      ],
      [],
    );
    vi.mocked(evaluate)
      .mockResolvedValueOnce(baselineEval)
      .mockResolvedValueOnce(baselineEval)
      .mockResolvedValue(candidateEval);

    const testSuite: TestSuite = {
      providers: [createMockProvider({ id: 'target-provider' })],
      prompts: [{ raw: 'Base', label: 'Base' }],
      tests: Array.from({ length: 5 }, (_, index) => ({ vars: { id: String(index) } })),
    };

    const result = await optimizePromptTestSuite(
      { evaluateOptions: { filterRange: '1:5' } },
      testSuite,
      { validationSplit: 0.5 },
    );

    expect(result.searchTestCount).toBe(2);
    expect(result.validationTestCount).toBe(2);
    expect(vi.mocked(evaluate).mock.calls[0][0].tests?.map((test) => test.vars?.id)).toEqual([
      '1',
      '2',
    ]);
    expect(vi.mocked(evaluate).mock.calls[1][0].tests?.map((test) => test.vars?.id)).toEqual([
      '3',
      '4',
    ]);
    for (const call of vi.mocked(evaluate).mock.calls) {
      expect(call[2]?.filterRange).toBeUndefined();
    }
  });

  it('keeps the baseline when validation and search scores both tie', async () => {
    const provider = createMockProvider({
      id: 'optimizer-provider',
      response: {
        output: JSON.stringify({
          candidates: [{ hypothesis: 'Equivalent quality.', prompt: 'Validation tie' }],
        }),
      },
    });
    vi.mocked(provider.callApi)
      .mockResolvedValueOnce(optimizerResponse('Validation tie'))
      .mockResolvedValueOnce(optimizerResponse('Validation tie 2'))
      .mockResolvedValueOnce(optimizerResponse('Validation tie 3'));
    vi.mocked(getDefaultProviders).mockResolvedValue({
      embeddingProvider: provider,
      gradingJsonProvider: provider,
      gradingProvider: provider,
      moderationProvider: provider,
      suggestionsProvider: provider,
      synthesizeProvider: provider,
    } as any);

    const baselineSearchEval = evalWith([completedPrompt('Base', 'Base', 0.6)], []);
    const baselineValidationEval = evalWith([completedPrompt('Base', 'Base', 0.7)], []);
    const candidateSearchEval = evalWith(
      [
        completedPrompt('Base', 'Base', 0.6),
        completedPrompt('Validation tie', 'Base [optimized 1]', 0.6),
      ],
      [],
    );
    const candidateValidationEval = evalWith(
      [
        completedPrompt('Base', 'Base', 0.7),
        completedPrompt('Validation tie', 'Base [optimized 1]', 0.7),
      ],
      [],
    );

    vi.mocked(evaluate)
      .mockResolvedValueOnce(baselineSearchEval)
      .mockResolvedValueOnce(baselineValidationEval)
      .mockResolvedValueOnce(candidateSearchEval)
      .mockResolvedValueOnce(candidateValidationEval)
      .mockResolvedValueOnce(candidateSearchEval)
      .mockResolvedValueOnce(candidateValidationEval)
      .mockResolvedValueOnce(candidateSearchEval)
      .mockResolvedValueOnce(candidateValidationEval);

    const testSuite: TestSuite = {
      providers: [createMockProvider({ id: 'target-provider' })],
      prompts: [{ raw: 'Base', label: 'Base' }],
      tests: [{}, {}, {}, {}, {}],
    };

    const result = await optimizePromptTestSuite({}, testSuite, { validationSplit: 0.4 });

    expect(result.bestPrompt.label).toBe('Base');
    expect(result.bestValidationPrompt?.label).toBe('Base');
    expect(result.improved).toBe(false);
  });
});

function completedPrompt(raw: string, label: string, score: number): CompletedPrompt {
  return {
    raw,
    label,
    provider: 'provider',
    metrics: {
      score,
      testPassCount: 0,
      testFailCount: 0,
      testErrorCount: 0,
      assertPassCount: 0,
      assertFailCount: 0,
      totalLatencyMs: 0,
      tokenUsage: {},
      namedScores: {},
      namedScoresCount: {},
      cost: 0,
    },
  } as CompletedPrompt;
}

function evalResult(promptIdx: number, success: boolean, reason: string): EvaluateResult {
  return {
    promptIdx,
    testIdx: 0,
    testCase: {},
    promptId: 'prompt',
    provider: { id: 'provider' },
    prompt: { raw: 'Prompt B', label: 'B' },
    vars: {},
    failureReason: 0,
    success,
    score: success ? 1 : 0,
    latencyMs: 0,
    gradingResult: {
      pass: success,
      score: success ? 1 : 0,
      reason,
    },
    namedScores: {},
  } as EvaluateResult;
}

function evalWith(prompts: CompletedPrompt[], results: EvaluateResult[]): Eval {
  const evalRecord = new Eval({}, { persisted: false, prompts });
  evalRecord.prompts = prompts;
  evalRecord.results = results as any;
  return evalRecord;
}

async function collectInternalEvalOptions(
  config: Parameters<typeof optimizePromptTestSuite>[0] = {},
  testSuiteOverrides: Partial<TestSuite> = {},
) {
  const provider = createMockProvider({
    id: 'optimizer-provider',
    response: optimizerResponse('Optimized Seed'),
  });
  vi.mocked(provider.callApi)
    .mockResolvedValueOnce(optimizerResponse('Optimized Seed'))
    .mockResolvedValueOnce(optimizerResponse('Optimized Seed 2'))
    .mockResolvedValueOnce(optimizerResponse('Optimized Seed 3'));
  vi.mocked(getDefaultProviders).mockResolvedValue({
    embeddingProvider: provider,
    gradingJsonProvider: provider,
    gradingProvider: provider,
    moderationProvider: provider,
    suggestionsProvider: provider,
    synthesizeProvider: provider,
  } as any);

  const baselineEval = evalWith([completedPrompt('Seed', 'Seed', 0.5)], []);
  const candidateEval = evalWith(
    [
      completedPrompt('Seed', 'Seed', 0.5),
      completedPrompt('Optimized Seed', 'Seed [optimized 1]', 0.8),
    ],
    [],
  );
  vi.mocked(evaluate).mockResolvedValue(candidateEval).mockResolvedValueOnce(baselineEval);

  await optimizePromptTestSuite(config, {
    providers: [createMockProvider({ id: 'target-provider' })],
    prompts: [{ raw: 'Seed', label: 'Seed' }],
    tests: [{}],
    ...testSuiteOverrides,
  });

  return vi.mocked(evaluate).mock.calls.map((call) => call[2]);
}

function optimizerResponse(prompt: string) {
  return {
    output: JSON.stringify({
      candidates: [{ hypothesis: 'Try a distinct candidate.', prompt }],
    }),
  };
}
