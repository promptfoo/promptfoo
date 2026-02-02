import chalk from 'chalk';
import { MODEL_GRADED_ASSERTION_TYPES } from '../../assertions/index';
import logger from '../../logger';

import type { TestCase, TestSuite } from '../../types/index';

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
    const modelGradedAsserts = tests.flatMap((t) =>
      (t.assert || []).filter(
        (a) =>
          // Exclude assert-sets and combinator assertions (and/or)
          a.type !== 'assert-set' &&
          a.type !== 'and' &&
          a.type !== 'or' &&
          MODEL_GRADED_ASSERTION_TYPES.has(a.type) &&
          !('assert' in a) && // Exclude combinators which have assert property but no provider
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
