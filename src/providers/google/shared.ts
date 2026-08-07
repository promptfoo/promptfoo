/**
 * Interface for Google model cost with optional tiered pricing.
 * Tiered pricing applies when prompt tokens exceed a threshold.
 */
export interface GoogleModelCost {
  input: number;
  output: number;
  cacheRead?: number;
  cacheReadAudio?: number;
  audioInput?: number;
  audioOutput?: number;
  imageInput?: number;
  videoInputPerSecond?: number;
  videoOutput?: number;
  priorityMultiplier?: number;
  priorityCacheRead?: number;
  priorityCacheReadAudio?: number;
  priorityAudioInput?: number;
  flexMultiplier?: number;
  flexCacheRead?: number;
  flexCacheReadAudio?: number;
  flexAudioInput?: number;
}

export interface GoogleModelTieredCost {
  threshold: number;
  above: GoogleModelCost;
}

export interface GoogleModel {
  id: string;
  cost?: GoogleModelCost;
  tieredCost?: GoogleModelTieredCost;
  /** Override pricing for Vertex AI when it differs from AI Studio. */
  vertexCost?: GoogleModelCost;
  /** Exact non-global Vertex pricing when it cannot be represented by a multiplier. */
  vertexRegionalCost?: GoogleModelCost;
  /** Multiplier for Vertex regional and multi-regional endpoints relative to global. */
  vertexRegionalPremium?: number;
}

// These Vertex Gemini IDs use the global endpoint by default. Their model pages list either
// global-only availability or global as the broadly available endpoint:
// https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/locations#generative_ai_models
const VERTEX_GLOBAL_DEFAULT_MODELS = new Set([
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3.5-flash-lite',
  'gemini-3.1-pro-preview',
  'gemini-3.1-pro-preview-customtools',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3-flash-preview',
]);

// Vertex's managed Llama 4 MaaS endpoints are currently available in us-east5.
const VERTEX_US_EAST5_DEFAULT_MODELS = new Set([
  'llama-4-maverick-17b-128e-instruct-maas',
  'llama-4-scout-17b-16e-instruct-maas',
]);

export function getVertexModelDefaultRegion(modelName: string): string | undefined {
  if (VERTEX_GLOBAL_DEFAULT_MODELS.has(modelName)) {
    return 'global';
  }
  if (VERTEX_US_EAST5_DEFAULT_MODELS.has(modelName)) {
    return 'us-east5';
  }
  return undefined;
}

const GEMINI_3_PRO_COST = { input: 2.0 / 1e6, output: 12.0 / 1e6, cacheRead: 0.2 / 1e6 };
const GEMINI_3_PRO_TIERED_COST = {
  threshold: 200_000,
  above: { input: 4.0 / 1e6, output: 18.0 / 1e6, cacheRead: 0.4 / 1e6 },
};

const GEMINI_2_5_PRO_COST = { input: 1.25 / 1e6, output: 10.0 / 1e6, cacheRead: 0.125 / 1e6 };
const GEMINI_2_5_PRO_TIERED_COST = {
  threshold: 200_000,
  above: { input: 2.5 / 1e6, output: 15.0 / 1e6, cacheRead: 0.25 / 1e6 },
};

/**
 * Google AI Studio model pricing used for current requests and saved-evaluation cost scoring.
 * Prices are per token (from Google AI pricing page, converted from per-million).
 *
 * Selected retired IDs remain here so historical results can still be scored. Membership in this
 * table does not imply that Google still serves the endpoint.
 *
 * Note: Vertex AI may have different pricing for some models.
 * @see https://ai.google.dev/gemini-api/docs/pricing
 * @see https://cloud.google.com/vertex-ai/generative-ai/pricing
 */
