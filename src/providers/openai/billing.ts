import {
  OPENAI_CHAT_MODELS,
  OPENAI_COMPLETION_MODELS,
  OPENAI_DEEP_RESEARCH_MODELS,
  OPENAI_REALTIME_MODELS,
  OPENAI_RESPONSES_ONLY_MODELS,
} from './util';

import type { ProviderConfig } from '../shared';

type OpenAITextRates = {
  input: number;
  cachedInput?: number;
  output?: number;
};

type OpenAIModalRates = {
  input?: number;
  cachedInput?: number;
  output?: number;
};

type OpenAIModelRates = {
  text: OpenAITextRates;
  audio?: OpenAIModalRates;
  image?: OpenAIModalRates;
};

export type OpenAIProcessingTier = 'standard' | 'batch' | 'flex' | 'priority';

export type OpenAIBillingUsage = {
  totalInputTokens: number;
  cachedInputTokens: number;
  cachedTextInputTokens: number;
  cachedAudioInputTokens: number;
  cachedImageInputTokens: number;
  textInputTokens: number;
  audioInputTokens: number;
  imageInputTokens: number;
  totalOutputTokens: number;
  textOutputTokens: number;
  audioOutputTokens: number;
  imageOutputTokens: number;
};

const PER_MILLION = 1 / 1_000_000;

function perMillion(value: number): number {
  return value * PER_MILLION;
}

type RateGroup<T> = {
  models: string[];
  rates: T;
};

function buildRateTable<T>(groups: RateGroup<T>[]): Record<string, T> {
  const table: Record<string, T> = {};
  for (const { models, rates } of groups) {
    for (const modelName of models) {
      table[modelName] = rates;
    }
  }
  return table;
}

const STANDARD_CACHED_INPUT_RATES = buildRateTable<number>([
  { models: ['gpt-5.5', 'gpt-5.5-2026-04-23'], rates: perMillion(0.5) },
  { models: ['gpt-5.4', 'gpt-5.4-2026-03-05'], rates: perMillion(0.25) },
  { models: ['gpt-5.4-mini', 'gpt-5.4-mini-2026-03-17'], rates: perMillion(0.075) },
  { models: ['gpt-5.4-nano', 'gpt-5.4-nano-2026-03-17'], rates: perMillion(0.02) },
  {
    models: ['gpt-5.2', 'gpt-5.2-2025-12-11', 'gpt-5.2-chat-latest', 'gpt-5.2-codex'],
    rates: perMillion(0.175),
  },
  {
    models: [
      'gpt-5.1',
      'gpt-5.1-2025-11-13',
      'gpt-5.1-chat-latest',
      'gpt-5.1-codex',
      'gpt-5.1-codex-max',
    ],
    rates: perMillion(0.125),
  },
  { models: ['gpt-5.1-mini', 'gpt-5.1-codex-mini'], rates: perMillion(0.025) },
  { models: ['gpt-5.1-nano'], rates: perMillion(0.005) },
  {
    models: ['gpt-5', 'gpt-5-2025-08-07', 'gpt-5-chat', 'gpt-5-chat-latest', 'gpt-5-codex'],
    rates: perMillion(0.125),
  },
  { models: ['gpt-5-mini', 'gpt-5-mini-2025-08-07'], rates: perMillion(0.025) },
  { models: ['gpt-5-nano', 'gpt-5-nano-2025-08-07'], rates: perMillion(0.005) },
  { models: ['gpt-4.1', 'gpt-4.1-2025-04-14'], rates: perMillion(0.5) },
  { models: ['gpt-4.1-mini', 'gpt-4.1-mini-2025-04-14'], rates: perMillion(0.1) },
  { models: ['gpt-4.1-nano', 'gpt-4.1-nano-2025-04-14'], rates: perMillion(0.025) },
  { models: ['gpt-4o', 'gpt-4o-2024-08-06', 'gpt-4o-2024-11-20'], rates: perMillion(1.25) },
  { models: ['gpt-5.3-chat-latest', 'gpt-5.3-codex'], rates: perMillion(0.175) },
  { models: ['gpt-5.3-codex-spark'], rates: perMillion(0.05) },
  { models: ['gpt-4o-mini', 'gpt-4o-mini-2024-07-18'], rates: perMillion(0.075) },
  { models: ['gpt-5-codex-mini'], rates: perMillion(0.05) },
  {
    models: ['o1', 'o1-2024-12-17', 'o1-preview', 'o1-preview-2024-09-12'],
    rates: perMillion(7.5),
  },
  { models: ['o3', 'o3-2025-04-16'], rates: perMillion(0.5) },
  { models: ['o4-mini', 'o4-mini-2025-04-16'], rates: perMillion(0.275) },
  { models: ['o3-mini', 'o3-mini-2025-01-31'], rates: perMillion(0.55) },
  { models: ['o1-mini', 'o1-mini-2024-09-12'], rates: perMillion(0.55) },
  { models: ['o3-deep-research', 'o3-deep-research-2025-06-26'], rates: perMillion(2.5) },
  {
    models: ['o4-mini-deep-research', 'o4-mini-deep-research-2025-06-26'],
    rates: perMillion(0.5),
  },
]);

