import chalk from 'chalk';

import logger from '../logger';
import { MODEL_GRADED_ASSERTION_TYPES } from '../assertions';
import {
  OpenAiAssistantProvider,
  OpenAiChatCompletionProvider,
  OpenAiCompletionProvider,
} from './openai';
import { AzureOpenAiChatCompletionProvider, AzureOpenAiCompletionProvider } from './azureopenai';

import type { TestCase, TestSuite } from '../types';

export function maybeEmitAzureOpenAiWarning(testSuite: TestSuite, tests: TestCase[]) {
  const hasAzure = testSuite.providers.some(
    (p) =>
      p instanceof AzureOpenAiChatCompletionProvider || p instanceof AzureOpenAiCompletionProvider,
  );
  const hasOpenAi = testSuite.providers.some(
    (p) =>
      p instanceof OpenAiChatCompletionProvider ||
      p instanceof OpenAiCompletionProvider ||
      p instanceof OpenAiAssistantProvider,
  );

  if (hasAzure && !hasOpenAi) {
    const modelGradedAsserts = tests.flatMap((t) =>
      (t.assert || []).filter(
        (a) => MODEL_GRADED_ASSERTION_TYPES.has(a.type) && !a.provider && !t.options?.provider,
      ),
    );
    if (modelGradedAsserts.length > 0) {
      const assertTypes = [...new Set(modelGradedAsserts.map((a) => a.type))].join(', ');
      logger.warn(
        chalk.yellow(
          `You are using model-graded assertions of types ${chalk.bold(
            assertTypes,
          )} while testing an Azure provider. You may need to override the provider for these assertions to use Azure. To learn more, see ${chalk.bold(
            `https://promptfoo.dev/docs/providers/azure/`,
          )}`,
        ),
      );
    }
  }
}
