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