const LONG_CONTEXT_CACHED_INPUT_RATES = buildRateTable<number>([
  { models: ['gpt-5.5', 'gpt-5.5-2026-04-23'], rates: perMillion(1) },
  { models: ['gpt-5.4', 'gpt-5.4-2026-03-05'], rates: perMillion(0.5) },
]);

const FLEX_SUPPORTED_TEXT_MODELS = new Set([
  'gpt-5.5',
  'gpt-5.5-2026-04-23',
  'gpt-5.5-pro',
  'gpt-5.5-pro-2026-04-23',
  'gpt-5.4',
  'gpt-5.4-2026-03-05',
  'gpt-5.4-mini',
  'gpt-5.4-mini-2026-03-17',
  'gpt-5.4-nano',
  'gpt-5.4-nano-2026-03-17',
  'gpt-5.4-pro',
  'gpt-5.4-pro-2026-03-05',
  'gpt-5.2',
  'gpt-5.2-2025-12-11',
  'gpt-5.2-chat-latest',
  'gpt-5.2-codex',
  'gpt-5.1',
  'gpt-5.1-2025-11-13',
  'gpt-5.1-chat-latest',
  'gpt-5',
  'gpt-5-2025-08-07',
  'gpt-5-chat',
  'gpt-5-chat-latest',
  'gpt-5-mini',
  'gpt-5-mini-2025-08-07',
  'gpt-5-nano',
  'gpt-5-nano-2025-08-07',
  'o3',
  'o3-2025-04-16',
  'o4-mini',
  'o4-mini-2025-04-16',
]);