export const GOOGLE_MODELS: GoogleModel[] = [
  // Gemini 3.6 models.
  {
    id: 'gemini-3.6-flash',
    cost: {
      input: 1.5 / 1e6,
      output: 7.5 / 1e6,
      cacheRead: 0.15 / 1e6,
      priorityMultiplier: 1.8,
      flexMultiplier: 0.5,
    },
  },

  // Gemini 3.5 models.
  ...['gemini-3.5-flash', 'gemini-flash-latest'].map((id) => ({
    id,
    cost: {
      input: 1.5 / 1e6,
      output: 9.0 / 1e6,
      cacheRead: 0.15 / 1e6,
      audioInput: 1.5 / 1e6,
      priorityMultiplier: 1.8,
      flexMultiplier: 0.5,
      flexCacheRead: 0.08 / 1e6,
    },
    vertexRegionalCost: {
      input: 1.65 / 1e6,
      output: 9.9 / 1e6,
      cacheRead: 0.165 / 1e6,
      audioInput: 1.65 / 1e6,
      priorityMultiplier: 1.8,
      flexMultiplier: 0.5,
      flexCacheRead: 0.0825 / 1e6,
    },
  })),
  {
    id: 'gemini-3.5-flash-lite',
    cost: {
      input: 0.3 / 1e6,
      output: 2.5 / 1e6,
      cacheRead: 0.03 / 1e6,
      audioInput: 0.3 / 1e6,
      priorityMultiplier: 1.8,
      priorityCacheRead: 0.05 / 1e6,
      flexMultiplier: 0.5,
      flexCacheRead: 0.02 / 1e6,
    },
    vertexCost: {
      input: 0.3 / 1e6,
      output: 2.5 / 1e6,
      cacheRead: 0.03 / 1e6,
      audioInput: 0.3 / 1e6,
      priorityMultiplier: 1.8,
      priorityCacheRead: 0.054 / 1e6,
      flexMultiplier: 0.5,
      flexCacheRead: 0.015 / 1e6,
    },
    vertexRegionalPremium: 1.1,
  },
  {
    id: 'gemini-omni-flash-preview',
    cost: {
      input: 1.5 / 1e6,
      output: 9.0 / 1e6,
      audioInput: 1.5 / 1e6,
      videoOutput: 17.5 / 1e6,
    },
  },
  {
    id: 'gemini-3.5-live-translate-preview',
    cost: {
      input: 3.5 / 1e6,
      output: 21.0 / 1e6,
      audioInput: 3.5 / 1e6,
      audioOutput: 21.0 / 1e6,
    },
  },

  // Gemini 3.1 models.
  ...['gemini-3.1-pro-preview', 'gemini-3.1-pro-preview-customtools', 'gemini-pro-latest'].map(
    (id) => ({
      id,
      cost: {
        ...GEMINI_3_PRO_COST,
        priorityMultiplier: 1.8,
        flexMultiplier: 0.5,
        flexCacheRead: GEMINI_3_PRO_COST.cacheRead,
      },
      tieredCost: {
        ...GEMINI_3_PRO_TIERED_COST,
        above: {
          ...GEMINI_3_PRO_TIERED_COST.above,
          priorityMultiplier: 1.8,
          flexMultiplier: 0.5,
          flexCacheRead: GEMINI_3_PRO_TIERED_COST.above.cacheRead,
        },
      },
    }),
  ),
  // gemini-3.1-flash-lite (GA) and its retired preview alias share Flash-Lite pricing. The preview
  // entry is retained for historical saved-evaluation cost scoring.
  ...['gemini-3.1-flash-lite', 'gemini-3.1-flash-lite-preview', 'gemini-flash-lite-latest'].map(
    (id) => ({
      id,
      cost: {
        input: 0.25 / 1e6,
        output: 1.5 / 1e6,
        cacheRead: 0.025 / 1e6,
        cacheReadAudio: 0.05 / 1e6,
        audioInput: 0.5 / 1e6,
        ...(id === 'gemini-3.1-flash-lite-preview'
          ? {}
          : {
              priorityMultiplier: 1.8,
              priorityAudioInput: 0.9 / 1e6,
              flexMultiplier: 0.5,
              flexAudioInput: 0.25 / 1e6,
            }),
      },
      ...(id === 'gemini-3.1-flash-lite-preview' ? {} : { vertexRegionalPremium: 1.1 }),
    }),
  ),
  {
    id: 'gemini-3.1-flash-live-preview',
    cost: {
      input: 0.75 / 1e6,
      output: 4.5 / 1e6,
      audioInput: 3.0 / 1e6,
      audioOutput: 12.0 / 1e6,
      imageInput: 1.0 / 1e6,
      videoInputPerSecond: 0.000033333333333333335,
    },
  },
  {
    id: 'gemini-3.1-flash-tts-preview',
    cost: { input: 1 / 1e6, output: 20 / 1e6, audioOutput: 20 / 1e6 },
  },
  {
    id: 'gemini-live-2.5-flash-preview-native-audio-09-2025',
    cost: {
      input: 0.3 / 1e6,
      output: 2.0 / 1e6,
      cacheRead: 0.075 / 1e6,
      audioInput: 3.0 / 1e6,
      audioOutput: 12.0 / 1e6,
    },
  },
  ...['gemini-2.5-flash-native-audio-latest', 'gemini-2.5-flash-native-audio-preview-12-2025'].map(
    (id) => ({
      id,
      cost: { input: 0.5 / 1e6, output: 2.0 / 1e6, audioInput: 3.0 / 1e6, audioOutput: 12.0 / 1e6 },
    }),
  ),
  ...['gemini-2.5-flash-native-audio-preview-09-2025'].map((id) => ({
    id,
    cost: { input: 0.3 / 1e6, output: 2.5 / 1e6, audioInput: 1.0 / 1e6 },
  })),

  // Gemini 3.0 models (Preview)
  {
    id: 'gemini-3-flash-preview',
    cost: {
      input: 0.5 / 1e6,
      output: 3.0 / 1e6,
      cacheRead: 0.05 / 1e6,
      cacheReadAudio: 0.1 / 1e6,
      audioInput: 1.0 / 1e6,
      priorityMultiplier: 1.8,
      flexMultiplier: 0.5,
      flexCacheRead: 0.05 / 1e6,
      flexCacheReadAudio: 0.1 / 1e6,
    },
  },
  {
    id: 'gemini-3-pro-preview',
    cost: { ...GEMINI_3_PRO_COST, priorityMultiplier: 1.8 },
    tieredCost: {
      ...GEMINI_3_PRO_TIERED_COST,
      above: { ...GEMINI_3_PRO_TIERED_COST.above, priorityMultiplier: 1.8 },
    },
  },

  // Gemini 2.5 models
  ...['gemini-2.5-pro', 'gemini-2.5-computer-use-preview-10-2025'].map((id) => ({
    id,
    cost:
      id === 'gemini-2.5-computer-use-preview-10-2025'
        ? { input: 1.25 / 1e6, output: 10.0 / 1e6 }
        : GEMINI_2_5_PRO_COST,
    tieredCost:
      id === 'gemini-2.5-computer-use-preview-10-2025'
        ? { threshold: 200_000, above: { input: 2.5 / 1e6, output: 15.0 / 1e6 } }
        : GEMINI_2_5_PRO_TIERED_COST,
  })),
  {
    id: 'gemini-2.5-pro-preview-tts',
    cost: { input: 1 / 1e6, output: 20 / 1e6, audioOutput: 20 / 1e6 },
  },
  {
    id: 'gemini-2.5-flash-preview-tts',
    cost: { input: 0.5 / 1e6, output: 10 / 1e6, audioOutput: 10 / 1e6 },
  },
  ...['gemini-2.5-flash', 'gemini-2.5-flash-preview-04-17'].map((id) => ({
    id,
    cost: {
      input: 0.3 / 1e6,
      output: 2.5 / 1e6,
      cacheRead: 0.03 / 1e6,
      cacheReadAudio: 0.1 / 1e6,
      audioInput: 1.0 / 1e6,
    },
  })),
  {
    id: 'gemini-2.5-flash-lite',
    cost: {
      input: 0.1 / 1e6,
      output: 0.4 / 1e6,
      cacheRead: 0.01 / 1e6,
      cacheReadAudio: 0.03 / 1e6,
      audioInput: 0.3 / 1e6,
    },
  },

  // Retired Gemini 2.0 models retained for historical saved-evaluation cost scoring.
  ...['gemini-2.0-flash', 'gemini-2.0-flash-001'].map((id) => ({
    id,
    cost: {
      input: 0.1 / 1e6,
      output: 0.4 / 1e6,
      cacheRead: 0.025 / 1e6,
      cacheReadAudio: 0.175 / 1e6,
      audioInput: 0.7 / 1e6,
    },
    vertexCost: {
      input: 0.15 / 1e6,
      output: 0.6 / 1e6,
      cacheRead: 0.0375 / 1e6,
      audioInput: 1.0 / 1e6,
    },
  })),
  ...['gemini-2.0-flash-lite', 'gemini-2.0-flash-lite-001'].map((id) => ({
    id,
    cost: {
      input: 0.075 / 1e6,
      output: 0.3 / 1e6,
      cacheRead: 0.01875 / 1e6,
      audioInput: 0.075 / 1e6,
    },
  })),
  // Gemini 1.5 models
  {
    id: 'gemini-1.5-pro',
    cost: { input: 1.25 / 1e6, output: 5.0 / 1e6 },
    tieredCost: {
      threshold: 128_000,
      above: { input: 2.5 / 1e6, output: 10.0 / 1e6 },
    },
  },
  ...['gemini-1.5-pro-001', 'gemini-1.5-pro-002', 'gemini-1.5-pro-latest'].map((id) => ({
    id,
    cost: { input: 1.25 / 1e6, output: 5.0 / 1e6 },
    tieredCost: {
      threshold: 128_000,
      above: { input: 2.5 / 1e6, output: 10.0 / 1e6 },
    },
  })),
  ...['gemini-1.5-pro-preview-0409', 'gemini-1.5-pro-preview-0514'].map((id) => ({
    id,
    cost: { input: 1.25 / 1e6, output: 5.0 / 1e6 },
    tieredCost: {
      threshold: 128_000,
      above: { input: 2.5 / 1e6, output: 10.0 / 1e6 },
    },
  })),
  ...[
    'gemini-1.5-flash',
    'gemini-1.5-flash-001',
    'gemini-1.5-flash-002',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash-preview-0514',
  ].map((id) => ({
    id,
    cost: { input: 0.075 / 1e6, output: 0.3 / 1e6 },
    tieredCost: {
      threshold: 128_000,
      above: { input: 0.15 / 1e6, output: 0.6 / 1e6 },
    },
  })),
  ...['gemini-1.5-flash-8b', 'gemini-1.5-flash-8b-001', 'gemini-1.5-flash-8b-latest'].map((id) => ({
    id,
    cost: { input: 0.0375 / 1e6, output: 0.15 / 1e6 },
    tieredCost: {
      threshold: 128_000,
      above: { input: 0.075 / 1e6, output: 0.3 / 1e6 },
    },
  })),

  // Gemini 1.0 models
  ...[
    'gemini-1.0-pro',
    'gemini-1.0-pro-001',
    'gemini-1.0-pro-002',
    'gemini-1.0-pro-vision',
    'gemini-1.0-pro-vision-001',
  ].map((id) => ({
    id,
    cost: { input: 0.5 / 1e6, output: 1.5 / 1e6 },
  })),

  // Legacy aliases
  {
    id: 'gemini-pro',
    cost: { input: 0.5 / 1e6, output: 1.5 / 1e6 },
  },
  {
    id: 'gemini-pro-vision',
    cost: { input: 0.5 / 1e6, output: 1.5 / 1e6 },
  },

  // Gemini Robotics (1.5-preview is intentionally excluded as a shutdown model;
  // see the shutdown-models test in test/providers/google/util.test.ts). ER 1.6 remains
  // here for historical cost scoring until its announced August 31, 2026 shutdown.
  {
    id: 'gemini-robotics-er-1.6-preview',
    cost: { input: 1.0 / 1e6, output: 5.0 / 1e6, audioInput: 2.0 / 1e6 },
  },
  {
    id: 'gemini-robotics-er-2-preview',
    cost: { input: 2.0 / 1e6, output: 10.0 / 1e6, cacheRead: 0.2 / 1e6 },
  },
  {
    id: 'gemini-robotics-er-2-streaming-preview',
    cost: { input: 2.0 / 1e6, output: 10.0 / 1e6 },
  },

  // Gemini Embedding. Google's model page and changelog use `gemini-embedding-2-preview`, while its
  // lifecycle table uses `embedding-2-preview`. Retain both official preview IDs so existing configs
  // and saved results continue to receive historical cost estimates.
  ...['gemini-embedding-2', 'embedding-2-preview', 'gemini-embedding-2-preview'].map((id) => ({
    id,
    cost: { input: 0.2 / 1e6, output: 0 },
  })),
  {
    id: 'gemini-embedding-001',
    cost: { input: 0.15 / 1e6, output: 0 },
  },

  // Models without pricing (no cost field) - legacy PaLM, Gemma, MedLM, etc.
  { id: 'aqa' },
  { id: 'chat-bison' },
  { id: 'chat-bison-32k' },
  { id: 'chat-bison-32k@001' },
  { id: 'chat-bison-32k@002' },
  { id: 'chat-bison@001' },
  { id: 'chat-bison@002' },
  { id: 'codechat-bison' },
  { id: 'codechat-bison-32k' },
  { id: 'codechat-bison-32k@001' },
  { id: 'codechat-bison-32k@002' },
  { id: 'codechat-bison@001' },
  { id: 'codechat-bison@002' },
  { id: 'gemini-ultra' },
  { id: 'gemma' },
  { id: 'gemma-4-31b-it' },
  { id: 'gemma-4-26b-a4b-it' },
  { id: 'codegemma' },
  { id: 'paligemma' },
  { id: 'medlm-medium' },
  { id: 'medlm-large' },
];

/**
 * List of chat model IDs for backwards compatibility.
 * Used for model validation in ai.studio.ts.
 */
export const CHAT_MODELS = GOOGLE_MODELS.map((m) => m.id);
