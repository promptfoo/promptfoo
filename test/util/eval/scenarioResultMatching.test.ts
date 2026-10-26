import { describe, expect, it } from 'vitest';
import {
  createScenarioResultClassifier,
  topLevelResultMatchContext,
} from '../../../src/util/eval/filterTestsUtil';

import type { EvaluateResult, Scenario, TestSuite } from '../../../src/types/index';

function failedResult(vars: Record<string, string>, metadata: Record<string, string>) {
  return {
    success: false,
    vars,
    testCase: { vars, metadata },
  } as unknown as EvaluateResult;
}

describe('exact scenario result matching', () => {
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