const PRIORITY_TEXT_RATES = buildRateTable<OpenAITextRates>([
  {
    models: ['gpt-5.5', 'gpt-5.5-2026-04-23'],
    rates: { input: perMillion(12.5), cachedInput: perMillion(1.25), output: perMillion(75) },
  },
  {
    models: ['gpt-5.4', 'gpt-5.4-2026-03-05'],
    rates: { input: perMillion(5), cachedInput: perMillion(0.5), output: perMillion(30) },
  },
  {
    models: ['gpt-5.4-mini', 'gpt-5.4-mini-2026-03-17'],
    rates: { input: perMillion(1.5), cachedInput: perMillion(0.15), output: perMillion(9) },
  },
  {
    models: ['gpt-5.2', 'gpt-5.2-2025-12-11', 'gpt-5.2-chat-latest', 'gpt-5.2-codex'],
    rates: { input: perMillion(3.5), cachedInput: perMillion(0.35), output: perMillion(28) },
  },
  {
    models: ['gpt-5.1', 'gpt-5.1-2025-11-13', 'gpt-5.1-chat-latest'],
    rates: { input: perMillion(2.5), cachedInput: perMillion(0.25), output: perMillion(20) },
  },
  {
    models: ['gpt-5', 'gpt-5-2025-08-07', 'gpt-5-chat', 'gpt-5-chat-latest'],
    rates: { input: perMillion(2.5), cachedInput: perMillion(0.25), output: perMillion(20) },
  },
  {
    models: ['gpt-5-mini', 'gpt-5-mini-2025-08-07'],
    rates: { input: perMillion(0.45), cachedInput: perMillion(0.045), output: perMillion(3.6) },
  },
  {
    models: ['gpt-4.1', 'gpt-4.1-2025-04-14'],
    rates: { input: perMillion(3.5), cachedInput: perMillion(0.875), output: perMillion(14) },
  },
  {
    models: ['gpt-4.1-mini', 'gpt-4.1-mini-2025-04-14'],
    rates: { input: perMillion(0.7), cachedInput: perMillion(0.175), output: perMillion(2.8) },
  },
  {
    models: ['gpt-4.1-nano', 'gpt-4.1-nano-2025-04-14'],
    rates: { input: perMillion(0.2), cachedInput: perMillion(0.05), output: perMillion(0.8) },
  },
  {
    models: ['gpt-4o', 'gpt-4o-2024-08-06', 'gpt-4o-2024-11-20'],
    rates: { input: perMillion(4.25), cachedInput: perMillion(2.125), output: perMillion(17) },
  },
  {
    models: ['gpt-4o-2024-05-13'],
    rates: { input: perMillion(8.75), output: perMillion(26.25) },
  },
  {
    models: ['gpt-4o-mini', 'gpt-4o-mini-2024-07-18'],
    rates: { input: perMillion(0.25), cachedInput: perMillion(0.125), output: perMillion(1) },
  },
  {
    models: ['o3', 'o3-2025-04-16'],
    rates: { input: perMillion(3.5), cachedInput: perMillion(0.875), output: perMillion(14) },
  },
  {
    models: ['o4-mini', 'o4-mini-2025-04-16'],
    rates: { input: perMillion(2), cachedInput: perMillion(0.5), output: perMillion(8) },
  },
]);

const IMAGE_MODEL_RATES = buildRateTable<OpenAIModelRates>([
  {
    models: ['gpt-image-2', 'gpt-image-2-2026-04-21'],
    rates: {
      text: { input: perMillion(5), cachedInput: perMillion(1.25) },
      image: {
        input: perMillion(8),
        cachedInput: perMillion(2),
        output: perMillion(30),
      },
    },
  },
  {
    models: ['gpt-image-1.5', 'gpt-image-1.5-2025-12-16'],
    rates: {
      text: {
        input: perMillion(5),
        cachedInput: perMillion(1.25),
        output: perMillion(10),
      },
      image: {
        input: perMillion(8),
        cachedInput: perMillion(2),
        output: perMillion(32),
      },
    },
  },
  {
    models: ['gpt-image-1'],
    rates: {
      text: { input: perMillion(5), cachedInput: perMillion(1.25) },
      image: {
        input: perMillion(10),
        cachedInput: perMillion(2.5),
        output: perMillion(40),
      },
    },
  },
  {
    models: ['gpt-image-1-mini'],
    rates: {
      text: { input: perMillion(2), cachedInput: perMillion(0.2) },
      image: {
        input: perMillion(2.5),
        cachedInput: perMillion(0.25),
        output: perMillion(8),
      },
    },
  },
]);

