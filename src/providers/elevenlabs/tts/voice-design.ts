/**
 * Voice Design and Remixing for ElevenLabs TTS
 *
 * Create custom voices from text descriptions or remix existing voices
 * to modify characteristics like gender, age, accent, style, and pacing.
 */

import logger from '../../../logger';
import { ElevenLabsClient } from '../client';

/**
 * Voice design configuration
 */
export interface VoiceDesignConfig {
  description: string; // Text description of desired voice (e.g., "A warm, friendly female voice with a slight British accent")
  gender?: 'male' | 'female';
  age?: 'young' | 'middle_aged' | 'old';
  accent?: string; // e.g., "british", "american", "australian"
  accentStrength?: number; // 0-2, default 1.0
  sampleText?: string; // Optional text to generate sample with
}

/**
 * Voice remix configuration
 */
export interface VoiceRemixConfig {
  gender?: 'male' | 'female';
  age?: 'young' | 'middle_aged' | 'old';
  accent?: string; // Target accent
  style?: string; // Voice style (e.g., "professional", "casual", "energetic")
  pacing?: 'slow' | 'normal' | 'fast';
  promptStrength?: 'low' | 'medium' | 'high' | 'max'; // How strongly to apply changes
}

/**
 * Voice generation response
 */
export interface GeneratedVoice {
  voiceId: string;
  name?: string;
  preview_url?: string;
  description?: string;
}

/**
 * Design a new voice from a text description
 *
 * This uses ElevenLabs Voice Generation API to create a custom voice
 * based on natural language description.
 */
export async function designVoice(
  client: ElevenLabsClient,
  config: VoiceDesignConfig,
): Promise<GeneratedVoice> {
  logger.debug('[ElevenLabs Voice Design] Generating voice', {
    description: config.description,
    gender: config.gender,
    age: config.age,
    accent: config.accent,
  });

  if (!config.description || config.description.trim().length === 0) {
    throw new Error('Voice description is required');
  }

  // Build request payload
  const payload: Record<string, any> = {
    voice_description: config.description,
    text: config.sampleText || 'This is a sample of the generated voice.',
  };

  if (config.gender) {
    payload.gender = config.gender;
  }

  if (config.age) {
    payload.age = config.age;
  }

  if (config.accent) {
    payload.accent = config.accent;
    payload.accent_strength = config.accentStrength ?? 1.0;
  }

  const response = await client.post<{
    voice_id: string;
    preview_url?: string;
  }>('/voice-generation/generate-voice', payload);

  logger.debug('[ElevenLabs Voice Design] Voice generated', {
    voiceId: response.voice_id,
  });

  return {
    voiceId: response.voice_id,
    preview_url: response.preview_url,
    description: config.description,
  };
}

/**
 * Remix an existing voice to modify its characteristics
 *
 * This creates a variation of an existing voice by adjusting parameters
 * like gender, age, accent, style, and pacing.
 */
export async function remixVoice(
  client: ElevenLabsClient,
  sourceVoiceId: string,
  config: VoiceRemixConfig,
  name?: string,
): Promise<GeneratedVoice> {
  logger.debug('[ElevenLabs Voice Remix] Remixing voice', {
    sourceVoiceId,
    changes: config,
  });

  if (!sourceVoiceId) {
    throw new Error('Source voice ID is required for remixing');
  }

  // Check if any remix parameters are provided
  const hasChanges =
    config.gender ||
    config.age ||
    config.accent ||
    config.style ||
    config.pacing ||
    config.promptStrength;

  if (!hasChanges) {
    throw new Error('At least one remix parameter must be specified');
  }

  // Build request payload
  const payload: Record<string, any> = {};

  if (config.gender) {
    payload.gender = config.gender;
  }

  if (config.age) {
    payload.age = config.age;
  }

  if (config.accent) {
    payload.accent = config.accent;
  }

  if (config.style) {
    payload.style = config.style;
  }

  if (config.pacing) {
    payload.pacing = config.pacing;
  }

  if (config.promptStrength) {
    payload.prompt_strength = config.promptStrength;
  } else {
    payload.prompt_strength = 'medium'; // Default
  }

  if (name) {
    payload.name = name;
  }

  const response = await client.post<{
    voice_id: string;
    name?: string;
  }>(`/voice-generation/${sourceVoiceId}/remix`, payload);

  logger.debug('[ElevenLabs Voice Remix] Voice remixed', {
    originalVoiceId: sourceVoiceId,
    remixedVoiceId: response.voice_id,
  });

  return {
    voiceId: response.voice_id,
    name: response.name,
  };
}
