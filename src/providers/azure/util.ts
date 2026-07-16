import dedent from 'dedent';
import { clampCachedTokens } from '../shared';
import { AZURE_MODELS } from './defaults';

import type { AzureCompletionOptions } from './types';

const AZURE_CACHE_READ_RATE_GROUPS: Array<[number, string[]]> = [
  [
    0.125,
    [
      'gpt-5',
      'gpt-5-2025-08-07',
      'gpt-5-chat',
      'gpt-5-chat-latest',
      'gpt-5-codex',
      'gpt-5.1',
      'gpt-5.1-2025-11-13',
      'gpt-5.1-chat',
      'gpt-5.1-chat-2025-11-13',
      'gpt-5.1-codex',
      'gpt-5.1-codex-2025-11-13',
      'gpt-5.1-codex-max',
    ],
  ],
  [
    0.025,
    [
      'gpt-5-mini',
      'gpt-5-mini-2025-08-07',
      'gpt-5.1-codex-mini',
      'gpt-5.1-codex-mini-2025-11-13',
      'gpt-4.1-nano',
      'gpt-4.1-nano-2025-04-14',
    ],
  ],
  [0.005, ['gpt-5-nano', 'gpt-5-nano-2025-08-07']],
  [0.5, ['gpt-5.5', 'gpt-5.5-2026-04-23', 'gpt-4.1', 'gpt-4.1-2025-04-14', 'o3', 'o3-2025-04-16']],
  [0.25, ['gpt-5.4', 'gpt-5.4-2026-03-05']],
  [3, ['gpt-5.4-pro', 'gpt-5.4-pro-2026-03-05']],
  [0.075, ['gpt-5.4-mini', 'gpt-5.4-mini-2026-03-17', 'gpt-4o-mini', 'gpt-4o-mini-2024-07-18']],
  [0.02, ['gpt-5.4-nano', 'gpt-5.4-nano-2026-03-17']],
  [
    0.175,
    [
      'gpt-5.2',
      'gpt-5.2-2025-12-11',
      'gpt-5.2-chat',
      'gpt-5.2-chat-2025-12-11',
      'gpt-5.2-codex',
      'gpt-5.3-chat',
      'gpt-5.3-codex',
    ],
  ],
  [0.1, ['gpt-4.1-mini', 'gpt-4.1-mini-2025-04-14']],
  [0.275, ['o4-mini', 'o4-mini-2025-04-16']],
  [0.55, ['o3-mini', 'o3-mini-2025-01-31', 'o1-mini-2024-09-12']],
  [2.5, ['o3-deep-research', 'o3-deep-research-2025-06-26']],
  [7.5, ['o1', 'o1-2024-12-17', 'o1-preview', 'o1-preview-2024-09-12']],
  [0.605, ['o1-mini']],
  [1.25, ['gpt-4o', 'gpt-4o-2024-11-20', 'gpt-4o-2024-08-06']],
  [0.375, ['codex-mini']],
  [1, ['claude-fable-5']],
  [
    0.5,
    [
      'claude-opus-4-8',
      'claude-opus-4-7',
      'claude-opus-4-6',
      'claude-opus-4-6-20260205',
      'claude-opus-4-5',
      'claude-opus-4-5-20251101',
    ],
  ],
  [0.2, ['claude-sonnet-5']],
  [0.3, ['claude-sonnet-4-6', 'claude-sonnet-4-5', 'claude-sonnet-4-5-20250929']],
  [1.5, ['claude-opus-4-1', 'claude-opus-4-1-20250805']],
  [0.1, ['claude-haiku-4-5', 'claude-haiku-4-5-20251001']],
];

const AZURE_CACHE_READ_RATES = new Map(
  AZURE_CACHE_READ_RATE_GROUPS.flatMap(([rate, ids]) => ids.map((id) => [id, rate / 1e6] as const)),
);