const REALTIME_MODAL_RATES = buildRateTable<OpenAIModelRates>([
  {
    models: ['gpt-realtime', 'gpt-realtime-2025-08-28', 'gpt-realtime-1.5'],
    rates: {
      text: { input: perMillion(4), cachedInput: perMillion(0.4), output: perMillion(16) },
      audio: {
        input: perMillion(32),
        cachedInput: perMillion(0.4),
        output: perMillion(64),
      },
      image: {
        input: perMillion(5),
        cachedInput: perMillion(0.5),
      },
    },
  },
  {
    models: ['gpt-4o-realtime-preview', 'gpt-4o-realtime-preview-2024-12-17'],
    rates: {
      text: { input: perMillion(5), cachedInput: perMillion(2.5), output: perMillion(20) },
      audio: {
        input: perMillion(40),
        cachedInput: perMillion(2.5),
        output: perMillion(80),
      },
    },
  },
  {
    models: ['gpt-4o-mini-realtime-preview', 'gpt-4o-mini-realtime-preview-2024-12-17'],
    rates: {
      text: { input: perMillion(0.6), cachedInput: perMillion(0.3), output: perMillion(2.4) },
      audio: {
        input: perMillion(10),
        cachedInput: perMillion(0.3),
        output: perMillion(20),
      },
    },
  },
  {
    models: ['gpt-4o-realtime-preview-2024-10-01'],
    rates: {
      text: { input: perMillion(5), cachedInput: perMillion(2.5), output: perMillion(20) },
      audio: {
        input: perMillion(100),
        cachedInput: perMillion(2.5),
        output: perMillion(200),
      },
    },
  },
  {
    models: ['gpt-realtime-mini', 'gpt-realtime-mini-2025-12-15'],
    rates: {
      text: { input: perMillion(0.6), cachedInput: perMillion(0.06), output: perMillion(2.4) },
      audio: {
        input: perMillion(10),
        cachedInput: perMillion(0.3),
        output: perMillion(20),
      },
      image: {
        input: perMillion(0.8),
        cachedInput: perMillion(0.08),
      },
    },
  },
]);

const EMBEDDING_RATES = buildRateTable<OpenAITextRates>([
  {
    models: ['text-embedding-3-small'],
    rates: { input: perMillion(0.02) },
  },
  {
    models: ['text-embedding-3-large'],
    rates: { input: perMillion(0.13) },
  },
  {
    models: ['text-embedding-ada-002'],
    rates: { input: perMillion(0.1) },
  },
]);

const ALL_TEXT_MODELS = [
  ...OPENAI_CHAT_MODELS,
  ...OPENAI_COMPLETION_MODELS,
  ...OPENAI_REALTIME_MODELS,
  ...OPENAI_RESPONSES_ONLY_MODELS,
  ...OPENAI_DEEP_RESEARCH_MODELS,
];

const TEXT_MODELS_BY_ID = new Map(ALL_TEXT_MODELS.map((model) => [model.id, model]));

type OpenAIUsageParts = {
  usage: any;
  inputDetails: any;
  outputDetails: any;
  hasOutputBreakdown: boolean;
};

function getOpenAIUsageParts(rawUsage: any): OpenAIUsageParts {
  const usage = rawUsage?.usage ?? rawUsage ?? {};
  const inputDetails =
    usage.prompt_tokens_details ?? usage.input_tokens_details ?? usage.input_token_details ?? {};
  const outputDetails =
    usage.completion_tokens_details ??
    usage.output_tokens_details ??
    usage.output_token_details ??
    {};

  return {
    usage,
    inputDetails,
    outputDetails,
    hasOutputBreakdown: ['text_tokens', 'image_tokens', 'audio_tokens'].some(
      (key) => typeof outputDetails[key] === 'number',
    ),
  };
}

export type OpenAITokenUsageSummary = {
  prompt?: number;
  completion?: number;
  cached?: number;
};

export function calculateOpenAIUsageCostFromTokenUsage(
  modelName: string | undefined,
  tokenUsage: OpenAITokenUsageSummary | undefined,
): number | undefined {
  if (!modelName || !tokenUsage) {
    return undefined;
  }

  return calculateOpenAIUsageCost(
    modelName,
    {},
    {
      prompt_tokens: tokenUsage.prompt,
      completion_tokens: tokenUsage.completion,
      prompt_tokens_details: {
        cached_tokens: tokenUsage.cached ?? 0,
      },
    },
  );
}

function normalizeServiceTier(serviceTier: string | null | undefined): OpenAIProcessingTier {
  switch (serviceTier) {
    case 'batch':
    case 'flex':
    case 'priority':
      return serviceTier;
    default:
      return 'standard';
  }
}

