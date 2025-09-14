import dedent from 'dedent';
import { calculateCost } from '../shared';
import { AZURE_MODELS } from './defaults';

import type { AzureCompletionOptions } from './types';

/**
 * Throws a configuration error with standard formatting and documentation link
 */
export function throwConfigurationError(message: string): never {
  throw new Error(dedent`
    ${message}

    See https://www.promptfoo.dev/docs/providers/azure/ to learn more about Azure configuration.
  `);
}

/**
 * Calculate Azure cost based on model name and token usage
 */
export function calculateAzureCost(
  modelName: string,
  config: AzureCompletionOptions,
  promptTokens?: number,
  completionTokens?: number,
): number | undefined {
  return calculateCost(
    modelName,
    { cost: undefined },
    promptTokens,
    completionTokens,
    AZURE_MODELS,
  );
}
