import type { AzureModelCost, AzureVideoSize } from './types';

export const DEFAULT_AZURE_API_VERSION = '2024-12-01-preview';

/**
 * Default route for Microsoft MAI image generation models in Microsoft Foundry
 * (e.g. MAI-Image-2.5). Unlike Azure OpenAI image models, MAI image models are
 * served from a Microsoft-managed `/mai/v1/...` route rather than
 * `/openai/deployments/<name>/images/generations`, and they do not take an
 * `api-version` query parameter.
 *
 * @see https://learn.microsoft.com/azure/foundry/foundry-models/how-to/use-foundry-models-mai
 */
export const DEFAULT_AZURE_MAI_IMAGE_API_PATH = '/mai/v1/images/generations';

// =============================================================================
// Video Generation Constants (Sora)
// =============================================================================

/**
 * Default API version for Azure video generation
 */
export const DEFAULT_AZURE_VIDEO_API_VERSION = 'preview';

/**
 * Valid Azure Sora video dimensions (width x height)
 */
export const AZURE_VIDEO_DIMENSIONS: Record<AzureVideoSize, { width: number; height: number }> = {
  '480x480': { width: 480, height: 480 },
  '854x480': { width: 854, height: 480 },
  '720x720': { width: 720, height: 720 },
  '1280x720': { width: 1280, height: 720 },
  '1080x1080': { width: 1080, height: 1080 },
  '1920x1080': { width: 1920, height: 1080 },
};

/**
 * Valid Azure Sora durations in seconds
 */
export const AZURE_VIDEO_DURATIONS = [5, 10, 15, 20] as const;

/**
 * Azure Sora cost per second (estimate - actual pricing from Azure documentation)
 */
export const AZURE_SORA_COST_PER_SECOND = 0.1;

/**
 * Prompt-token count above which GPT-5.x models switch to their long-context
 * pricing tier. Matches OpenAI's own threshold (see `GPT_5_LONG_CONTEXT_THRESHOLD`
 * in `src/providers/openai/util.ts`).
 */
const GPT_5_LONG_CONTEXT_THRESHOLD = 272_000;

