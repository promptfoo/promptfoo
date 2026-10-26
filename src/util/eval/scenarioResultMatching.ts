import deepEqual from 'fast-deep-equal';
import { filterRuntimeVars, resultIsForTestCase } from '../comparison';
import { providerToIdentifier } from '../provider';
import { mergeScenarioTest } from './mergeScenarioTest';

import type { EvaluateResult, Scenario, TestCase, TestSuite } from '../../types/index';
import type { ResultMatchContext } from './filterTestsUtil';

type Variant = Scenario['config'][number];

function defaultTest(suite: TestSuite): TestCase | undefined {
  return typeof suite.defaultTest === 'object' ? suite.defaultTest : undefined;
}

function declaredMetadata(suite: TestSuite, variant: Variant, test: TestCase) {
  return { ...defaultTest(suite)?.metadata, ...variant.metadata, ...test.metadata };
}

function matchesCandidate(
  result: EvaluateResult,
  effective: TestCase,
  metadata: TestCase['metadata'],
  metadataKeys: string[],
): boolean {
  const resultMetadata = result.testCase?.metadata;
  return (
    resultIsForTestCase(result, effective) &&
    metadataKeys.every((key) => deepEqual(resultMetadata?.[key], metadata?.[key]))
  );
}

export function createScenarioResultClassifier(suite: TestSuite, scenario: Scenario) {
  const defaults = defaultTest(suite);
  const variantMetadataKeys = [
    ...new Set([
      ...Object.keys(defaults?.metadata ?? {}),
      ...scenario.config.flatMap((variant) => Object.keys(variant.metadata ?? {})),
    ]),
  ];
  const metadataKeysForTest = (test: TestCase) => [
    ...new Set([...variantMetadataKeys, ...Object.keys(test.metadata ?? {})]),
  ];
  const candidates = scenario.config.map((variant) =>
    (scenario.tests ?? []).map((test) => ({
      effective: mergeScenarioTest(suite, variant, test, 0),
      metadata: declaredMetadata(suite, variant, test),
      metadataKeys: metadataKeysForTest(test),
    })),
  );
  const signatureVarKeys = [
    ...new Set(scenario.config.flatMap((variant) => Object.keys(variant.vars ?? {}))),
  ];
  const signatureMetadataKeys = [
    ...new Set(scenario.config.flatMap((variant) => Object.keys(variant.metadata ?? {}))),
  ];
  const signatures = scenario.config.map((variant) => ({
    vars: { ...defaults?.vars, ...variant.vars },
    metadata: { ...defaults?.metadata, ...variant.metadata },
    providerId: providerToIdentifier(variant.provider ?? defaults?.provider),
  }));
  const configuredMatch = (result: EvaluateResult, index: number) =>
    candidates[index].some((candidate) =>
      matchesCandidate(result, candidate.effective, candidate.metadata, candidate.metadataKeys),
    );
  const signatureMatch = (result: EvaluateResult, index: number) => {
    if (!result.testCase) {
      return false;
    }
    const resultVars = filterRuntimeVars(result.vars) ?? {};
    const resultProviderId = providerToIdentifier(result.provider);
    return (
      (!signatures[index].providerId ||
        !resultProviderId ||
        signatures[index].providerId === resultProviderId) &&
      signatureVarKeys.every((key) => deepEqual(resultVars[key], signatures[index].vars[key])) &&
      signatureMetadataKeys.every((key) =>
        deepEqual(result.testCase?.metadata?.[key], signatures[index].metadata[key]),
      )
    );
  };

  return {
    matchesAny: (result: EvaluateResult) =>
      scenario.config.some(
        (_, index) => configuredMatch(result, index) || signatureMatch(result, index),
      ),
    forVariant: (index: number): ResultMatchContext => ({
      includesResult: (result) => {
        if (configuredMatch(result, index)) {
          return true;
        }
        if (!signatureMatch(result, index)) {
          return false;
        }
        if (scenario.config.some((_, other) => other !== index && configuredMatch(result, other))) {
          return false;
        }
        return !scenario.config.some(
          (_, other) => other !== index && signatureMatch(result, other),
        );
      },
      matchesTest: (result, test) =>
        matchesCandidate(
          result,
          mergeScenarioTest(suite, scenario.config[index], test, 0),
          declaredMetadata(suite, scenario.config[index], test),
          metadataKeysForTest(test),
        ),
    }),
  };
}

export function topLevelResultMatchContext(suite: TestSuite): ResultMatchContext {
  if (!suite.tests?.length) {
    return { includesResult: () => false, matchesTest: () => false };
  }
  const topLevelVariant: Variant = {};
  const topLevelCandidates = (suite.tests ?? []).map((test) => {
    const metadata = declaredMetadata(suite, topLevelVariant, test);
    return {
      effective: mergeScenarioTest(suite, topLevelVariant, test, 0),
      metadata,
      metadataKeys: Object.keys(metadata),
    };
  });
  const scenarioClassifiers = (suite.scenarios ?? []).map((scenario) =>
    createScenarioResultClassifier(suite, scenario),
  );
  const explicitScenarioIds = new Set(
    (suite.scenarios ?? []).flatMap((scenario) =>
      scenario.config.flatMap((variant) =>
        (scenario.tests ?? []).map((test) => declaredMetadata(suite, variant, test).conversationId),
      ),
    ),
  );
  return {
    includesResult: (result) => {
      const topLevelMatch = topLevelCandidates.some((candidate) =>
        matchesCandidate(result, candidate.effective, candidate.metadata, candidate.metadataKeys),
      );
      const scenarioMatch = scenarioClassifiers.some((classifier) => classifier.matchesAny(result));
      const conversationId = result.testCase?.metadata?.conversationId;
      const generatedScenarioId =
        typeof conversationId === 'string' && /^__scenario_\d+__$/.test(conversationId);
      const explicitScenarioId = explicitScenarioIds.has(conversationId);
      if (
        (generatedScenarioId || (conversationId !== undefined && explicitScenarioId)) &&
        !topLevelCandidates.some(
          (candidate) =>
            candidate.metadata.conversationId !== undefined &&
            matchesCandidate(
              result,
              candidate.effective,
              candidate.metadata,
              candidate.metadataKeys,
            ),
        )
      ) {
        return false;
      }
      return !scenarioMatch || Boolean(topLevelMatch) || conversationId === undefined;
    },
    matchesTest: (result, test) => {
      const metadata = declaredMetadata(suite, topLevelVariant, test);
      return matchesCandidate(
        result,
        mergeScenarioTest(suite, topLevelVariant, test, 0),
        metadata,
        Object.keys(metadata),
      );
    },
  };
}