function getBaseTextRates(
  modelName: string,
  totalInputTokens: number,
): OpenAITextRates | undefined {
  const model = TEXT_MODELS_BY_ID.get(modelName);
  if (!model?.cost) {
    return undefined;
  }

  const longContext =
    model.cost.longContext && totalInputTokens > model.cost.longContext.threshold
      ? model.cost.longContext
      : undefined;

  return {
    input: longContext?.input ?? model.cost.input,
    cachedInput:
      (longContext ? LONG_CONTEXT_CACHED_INPUT_RATES[modelName] : undefined) ??
      STANDARD_CACHED_INPUT_RATES[modelName],
    output: longContext?.output ?? model.cost.output,
  };
}

function getModelRates(
  modelName: string,
  tier: OpenAIProcessingTier,
  totalInputTokens: number,
): OpenAIModelRates | undefined {
  if (modelName.startsWith('gpt-image-1.5-')) {
    return IMAGE_MODEL_RATES['gpt-image-1.5'];
  }

  if (modelName.startsWith('gpt-image-1-mini-')) {
    return IMAGE_MODEL_RATES['gpt-image-1-mini'];
  }

  if (modelName.startsWith('gpt-image-1-')) {
    return IMAGE_MODEL_RATES['gpt-image-1'];
  }

  if (IMAGE_MODEL_RATES[modelName]) {
    return IMAGE_MODEL_RATES[modelName];
  }

  if (REALTIME_MODAL_RATES[modelName]) {
    return REALTIME_MODAL_RATES[modelName];
  }

  if (EMBEDDING_RATES[modelName]) {
    const text = EMBEDDING_RATES[modelName];
    return {
      text:
        tier === 'batch'
          ? {
              input: text.input * 0.5,
            }
          : text,
    };
  }

  if (tier === 'priority' && PRIORITY_TEXT_RATES[modelName]) {
    return { text: PRIORITY_TEXT_RATES[modelName] };
  }

  const text = getBaseTextRates(modelName, totalInputTokens);
  if (!text) {
    return undefined;
  }

  const model = TEXT_MODELS_BY_ID.get(modelName);
  const discountedText =
    tier === 'batch' || (tier === 'flex' && FLEX_SUPPORTED_TEXT_MODELS.has(modelName))
      ? {
          input: text.input * 0.5,
          ...(text.cachedInput === undefined ? {} : { cachedInput: text.cachedInput * 0.5 }),
          ...(text.output === undefined ? {} : { output: text.output * 0.5 }),
        }
      : text;

  if (tier === 'flex' && discountedText === text) {
    return undefined;
  }

  return {
    text: discountedText,
    ...(model?.cost?.audioInput || model?.cost?.audioOutput
      ? {
          audio: {
            input: model.cost.audioInput,
            output: model.cost.audioOutput,
          },
        }
      : {}),
  };
}

function getNumericValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function extractOpenAIBillingUsage(rawUsage: any): OpenAIBillingUsage {
  const { usage, inputDetails, outputDetails } = getOpenAIUsageParts(rawUsage);

  const totalOutputTokens = getNumericValue(usage.completion_tokens ?? usage.output_tokens);
  const reportedInputTokens = getNumericValue(usage.prompt_tokens ?? usage.input_tokens);
  const totalInputTokens =
    reportedInputTokens === 0 && totalOutputTokens === 0
      ? getNumericValue(usage.total_tokens)
      : reportedInputTokens;
  const audioInputTokens = getNumericValue(
    inputDetails.audio_tokens ?? usage.audio_prompt_tokens ?? usage.audio_input_tokens,
  );
  const imageInputTokens = getNumericValue(inputDetails.image_tokens);
  const textInputTokens = getNumericValue(
    inputDetails.text_tokens ?? Math.max(totalInputTokens - audioInputTokens - imageInputTokens, 0),
  );
  const audioOutputTokens = getNumericValue(
    outputDetails.audio_tokens ?? usage.audio_completion_tokens ?? usage.audio_output_tokens,
  );
  const imageOutputTokens = getNumericValue(outputDetails.image_tokens);
  const textOutputTokens = getNumericValue(
    outputDetails.text_tokens ??
      Math.max(totalOutputTokens - audioOutputTokens - imageOutputTokens, 0),
  );
  const cachedInputDetails = inputDetails.cached_tokens_details ?? {};

  return {
    totalInputTokens,
    cachedInputTokens: getNumericValue(inputDetails.cached_tokens ?? usage.cached_input_tokens),
    cachedTextInputTokens: getNumericValue(cachedInputDetails.text_tokens),
    cachedAudioInputTokens: getNumericValue(cachedInputDetails.audio_tokens),
    cachedImageInputTokens: getNumericValue(cachedInputDetails.image_tokens),
    textInputTokens,
    audioInputTokens,
    imageInputTokens,
    totalOutputTokens,
    textOutputTokens,
    audioOutputTokens,
    imageOutputTokens,
  };
}

