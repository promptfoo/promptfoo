import chalk from 'chalk';
import { MODEL_GRADED_ASSERTION_TYPES } from '../../assertions/index';
import logger from '../../logger';

import type {
  Assertion,
  AssertionSet,
  CombinatorAssertion,
  TestCase,
  TestSuite,
} from '../../types/index';

/**
 * Recursively collect all leaf assertions from an assertion tree.
 * This traverses combinators (and/or) and assert-sets to find model-graded assertions.
 */
function collectLeafAssertions(
  assertion: Assertion | AssertionSet | CombinatorAssertion,
): Assertion[] {
  // Combinator assertions (and/or) - recurse into sub-assertions
  if (assertion.type === 'and' || assertion.type === 'or') {
    const combinator = assertion as CombinatorAssertion;
    return (combinator.assert || []).flatMap(collectLeafAssertions);
  }

  // Assert-set - recurse into sub-assertions
  if (assertion.type === 'assert-set') {
    const assertSet = assertion as AssertionSet;
    return (assertSet.assert || []).flatMap(collectLeafAssertions);
  }

  // Leaf assertion
  return [assertion as Assertion];
}

/**
 * Emits a warning if Azure providers are used with model-graded assertions without
 * explicitly setting a provider for the assertions.
 */
export function maybeEmitAzureOpenAiWarning(testSuite: TestSuite, tests: TestCase[]) {
  const hasAzure = testSuite.providers.some(
    (p) =>
      p.constructor.name === 'AzureChatCompletionProvider' ||
      p.constructor.name === 'AzureCompletionProvider',
  );
  const hasOpenAi = testSuite.providers.some(
    (p) =>
      p.constructor.name === 'OpenAiChatCompletionProvider' ||
      p.constructor.name === 'OpenAiCompletionProvider' ||
      p.constructor.name === 'OpenAiAssistantProvider',
  );

  if (
    hasAzure &&
    !hasOpenAi &&
    !(typeof testSuite.defaultTest === 'object' && testSuite.defaultTest?.options?.provider)
  ) {
    // Recursively collect all leaf assertions from combinators and assert-sets
    const modelGradedAsserts = tests.flatMap((t) =>
      (t.assert || [])
        .flatMap(collectLeafAssertions)
        .filter(
          (a) =>
            MODEL_GRADED_ASSERTION_TYPES.has(a.type) &&
            !(a as { provider?: unknown }).provider &&
            !t.options?.provider,
        ),
    );
    if (modelGradedAsserts.length > 0) {
      const assertTypes = Array.from(new Set(modelGradedAsserts.map((a) => a.type))).join(', ');
      logger.warn(
        chalk.yellow(
          `You are using model-graded assertions of types ${chalk.bold(
            assertTypes,
          )} while testing an Azure provider. You may need to override these to use your Azure deployment. To learn more, see ${chalk.bold(
            `https://promptfoo.dev/docs/providers/azure/#model-graded-tests`,
          )}`,
        ),
      );
      return true;
    }
  }
  return false;
}
