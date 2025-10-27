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

/**
 * Clone a voice from audio samples
 *
 * Upload audio samples to create a voice clone. Requires clear audio
 * with minimal background noise.
 */
export async function cloneVoice(
  client: ElevenLabsClient,
  name: string,
  audioSamples: Buffer[],
  description?: string,
): Promise<GeneratedVoice> {
  logger.debug('[ElevenLabs Voice Clone] Cloning voice', {
    name,
    sampleCount: audioSamples.length,
  });

  if (!name || name.trim().length === 0) {
    throw new Error('Voice name is required');
  }

  if (audioSamples.length === 0) {
    throw new Error('At least one audio sample is required for voice cloning');
  }

  // Build multipart form data for multiple audio samples
  const formData = new FormData();
  formData.append('name', name);

  if (description) {
    formData.append('description', description);
  }

  // Add all audio samples with the field name 'files' (API expects this for multiple files)
  for (let i = 0; i < audioSamples.length; i++) {
    const sample = audioSamples[i];
    const fileName = `sample_${i}.mp3`;
    formData.append('files', new Blob([new Uint8Array(sample)], { type: 'audio/mpeg' }), fileName);
  }

  const response = await client.post<{
    voice_id: string;
    name: string;
  }>('/voices/add', formData);

  logger.debug('[ElevenLabs Voice Clone] Voice cloned', {
    voiceId: response.voice_id,
  });

  return {
    voiceId: response.voice_id,
    name: response.name,
    description,
  };
}

/**
 * Delete a generated or cloned voice
 */
export async function deleteVoice(client: ElevenLabsClient, voiceId: string): Promise<void> {
  logger.debug('[ElevenLabs Voice Design] Deleting voice', { voiceId });

  await client.delete(`/voices/${voiceId}`);

  logger.debug('[ElevenLabs Voice Design] Voice deleted', { voiceId });
}

/**
 * Get voice generation status
 *
 * Voice generation is asynchronous, this checks if generation is complete
 */
export async function getVoiceGenerationStatus(
  client: ElevenLabsClient,
  generationId: string,
): Promise<{
  status: 'processing' | 'completed' | 'failed';
  voice_id?: string;
  error?: string;
}> {
  logger.debug('[ElevenLabs Voice Design] Checking generation status', { generationId });

  const response = await client.get<{
    status: 'processing' | 'completed' | 'failed';
    voice_id?: string;
    error?: string;
  }>(`/voice-generation/status/${generationId}`);

  return response;
}

/**
 * Predefined voice design templates
 */
export const VOICE_DESIGN_TEMPLATES = {
  // Professional voices
  professionalMale: {
    description:
      'A confident, authoritative male voice with clear articulation, perfect for business presentations and corporate narration',
    gender: 'male' as const,
    age: 'middle_aged' as const,
    accent: 'american',
  },
  professionalFemale: {
    description:
      'A warm, professional female voice with excellent clarity, ideal for educational content and corporate training',
    gender: 'female' as const,
    age: 'middle_aged' as const,
    accent: 'american',
  },

  // Friendly voices
  friendlyMale: {
    description:
      'A casual, approachable male voice with a friendly tone, great for customer service and conversational content',
    gender: 'male' as const,
    age: 'young' as const,
    accent: 'american',
  },
  friendlyFemale: {
    description:
      'An energetic, friendly female voice with a smile in the tone, perfect for marketing and engaging content',
    gender: 'female' as const,
    age: 'young' as const,
    accent: 'american',
  },

  // Narrative voices
  narrativeMale: {
    description:
      'A deep, resonant male voice with storytelling quality, excellent for audiobooks and documentaries',
    gender: 'male' as const,
    age: 'middle_aged' as const,
    accent: 'british',
  },
  narrativeFemale: {
    description:
      'A soothing, expressive female voice with narrative flow, ideal for audiobooks and meditation content',
    gender: 'female' as const,
    age: 'middle_aged' as const,
    accent: 'british',
  },

  // Character voices
  elderly: {
    description:
      'A wise, gentle elderly voice with warmth and experience, perfect for character work and storytelling',
    age: 'old' as const,
  },
  energetic: {
    description:
      'A high-energy, enthusiastic voice with dynamic range, great for sports commentary and exciting content',
    age: 'young' as const,
  },
  calm: {
    description:
      'A tranquil, peaceful voice with soothing tones, ideal for meditation, relaxation, and ASMR content',
  },
};

/**
 * Create a voice from a predefined template
 */
export async function designVoiceFromTemplate(
  client: ElevenLabsClient,
  templateName: keyof typeof VOICE_DESIGN_TEMPLATES,
  customizations?: Partial<VoiceDesignConfig>,
): Promise<GeneratedVoice> {
  const template = VOICE_DESIGN_TEMPLATES[templateName];

  if (!template) {
    throw new Error(`Unknown voice design template: ${templateName}`);
  }

  const config: VoiceDesignConfig = {
    ...template,
    ...customizations,
  };

  return designVoice(client, config);
}
