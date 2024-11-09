import chalk from 'chalk';
import { MODEL_GRADED_ASSERTION_TYPES } from '../assertions';
import logger from '../logger';
import type { TestCase, TestSuite } from '../types';
import { AzureChatCompletionProvider, AzureCompletionProvider } from './azure';
import {
  OpenAiAssistantProvider,
  OpenAiChatCompletionProvider,
  OpenAiCompletionProvider,
} from './openai';

export function maybeEmitAzureOpenAiWarning(testSuite: TestSuite, tests: TestCase[]) {
  const hasAzure = testSuite.providers.some(
    (p) => p instanceof AzureChatCompletionProvider || p instanceof AzureCompletionProvider,
  );
  const hasOpenAi = testSuite.providers.some(
    (p) =>
      p instanceof OpenAiChatCompletionProvider ||
      p instanceof OpenAiCompletionProvider ||
      p instanceof OpenAiAssistantProvider,
  );

  if (hasAzure && !hasOpenAi && !testSuite.defaultTest?.options?.provider) {
    const modelGradedAsserts = tests.flatMap((t) =>
      (t.assert || []).filter(
        (a) =>
          a.type !== 'assert-set' &&
          MODEL_GRADED_ASSERTION_TYPES.has(a.type) &&
          !a.provider &&
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