function splitCachedInputTokens(
  usage: OpenAIBillingUsage,
): Pick<OpenAIBillingUsage, 'textInputTokens' | 'audioInputTokens' | 'imageInputTokens'> {
  if (usage.cachedInputTokens <= 0) {
    return {
      textInputTokens: 0,
      audioInputTokens: 0,
      imageInputTokens: 0,
    };
  }

  const explicitCachedInputTokens =
    usage.cachedTextInputTokens + usage.cachedAudioInputTokens + usage.cachedImageInputTokens;
  if (explicitCachedInputTokens > 0) {
    return {
      textInputTokens: Math.min(usage.cachedTextInputTokens, usage.textInputTokens),
      audioInputTokens: Math.min(usage.cachedAudioInputTokens, usage.audioInputTokens),
      imageInputTokens: Math.min(usage.cachedImageInputTokens, usage.imageInputTokens),
    };
  }

  if (usage.audioInputTokens === 0 && usage.imageInputTokens === 0) {
    return {
      textInputTokens: Math.min(usage.cachedInputTokens, usage.textInputTokens),
      audioInputTokens: 0,
      imageInputTokens: 0,
    };
  }

  if (usage.textInputTokens === 0 && usage.imageInputTokens === 0) {
    return {
      textInputTokens: 0,
      audioInputTokens: Math.min(usage.cachedInputTokens, usage.audioInputTokens),
      imageInputTokens: 0,
    };
  }

  if (usage.textInputTokens === 0 && usage.audioInputTokens === 0) {
    return {
      textInputTokens: 0,
      audioInputTokens: 0,
      imageInputTokens: Math.min(usage.cachedInputTokens, usage.imageInputTokens),
    };
  }

  // Older payloads expose only a total cached-token count.
  // Attribute mixed-modality cached input to text so the fallback remains deterministic.
  return {
    textInputTokens: Math.min(usage.cachedInputTokens, usage.textInputTokens),
    audioInputTokens: 0,
    imageInputTokens: 0,
  };
}

function calculateTextCost(
  rates: OpenAITextRates,
  usage: OpenAIBillingUsage,
  cachedTextInputTokens: number,
  config: ProviderConfig,
): number {
  const textInputCost = config.inputCost ?? config.cost ?? rates.input;
  const cachedInputCost = config.inputCost ?? config.cost ?? rates.cachedInput ?? textInputCost;
  const outputCost = config.outputCost ?? config.cost ?? rates.output ?? 0;
  const uncachedTextInputTokens = Math.max(usage.textInputTokens - cachedTextInputTokens, 0);

  return (
    uncachedTextInputTokens * textInputCost +
    cachedTextInputTokens * cachedInputCost +
    usage.textOutputTokens * outputCost
  );
}

function calculateModalCost(
  rates: OpenAIModalRates | undefined,
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number,
  overrides: {
    input?: number;
    cachedInput?: number;
    output?: number;
  },
): number {
  if (!rates) {
    return 0;
  }

  const inputCost = overrides.input ?? rates.input ?? 0;
  const cachedInputCost = overrides.cachedInput ?? rates.cachedInput ?? inputCost;
  const outputCost = overrides.output ?? rates.output ?? 0;
  const uncachedInputTokens = Math.max(inputTokens - cachedInputTokens, 0);

  return (
    uncachedInputTokens * inputCost +
    cachedInputTokens * cachedInputCost +
    outputTokens * outputCost
  );
}

