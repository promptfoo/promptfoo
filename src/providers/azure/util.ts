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
  config: AzureCompletionOptions,
  promptTokens?: number,
  completionTokens?: number,
  cachedPromptTokens?: number,
  audioPromptTokens?: number,
  audioCompletionTokens?: number,
  imagePromptTokens?: number,
  cachedAudioPromptTokens?: number,
  cachedImagePromptTokens?: number,
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
  const audioInputTokens = clampCachedTokens(audioPromptTokens, promptTokens);
  const imageInputTokens = clampCachedTokens(
    imagePromptTokens,
    Math.max(promptTokens - audioInputTokens, 0),
  );
  const textInputTokens = Math.max(promptTokens - audioInputTokens - imageInputTokens, 0);
  const cachedAudioTokens = clampCachedTokens(
    cachedAudioPromptTokens,
    Math.min(cachedTokens, audioInputTokens),
  );
  const cachedImageTokens = clampCachedTokens(
    cachedImagePromptTokens,
    Math.min(Math.max(cachedTokens - cachedAudioTokens, 0), imageInputTokens),
  );
  const cachedTextTokens = Math.min(
    Math.max(cachedTokens - cachedAudioTokens - cachedImageTokens, 0),
    textInputTokens,
  );
  const audioOutputTokens = clampCachedTokens(audioCompletionTokens, completionTokens);
  const serviceTier = (config.passthrough as { service_tier?: unknown } | undefined)?.service_tier;
  const priorityMultiplier = serviceTier === 'priority' ? (model.cost.priorityMultiplier ?? 1) : 1;

  return (
    ((textInputTokens - cachedTextTokens) * inputCost +
      cachedTextTokens * cacheReadCost +
      (audioInputTokens - cachedAudioTokens) * (model.cost.audioInput ?? inputCost) +
      cachedAudioTokens * (model.cost.cacheReadAudio ?? cacheReadCost) +
      (imageInputTokens - cachedImageTokens) * (model.cost.imageInput ?? inputCost) +
      cachedImageTokens * (model.cost.cacheReadImage ?? cacheReadCost) +
      (completionTokens - audioOutputTokens) * outputCost +
      audioOutputTokens * (model.cost.audioOutput ?? outputCost)) *
    priorityMultiplier
  );
}