const AZURE_LONG_CONTEXT_CACHE_READ_RATES = new Map(
  [
    [0.5, ['gpt-5.4', 'gpt-5.4-2026-03-05']],
    [6, ['gpt-5.4-pro', 'gpt-5.4-pro-2026-03-05']],
    [1, ['gpt-5.5', 'gpt-5.5-2026-04-23']],
  ].flatMap(([rate, ids]) => (ids as string[]).map((id) => [id, (rate as number) / 1e6] as const)),
);

const AZURE_PRIORITY_MULTIPLIERS = new Map<string, number>([
  ['gpt-5.4', 2],
  ['gpt-5.4-2026-03-05', 2],
  ['gpt-5.5', 2],
  ['gpt-5.5-2026-04-23', 2],
  ['gpt-5.2-2025-12-11', 2],
  ['gpt-5.2-chat', 2],
  ['gpt-5.2-chat-2025-12-11', 2],
  ['gpt-5.3-chat', 2],
  ['gpt-5.1-2025-11-13', 2],
  ['gpt-5.1-chat-2025-11-13', 2],
  ['gpt-5.1-codex-2025-11-13', 2],
  ['gpt-5.1-codex-mini-2025-11-13', 1.8],
]);

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
  imageCompletionTokens?: number,
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
  const cacheReadCost =
    longContext?.cacheRead ??
    (longContext ? AZURE_LONG_CONTEXT_CACHE_READ_RATES.get(modelName) : undefined) ??
    model.cost.cacheRead ??
    AZURE_CACHE_READ_RATES.get(modelName) ??
    inputCost;
  const cachedTokens = clampCachedTokens(cachedPromptTokens, promptTokens);
  const audioInputTokens = clampCachedTokens(audioPromptTokens, promptTokens);
  const imageInputTokens = clampCachedTokens(
    imagePromptTokens,
    Math.max(promptTokens - audioInputTokens, 0),
  );
  const textInputTokens = Math.max(promptTokens - audioInputTokens - imageInputTokens, 0);
  let cachedAudioTokens = clampCachedTokens(
    cachedAudioPromptTokens,
    Math.min(cachedTokens, audioInputTokens),
  );
  let cachedImageTokens = clampCachedTokens(
    cachedImagePromptTokens,
    Math.min(Math.max(cachedTokens - cachedAudioTokens, 0), imageInputTokens),
  );
  if (cachedAudioTokens === 0 && cachedImageTokens === 0) {
    const cachedNonTextTokens = Math.max(cachedTokens - textInputTokens, 0);
    if (imageInputTokens === 0) {
      cachedAudioTokens = Math.min(cachedNonTextTokens, audioInputTokens);
    } else if (audioInputTokens === 0) {
      cachedImageTokens = Math.min(cachedNonTextTokens, imageInputTokens);
    }
  }
  const cachedTextTokens = Math.min(
    Math.max(cachedTokens - cachedAudioTokens - cachedImageTokens, 0),
    textInputTokens,
  );
  const audioOutputTokens = clampCachedTokens(audioCompletionTokens, completionTokens);
  const imageOutputTokens = clampCachedTokens(
    imageCompletionTokens,
    Math.max(completionTokens - audioOutputTokens, 0),
  );
  const serviceTier = (config.passthrough as { service_tier?: unknown } | undefined)?.service_tier;
  const priorityMultiplier =
    serviceTier === 'priority'
      ? (model.cost.priorityMultiplier ?? AZURE_PRIORITY_MULTIPLIERS.get(modelName) ?? 1)
      : 1;

  return (
    ((textInputTokens - cachedTextTokens) * inputCost +
      cachedTextTokens * cacheReadCost +
      (audioInputTokens - cachedAudioTokens) * (model.cost.audioInput ?? inputCost) +
      cachedAudioTokens * (model.cost.cacheReadAudio ?? cacheReadCost) +
      (imageInputTokens - cachedImageTokens) * (model.cost.imageInput ?? inputCost) +
      cachedImageTokens * (model.cost.cacheReadImage ?? cacheReadCost) +
      (completionTokens - audioOutputTokens - imageOutputTokens) * outputCost +
      audioOutputTokens * (model.cost.audioOutput ?? outputCost) +
      imageOutputTokens * (model.cost.imageOutput ?? outputCost)) *
    priorityMultiplier
  );
}
