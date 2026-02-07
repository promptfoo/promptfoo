import type { AzureModelCost, AzureVideoSize } from './types';

export const DEFAULT_AZURE_API_VERSION = '2024-12-01-preview';

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

export const AZURE_MODELS: AzureModelCost[] = [
  // =============================================================================
  // GPT-5 Series (Latest Flagship)
  // Note: Pricing is provisional/estimated based on relative model capabilities
  // =============================================================================
  {
    id: 'gpt-5',
    cost: { input: 2.5 / 1000000, output: 10 / 1000000 },
  },
  {
    id: 'gpt-5-2025-08-07',
    cost: { input: 2.5 / 1000000, output: 10 / 1000000 },
  },
  {
    id: 'gpt-5-pro',
    cost: { input: 5 / 1000000, output: 20 / 1000000 },
  },
  {
    id: 'gpt-5-pro-2025-10-06',
    cost: { input: 5 / 1000000, output: 20 / 1000000 },
  },
  {
    id: 'gpt-5-mini',
    cost: { input: 0.4 / 1000000, output: 1.6 / 1000000 },
  },
  {
    id: 'gpt-5-mini-2025-08-07',
    cost: { input: 0.4 / 1000000, output: 1.6 / 1000000 },
  },
  {
    id: 'gpt-5-nano',
    cost: { input: 0.1 / 1000000, output: 0.4 / 1000000 },
  },
  {
    id: 'gpt-5-nano-2025-08-07',
    cost: { input: 0.1 / 1000000, output: 0.4 / 1000000 },
  },
  {
    id: 'gpt-5-chat',
    cost: { input: 2.5 / 1000000, output: 10 / 1000000 },
  },
  {
    id: 'gpt-5-chat-2025-08-07',
    cost: { input: 2.5 / 1000000, output: 10 / 1000000 },
  },
  {
    id: 'gpt-5-chat-2025-10-03',
    cost: { input: 2.5 / 1000000, output: 10 / 1000000 },
  },
  {
    id: 'gpt-5-codex',
    cost: { input: 2.5 / 1000000, output: 10 / 1000000 },
  },
  {
    id: 'gpt-5-codex-2025-09-15',
    cost: { input: 2.5 / 1000000, output: 10 / 1000000 },
  },

  // =============================================================================
  // GPT-5.1 Series (Newest)
  // Note: Pricing is provisional/estimated based on relative model capabilities
  // =============================================================================
  {
    id: 'gpt-5.1',
    cost: { input: 2.5 / 1000000, output: 10 / 1000000 },
  },
  {
    id: 'gpt-5.1-2025-11-13',
    cost: { input: 2.5 / 1000000, output: 10 / 1000000 },
  },
  {
    id: 'gpt-5.1-chat',
    cost: { input: 2.5 / 1000000, output: 10 / 1000000 },
  },
  {
    id: 'gpt-5.1-chat-2025-11-13',
    cost: { input: 2.5 / 1000000, output: 10 / 1000000 },
  },
  {
    id: 'gpt-5.1-codex',
    cost: { input: 2.5 / 1000000, output: 10 / 1000000 },
  },
  {
    id: 'gpt-5.1-codex-2025-11-13',
    cost: { input: 2.5 / 1000000, output: 10 / 1000000 },
  },
  {
    id: 'gpt-5.1-codex-mini',
    cost: { input: 0.4 / 1000000, output: 1.6 / 1000000 },
  },
  {
    id: 'gpt-5.1-codex-mini-2025-11-13',
    cost: { input: 0.4 / 1000000, output: 1.6 / 1000000 },
  },

  // =============================================================================
  // GPT-4.1 Series (1M Context)
  // =============================================================================
  {
    id: 'gpt-4.1',
    cost: { input: 2 / 1000000, output: 8 / 1000000 },
  },
  {
    id: 'gpt-4.1-2025-04-14',
    cost: { input: 2 / 1000000, output: 8 / 1000000 },
  },
  {
    id: 'gpt-4.1-mini',
    cost: { input: 0.4 / 1000000, output: 1.6 / 1000000 },
  },
  {
    id: 'gpt-4.1-mini-2025-04-14',
    cost: { input: 0.4 / 1000000, output: 1.6 / 1000000 },
  },
  {
    id: 'gpt-4.1-nano',
    cost: { input: 0.1 / 1000000, output: 0.4 / 1000000 },
  },
  {
    id: 'gpt-4.1-nano-2025-04-14',
    cost: { input: 0.1 / 1000000, output: 0.4 / 1000000 },
  },

  // =============================================================================
  // Reasoning Models (o-series)
  // =============================================================================
  {
    id: 'o4-mini',
    cost: { input: 1.1 / 1000000, output: 4.4 / 1000000 },
  },
  {
    id: 'o4-mini-2025-04-16',
    cost: { input: 1.1 / 1000000, output: 4.4 / 1000000 },
  },
  {
    id: 'o3',
    cost: { input: 10 / 1000000, output: 40 / 1000000 },
  },
  {
    id: 'o3-2025-04-16',
    cost: { input: 10 / 1000000, output: 40 / 1000000 },
  },
  {
    id: 'o3-pro',
    cost: { input: 20 / 1000000, output: 80 / 1000000 },
  },
  {
    id: 'o3-pro-2025-06-10',
    cost: { input: 20 / 1000000, output: 80 / 1000000 },
  },
  {
    id: 'o3-mini',
    cost: { input: 1.1 / 1000000, output: 4.4 / 1000000 },
  },
  {
    id: 'o3-mini-2025-01-31',
    cost: { input: 1.1 / 1000000, output: 4.4 / 1000000 },
  },
  {
    id: 'o3-deep-research',
    cost: { input: 10 / 1000000, output: 40 / 1000000 },
  },
  {
    id: 'o3-deep-research-2025-06-26',
    cost: { input: 10 / 1000000, output: 40 / 1000000 },
  },
  {
    id: 'o1',
    cost: { input: 15 / 1000000, output: 60 / 1000000 },
  },
  {
    id: 'o1-2024-12-17',
    cost: { input: 15 / 1000000, output: 60 / 1000000 },
  },
  {
    id: 'o1-preview',
    cost: { input: 15 / 1000000, output: 60 / 1000000 },
  },
  {
    id: 'o1-preview-2024-09-12',
    cost: { input: 15 / 1000000, output: 60 / 1000000 },
  },
  {
    id: 'o1-mini',
    cost: { input: 1.1 / 1000000, output: 4.4 / 1000000 },
  },
  {
    id: 'o1-mini-2024-09-12',
    cost: { input: 1.1 / 1000000, output: 4.4 / 1000000 },
  },

  // =============================================================================
  // GPT-4o Series
  // =============================================================================
  {
    id: 'gpt-4o',
    cost: { input: 2.5 / 1000000, output: 10 / 1000000 },
  },
  {
    id: 'gpt-4o-2024-11-20',
    cost: { input: 2.5 / 1000000, output: 10 / 1000000 },
  },
  {
    id: 'gpt-4o-2024-08-06',
    cost: { input: 2.5 / 1000000, output: 10 / 1000000 },
  },
  {
    id: 'gpt-4o-2024-05-13',
    cost: { input: 5 / 1000000, output: 15 / 1000000 },
  },
  {
    id: 'gpt-4o-mini',
    cost: { input: 0.15 / 1000000, output: 0.6 / 1000000 },
  },
  {
    id: 'gpt-4o-mini-2024-07-18',
    cost: { input: 0.15 / 1000000, output: 0.6 / 1000000 },
  },

  // =============================================================================
  // GPT-4o Audio & Realtime Models
  // =============================================================================
  {
    id: 'gpt-4o-realtime-preview',
    cost: { input: 5 / 1000000, output: 20 / 1000000 },
  },
  {
    id: 'gpt-4o-realtime-preview-2024-12-17',
    cost: { input: 5 / 1000000, output: 20 / 1000000 },
  },
  {
    id: 'gpt-4o-realtime-preview-2025-06-03',
    cost: { input: 5 / 1000000, output: 20 / 1000000 },
  },
  {
    id: 'gpt-4o-mini-realtime-preview',
    cost: { input: 0.6 / 1000000, output: 2.4 / 1000000 },
  },
  {
    id: 'gpt-4o-mini-realtime-preview-2024-12-17',
    cost: { input: 0.6 / 1000000, output: 2.4 / 1000000 },
  },
  {
    id: 'gpt-4o-audio-preview',
    cost: { input: 2.5 / 1000000, output: 10 / 1000000 },
  },
  {
    id: 'gpt-4o-audio-preview-2024-12-17',
    cost: { input: 2.5 / 1000000, output: 10 / 1000000 },
  },
  {
    id: 'gpt-4o-mini-audio-preview',
    cost: { input: 0.15 / 1000000, output: 0.6 / 1000000 },
  },
  {
    id: 'gpt-4o-mini-audio-preview-2024-12-17',
    cost: { input: 0.15 / 1000000, output: 0.6 / 1000000 },
  },
  {
    id: 'gpt-realtime',
    cost: { input: 5 / 1000000, output: 20 / 1000000 },
  },
  {
    id: 'gpt-realtime-2025-08-28',
    cost: { input: 5 / 1000000, output: 20 / 1000000 },
  },
  {
    id: 'gpt-realtime-mini',
    cost: { input: 0.6 / 1000000, output: 2.4 / 1000000 },
  },
  {
    id: 'gpt-realtime-mini-2025-10-06',
    cost: { input: 0.6 / 1000000, output: 2.4 / 1000000 },
  },
  {
    id: 'gpt-audio',
    cost: { input: 2.5 / 1000000, output: 10 / 1000000 },
  },
  {
    id: 'gpt-audio-2025-08-28',
    cost: { input: 2.5 / 1000000, output: 10 / 1000000 },
  },
  {
    id: 'gpt-audio-mini',
    cost: { input: 0.15 / 1000000, output: 0.6 / 1000000 },
  },
  {
    id: 'gpt-audio-mini-2025-10-06',
    cost: { input: 0.15 / 1000000, output: 0.6 / 1000000 },
  },

  // =============================================================================
  // GPT-4o Transcription Models
  // =============================================================================
  {
    id: 'gpt-4o-transcribe',
    cost: { input: 2.5 / 1000000, output: 10 / 1000000 },
  },
  {
    id: 'gpt-4o-transcribe-2025-03-20',
    cost: { input: 2.5 / 1000000, output: 10 / 1000000 },
  },
  {
    id: 'gpt-4o-mini-transcribe',
    cost: { input: 0.15 / 1000000, output: 0.6 / 1000000 },
  },
  {
    id: 'gpt-4o-mini-transcribe-2025-03-20',
    cost: { input: 0.15 / 1000000, output: 0.6 / 1000000 },
  },
  {
    id: 'gpt-4o-transcribe-diarize',
    cost: { input: 2.5 / 1000000, output: 10 / 1000000 },
  },
  {
    id: 'gpt-4o-transcribe-diarize-2025-10-15',
    cost: { input: 2.5 / 1000000, output: 10 / 1000000 },
  },
  {
    id: 'gpt-4o-mini-tts',
    cost: { input: 0.15 / 1000000, output: 0.6 / 1000000 },
  },
  {
    id: 'gpt-4o-mini-tts-2025-03-20',
    cost: { input: 0.15 / 1000000, output: 0.6 / 1000000 },
  },

  // =============================================================================
  // GPT-4 Legacy
  // =============================================================================
  {
    id: 'gpt-4',
    cost: { input: 30 / 1000000, output: 60 / 1000000 },
  },
  {
    id: 'gpt-4-32k',
    cost: { input: 60 / 1000000, output: 120 / 1000000 },
  },
  {
    id: 'gpt-4-turbo',
    cost: { input: 10 / 1000000, output: 30 / 1000000 },
  },
  {
    id: 'gpt-4-turbo-2024-04-09',
    cost: { input: 10 / 1000000, output: 30 / 1000000 },
  },
  {
    id: 'gpt-4-turbo-vision',
    cost: { input: 10 / 1000000, output: 30 / 1000000 },
  },

  // =============================================================================
  // GPT-3.5 Legacy
  // =============================================================================
  {
    id: 'gpt-35-turbo',
    cost: { input: 0.5 / 1000000, output: 1.5 / 1000000 },
  },
  {
    id: 'gpt-35-turbo-0125',
    cost: { input: 0.5 / 1000000, output: 1.5 / 1000000 },
  },
  {
    id: 'gpt-35-turbo-1106',
    cost: { input: 1 / 1000000, output: 2 / 1000000 },
  },
  {
    id: 'gpt-35-turbo-0613',
    cost: { input: 1.5 / 1000000, output: 2 / 1000000 },
  },
  {
    id: 'gpt-35-turbo-0301',
    cost: { input: 2 / 1000000, output: 2 / 1000000 },
  },
  {
    id: 'gpt-35-turbo-16k',
    cost: { input: 3 / 1000000, output: 4 / 1000000 },
  },
  {
    id: 'gpt-35-turbo-instruct',
    cost: { input: 1.5 / 1000000, output: 2 / 1000000 },
  },
  // OpenAI-style naming (for compatibility)
  {
    id: 'gpt-3.5-turbo',
    cost: { input: 0.5 / 1000000, output: 1.5 / 1000000 },
  },
  {
    id: 'gpt-3.5-turbo-0125',
    cost: { input: 0.5 / 1000000, output: 1.5 / 1000000 },
  },
  {
    id: 'gpt-3.5-turbo-instruct',
    cost: { input: 1.5 / 1000000, output: 2 / 1000000 },
  },

  // =============================================================================
  // Image Generation Models
  // =============================================================================
  {
    id: 'gpt-image-1',
    cost: { input: 5 / 1000000, output: 40 / 1000000 },
  },
  {
    id: 'gpt-image-1-2025-04-15',
    cost: { input: 5 / 1000000, output: 40 / 1000000 },
  },
  {
    id: 'gpt-image-1-mini',
    cost: { input: 1.25 / 1000000, output: 10 / 1000000 },
  },
  {
    id: 'gpt-image-1-mini-2025-10-06',
    cost: { input: 1.25 / 1000000, output: 10 / 1000000 },
  },
  {
    id: 'gpt-image-1.5',
    cost: { input: 8 / 1000000, output: 32 / 1000000 },
  },
  {
    id: 'gpt-image-1.5-2025-12-16',
    cost: { input: 8 / 1000000, output: 32 / 1000000 },
  },
  {
    id: 'dall-e-3',
    cost: { input: 40 / 1000000, output: 40 / 1000000 },
  },
  {
    id: 'dall-e-2',
    cost: { input: 20 / 1000000, output: 20 / 1000000 },
  },

  // =============================================================================
  // Embedding Models
  // =============================================================================
  {
    id: 'text-embedding-3-large',
    cost: { input: 0.13 / 1000000, output: 0.13 / 1000000 },
  },
  {
    id: 'text-embedding-3-small',
    cost: { input: 0.02 / 1000000, output: 0.02 / 1000000 },
  },
  {
    id: 'text-embedding-ada-002',
    cost: { input: 0.1 / 1000000, output: 0.1 / 1000000 },
  },

  // =============================================================================
  // Base/Legacy Models
  // =============================================================================
  {
    id: 'babbage-002',
    cost: { input: 0.4 / 1000000, output: 0.4 / 1000000 },
  },
  {
    id: 'davinci-002',
    cost: { input: 2 / 1000000, output: 2 / 1000000 },
  },
  {
    id: 'codex-mini',
    cost: { input: 1.5 / 1000000, output: 6 / 1000000 },
  },
  {
    id: 'codex-mini-2025-05-16',
    cost: { input: 1.5 / 1000000, output: 6 / 1000000 },
  },

  // =============================================================================
  // Anthropic Claude Models (via Azure AI Foundry)
  // =============================================================================
  {
    id: 'claude-opus-4-6',
    cost: { input: 5 / 1000000, output: 25 / 1000000 },
  },
  {
    id: 'claude-opus-4-6-20260205',
    cost: { input: 5 / 1000000, output: 25 / 1000000 },
  },
  {
    id: 'claude-opus-4-5',
    cost: { input: 5 / 1000000, output: 25 / 1000000 },
  },
  {
    id: 'claude-opus-4-5-20251101',
    cost: { input: 5 / 1000000, output: 25 / 1000000 },
  },
  {
    id: 'claude-opus-4-1',
    cost: { input: 15 / 1000000, output: 75 / 1000000 },
  },
  {
    id: 'claude-opus-4-1-20250805',
    cost: { input: 15 / 1000000, output: 75 / 1000000 },
  },
  {
    id: 'claude-sonnet-4-5',
    cost: { input: 3 / 1000000, output: 15 / 1000000 },
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    cost: { input: 3 / 1000000, output: 15 / 1000000 },
  },
  {
    id: 'claude-haiku-4-5',
    cost: { input: 0.8 / 1000000, output: 4 / 1000000 },
  },
  {
    id: 'claude-haiku-4-5-20251001',
    cost: { input: 0.8 / 1000000, output: 4 / 1000000 },
  },

  // =============================================================================
  // Meta Llama Models (via Azure AI Foundry)
  // =============================================================================
  {
    id: 'Llama-4-Maverick-17B-128E-Instruct-FP8',
    cost: { input: 0.22 / 1000000, output: 0.88 / 1000000 },
  },
  {
    id: 'Llama-4-Scout-17B-16E-Instruct',
    cost: { input: 0.17 / 1000000, output: 0.68 / 1000000 },
  },
  {
    id: 'Llama-3.3-70B-Instruct',
    cost: { input: 0.37 / 1000000, output: 0.37 / 1000000 },
  },
  {
    id: 'Llama-3.2-90B-Vision-Instruct',
    cost: { input: 0.99 / 1000000, output: 0.99 / 1000000 },
  },
  {
    id: 'Llama-3.2-11B-Vision-Instruct',
    cost: { input: 0.037 / 1000000, output: 0.037 / 1000000 },
  },
  {
    id: 'Meta-Llama-3.1-405B-Instruct',
    cost: { input: 2.1 / 1000000, output: 2.1 / 1000000 },
  },
  {
    id: 'Meta-Llama-3.1-70B-Instruct',
    cost: { input: 0.37 / 1000000, output: 0.37 / 1000000 },
  },
  {
    id: 'Meta-Llama-3.1-8B-Instruct',
    cost: { input: 0.03 / 1000000, output: 0.03 / 1000000 },
  },
  {
    id: 'Meta-Llama-3-70B-Instruct',
    cost: { input: 0.37 / 1000000, output: 0.37 / 1000000 },
  },
  {
    id: 'Meta-Llama-3-8B-Instruct',
    cost: { input: 0.03 / 1000000, output: 0.03 / 1000000 },
  },

  // =============================================================================
  // DeepSeek Models (via Azure AI Foundry)
  // =============================================================================
  {
    id: 'DeepSeek-R1',
    cost: { input: 0.55 / 1000000, output: 2.19 / 1000000 },
  },
  {
    id: 'DeepSeek-R1-0528',
    cost: { input: 0.55 / 1000000, output: 2.19 / 1000000 },
  },
  {
    id: 'DeepSeek-V3',
    cost: { input: 0.27 / 1000000, output: 1.1 / 1000000 },
  },
  {
    id: 'DeepSeek-V3-0324',
    cost: { input: 0.27 / 1000000, output: 1.1 / 1000000 },
  },
  {
    id: 'DeepSeek-V3.1',
    cost: { input: 0.27 / 1000000, output: 1.1 / 1000000 },
  },

  // =============================================================================
  // xAI Grok Models (via Azure AI Foundry)
  // =============================================================================
  {
    id: 'grok-4',
    cost: { input: 3 / 1000000, output: 15 / 1000000 },
  },
  {
    id: 'grok-4-fast-reasoning',
    cost: { input: 3 / 1000000, output: 15 / 1000000 },
  },
  {
    id: 'grok-4-fast-non-reasoning',
    cost: { input: 3 / 1000000, output: 15 / 1000000 },
  },
  {
    id: 'grok-3',
    cost: { input: 3 / 1000000, output: 15 / 1000000 },
  },
  {
    id: 'grok-3-mini',
    cost: { input: 0.3 / 1000000, output: 0.5 / 1000000 },
  },
  {
    id: 'grok-code-fast-1',
    cost: { input: 0.15 / 1000000, output: 0.6 / 1000000 },
  },

  // =============================================================================
  // Microsoft Phi Models (via Azure AI Foundry)
  // =============================================================================
  {
    id: 'Phi-4',
    cost: { input: 0.07 / 1000000, output: 0.14 / 1000000 },
  },
  {
    id: 'Phi-4-reasoning',
    cost: { input: 0.07 / 1000000, output: 0.14 / 1000000 },
  },
  {
    id: 'Phi-4-mini-reasoning',
    cost: { input: 0.035 / 1000000, output: 0.07 / 1000000 },
  },
  {
    id: 'Phi-4-mini-instruct',
    cost: { input: 0.035 / 1000000, output: 0.07 / 1000000 },
  },
  {
    id: 'Phi-4-multimodal-instruct',
    cost: { input: 0.07 / 1000000, output: 0.14 / 1000000 },
  },
  {
    id: 'Phi-3.5-MoE-instruct',
    cost: { input: 0.26 / 1000000, output: 0.52 / 1000000 },
  },
  {
    id: 'Phi-3.5-mini-instruct',
    cost: { input: 0.026 / 1000000, output: 0.052 / 1000000 },
  },
  {
    id: 'Phi-3.5-vision-instruct',
    cost: { input: 0.026 / 1000000, output: 0.052 / 1000000 },
  },
  {
    id: 'Phi-3-medium-128k-instruct',
    cost: { input: 0.14 / 1000000, output: 0.14 / 1000000 },
  },
  {
    id: 'Phi-3-small-128k-instruct',
    cost: { input: 0.052 / 1000000, output: 0.052 / 1000000 },
  },
  {
    id: 'Phi-3-mini-128k-instruct',
    cost: { input: 0.026 / 1000000, output: 0.026 / 1000000 },
  },

  // =============================================================================
  // Mistral Models (via Azure AI Foundry)
  // =============================================================================
  {
    id: 'Mistral-Large-2411',
    cost: { input: 2 / 1000000, output: 6 / 1000000 },
  },
  {
    id: 'Mistral-large-2407',
    cost: { input: 2 / 1000000, output: 6 / 1000000 },
  },
  {
    id: 'Mistral-large',
    cost: { input: 2 / 1000000, output: 6 / 1000000 },
  },
  {
    id: 'mistral-medium-2505',
    cost: { input: 0.4 / 1000000, output: 1.5 / 1000000 },
  },
  {
    id: 'mistral-small-2503',
    cost: { input: 0.1 / 1000000, output: 0.3 / 1000000 },
  },
  {
    id: 'Mistral-small',
    cost: { input: 0.1 / 1000000, output: 0.3 / 1000000 },
  },
  {
    id: 'Mistral-Nemo',
    cost: { input: 0.15 / 1000000, output: 0.15 / 1000000 },
  },
  {
    id: 'Ministral-3B',
    cost: { input: 0.04 / 1000000, output: 0.04 / 1000000 },
  },
  {
    id: 'Codestral-2501',
    cost: { input: 0.3 / 1000000, output: 0.9 / 1000000 },
  },
  {
    id: 'mistral-document-ai-2505',
    cost: { input: 0.5 / 1000000, output: 1 / 1000000 },
  },

  // =============================================================================
  // Cohere Models (via Azure AI Foundry)
  // =============================================================================
  {
    id: 'cohere-command-a',
    cost: { input: 2.5 / 1000000, output: 10 / 1000000 },
  },
  {
    id: 'Cohere-command-r-plus',
    cost: { input: 2.5 / 1000000, output: 10 / 1000000 },
  },
  {
    id: 'Cohere-command-r-plus-08-2024',
    cost: { input: 2.5 / 1000000, output: 10 / 1000000 },
  },
  {
    id: 'Cohere-command-r',
    cost: { input: 0.15 / 1000000, output: 0.6 / 1000000 },
  },
  {
    id: 'Cohere-command-r-08-2024',
    cost: { input: 0.15 / 1000000, output: 0.6 / 1000000 },
  },
  {
    id: 'Cohere-embed-v3-english',
    cost: { input: 0.1 / 1000000, output: 0.1 / 1000000 },
  },
  {
    id: 'Cohere-embed-v3-multilingual',
    cost: { input: 0.1 / 1000000, output: 0.1 / 1000000 },
  },
  {
    id: 'embed-v-4-0',
    cost: { input: 0.1 / 1000000, output: 0.1 / 1000000 },
  },

  // =============================================================================
  // AI21 Labs Models (via Azure AI Foundry)
  // =============================================================================
  {
    id: 'AI21-Jamba-1.5-Large',
    cost: { input: 0.2 / 1000000, output: 0.8 / 1000000 },
  },
  {
    id: 'AI21-Jamba-1.5-Mini',
    cost: { input: 0.02 / 1000000, output: 0.08 / 1000000 },
  },
  {
    id: 'AI21-Jamba-Instruct',
    cost: { input: 0.5 / 1000000, output: 0.7 / 1000000 },
  },

  // =============================================================================
  // Core42 Models (via Azure AI Foundry)
  // =============================================================================
  {
    id: 'jais-30b-chat',
    cost: { input: 0.1 / 1000000, output: 0.1 / 1000000 },
  },
  {
    id: 'JAIS-70b-chat',
    cost: { input: 0.2 / 1000000, output: 0.2 / 1000000 },
  },
  {
    id: 'Falcon3-7B-Instruct',
    cost: { input: 0.05 / 1000000, output: 0.05 / 1000000 },
  },
];
