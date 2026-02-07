/**
 * Interface for Google model cost with optional tiered pricing.
 * Tiered pricing applies when prompt tokens exceed a threshold.
 */
export interface GoogleModelCost {
  input: number;
  output: number;
}

export interface GoogleModelTieredCost {
  threshold: number;
  above: GoogleModelCost;
}

export interface GoogleModel {
  id: string;
  cost?: GoogleModelCost;
  tieredCost?: GoogleModelTieredCost;
}

/**
 * Google AI Studio models with pricing data.
 * Prices are per token (from Google AI pricing page, converted from per-million).
 *
 * Note: Vertex AI may have different pricing for some models.
 */
export const GOOGLE_MODELS: GoogleModel[] = [
  // Gemini 3.0 models (Preview)
  {
    id: 'gemini-3-flash-preview',
    cost: { input: 0.5 / 1e6, output: 3.0 / 1e6 },
  },
  {
    id: 'gemini-3-pro-preview',
    cost: { input: 2.0 / 1e6, output: 12.0 / 1e6 },
    tieredCost: {
      threshold: 200_000,
      above: { input: 4.0 / 1e6, output: 18.0 / 1e6 },
    },
  },

  // Gemini 2.5 models
  {
    id: 'gemini-2.5-pro',
    cost: { input: 1.25 / 1e6, output: 10.0 / 1e6 },
    tieredCost: {
      threshold: 200_000,
      above: { input: 2.5 / 1e6, output: 15.0 / 1e6 },
    },
  },
  ...[
    'gemini-2.5-pro-latest',
    'gemini-2.5-pro-preview-05-06',
    'gemini-2.5-pro-preview-06-05',
    'gemini-2.5-computer-use-preview-10-2025',
  ].map((id) => ({
    id,
    cost: { input: 1.25 / 1e6, output: 10.0 / 1e6 },
    tieredCost: {
      threshold: 200_000,
      above: { input: 2.5 / 1e6, output: 15.0 / 1e6 },
    },
  })),
  ...[
    'gemini-2.5-flash',
    'gemini-2.5-flash-latest',
    'gemini-2.5-flash-preview-04-17',
    'gemini-2.5-flash-preview-05-20',
  ].map((id) => ({
    id,
    cost: { input: 0.3 / 1e6, output: 2.5 / 1e6 },
  })),
  ...[
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash-lite-latest',
    'gemini-2.5-flash-lite-preview-09-2025',
  ].map((id) => ({
    id,
    cost: { input: 0.1 / 1e6, output: 0.4 / 1e6 },
  })),
  {
    id: 'gemini-2.5-flash-preview-09-2025',
    cost: { input: 0.3 / 1e6, output: 2.5 / 1e6 },
  },

  // Gemini 2.0 models
  ...['gemini-2.0-flash', 'gemini-2.0-flash-001', 'gemini-2.0-flash-exp'].map((id) => ({
    id,
    cost: { input: 0.1 / 1e6, output: 0.4 / 1e6 },
  })),
  ...[
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash-lite-001',
    'gemini-2.0-flash-lite-preview-02-05',
  ].map((id) => ({
    id,
    cost: { input: 0.075 / 1e6, output: 0.3 / 1e6 },
  })),
  {
    id: 'gemini-2.0-flash-thinking-exp',
    cost: { input: 0.1 / 1e6, output: 0.4 / 1e6 },
  },
  {
    id: 'gemini-2.0-pro',
    cost: { input: 1.25 / 1e6, output: 10.0 / 1e6 },
  },

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

  // Gemini Robotics
  {
    id: 'gemini-robotics-er-1.5-preview',
    cost: { input: 0.3 / 1e6, output: 2.5 / 1e6 },
  },

  // Gemini Embedding
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
