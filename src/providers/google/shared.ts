/**
 * Interface for Google model cost with optional tiered pricing.
 * Tiered pricing applies when prompt tokens exceed a threshold.
 */
export interface GoogleModelCost {
  input: number;
  output: number;
  cacheRead?: number;
  audioInput?: number;
  audioOutput?: number;
  imageInput?: number;
  videoOutput?: number;
  priorityMultiplier?: number;
  priorityAudioInput?: number;
  flexMultiplier?: number;
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
 * Google AI Studio models with pricing data.
 * Prices are per token (from Google AI pricing page, converted from per-million).
 *
 * Note: Vertex AI may have different pricing for some models.
 */
export const GOOGLE_MODELS: GoogleModel[] = [
  // Gemini 3.5 models.
  {
    id: 'gemini-3.5-flash',
    cost: {
      input: 1.5 / 1e6,
      output: 9.0 / 1e6,
      cacheRead: 0.15 / 1e6,
      audioInput: 1.0 / 1e6,
      priorityMultiplier: 1.8,
    },
  },
  {
    id: 'gemini-flash-latest',
    cost: { input: 0.3 / 1e6, output: 2.5 / 1e6, cacheRead: 0.075 / 1e6, audioInput: 1.0 / 1e6 },
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

  // Gemini 3.1 models.
  ...['gemini-3.1-pro-preview', 'gemini-3.1-pro-preview-customtools'].map((id) => ({
    id,
    cost: {
      ...GEMINI_3_PRO_COST,
      priorityMultiplier: 1.8,
    },
    tieredCost: {
      ...GEMINI_3_PRO_TIERED_COST,
      above: {
        ...GEMINI_3_PRO_TIERED_COST.above,
        priorityMultiplier: 1.8,
      },
    },
  })),
  {
    id: 'gemini-pro-latest',
    cost: GEMINI_2_5_PRO_COST,
    tieredCost: GEMINI_2_5_PRO_TIERED_COST,
  },
  // gemini-3.1-flash-lite (GA) and its preview alias share Flash-Lite pricing.
  ...['gemini-3.1-flash-lite', 'gemini-3.1-flash-lite-preview'].map((id) => ({
    id,
    cost: {
      input: 0.25 / 1e6,
      output: 1.5 / 1e6,
      cacheRead: 0.025 / 1e6,
      audioInput: 0.5 / 1e6,
      ...(id === 'gemini-3.1-flash-lite'
        ? {
            priorityMultiplier: 1.8,
            priorityAudioInput: 0.5 / 1e6,
            flexMultiplier: 0.5,
            flexAudioInput: 0.5 / 1e6,
          }
        : {}),
    },
  })),
  {
    id: 'gemini-flash-lite-latest',
    cost: { input: 0.1 / 1e6, output: 0.4 / 1e6, cacheRead: 0.025 / 1e6, audioInput: 0.3 / 1e6 },
  },
  {
    id: 'gemini-3.1-flash-live-preview',
    cost: {
      input: 0.75 / 1e6,
      output: 4.5 / 1e6,
      audioInput: 3.0 / 1e6,
      audioOutput: 12.0 / 1e6,
      imageInput: 1.0 / 1e6,
    },
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
  ...[
    'gemini-2.5-flash-native-audio-latest',
    'gemini-2.5-flash-native-audio-preview-09-2025',
    'gemini-2.5-flash-native-audio-preview-12-2025',
  ].map((id) => ({
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
      audioInput: 1.0 / 1e6,
      priorityMultiplier: 1.8,
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
    cost: { ...GEMINI_2_5_PRO_COST, audioInput: 0.7 / 1e6 },
    tieredCost: {
      ...GEMINI_2_5_PRO_TIERED_COST,
      above: { ...GEMINI_2_5_PRO_TIERED_COST.above, audioInput: 0.7 / 1e6 },
    },
  },
  {
    id: 'gemini-2.5-flash-preview-tts',
    cost: { input: 0.3 / 1e6, output: 2.5 / 1e6 },
  },
  ...['gemini-2.5-flash', 'gemini-2.5-flash-preview-04-17'].map((id) => ({
    id,
    cost: { input: 0.3 / 1e6, output: 2.5 / 1e6, cacheRead: 0.03 / 1e6, audioInput: 1.0 / 1e6 },
  })),
  {
    id: 'gemini-2.5-flash-lite',
    cost: { input: 0.1 / 1e6, output: 0.4 / 1e6, cacheRead: 0.01 / 1e6, audioInput: 0.3 / 1e6 },
  },

  // Gemini 2.0 models
  ...['gemini-2.0-flash', 'gemini-2.0-flash-001'].map((id) => ({
    id,
    cost: {
      input: 0.1 / 1e6,
      output: 0.4 / 1e6,
      cacheRead: 0.025 / 1e6,
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
  // see the shutdown-models test in test/providers/google/util.test.ts)
  {
    id: 'gemini-robotics-er-1.6-preview',
    cost: { input: 1.0 / 1e6, output: 5.0 / 1e6 },
  },

  // Gemini Embedding
  ...['gemini-embedding-2', 'gemini-embedding-2-preview'].map((id) => ({
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