export function calculateOpenAIUsageCost(
  modelName: string,
  config: ProviderConfig,
  rawUsage: any,
  options: {
    serviceTier?: string | null;
    cachedResponse?: boolean;
  } = {},
): number | undefined {
  if (!rawUsage) {
    return undefined;
  }

  const usage = extractOpenAIBillingUsage(rawUsage);
  const tier = normalizeServiceTier(options.serviceTier);
  const rates = getModelRates(modelName, tier, usage.totalInputTokens);
  if (!rates) {
    return undefined;
  }

  if (options.cachedResponse) {
    return 0;
  }

  const { hasOutputBreakdown } = getOpenAIUsageParts(rawUsage);

  if (
    rates.image?.output &&
    rates.text.output &&
    usage.totalOutputTokens > 0 &&
    usage.imageOutputTokens === 0 &&
    !hasOutputBreakdown
  ) {
    return undefined;
  }

  if (
    rates.image?.output &&
    rates.text.output === undefined &&
    usage.totalOutputTokens > 0 &&
    usage.imageOutputTokens === 0 &&
    usage.audioOutputTokens === 0 &&
    usage.textOutputTokens === usage.totalOutputTokens
  ) {
    usage.imageOutputTokens = usage.totalOutputTokens;
    usage.textOutputTokens = 0;
  }

  const cachedInput = splitCachedInputTokens(usage);
  const textCost = calculateTextCost(rates.text, usage, cachedInput.textInputTokens, config);
  const audioCost = calculateModalCost(
    rates.audio,
    usage.audioInputTokens,
    cachedInput.audioInputTokens,
    usage.audioOutputTokens,
    {
      input: config.audioInputCost ?? config.audioCost,
      cachedInput: config.audioInputCost ?? config.audioCost,
      output: config.audioOutputCost ?? config.audioCost,
    },
  );
  const imageCost = calculateModalCost(
    rates.image,
    usage.imageInputTokens,
    cachedInput.imageInputTokens,
    usage.imageOutputTokens,
    {},
  );

  return textCost + audioCost + imageCost;
}

function isReasoningModel(modelName: string): boolean {
  return (
    modelName.startsWith('gpt-5') ||
    modelName.startsWith('o1') ||
    modelName.startsWith('o3') ||
    modelName.startsWith('o4') ||
    modelName.includes('deep-research')
  );
}

type OpenAIToolCostConfig = ProviderConfig & {
  tools?: Array<{ type?: unknown } | undefined>;
};

function getWebSearchToolType(
  config: OpenAIToolCostConfig,
): 'web_search' | 'web_search_preview' | undefined {
  if (!Array.isArray(config.tools)) {
    return undefined;
  }

  const toolTypes = config.tools
    .map((tool) => (typeof tool === 'object' && tool ? tool.type : undefined))
    .filter(
      (type): type is 'web_search' | 'web_search_preview' =>
        type === 'web_search' || type === 'web_search_preview',
    );

  if (toolTypes.includes('web_search')) {
    return 'web_search';
  }

  if (toolTypes.includes('web_search_preview')) {
    return 'web_search_preview';
  }

  return undefined;
}

export function calculateObservableOpenAIToolCost(
  data: any,
  modelName: string,
  config: OpenAIToolCostConfig = {},
): number {
  if (!Array.isArray(data?.output)) {
    return 0;
  }

  const webSearchToolType = getWebSearchToolType(config);
  let total = 0;
  for (const item of data.output) {
    if (item?.type === 'web_search_call' && item.action?.type === 'search') {
      total += webSearchToolType === 'web_search' || isReasoningModel(modelName) ? 0.01 : 0.025;
    } else if (item?.type === 'file_search_call') {
      total += 0.0025;
    }
  }

  return total;
}
