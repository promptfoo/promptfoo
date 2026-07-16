import dedent from 'dedent';
import { clampCachedTokens } from '../shared';
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
  _config: AzureCompletionOptions,
  promptTokens?: number,
  completionTokens?: number,
  cachedPromptTokens?: number,
  audioPromptTokens?: number,
  audioCompletionTokens?: number,
): number | undefined {
  if (
    typeof promptTokens !== 'number' ||
    typeof completionTokens !== 'number' ||
    !Number.isFinite(promptTokens) ||
    !Number.isFinite(completionTokens)
  ) {
    return undefined;
  }

  const model = AZURE_MODELS.find((entry) => entry.id === modelName);
  if (!model) {
    return undefined;
  }

  const longContext =
    model.cost.longContext && promptTokens > model.cost.longContext.threshold
      ? model.cost.longContext
      : undefined;
  const inputCost = longContext?.input ?? model.cost.input;
  const outputCost = longContext?.output ?? model.cost.output;
  const cacheReadCost = longContext?.cacheRead ?? model.cost.cacheRead ?? inputCost;
  const cachedTokens = clampCachedTokens(cachedPromptTokens, promptTokens);
  const audioInputTokens = clampCachedTokens(
    audioPromptTokens,
    Math.max(promptTokens - cachedTokens, 0),
  );
  const audioOutputTokens = clampCachedTokens(audioCompletionTokens, completionTokens);

  return (
    (promptTokens - cachedTokens - audioInputTokens) * inputCost +
    cachedTokens * cacheReadCost +
    audioInputTokens * (model.cost.audioInput ?? inputCost) +
    (completionTokens - audioOutputTokens) * outputCost +
    audioOutputTokens * (model.cost.audioOutput ?? outputCost)
  );
}
