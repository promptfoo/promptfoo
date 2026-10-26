import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import {
  createScenarioResultClassifier,
  topLevelResultMatchContext,
} from '../../../src/util/eval/filterTestsUtil';

import type { EvaluateResult, Scenario, TestCase, TestSuite } from '../../../src/types/index';

function failedResult(vars: Record<string, string>, metadata: Record<string, string>) {
  return {
    success: false,
    vars,
    testCase: { vars, metadata },
  } as unknown as EvaluateResult;
}

describe('exact scenario result matching', () => {
  it.each([
    {
      name: 'an unsafe target label',
      id: 'safe-target',
      label: 'https://example.invalid?api_key=fake-secret',
      storedProvider: { id: 'safe-target' },
    },
    {
      name: 'an unsafe target ID',
      id: 'https://example.invalid?api_key=fake-secret',
      label: 'safe-label',
      storedProvider: undefined,
    },
  ])('does not fall back to a suite provider for $name', ({ id, label, storedProvider }) => {
    const target = { id: () => id, label, callApi: async () => ({ output: 'unused' }) };
    const test: TestCase = { vars: { caseId: 'shared' }, provider: target };
    const scenario: Scenario = { config: [{}], tests: [test] };
    const suite: TestSuite = { prompts: [], providers: [], tests: [test], scenarios: [scenario] };
    const scenarioResult = {
      ...failedResult({ caseId: 'shared' }, { conversationId: '__scenario_0__' }),
      provider: { id: 'echo' },
      metadata: { __promptfoo: { evalOrigin: 'scenario', targetIdentityRedacted: true } },
      testCase: {
        vars: { caseId: 'shared' },
        metadata: { conversationId: '__scenario_0__' },
        provider: storedProvider,
      },
    } as unknown as EvaluateResult;
    const topResult = {
      ...scenarioResult,
      metadata: { __promptfoo: { evalOrigin: 'top-level', targetIdentityRedacted: true } },
      testCase: { ...scenarioResult.testCase, metadata: {} },
    } as EvaluateResult;

    expect(
      createScenarioResultClassifier(suite, scenario).forVariant(0).includesResult(scenarioResult),
    ).toBe(false);
    expect(topLevelResultMatchContext(suite).includesResult(topResult)).toBe(false);
    const sameColumnIdentity = { ...scenarioResult, provider: { id, label } } as EvaluateResult;
    expect(
      createScenarioResultClassifier(suite, scenario)
        .forVariant(0)
        .includesResult(sameColumnIdentity),
    ).toBe(false);
    const distinctTarget = {
      ...scenarioResult,
      metadata: { __promptfoo: { evalOrigin: 'scenario' } },
      testCase: { ...scenarioResult.testCase, provider: { id: 'different-target' } },
    } as EvaluateResult;
    expect(
      createScenarioResultClassifier(suite, scenario).forVariant(0).includesResult(distinctTarget),
    ).toBe(true);
  });

  it('keeps a marked row when the current test adds its suite column as a target', () => {
    const target = { id: () => 'shared-provider', callApi: async () => ({ output: 'unused' }) };
    const test: TestCase = { vars: { caseId: 'shared' }, provider: target };
    const scenario: Scenario = { config: [{}], tests: [test] };
    const suite: TestSuite = {
      prompts: [],
      providers: [target],
      tests: [test],
      scenarios: [scenario],
    };
    const saved = {
      ...failedResult({ caseId: 'shared' }, { conversationId: '__scenario_0__' }),
      provider: { id: 'shared-provider' },
      metadata: { __promptfoo: { evalOrigin: 'scenario' } },
    } as EvaluateResult;

    expect(
      createScenarioResultClassifier(suite, scenario).forVariant(0).includesResult(saved),
    ).toBe(true);
    expect(
      topLevelResultMatchContext(suite).includesResult({
        ...saved,
        metadata: { __promptfoo: { evalOrigin: 'top-level' } },
        testCase: { ...saved.testCase, metadata: {} },
      }),
    ).toBe(true);
  });

  it('distinguishes a variant with missing metadata from one that declares the key', () => {
    const scenario: Scenario = {
      config: [{}, { metadata: { category: 'B' } }],
      tests: [{ vars: { caseId: 'shared' }, metadata: { role: 'common' } }],
    };
    const suite: TestSuite = { prompts: [], providers: [], scenarios: [scenario] };
    const result = failedResult({ caseId: 'shared' }, { role: 'common', category: 'B' });
    const classifier = createScenarioResultClassifier(suite, scenario);

    expect(classifier.forVariant(0).includesResult(result)).toBe(false);
    expect(classifier.forVariant(1).includesResult(result)).toBe(true);
  });

  it('uses global generated scenario IDs when variants have identical configured identities', () => {
    const scenario: Scenario = {
      config: [{}, {}],
      tests: [{ vars: { caseId: 'shared' }, metadata: { role: 'common' } }],
    };
    const suite: TestSuite = { prompts: [], providers: [], scenarios: [scenario] };
    const classifier = createScenarioResultClassifier(suite, scenario, 2);
    const saved = failedResult(
      { caseId: 'shared' },
      { role: 'common', conversationId: '__scenario_2__' },
    );

    expect(classifier.forVariant(0).includesResult(saved)).toBe(true);
    expect(classifier.forVariant(1).includesResult(saved)).toBe(false);
    expect(
      classifier
        .forVariant(1)
        .includesResult(failedResult({ caseId: 'shared' }, { role: 'common' })),
    ).toBe(true);
    expect(
      classifier
        .forVariant(0)
        .includesResult(
          failedResult({ caseId: 'shared' }, { role: 'common', conversationId: '__scenario_1__' }),
        ),
    ).toBe(false);
  });

  it('uses an explicit conversation ID even if a variant moves', () => {
    const scenario: Scenario = {
      config: [{}],
      tests: [{ vars: { caseId: 'shared' }, metadata: { conversationId: 'stable' } }],
    };
    const suite: TestSuite = { prompts: [], providers: [], scenarios: [scenario] };
    const result = failedResult({ caseId: 'shared' }, { conversationId: 'stable' });

    expect(
      createScenarioResultClassifier(suite, scenario, 5).forVariant(0).includesResult(result),
    ).toBe(true);
    expect(
      createScenarioResultClassifier(suite, scenario, 5)
        .forVariant(0)
        .includesResult(failedResult({ caseId: 'shared' }, {})),
    ).toBe(false);
  });

  it('keeps an implicit scenario ID beside an explicit authored ID', () => {
    const scenario: Scenario = {
      config: [{}],
      tests: [
        { vars: { caseId: 'explicit' }, metadata: { conversationId: 'stable' } },
        { vars: { caseId: 'implicit' } },
      ],
    };
    const suite: TestSuite = { prompts: [], providers: [], scenarios: [scenario] };
    const context = createScenarioResultClassifier(suite, scenario, 3).forVariant(0);
    const implicit = failedResult({ caseId: 'implicit' }, { conversationId: '__scenario_3__' });

    expect(context.includesResult(implicit)).toBe(true);
    expect(context.matchesTest(implicit, scenario.tests![1])).toBe(true);
  });

  it('keeps a legacy no-ID row for an implicit sibling beside an explicit-ID test', () => {
    const scenario: Scenario = {
      config: [{}],
      tests: [
        { vars: { caseId: 'shared' }, metadata: { conversationId: 'stable' } },
        { vars: { caseId: 'shared' } },
      ],
    };
    const suite: TestSuite = { prompts: [], providers: [], scenarios: [scenario] };
    const context = createScenarioResultClassifier(suite, scenario).forVariant(0);
    const legacy = failedResult({ caseId: 'shared' }, {});

    expect(context.matchesTest(legacy, scenario.tests![0])).toBe(false);
    expect(context.matchesTest(legacy, scenario.tests![1])).toBe(true);
    expect(context.includesResult(legacy)).toBe(true);
  });

  it('compares missing metadata keys across all authored tests and top-level tests', () => {
    const tests = [
      { vars: { caseId: 'shared' }, metadata: { role: 'common', id: 'A' } },
      { vars: { caseId: 'shared' }, metadata: { role: 'common' } },
    ];
    const scenario: Scenario = { config: [{}], tests };
    const suite: TestSuite = { prompts: [], providers: [], scenarios: [scenario] };
    const result = failedResult({ caseId: 'shared' }, { role: 'common', id: 'A' });
    const context = createScenarioResultClassifier(suite, scenario).forVariant(0);

    expect(context.matchesTest(result, tests[0])).toBe(true);
    expect(context.matchesTest(result, tests[1])).toBe(false);
    const topLevel = topLevelResultMatchContext({ prompts: [], providers: [], tests });
    expect(topLevel.matchesTest(result, tests[0])).toBe(true);
    expect(topLevel.matchesTest(result, tests[1])).toBe(false);
  });

  it('matches per-test provider allowlists against the saved provider column', () => {
    const tests = [
      { vars: { caseId: 'shared' }, metadata: { role: 'common' }, providers: ['echo:A'] },
      { vars: { caseId: 'shared' }, metadata: { role: 'common' }, providers: ['echo:B'] },
    ];
    const scenario: Scenario = { config: [{}], tests };
    const suite: TestSuite = { prompts: [], providers: [], scenarios: [scenario] };
    const result = {
      ...failedResult({ caseId: 'shared' }, { role: 'common' }),
      provider: { id: 'echo:A' },
    } as EvaluateResult;
    const context = createScenarioResultClassifier(suite, scenario).forVariant(0);

    expect(context.matchesTest(result, tests[0])).toBe(true);
    expect(context.matchesTest(result, tests[1])).toBe(false);
    const topLevel = topLevelResultMatchContext({ prompts: [], providers: [], tests });
    expect(topLevel.matchesTest(result, tests[0])).toBe(true);
    expect(topLevel.matchesTest(result, tests[1])).toBe(false);
  });

  it('uses provider labels, wildcards, and empty allowlists for stored columns', () => {
    const tests = [
      { vars: { caseId: 'shared' }, providers: ['fast-model'] },
      { vars: { caseId: 'shared' }, providers: ['openai:*'] },
      { vars: { caseId: 'shared' }, providers: [] },
    ];
    const suite: TestSuite = { prompts: [], providers: [], tests };
    const result = {
      ...failedResult({ caseId: 'shared' }, {}),
      provider: { id: 'openai:gpt-4', label: 'fast-model' },
    } as EvaluateResult;
    const context = topLevelResultMatchContext(suite);

    expect(context.matchesTest(result, tests[0])).toBe(true);
    expect(context.matchesTest(result, tests[1])).toBe(true);
    expect(context.matchesTest(result, tests[2])).toBe(false);
  });

  it('scopes runtime-generated scenario cases by inherited provider allowlist', () => {
    const scenario: Scenario = {
      config: [{ providers: ['echo:A'] }, { providers: ['echo:B'] }],
      tests: [{ vars: { caseId: 'authored' } }],
    };
    const suite: TestSuite = { prompts: [], providers: [], scenarios: [scenario] };
    const generated = {
      ...failedResult({ caseId: 'generated' }, {}),
      provider: { id: 'echo:B' },
    } as EvaluateResult;
    const classifier = createScenarioResultClassifier(suite, scenario);

    expect(classifier.forVariant(0).includesResult(generated)).toBe(false);
    expect(classifier.forVariant(1).includesResult(generated)).toBe(true);
  });

  it('rejects generated scenario rows when current top-level and scenarios are empty', () => {
    const suite: TestSuite = { prompts: [], providers: [], tests: [], scenarios: [] };
    const context = topLevelResultMatchContext(suite);
    const scenarioResult = failedResult({ caseId: 'shared' }, { conversationId: '__scenario_0__' });
    const generatedTopLevel = failedResult({ caseId: 'shared' }, {});

    expect(context.includesResult(scenarioResult)).toBe(false);
    expect(context.includesResult(generatedTopLevel)).toBe(true);
  });

  it('preserves generated top-level rows beside scenarios while rejecting scenario IDs', () => {
    const scenario: Scenario = {
      config: [{ metadata: { role: 'common' } }],
      tests: [{ vars: { caseId: 'shared' } }],
    };
    const suite: TestSuite = { prompts: [], providers: [], tests: [], scenarios: [scenario] };
    const topLevel = topLevelResultMatchContext(suite);
    const priorTopLevel = failedResult({ caseId: 'shared' }, { role: 'common', id: 'A' });
    const priorScenario = failedResult(
      { caseId: 'shared' },
      { role: 'common', conversationId: '__scenario_0__' },
    );

    expect(topLevel.includesResult(priorTopLevel, { hasScenarios: false })).toBe(true);
    expect(topLevel.includesResult(priorScenario, { hasScenarios: true })).toBe(false);
    expect(topLevel.includesResult(priorScenario, { hasScenarios: false })).toBe(true);
    const scenarioContext = createScenarioResultClassifier(suite, scenario).forVariant(0);
    expect(scenarioContext.includesResult(priorTopLevel, { hasScenarios: false })).toBe(false);
    expect(scenarioContext.includesResult(priorTopLevel)).toBe(true);
    expect(scenarioContext.includesResult(priorScenario, { hasScenarios: true })).toBe(true);
    expect(
      scenarioContext.includesResult(priorTopLevel, {
        hasScenarios: true,
        generatedScenarioIdsObserved: true,
      }),
    ).toBe(false);
  });

  it('honors prompt labels, IDs, wildcards, and empty allowlists for authored tests', () => {
    const tests = [
      { vars: { caseId: 'shared' }, prompts: ['Group:*'] },
      { vars: { caseId: 'shared' }, prompts: ['prompt-hash'] },
      { vars: { caseId: 'shared' }, prompts: ['other'] },
      { vars: { caseId: 'shared' }, prompts: [] },
    ];
    const result = {
      ...failedResult({ caseId: 'shared' }, {}),
      prompt: { raw: 'rendered', label: 'Group:one' },
      promptId: 'prompt-hash',
    } as EvaluateResult;
    const context = topLevelResultMatchContext({ prompts: [], providers: [], tests });

    expect(context.matchesTest(result, tests[0])).toBe(true);
    expect(context.matchesTest(result, tests[1])).toBe(true);
    expect(context.matchesTest(result, tests[2])).toBe(false);
    expect(context.matchesTest(result, tests[3])).toBe(false);
  });

  it('does not extract a top-level result excluded only by its authored prompt selector', () => {
    const suite: TestSuite = {
      prompts: [],
      providers: [],
      tests: [{ vars: { caseId: 'authored' }, metadata: { role: 'common' }, prompts: ['alpha'] }],
    };
    const context = topLevelResultMatchContext(suite);
    const stored = {
      ...failedResult({ caseId: 'authored' }, { role: 'common' }),
      prompt: { raw: 'rendered', label: 'beta' },
      promptId: 'hash-beta',
    } as EvaluateResult;

    expect(context.includesResult(stored, { hasScenarios: false })).toBe(false);
    expect(
      context.includesResult(
        {
          ...stored,
          vars: { caseId: 'generated' },
          testCase: { ...stored.testCase, vars: { caseId: 'generated' } },
        },
        { hasScenarios: false },
      ),
    ).toBe(true);
  });

  it('scopes runtime-generated scenario cases by inherited prompt allowlist', () => {
    const scenario: Scenario = {
      config: [{ prompts: ['alpha'] }, { prompts: ['beta'] }],
      tests: [{ vars: { caseId: 'authored' } }],
    };
    const suite: TestSuite = { prompts: [], providers: [], scenarios: [scenario] };
    const generated = {
      ...failedResult({ caseId: 'generated' }, {}),
      prompt: { raw: 'rendered', label: 'beta' },
      promptId: 'hash-beta',
    } as EvaluateResult;
    const classifier = createScenarioResultClassifier(suite, scenario);

    expect(classifier.forVariant(0).includesResult(generated)).toBe(false);
    expect(classifier.forVariant(1).includesResult(generated)).toBe(true);
  });

  it('does not extract an authored case rejected by its own prompt or provider selectors', () => {
    const scenario: Scenario = {
      config: [{}],
      tests: [{ vars: { caseId: 'authored' }, prompts: ['alpha'], providers: ['echo:A'] }],
    };
    const suite: TestSuite = { prompts: [], providers: [], scenarios: [scenario] };
    const context = createScenarioResultClassifier(suite, scenario).forVariant(0);
    const stored = {
      ...failedResult({ caseId: 'authored' }, { conversationId: '__scenario_0__' }),
      provider: { id: 'echo:A' },
      prompt: { raw: 'rendered', label: 'beta' },
      promptId: 'hash-beta',
    } as EvaluateResult;

    expect(context.includesResult(stored)).toBe(false);
    expect(
      context.includesResult({
        ...stored,
        provider: { id: 'echo:B' },
        prompt: { raw: 'rendered', label: 'alpha' },
      }),
    ).toBe(false);
    expect(
      context.includesResult({
        ...stored,
        vars: { caseId: 'generated' },
        testCase: { ...stored.testCase, vars: { caseId: 'generated' } },
      }),
    ).toBe(true);
  });

  it('keeps an expanded scenario test selected by its own prompt override', () => {
    const scenario: Scenario = {
      config: [{ prompts: ['alpha'] }],
      tests: [
        {
          vars: { caseId: ['x', 'y'] },
          metadata: { role: 'keep' },
          prompts: ['beta'],
        },
      ],
    };
    const suite: TestSuite = { prompts: [], providers: [], scenarios: [scenario] };
    const stored = {
      ...failedResult({ caseId: 'x' }, { role: 'keep', conversationId: '__scenario_0__' }),
      prompt: { raw: 'rendered', label: 'beta' },
      promptId: 'hash-beta',
      testCase: {
        vars: { caseId: 'x' },
        metadata: { role: 'keep', conversationId: '__scenario_0__' },
        prompts: ['beta'],
      },
    } as EvaluateResult;
    const context = createScenarioResultClassifier(suite, scenario).forVariant(0);

    expect(context.includesResult(stored)).toBe(true);
    expect(context.matchesTest(stored, scenario.tests?.[0] as TestCase)).toBe(false);
  });

  it('keeps an expanded scenario test selected by its own provider override', () => {
    const scenario: Scenario = {
      config: [{ providers: ['echo:A'] }],
      tests: [
        {
          vars: { caseId: ['x', 'y'] },
          metadata: { role: 'keep' },
          providers: ['echo:B'],
        },
      ],
    };
    const suite: TestSuite = { prompts: [], providers: [], scenarios: [scenario] };
    const stored = {
      ...failedResult({ caseId: 'x' }, { role: 'keep', conversationId: '__scenario_0__' }),
      provider: { id: 'echo:B' },
      testCase: {
        vars: { caseId: 'x' },
        metadata: { role: 'keep', conversationId: '__scenario_0__' },
        providers: ['echo:B'],
      },
    } as EvaluateResult;
    const context = createScenarioResultClassifier(suite, scenario).forVariant(0);

    expect(context.includesResult(stored)).toBe(true);
    expect(context.matchesTest(stored, scenario.tests?.[0] as TestCase)).toBe(false);
  });

  it('admits a failed scalar from ordinary scenario config arrays without matching the whole test', () => {
    const scenario: Scenario = {
      config: [{ vars: { variant: ['a', 'b'], region: ['east', 'west'] } }],
      tests: [{ vars: { caseId: 'shared' }, metadata: { role: 'common' } }],
    };
    const suite: TestSuite = { prompts: [], providers: [], scenarios: [scenario] };
    const context = createScenarioResultClassifier(suite, scenario).forVariant(0);
    const stored = failedResult(
      { variant: 'a', region: 'east', caseId: 'shared' },
      { role: 'common', conversationId: '__scenario_0__' },
    );

    expect(context.includesResult(stored)).toBe(true);
    expect(context.matchesTest(stored, scenario.tests![0])).toBe(false);
    expect(
      context.includesResult({
        ...stored,
        vars: { ...stored.vars, region: 'unknown' },
        testCase: { ...stored.testCase, vars: { ...stored.vars, region: 'unknown' } },
      }),
    ).toBe(false);
    const disabledScenario: Scenario = {
      ...scenario,
      config: [{ ...scenario.config[0], options: { disableVarExpansion: true } }],
    };
    expect(
      createScenarioResultClassifier(suite, disabledScenario).forVariant(0).includesResult(stored),
    ).toBe(false);
    expect(
      createScenarioResultClassifier(suite, scenario, 0, { varExpansionDisabled: true })
        .forVariant(0)
        .includesResult(stored),
    ).toBe(false);
  });

  it('matches only current files from a scenario config glob and honors disabled expansion', async () => {
    const basePath = await mkdtemp(path.join(tmpdir(), 'promptfoo-scenario-glob-'));
    try {
      await mkdir(path.join(basePath, 'cases'));
      await Promise.all(
        ['a', 'b'].map((name) => writeFile(path.join(basePath, 'cases', `${name}.txt`), name)),
      );
      const scenario: Scenario = {
        config: [{ vars: { caseId: 'file://./cases/*.txt' } }],
        tests: [{ metadata: { role: 'common' } }],
      };
      const suite: TestSuite = { prompts: [], providers: [], scenarios: [scenario] };
      const selected = failedResult(
        { caseId: 'file://cases/a.txt' },
        { role: 'common', conversationId: '__scenario_0__' },
      );
      const context = createScenarioResultClassifier(suite, scenario, 0, { basePath }).forVariant(
        0,
      );

      expect(context.includesResult(selected)).toBe(true);
      expect(context.matchesTest(selected, scenario.tests![0])).toBe(false);
      expect(
        context.includesResult({
          ...selected,
          vars: { caseId: 'file://cases/missing.txt' },
          testCase: { ...selected.testCase, vars: { caseId: 'file://cases/missing.txt' } },
        }),
      ).toBe(false);

      const disabledScenario: Scenario = {
        ...scenario,
        config: [{ ...scenario.config[0], options: { disableVarExpansion: true } }],
      };
      expect(
        createScenarioResultClassifier(suite, disabledScenario, 0, { basePath })
          .forVariant(0)
          .includesResult(selected),
      ).toBe(false);
      const unmatchedGlob: Scenario = {
        ...scenario,
        config: [{ vars: { caseId: 'file://./cases/missing-*.txt' } }],
      };
      expect(
        createScenarioResultClassifier(suite, unmatchedGlob, 0, { basePath })
          .forVariant(0)
          .includesResult(selected),
      ).toBe(false);
    } finally {
      await rm(basePath, { recursive: true, force: true });
    }
  });

  it('does not treat non-string arrays as scalar combinations', () => {
    const scenario: Scenario = {
      config: [{ vars: { objectValue: [{ key: 'a' }, { key: 'b' }] } }],
      tests: [{}],
    };
    const suite: TestSuite = { prompts: [], providers: [], scenarios: [scenario] };
    const result = {
      ...failedResult({}, { conversationId: '__scenario_0__' }),
      vars: { objectValue: { key: 'a' } },
      testCase: {
        vars: { objectValue: { key: 'a' } },
        metadata: { conversationId: '__scenario_0__' },
      },
    } as unknown as EvaluateResult;

    expect(
      createScenarioResultClassifier(suite, scenario).forVariant(0).includesResult(result),
    ).toBe(false);
  });

  it('keeps a runtime-generated case with its unique variant', () => {
    const scenario: Scenario = {
      config: [
        { vars: { variant: 'A' }, metadata: { category: 'A' } },
        { vars: { variant: 'B' }, metadata: { category: 'B' } },
      ],
      tests: [{ vars: { caseId: 'authored' } }],
    };
    const suite: TestSuite = { prompts: [], providers: [], scenarios: [scenario] };
    const generated = failedResult({ variant: 'B', caseId: 'generated' }, { category: 'B' });
    const classifier = createScenarioResultClassifier(suite, scenario);

    expect(classifier.forVariant(0).includesResult(generated)).toBe(false);
    expect(classifier.forVariant(1).includesResult(generated)).toBe(true);
  });

  it('uses a configured provider to scope runtime-generated cases with shared vars and metadata', () => {
    const scenario: Scenario = {
      config: [{ provider: 'echo:A' }, { provider: 'echo:B' }],
      tests: [{ vars: { caseId: 'authored' } }],
    };
    const suite: TestSuite = { prompts: [], providers: [], scenarios: [scenario] };
    const generated = {
      ...failedResult({ caseId: 'generated' }, {}),
      provider: { id: 'echo:B' },
    } as EvaluateResult;
    const classifier = createScenarioResultClassifier(suite, scenario);

    expect(classifier.forVariant(0).includesResult(generated)).toBe(false);
    expect(classifier.forVariant(1).includesResult(generated)).toBe(true);

    const savedOverride = {
      ...generated,
      provider: { id: 'echo' },
      testCase: { ...generated.testCase, provider: { id: 'echo:B' } },
    } as EvaluateResult;
    expect(classifier.forVariant(0).includesResult(savedOverride)).toBe(false);
    expect(classifier.forVariant(1).includesResult(savedOverride)).toBe(true);
  });

  it('keeps both authored variants when a test override makes their effective identity identical', () => {
    const scenario: Scenario = {
      config: [{ metadata: { category: 'A' } }, { metadata: { category: 'B' } }],
      tests: [{ vars: { caseId: 'shared' }, metadata: { category: 'override' } }],
    };
    const suite: TestSuite = { prompts: [], providers: [], scenarios: [scenario] };
    const result = failedResult({ caseId: 'shared' }, { category: 'override' });
    const classifier = createScenarioResultClassifier(suite, scenario);

    expect(classifier.forVariant(0).includesResult(result)).toBe(true);
    expect(classifier.forVariant(1).includesResult(result)).toBe(true);
  });

  it('preserves a generated top-level case even when its vars overlap a scenario', () => {
    const scenario: Scenario = {
      config: [{ metadata: { category: 'A' } }],
      tests: [{ vars: { caseId: 'shared' }, metadata: { role: 'common' } }],
    };
    const suite: TestSuite = {
      prompts: [],
      providers: [],
      tests: [{ vars: { caseId: 'authored' } }],
      scenarios: [scenario],
    };
    const generatedTopLevel = failedResult({ caseId: 'shared' }, { role: 'common', category: 'A' });
    const scenarioResult = failedResult(
      { caseId: 'shared' },
      { role: 'common', category: 'A', conversationId: '__scenario_9__' },
    );

    expect(topLevelResultMatchContext(suite).includesResult(generatedTopLevel)).toBe(true);
    expect(topLevelResultMatchContext(suite).includesResult(scenarioResult)).toBe(false);
  });

  it('never extracts a removed scenario variant into a suite with no top-level tests', () => {
    const scenario: Scenario = {
      config: [{ metadata: { category: 'B' } }],
      tests: [{ vars: { caseId: 'shared' }, metadata: { role: 'common' } }],
    };
    const suite: TestSuite = { prompts: [], providers: [], tests: [], scenarios: [scenario] };
    const removedVariant = failedResult(
      { caseId: 'shared' },
      { category: 'A', role: 'common', conversationId: '__scenario_0__' },
    );

    expect(topLevelResultMatchContext(suite).includesResult(removedVariant)).toBe(false);
  });

  it('checks each authored variant without rescanning every sibling candidate', () => {
    const variantCount = 20;
    const scenario: Scenario = {
      config: Array.from({ length: variantCount }, (_, index) => ({
        metadata: { category: String(index) },
      })),
      tests: [{ vars: { caseId: 'shared' } }],
    };
    const suite: TestSuite = { prompts: [], providers: [], scenarios: [scenario] };
    const classifier = createScenarioResultClassifier(suite, scenario);
    const contexts = scenario.config.map((_, index) => classifier.forVariant(index));
    let varsReads = 0;
    for (let index = 0; index < variantCount; index++) {
      const result = new Proxy(failedResult({ caseId: 'shared' }, { category: String(index) }), {
        get(target, key, receiver) {
          if (key === 'vars') {
            varsReads++;
          }
          return Reflect.get(target, key, receiver);
        },
      });
      expect(
        contexts.flatMap((context, candidate) =>
          context.includesResult(result) ? [candidate] : [],
        ),
      ).toEqual([index]);
    }
    expect(varsReads).toBeLessThan(variantCount * variantCount * 4);
  });
});