export const AZURE_MODELS: AzureModelCost[] = [
  // =============================================================================
  // GPT-5 Series (Latest Flagship)
  // Global Standard rates verified against the Azure Retail Prices API (prices.azure.com, eastus2)
  // =============================================================================
  ...modelsWithCost(['gpt-5'], { input: 1.25 / 1000000, output: 10 / 1000000 }),
  ...modelsWithCost(['gpt-5-2025-08-07'], { input: 1.25 / 1000000, output: 10 / 1000000 }),
  ...modelsWithCost(['gpt-5-pro'], { input: 15 / 1000000, output: 120 / 1000000 }),
  ...modelsWithCost(['gpt-5-pro-2025-10-06'], { input: 15 / 1000000, output: 120 / 1000000 }),
  ...modelsWithCost(['gpt-5.6', 'gpt-5.6-sol'], {
    input: 5 / 1000000,
    output: 30 / 1000000,
    cacheRead: 0.5 / 1000000,
    priorityMultiplier: 2,
    longContext: {
      threshold: GPT_5_LONG_CONTEXT_THRESHOLD,
      input: 10 / 1000000,
      output: 45 / 1000000,
      cacheRead: 1 / 1000000,
    },
  }),
  ...modelsWithCost(['gpt-5.6-terra'], {
    input: 2.5 / 1000000,
    output: 15 / 1000000,
    cacheRead: 0.25 / 1000000,
    priorityMultiplier: 2,
    longContext: {
      threshold: GPT_5_LONG_CONTEXT_THRESHOLD,
      input: 5 / 1000000,
      output: 22.5 / 1000000,
      cacheRead: 0.5 / 1000000,
    },
  }),
  ...modelsWithCost(['gpt-5.6-luna'], {
    input: 1 / 1000000,
    output: 6 / 1000000,
    cacheRead: 0.1 / 1000000,
    priorityMultiplier: 2,
    longContext: {
      threshold: GPT_5_LONG_CONTEXT_THRESHOLD,
      input: 2 / 1000000,
      output: 9 / 1000000,
      cacheRead: 0.2 / 1000000,
    },
  }),
  ...modelsWithCost(['gpt-5.4'], {
    input: 2.5 / 1000000,
    output: 15 / 1000000,
    longContext: {
      threshold: GPT_5_LONG_CONTEXT_THRESHOLD,
      input: 5 / 1000000,
      output: 22.5 / 1000000,
    },
  }),
  ...modelsWithCost(['gpt-5.4-2026-03-05'], {
    input: 2.5 / 1000000,
    output: 15 / 1000000,
    longContext: {
      threshold: GPT_5_LONG_CONTEXT_THRESHOLD,
      input: 5 / 1000000,
      output: 22.5 / 1000000,
    },
  }),
  ...modelsWithCost(['gpt-5.4-pro'], {
    input: 30 / 1000000,
    output: 180 / 1000000,
    cacheRead: 3 / 1000000,
    longContext: {
      threshold: GPT_5_LONG_CONTEXT_THRESHOLD,
      input: 60 / 1000000,
      output: 270 / 1000000,
      cacheRead: 6 / 1000000,
    },
  }),
  ...modelsWithCost(['gpt-5.4-pro-2026-03-05'], {
    input: 30 / 1000000,
    output: 180 / 1000000,
    cacheRead: 3 / 1000000,
    longContext: {
      threshold: GPT_5_LONG_CONTEXT_THRESHOLD,
      input: 60 / 1000000,
      output: 270 / 1000000,
      cacheRead: 6 / 1000000,
    },
  }),
  ...modelsWithCost(['gpt-5.4-mini', 'gpt-5.4-mini-2026-03-17'], {
    input: 0.75 / 1000000,
    output: 4.5 / 1000000,
    cacheRead: 0.075 / 1000000,
  }),
  ...modelsWithCost(['gpt-5.4-nano', 'gpt-5.4-nano-2026-03-17'], {
    input: 0.2 / 1000000,
    output: 1.25 / 1000000,
    cacheRead: 0.02 / 1000000,
  }),
  // gpt-5.5 / gpt-5.2 / gpt-5.3 — Global Standard rates verified against the Azure Retail Prices
  // API (prices.azure.com, serviceFamily 'AI + Machine Learning'). gpt-5.5 long-context is 10/45
  // above the threshold. gpt-5.2/5.3 chat and codex share 1.75/14.
  ...modelsWithCost(['gpt-5.5', 'gpt-5.5-2026-04-24'], {
    input: 5 / 1000000,
    output: 30 / 1000000,
    longContext: {
      threshold: GPT_5_LONG_CONTEXT_THRESHOLD,
      input: 10 / 1000000,
      output: 45 / 1000000,
    },
  }),
  // Azure's product name is `gpt-chat-latest`, distinct from OpenAI's `chat-latest`
  // API alias. Versioned deployment names use the same Global Standard rates.
  ...modelsWithCost(
    [
      'gpt-chat-latest',
      'gpt-chat-latest-2026-08-06',
      'gpt-chat-latest-2026-06-24',
      'gpt-chat-latest-2026-05-28',
      'gpt-chat-latest-2026-05-05',
    ],
    {
      input: 5 / 1000000,
      output: 30 / 1000000,
    },
  ),
  ...modelsWithCost(['gpt-5.2'], { input: 1.75 / 1000000, output: 14 / 1000000 }),
  ...modelsWithCost(['gpt-5.2-2025-12-11'], { input: 1.75 / 1000000, output: 14 / 1000000 }),
  ...modelsWithCost(['gpt-5.2-chat', 'gpt-5.2-chat-2025-12-11', 'gpt-5.2-chat-2026-02-10'], {
    input: 1.75 / 1000000,
    output: 14 / 1000000,
  }),
  ...modelsWithCost(['gpt-5.2-codex', 'gpt-5.2-codex-2026-01-14'], {
    input: 1.75 / 1000000,
    output: 14 / 1000000,
  }),
  ...modelsWithCost(['gpt-5.3-chat', 'gpt-5.3-chat-2026-03-03'], {
    input: 1.75 / 1000000,
    output: 14 / 1000000,
  }),
  ...modelsWithCost(['gpt-5.3-codex', 'gpt-5.3-codex-2026-02-24'], {
    input: 1.75 / 1000000,
    output: 14 / 1000000,
  }),
  ...modelsWithCost(['gpt-5.1-codex-max'], { input: 1.25 / 1000000, output: 10 / 1000000 }),
  ...modelsWithCost(['gpt-5-mini'], { input: 0.25 / 1000000, output: 2 / 1000000 }),
  ...modelsWithCost(['gpt-5-mini-2025-08-07'], { input: 0.25 / 1000000, output: 2 / 1000000 }),
  ...modelsWithCost(['gpt-5-nano'], { input: 0.05 / 1000000, output: 0.4 / 1000000 }),
  ...modelsWithCost(['gpt-5-nano-2025-08-07'], { input: 0.05 / 1000000, output: 0.4 / 1000000 }),
  ...modelsWithCost(['gpt-5-chat'], { input: 1.25 / 1000000, output: 10 / 1000000 }),
  ...modelsWithCost(['gpt-5-chat-2025-08-07'], { input: 1.25 / 1000000, output: 10 / 1000000 }),
  ...modelsWithCost(['gpt-5-chat-2025-10-03'], { input: 1.25 / 1000000, output: 10 / 1000000 }),
  ...modelsWithCost(['gpt-5-codex'], { input: 1.25 / 1000000, output: 10 / 1000000 }),
  ...modelsWithCost(['gpt-5-codex-2025-09-15'], { input: 1.25 / 1000000, output: 10 / 1000000 }),

  // =============================================================================
  // GPT-5.1 Series (Newest)
  // Global Standard rates verified against the Azure Retail Prices API (prices.azure.com, eastus2)
  // =============================================================================
  ...modelsWithCost(['gpt-5.1'], { input: 1.25 / 1000000, output: 10 / 1000000 }),
  ...modelsWithCost(['gpt-5.1-2025-11-13'], { input: 1.25 / 1000000, output: 10 / 1000000 }),
  ...modelsWithCost(['gpt-5.1-chat'], { input: 1.25 / 1000000, output: 10 / 1000000 }),
  ...modelsWithCost(['gpt-5.1-chat-2025-11-13'], { input: 1.25 / 1000000, output: 10 / 1000000 }),
  ...modelsWithCost(['gpt-5.1-codex'], { input: 1.25 / 1000000, output: 10 / 1000000 }),
  ...modelsWithCost(['gpt-5.1-codex-2025-11-13'], { input: 1.25 / 1000000, output: 10 / 1000000 }),
  ...modelsWithCost(['gpt-5.1-codex-mini'], { input: 0.25 / 1000000, output: 2 / 1000000 }),
  ...modelsWithCost(['gpt-5.1-codex-mini-2025-11-13'], {
    input: 0.25 / 1000000,
    output: 2 / 1000000,
  }),

  // =============================================================================
  // GPT-4.1 Series (1M Context)
  // =============================================================================
  ...modelsWithCost(['gpt-4.1'], { input: 2 / 1000000, output: 8 / 1000000 }),
  ...modelsWithCost(['gpt-4.1-2025-04-14'], { input: 2 / 1000000, output: 8 / 1000000 }),
  ...modelsWithCost(['gpt-4.1-mini'], { input: 0.4 / 1000000, output: 1.6 / 1000000 }),
  ...modelsWithCost(['gpt-4.1-mini-2025-04-14'], { input: 0.4 / 1000000, output: 1.6 / 1000000 }),
  ...modelsWithCost(['gpt-4.1-nano'], { input: 0.1 / 1000000, output: 0.4 / 1000000 }),
  ...modelsWithCost(['gpt-4.1-nano-2025-04-14'], { input: 0.1 / 1000000, output: 0.4 / 1000000 }),

  // =============================================================================
  // Reasoning Models (o-series)
  // =============================================================================
  ...modelsWithCost(['o4-mini'], { input: 1.1 / 1000000, output: 4.4 / 1000000 }),
  ...modelsWithCost(['o4-mini-2025-04-16'], { input: 1.1 / 1000000, output: 4.4 / 1000000 }),
  ...modelsWithCost(['o3'], { input: 2 / 1000000, output: 8 / 1000000 }),
  ...modelsWithCost(['o3-2025-04-16'], { input: 2 / 1000000, output: 8 / 1000000 }),
  ...modelsWithCost(['o3-pro'], { input: 20 / 1000000, output: 80 / 1000000 }),
  ...modelsWithCost(['o3-pro-2025-06-10'], { input: 20 / 1000000, output: 80 / 1000000 }),
  ...modelsWithCost(['o3-mini'], { input: 1.1 / 1000000, output: 4.4 / 1000000 }),
  ...modelsWithCost(['o3-mini-2025-01-31'], { input: 1.1 / 1000000, output: 4.4 / 1000000 }),
  ...modelsWithCost(['o3-deep-research'], { input: 10 / 1000000, output: 40 / 1000000 }),
  ...modelsWithCost(['o3-deep-research-2025-06-26'], { input: 10 / 1000000, output: 40 / 1000000 }),
  ...modelsWithCost(['o1'], { input: 15 / 1000000, output: 60 / 1000000 }),
  ...modelsWithCost(['o1-2024-12-17'], { input: 15 / 1000000, output: 60 / 1000000 }),
  ...modelsWithCost(['o1-preview'], { input: 15 / 1000000, output: 60 / 1000000 }),
  ...modelsWithCost(['o1-preview-2024-09-12'], { input: 15 / 1000000, output: 60 / 1000000 }),
  ...modelsWithCost(['o1-mini'], { input: 1.1 / 1000000, output: 4.4 / 1000000 }),
  ...modelsWithCost(['o1-mini-2024-09-12'], { input: 1.1 / 1000000, output: 4.4 / 1000000 }),

  // =============================================================================
  // GPT-4o Series
  // =============================================================================
  ...modelsWithCost(['gpt-4o'], { input: 2.5 / 1000000, output: 10 / 1000000 }),
  ...modelsWithCost(['gpt-4o-2024-11-20'], { input: 2.5 / 1000000, output: 10 / 1000000 }),
  ...modelsWithCost(['gpt-4o-2024-08-06'], { input: 2.5 / 1000000, output: 10 / 1000000 }),
  ...modelsWithCost(['gpt-4o-2024-05-13'], { input: 5 / 1000000, output: 15 / 1000000 }),
  ...modelsWithCost(['gpt-4o-mini'], { input: 0.15 / 1000000, output: 0.6 / 1000000 }),
  ...modelsWithCost(['gpt-4o-mini-2024-07-18'], { input: 0.15 / 1000000, output: 0.6 / 1000000 }),

  // =============================================================================
  // GPT-4o Audio & Realtime Models
  // =============================================================================
  ...modelsWithCost(['gpt-4o-realtime-preview'], {
    input: 5 / 1000000,
    output: 20 / 1000000,
    cacheRead: 2.5 / 1000000,
    audioInput: 40 / 1000000,
    audioOutput: 80 / 1000000,
  }),
  ...modelsWithCost(['gpt-4o-realtime-preview-2024-10-01'], {
    input: 5 / 1000000,
    output: 20 / 1000000,
    cacheRead: 2.5 / 1000000,
    cacheReadAudio: 20 / 1000000,
    audioInput: 100 / 1000000,
    audioOutput: 200 / 1000000,
  }),
  ...modelsWithCost(['gpt-4o-realtime-preview-2024-12-17'], {
    input: 5 / 1000000,
    output: 20 / 1000000,
    cacheRead: 2.5 / 1000000,
    audioInput: 40 / 1000000,
    audioOutput: 80 / 1000000,
  }),
  ...modelsWithCost(['gpt-4o-realtime-preview-2025-06-03'], {
    input: 5 / 1000000,
    output: 20 / 1000000,
    cacheRead: 2.5 / 1000000,
    audioInput: 40 / 1000000,
    audioOutput: 80 / 1000000,
  }),
  ...modelsWithCost(['gpt-4o-mini-realtime-preview'], {
    input: 0.6 / 1000000,
    output: 2.4 / 1000000,
    cacheRead: 0.3 / 1000000,
    cacheReadAudio: 0.3 / 1000000,
    audioInput: 10 / 1000000,
    audioOutput: 20 / 1000000,
  }),
  ...modelsWithCost(['gpt-4o-mini-realtime-preview-2024-12-17'], {
    input: 0.6 / 1000000,
    output: 2.4 / 1000000,
    cacheRead: 0.3 / 1000000,
    cacheReadAudio: 0.3 / 1000000,
    audioInput: 10 / 1000000,
    audioOutput: 20 / 1000000,
  }),
  ...modelsWithCost(['gpt-4o-audio-preview'], {
    input: 2.5 / 1000000,
    output: 10 / 1000000,
    audioInput: 40 / 1000000,
    audioOutput: 80 / 1000000,
  }),
  ...modelsWithCost(['gpt-4o-audio-preview-2024-12-17'], {
    input: 2.5 / 1000000,
    output: 10 / 1000000,
    audioInput: 40 / 1000000,
    audioOutput: 80 / 1000000,
  }),
  ...modelsWithCost(['gpt-4o-mini-audio-preview'], {
    input: 0.15 / 1000000,
    output: 0.6 / 1000000,
    audioInput: 10 / 1000000,
    audioOutput: 20 / 1000000,
  }),
  ...modelsWithCost(['gpt-4o-mini-audio-preview-2024-12-17'], {
    input: 0.15 / 1000000,
    output: 0.6 / 1000000,
    audioInput: 10 / 1000000,
    audioOutput: 20 / 1000000,
  }),
  ...modelsWithCost(['gpt-realtime'], {
    input: 4 / 1000000,
    output: 16 / 1000000,
    cacheRead: 0.4 / 1000000,
    cacheReadAudio: 0.4 / 1000000,
    cacheReadImage: 0.5 / 1000000,
    audioInput: 32 / 1000000,
    audioOutput: 64 / 1000000,
    imageInput: 5 / 1000000,
  }),
  ...modelsWithCost(['gpt-realtime-2025-08-28'], {
    input: 4 / 1000000,
    output: 16 / 1000000,
    cacheRead: 0.4 / 1000000,
    cacheReadAudio: 0.4 / 1000000,
    cacheReadImage: 0.5 / 1000000,
    audioInput: 32 / 1000000,
    audioOutput: 64 / 1000000,
    imageInput: 5 / 1000000,
  }),
  ...modelsWithCost(['gpt-realtime-1.5'], {
    input: 4 / 1000000,
    output: 16 / 1000000,
    cacheRead: 0.4 / 1000000,
    cacheReadAudio: 0.4 / 1000000,
    cacheReadImage: 0.5 / 1000000,
    audioInput: 32 / 1000000,
    audioOutput: 64 / 1000000,
    imageInput: 5 / 1000000,
  }),
  ...modelsWithCost(['gpt-realtime-1.5-2026-02-23'], {
    input: 4 / 1000000,
    output: 16 / 1000000,
    cacheRead: 0.4 / 1000000,
    cacheReadAudio: 0.4 / 1000000,
    cacheReadImage: 0.5 / 1000000,
    audioInput: 32 / 1000000,
    audioOutput: 64 / 1000000,
    imageInput: 5 / 1000000,
  }),
  ...modelsWithCost(['gpt-realtime-mini'], {
    input: 0.6 / 1000000,
    output: 2.4 / 1000000,
    cacheRead: 0.06 / 1000000,
    cacheReadAudio: 0.3 / 1000000,
    cacheReadImage: 0.08 / 1000000,
    audioInput: 10 / 1000000,
    audioOutput: 20 / 1000000,
    imageInput: 0.8 / 1000000,
  }),
  ...modelsWithCost(['gpt-realtime-mini-2025-10-06'], {
    input: 0.6 / 1000000,
    output: 2.4 / 1000000,
    cacheRead: 0.06 / 1000000,
    cacheReadAudio: 0.3 / 1000000,
    cacheReadImage: 0.08 / 1000000,
    audioInput: 10 / 1000000,
    audioOutput: 20 / 1000000,
    imageInput: 0.8 / 1000000,
  }),
  ...modelsWithCost(['gpt-audio'], {
    input: 2.5 / 1000000,
    output: 10 / 1000000,
    audioInput: 32 / 1000000,
    audioOutput: 64 / 1000000,
  }),
  ...modelsWithCost(['gpt-audio-2025-08-28'], {
    input: 2.5 / 1000000,
    output: 10 / 1000000,
    audioInput: 32 / 1000000,
    audioOutput: 64 / 1000000,
  }),
  ...modelsWithCost(['gpt-audio-1.5'], {
    input: 2.5 / 1000000,
    output: 10 / 1000000,
    audioInput: 32 / 1000000,
    audioOutput: 64 / 1000000,
  }),
  ...modelsWithCost(['gpt-audio-1.5-2026-02-23'], {
    input: 2.5 / 1000000,
    output: 10 / 1000000,
    audioInput: 32 / 1000000,
    audioOutput: 64 / 1000000,
  }),
  ...modelsWithCost(['gpt-audio-mini'], {
    input: 0.6 / 1000000,
    output: 2.4 / 1000000,
    audioInput: 10 / 1000000,
    audioOutput: 20 / 1000000,
  }),
  ...modelsWithCost(['gpt-audio-mini-2025-10-06'], {
    input: 0.6 / 1000000,
    output: 2.4 / 1000000,
    audioInput: 10 / 1000000,
    audioOutput: 20 / 1000000,
  }),

  // =============================================================================
  // GPT-4o Transcription Models
  // =============================================================================
  ...modelsWithCost(['gpt-4o-transcribe'], { input: 2.5 / 1000000, output: 10 / 1000000 }),
  ...modelsWithCost(['gpt-4o-transcribe-2025-03-20'], {
    input: 2.5 / 1000000,
    output: 10 / 1000000,
  }),
  ...modelsWithCost(['gpt-4o-mini-transcribe'], { input: 1.25 / 1000000, output: 5 / 1000000 }),
  ...modelsWithCost(['gpt-4o-mini-transcribe-2025-03-20'], {
    input: 1.25 / 1000000,
    output: 5 / 1000000,
  }),
  ...modelsWithCost(['gpt-4o-transcribe-diarize'], { input: 2.5 / 1000000, output: 10 / 1000000 }),
  ...modelsWithCost(['gpt-4o-transcribe-diarize-2025-10-15'], {
    input: 2.5 / 1000000,
    output: 10 / 1000000,
  }),
  ...modelsWithCost(['gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-03-20'], {
    input: 0.6 / 1000000,
    output: 12 / 1000000,
    audioOutput: 12 / 1000000,
  }),

  // =============================================================================
  // GPT-4 Legacy
  // =============================================================================
  ...modelsWithCost(['gpt-4'], { input: 30 / 1000000, output: 60 / 1000000 }),
  ...modelsWithCost(['gpt-4-32k'], { input: 60 / 1000000, output: 120 / 1000000 }),
  ...modelsWithCost(['gpt-4-turbo'], { input: 10 / 1000000, output: 30 / 1000000 }),
  ...modelsWithCost(['gpt-4-turbo-2024-04-09'], { input: 10 / 1000000, output: 30 / 1000000 }),
  ...modelsWithCost(['gpt-4-turbo-vision'], { input: 10 / 1000000, output: 30 / 1000000 }),

  // =============================================================================
  // GPT-3.5 Legacy
  // =============================================================================
  ...modelsWithCost(['gpt-35-turbo'], { input: 0.5 / 1000000, output: 1.5 / 1000000 }),
  ...modelsWithCost(['gpt-35-turbo-0125'], { input: 0.5 / 1000000, output: 1.5 / 1000000 }),
  ...modelsWithCost(['gpt-35-turbo-1106'], { input: 1 / 1000000, output: 2 / 1000000 }),
  ...modelsWithCost(['gpt-35-turbo-0613'], { input: 1.5 / 1000000, output: 2 / 1000000 }),
  ...modelsWithCost(['gpt-35-turbo-0301'], { input: 2 / 1000000, output: 2 / 1000000 }),
  ...modelsWithCost(['gpt-35-turbo-16k'], { input: 3 / 1000000, output: 4 / 1000000 }),
  ...modelsWithCost(['gpt-35-turbo-instruct'], { input: 1.5 / 1000000, output: 2 / 1000000 }),
  // OpenAI-style naming (for compatibility)
  ...modelsWithCost(['gpt-3.5-turbo'], { input: 0.5 / 1000000, output: 1.5 / 1000000 }),
  ...modelsWithCost(['gpt-3.5-turbo-0125'], { input: 0.5 / 1000000, output: 1.5 / 1000000 }),
  ...modelsWithCost(['gpt-3.5-turbo-instruct'], { input: 1.5 / 1000000, output: 2 / 1000000 }),

  // =============================================================================
  // Image Generation Models
  // =============================================================================
  ...modelsWithCost(['gpt-image-1'], {
    input: 5 / 1000000,
    output: 40 / 1000000,
    cacheRead: 1.25 / 1000000,
    imageInput: 10 / 1000000,
  }),
  ...modelsWithCost(['gpt-image-1-2025-04-15'], {
    input: 5 / 1000000,
    output: 40 / 1000000,
    cacheRead: 1.25 / 1000000,
    imageInput: 10 / 1000000,
  }),
  ...modelsWithCost(['gpt-image-1-mini'], {
    input: 2 / 1000000,
    output: 8 / 1000000,
    cacheRead: 0.2 / 1000000,
    imageInput: 2.5 / 1000000,
  }),
  ...modelsWithCost(['gpt-image-1-mini-2025-10-06'], {
    input: 2 / 1000000,
    output: 8 / 1000000,
    cacheRead: 0.2 / 1000000,
    imageInput: 2.5 / 1000000,
  }),
  ...modelsWithCost(['gpt-image-1.5'], {
    input: 5 / 1000000,
    output: 32 / 1000000,
    cacheRead: 1.25 / 1000000,
    imageInput: 8 / 1000000,
  }),
  ...modelsWithCost(['gpt-image-1.5-2025-12-16'], {
    input: 5 / 1000000,
    output: 32 / 1000000,
    cacheRead: 1.25 / 1000000,
    imageInput: 8 / 1000000,
  }),
  ...modelsWithCost(['gpt-image-2', 'gpt-image-2-2026-04-21'], {
    input: 5 / 1000000,
    output: 10 / 1000000,
    cacheRead: 1.25 / 1000000,
    imageInput: 8 / 1000000,
    imageOutput: 30 / 1000000,
  }),
  ...modelsWithCost(['dall-e-3'], { input: 40 / 1000000, output: 40 / 1000000 }),
  ...modelsWithCost(['dall-e-2'], { input: 20 / 1000000, output: 20 / 1000000 }),

  // =============================================================================
  // Embedding Models
  // =============================================================================
  ...modelsWithCost(['text-embedding-3-large'], { input: 0.13 / 1000000, output: 0.13 / 1000000 }),
  ...modelsWithCost(['text-embedding-3-small'], { input: 0.02 / 1000000, output: 0.02 / 1000000 }),
  ...modelsWithCost(['text-embedding-ada-002'], { input: 0.1 / 1000000, output: 0.1 / 1000000 }),

  // =============================================================================
  // Base/Legacy Models
  // =============================================================================
  ...modelsWithCost(['babbage-002'], { input: 0.4 / 1000000, output: 0.4 / 1000000 }),
  ...modelsWithCost(['davinci-002'], { input: 2 / 1000000, output: 2 / 1000000 }),
  ...modelsWithCost(['codex-mini'], { input: 1.5 / 1000000, output: 6 / 1000000 }),
  ...modelsWithCost(['codex-mini-2025-05-16'], { input: 1.5 / 1000000, output: 6 / 1000000 }),

  // =============================================================================
  // Anthropic Claude Models (via Azure AI Foundry)
  // =============================================================================
  ...modelsWithCost(['claude-fable-5-1'], {
    input: 10 / 1000000,
    output: 50 / 1000000,
    cacheRead: 0.25 / 1000000,
  }),
  ...modelsWithCost(['claude-mythos-5-1'], {
    input: 10 / 1000000,
    output: 50 / 1000000,
    cacheRead: 0.25 / 1000000,
  }),
  ...modelsWithCost(['claude-fable-5', 'claude-mythos-5'], {
    input: 10 / 1000000,
    output: 50 / 1000000,
  }),
  ...modelsWithCost(['claude-mythos-preview'], { input: 25 / 1000000, output: 125 / 1000000 }),
  ...modelsWithCost(['claude-opus-5-5'], {
    input: 4 / 1000000,
    output: 20 / 1000000,
    cacheRead: 0.2 / 1000000,
  }),
  ...modelsWithCost(['claude-sonnet-5-5'], {
    input: 2 / 1000000,
    output: 10 / 1000000,
    cacheRead: 0.2 / 1000000,
  }),
  ...modelsWithCost(['claude-opus-5'], { input: 5 / 1000000, output: 25 / 1000000 }),
  ...modelsWithCost(['claude-opus-4-8'], { input: 5 / 1000000, output: 25 / 1000000 }),
  ...modelsWithCost(['claude-opus-4-7'], { input: 5 / 1000000, output: 25 / 1000000 }),
  // Foundry bills Claude at Anthropic's API rates (see ANTHROPIC_MODELS).
  ...modelsWithCost(['claude-sonnet-5'], { input: 2 / 1000000, output: 10 / 1000000 }),
  ...modelsWithCost(['claude-sonnet-4-6'], { input: 3 / 1000000, output: 15 / 1000000 }),
  ...modelsWithCost(['claude-opus-4-6'], { input: 5 / 1000000, output: 25 / 1000000 }),
  ...modelsWithCost(['claude-opus-4-6-20260205'], { input: 5 / 1000000, output: 25 / 1000000 }),
  ...modelsWithCost(['claude-opus-4-5'], { input: 5 / 1000000, output: 25 / 1000000 }),
  ...modelsWithCost(['claude-opus-4-5-20251101'], { input: 5 / 1000000, output: 25 / 1000000 }),
  ...modelsWithCost(['claude-opus-4-1'], { input: 15 / 1000000, output: 75 / 1000000 }),
  ...modelsWithCost(['claude-opus-4-1-20250805'], { input: 15 / 1000000, output: 75 / 1000000 }),
  ...modelsWithCost(['claude-sonnet-4-5'], { input: 3 / 1000000, output: 15 / 1000000 }),
  ...modelsWithCost(['claude-sonnet-4-5-20250929'], { input: 3 / 1000000, output: 15 / 1000000 }),
  ...modelsWithCost(['claude-haiku-4-5'], { input: 1 / 1000000, output: 5 / 1000000 }),
  ...modelsWithCost(['claude-haiku-4-5-20251001'], { input: 1 / 1000000, output: 5 / 1000000 }),

  // =============================================================================
  // Meta Llama Models (via Azure AI Foundry)
  // =============================================================================
  ...modelsWithCost(['Llama-4-Maverick-17B-128E-Instruct-FP8'], {
    input: 0.22 / 1000000,
    output: 0.88 / 1000000,
  }),
  ...modelsWithCost(['Llama-4-Scout-17B-16E-Instruct'], {
    input: 0.17 / 1000000,
    output: 0.68 / 1000000,
  }),
  ...modelsWithCost(['Llama-3.3-70B-Instruct'], { input: 0.37 / 1000000, output: 0.37 / 1000000 }),
  ...modelsWithCost(['Llama-3.2-90B-Vision-Instruct'], {
    input: 0.99 / 1000000,
    output: 0.99 / 1000000,
  }),
  ...modelsWithCost(['Llama-3.2-11B-Vision-Instruct'], {
    input: 0.037 / 1000000,
    output: 0.037 / 1000000,
  }),
  ...modelsWithCost(['Meta-Llama-3.1-405B-Instruct'], {
    input: 2.1 / 1000000,
    output: 2.1 / 1000000,
  }),
  ...modelsWithCost(['Meta-Llama-3.1-70B-Instruct'], {
    input: 0.37 / 1000000,
    output: 0.37 / 1000000,
  }),
  ...modelsWithCost(['Meta-Llama-3.1-8B-Instruct'], {
    input: 0.03 / 1000000,
    output: 0.03 / 1000000,
  }),
  ...modelsWithCost(['Meta-Llama-3-70B-Instruct'], {
    input: 0.37 / 1000000,
    output: 0.37 / 1000000,
  }),
  ...modelsWithCost(['Meta-Llama-3-8B-Instruct'], {
    input: 0.03 / 1000000,
    output: 0.03 / 1000000,
  }),

  // =============================================================================
  // DeepSeek Models (via Azure AI Foundry)
  // =============================================================================
  ...modelsWithCost(['DeepSeek-R1'], { input: 0.55 / 1000000, output: 2.19 / 1000000 }),
  ...modelsWithCost(['DeepSeek-R1-0528'], { input: 0.55 / 1000000, output: 2.19 / 1000000 }),
  ...modelsWithCost(['DeepSeek-V3'], { input: 0.27 / 1000000, output: 1.1 / 1000000 }),
  ...modelsWithCost(['DeepSeek-V3-0324'], { input: 0.27 / 1000000, output: 1.1 / 1000000 }),
  ...modelsWithCost(['DeepSeek-V3.1'], { input: 0.27 / 1000000, output: 1.1 / 1000000 }),
  // DeepSeek V3.2 / V4 — Global Standard rates from the Azure Retail Prices API (prices.azure.com).
  ...modelsWithCost(['DeepSeek-V3.2'], { input: 0.58 / 1000000, output: 1.68 / 1000000 }),
  ...modelsWithCost(['DeepSeek-V3.2-Speciale'], { input: 0.58 / 1000000, output: 1.68 / 1000000 }),
  ...modelsWithCost(['DeepSeek-V4-Flash'], { input: 0.19 / 1000000, output: 0.51 / 1000000 }),
  ...modelsWithCost(['DeepSeek-V4-Pro'], { input: 1.74 / 1000000, output: 3.48 / 1000000 }),

  // =============================================================================
  // MoonshotAI Kimi Models (via Azure AI Foundry) — Global Standard (prices.azure.com)
  // Kimi-K2.7-Code is a current Preview model, but is intentionally omitted from this pricing
  // table until the Azure Retail Prices API exposes an unambiguous matching meter.
  // =============================================================================
  ...modelsWithCost(['Kimi-K2-Thinking'], { input: 0.6 / 1000000, output: 2.5 / 1000000 }),
  ...modelsWithCost(['Kimi-K2.5'], { input: 0.6 / 1000000, output: 3 / 1000000 }),
  ...modelsWithCost(['Kimi-K2.6'], { input: 0.95 / 1000000, output: 4 / 1000000 }),

  // =============================================================================
  // xAI Grok Models (via Azure AI Foundry)
  // Current models; grok-4.3 is Preview. grok-4-20 reasoning variants are intentionally omitted
  // because Azure's Retail Prices API does not expose an unambiguous matching meter.
  // =============================================================================
  ...modelsWithCost(['grok-4'], { input: 3 / 1000000, output: 15 / 1000000 }),
  ...modelsWithCost(['grok-code-fast-1'], { input: 0.2 / 1000000, output: 1.5 / 1000000 }),
  ...modelsWithCost(['grok-4.3'], { input: 1.25 / 1000000, output: 2.5 / 1000000 }),
  ...modelsWithCost(['grok-4-1-fast-reasoning'], { input: 0.2 / 1000000, output: 0.5 / 1000000 }),
  ...modelsWithCost(['grok-4-1-fast-non-reasoning'], {
    input: 0.2 / 1000000,
    output: 0.5 / 1000000,
  }),
  // Retired May 1, 2026. Retained only so historical deployments still report their published
  // Global Standard cost; use the replacement IDs above for new deployments.
  ...modelsWithCost(['grok-4-fast-reasoning'], { input: 0.2 / 1000000, output: 0.5 / 1000000 }),
  ...modelsWithCost(['grok-4-fast-non-reasoning'], { input: 0.2 / 1000000, output: 0.5 / 1000000 }),
  ...modelsWithCost(['grok-3'], { input: 3 / 1000000, output: 15 / 1000000 }),
  ...modelsWithCost(['grok-3-mini'], { input: 0.25 / 1000000, output: 1.27 / 1000000 }),

  // =============================================================================
  // Microsoft Phi Models (via Azure AI Foundry)
  // =============================================================================
  ...modelsWithCost(['Phi-4'], { input: 0.07 / 1000000, output: 0.14 / 1000000 }),
  ...modelsWithCost(['Phi-4-reasoning'], { input: 0.07 / 1000000, output: 0.14 / 1000000 }),
  ...modelsWithCost(['Phi-4-mini-reasoning'], { input: 0.035 / 1000000, output: 0.07 / 1000000 }),
  ...modelsWithCost(['Phi-4-mini-instruct'], { input: 0.035 / 1000000, output: 0.07 / 1000000 }),
  ...modelsWithCost(['Phi-4-multimodal-instruct'], {
    input: 0.08 / 1000000,
    output: 0.32 / 1000000,
    audioInput: 4 / 1000000,
  }),
  ...modelsWithCost(['Phi-3.5-MoE-instruct'], { input: 0.26 / 1000000, output: 0.52 / 1000000 }),
  ...modelsWithCost(['Phi-3.5-mini-instruct'], { input: 0.026 / 1000000, output: 0.052 / 1000000 }),
  ...modelsWithCost(['Phi-3.5-vision-instruct'], {
    input: 0.026 / 1000000,
    output: 0.052 / 1000000,
  }),
  ...modelsWithCost(['Phi-3-medium-128k-instruct'], {
    input: 0.14 / 1000000,
    output: 0.14 / 1000000,
  }),
  ...modelsWithCost(['Phi-3-small-128k-instruct'], {
    input: 0.052 / 1000000,
    output: 0.052 / 1000000,
  }),
  ...modelsWithCost(['Phi-3-mini-128k-instruct'], {
    input: 0.026 / 1000000,
    output: 0.026 / 1000000,
  }),
  // Phi-3 4K/8K context variants — same Global Standard rate as their 128K counterparts per the
  // Azure Retail Prices API (prices.azure.com).
  ...modelsWithCost(['Phi-3-medium-4k-instruct'], {
    input: 0.17 / 1000000,
    output: 0.68 / 1000000,
  }),
  ...modelsWithCost(['Phi-3-mini-4k-instruct'], { input: 0.13 / 1000000, output: 0.52 / 1000000 }),
  ...modelsWithCost(['Phi-3-small-8k-instruct'], { input: 0.15 / 1000000, output: 0.6 / 1000000 }),

  // =============================================================================
  // OpenAI open-weight (gpt-oss) via Azure AI Foundry — Global Standard (prices.azure.com).
  // gpt-oss-20b is intentionally omitted: Azure exposes only fine-tuning meters for it, with no
  // base Global Standard inference rate, so it is left unpriced rather than guessed.
  // =============================================================================
  ...modelsWithCost(['gpt-oss-120b'], { input: 0.15 / 1000000, output: 0.6 / 1000000 }),

  // =============================================================================
  // Mistral Models (via Azure AI Foundry)
  // =============================================================================
  ...modelsWithCost(['Mistral-Large-3'], { input: 0.5 / 1000000, output: 1.5 / 1000000 }),
  ...modelsWithCost(['mistral-medium-3-5'], { input: 1.5 / 1000000, output: 7.5 / 1000000 }),
  ...modelsWithCost(['Mistral-Large-2411'], { input: 2 / 1000000, output: 6 / 1000000 }),
  ...modelsWithCost(['Mistral-large-2407'], { input: 2 / 1000000, output: 6 / 1000000 }),
  ...modelsWithCost(['Mistral-large'], { input: 2 / 1000000, output: 6 / 1000000 }),
  ...modelsWithCost(['mistral-medium-2505'], { input: 0.4 / 1000000, output: 1.5 / 1000000 }),
  ...modelsWithCost(['mistral-small-2503'], { input: 0.1 / 1000000, output: 0.3 / 1000000 }),
  ...modelsWithCost(['Mistral-small'], { input: 0.1 / 1000000, output: 0.3 / 1000000 }),
  ...modelsWithCost(['Mistral-Nemo'], { input: 0.15 / 1000000, output: 0.15 / 1000000 }),
  ...modelsWithCost(['Ministral-3B'], { input: 0.04 / 1000000, output: 0.04 / 1000000 }),
  ...modelsWithCost(['Codestral-2501'], { input: 0.3 / 1000000, output: 0.9 / 1000000 }),
  ...modelsWithCost(['mistral-document-ai-2505'], { input: 0.5 / 1000000, output: 1 / 1000000 }),

  // =============================================================================
  // Cohere Models (via Azure AI Foundry)
  // =============================================================================
  ...modelsWithCost(['cohere-command-a'], { input: 2.5 / 1000000, output: 10 / 1000000 }),
  ...modelsWithCost(['Cohere-command-a-plus-05-2026'], {
    input: 0.8 / 1000000,
    output: 3.2 / 1000000,
  }),
  // Retired May 12, 2026. Retained for historical deployment cost recognition.
  ...modelsWithCost(['Cohere-command-r-plus'], { input: 2.5 / 1000000, output: 10 / 1000000 }),
  ...modelsWithCost(['Cohere-command-r-plus-08-2024'], {
    input: 2.5 / 1000000,
    output: 10 / 1000000,
  }),
  ...modelsWithCost(['Cohere-command-r'], { input: 0.15 / 1000000, output: 0.6 / 1000000 }),
  ...modelsWithCost(['Cohere-command-r-08-2024'], { input: 0.15 / 1000000, output: 0.6 / 1000000 }),
  ...modelsWithCost(['Cohere-embed-v3-english'], { input: 0.1 / 1000000, output: 0.1 / 1000000 }),
  ...modelsWithCost(['Cohere-embed-v3-multilingual'], {
    input: 0.1 / 1000000,
    output: 0.1 / 1000000,
  }),
  ...modelsWithCost(['embed-v-4-0'], { input: 0.1 / 1000000, output: 0.1 / 1000000 }),

  // =============================================================================
  // AI21 Labs Models (via Azure AI Foundry)
  // =============================================================================
  ...modelsWithCost(['AI21-Jamba-1.5-Large'], { input: 0.2 / 1000000, output: 0.8 / 1000000 }),
  ...modelsWithCost(['AI21-Jamba-1.5-Mini'], { input: 0.02 / 1000000, output: 0.08 / 1000000 }),
  ...modelsWithCost(['AI21-Jamba-Instruct'], { input: 0.5 / 1000000, output: 0.7 / 1000000 }),

  // =============================================================================
  // Core42 Models (via Azure AI Foundry)
  // =============================================================================
  ...modelsWithCost(['jais-30b-chat'], { input: 0.1 / 1000000, output: 0.1 / 1000000 }),
  ...modelsWithCost(['JAIS-70b-chat'], { input: 0.2 / 1000000, output: 0.2 / 1000000 }),
  ...modelsWithCost(['Falcon3-7B-Instruct'], { input: 0.05 / 1000000, output: 0.05 / 1000000 }),

  // =============================================================================
  // Microsoft MAI Models (Foundry Models sold by Azure)
  // Microsoft's first-party model family. Image models are billed per token; the
  // `/mai/v1/images` route reports token counts either under a `usage` object
  // (num_output_tokens / num_input_text_tokens / num_input_image_tokens) or, in
  // an older shape, as a top-level `num_output_tokens`. AzureImageProvider reads
  // both and prices input + output. Cost lookup is keyed by the model id, so set
  // `model` in the provider config (deployment names can't contain the dots in
  // ids like `MAI-Image-2.5`) to enable cost reporting. Rates marked
  // "provisional" are estimates pending published pricing.
  // =============================================================================
  // Reasoning chat model (DeepSeek-R1 lineage). Provisional pricing mirrors
  // DeepSeek-R1 on Foundry pending a published MAI-DS-R1 rate.
  ...modelsWithCost(['MAI-DS-R1'], { input: 0.55 / 1000000, output: 2.19 / 1000000 }),
  // Text-to-image. Text input $5/1M; image output $33/1M (Microsoft).
  ...modelsWithCost(['MAI-Image-2'], { input: 5 / 1000000, output: 33 / 1000000 }),
  // Efficient image. Text input $5/1M; image output $19.50/1M (Microsoft).
  ...modelsWithCost(['MAI-Image-2e'], { input: 5 / 1000000, output: 19.5 / 1000000 }),
  // Flagship text-to-image + image edits. Text input $5/1M confirmed; image
  // output rate provisional.
  ...modelsWithCost(['MAI-Image-2.5'], { input: 5 / 1000000, output: 33 / 1000000 }),
  // Efficient flagship image variant. Pricing provisional (flash tier).
  ...modelsWithCost(['MAI-Image-2.5-Flash'], { input: 5 / 1000000, output: 19.5 / 1000000 }),
];

function modelsWithCost(ids: string[], cost: AzureModelCost['cost']): AzureModelCost[] {
  return ids.map((id) => ({
    id,
    cost: { ...cost, ...(cost.longContext && { longContext: { ...cost.longContext } }) },
  }));
}
