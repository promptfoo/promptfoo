/**
 * Voice management utilities for ElevenLabs TTS
 */

import logger from '../../../logger';
import { ElevenLabsClient } from '../client';

/**
 * Popular pre-made voices
 */
export const POPULAR_VOICES = {
  // Female voices
  rachel: '21m00Tcm4TlvDq8ikWAM', // Calm, clear
  domi: 'AZnzlk1XvdvUeBnXmlld', // Strong, confident
  bella: 'EXAVITQu4vr4xnSDxMaL', // Soft, smooth
  elli: 'MF3mGyEYCl7XYWbV9V6O', // Energetic, friendly

  // Male voices
  clyde: '2EiwWnXFnvU5JabPnv8n', // Warm, grounded
  drew: '29vD33N1CtxCmqQRPOHJ', // Well-rounded
  paul: '5Q0t7uMcjvnagumLfvZi', // Casual, conversational
  josh: 'TxGEqnHWrfWFTfGW9XjX', // Deep, professional

  // Character voices
  adam: 'pNInz6obpgDQGcFmaJgB', // Narrative, storytelling
  antoni: 'ErXwobaYiN019PkySvjV', // Articulate, refined
  arnold: 'VR6AewLTigWG4xSOukaG', // Assertive, strong
  callum: 'N2lVS1w4EtoT3dr4eOWO', // Calm, trustworthy
  charlie: 'IKne3meq5aSn9XLyUdCD', // Natural, authentic
  charlotte: 'XB0fDUnXU5powFXDhCwa', // Expressive, dynamic
  daniel: 'onwK4e9ZLuTAKqWW03F9', // Authoritative, clear
  emily: 'LcfcDJNUP1GQjkzn1xUU', // Bright, engaging
  ethan: 'g5CIjZEefAph4nQFvHAz', // Balanced, versatile
  freya: 'jsCqWAovK2LkecY7zXl4', // Confident, mature
  george: 'JBFqnCBsd6RMkjVDRZzb', // Authoritative, commanding
  gigi: 'jBpfuIE2acCO8z3wKNLl', // Playful, youthful
  grace: 'oWAxZDx7w5VEj9dCyTzz', // Sophisticated, poised
  harry: 'SOYHLrjzK2X1ezoPC6cr', // Energetic, charismatic
  james: 'ZQe5CZNOzWyzPSCn5a3c', // Smooth, professional
  jeremy: 'bVMeCyTHy58xNoL34h3p', // Technical, precise
  jessie: 't0jbNlBVZ17f02VDIeMI', // Dynamic, versatile
  joseph: 'Zlb1dXrM653N07WRdFW3', // Warm, friendly
  lily: 'pFZP5JQG7iQjIQuC4Bku', // Gentle, soothing
  matilda: 'XrExE9yKIg1WjnnlVkGX', // Articulate, professional
  michael: 'flq6f7yk4E4fJM5XTYuZ', // Rich, resonant
  nicole: 'piTKgcLEGmPE4e6mEKli', // Clear, reliable
  patrick: 'ODq5zmih8GrVes37Dizd', // Distinctive, character
  rachel_emotional: '21m00Tcm4TlvDq8ikWAM', // Same as rachel but different context
  sam: 'yoZ06aMxZJJ28mfd3POQ', // Dynamic, energetic
  sarah: 'EXAVITQu4vr4xnSDxMaL', // Same as bella
  serena: 'pMsXgVXv3BLzUgSXRplE', // Pleasant, conversational
  thomas: 'GBv7mTt0atIp3Br8iCZE', // Friendly, approachable
};

/**
 * Voice metadata interface
 */
export interface VoiceInfo {
  voice_id: string;
  name: string;
  category?: string;
  description?: string;
  labels?: Record<string, string>;
  preview_url?: string;
  available_for_tiers?: string[];
  settings?: {
    stability?: number;
    similarity_boost?: number;
    style?: number;
    use_speaker_boost?: boolean;
  };
}

/**
 * Get all available voices from ElevenLabs
 */
export async function getAvailableVoices(client: ElevenLabsClient): Promise<VoiceInfo[]> {
  try {
    logger.debug('[ElevenLabs Voices] Fetching available voices');

    const response = await client.get<{ voices: VoiceInfo[] }>('/voices');

    logger.debug('[ElevenLabs Voices] Retrieved voices', {
      count: response.voices.length,
    });

    return response.voices;
  } catch (error) {
    logger.error('[ElevenLabs Voices] Failed to fetch voices', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Get voice by ID or name
 */
export async function getVoice(
  client: ElevenLabsClient,
  voiceIdOrName: string,
): Promise<VoiceInfo | null> {
  try {
    // Try as ID first
    try {
      logger.debug('[ElevenLabs Voices] Fetching voice by ID', { voiceId: voiceIdOrName });
      const response = await client.get<VoiceInfo>(`/voices/${voiceIdOrName}`);
      return response;
    } catch {
      // If ID lookup fails, try searching by name
      logger.debug('[ElevenLabs Voices] ID lookup failed, searching by name');
      const allVoices = await getAvailableVoices(client);
      const voice = allVoices.find((v) => v.name.toLowerCase() === voiceIdOrName.toLowerCase());

      if (voice) {
        logger.debug('[ElevenLabs Voices] Found voice by name', {
          name: voiceIdOrName,
          voiceId: voice.voice_id,
        });
        return voice;
      }

      logger.warn('[ElevenLabs Voices] Voice not found', { query: voiceIdOrName });
      return null;
    }
  } catch (error) {
    logger.error('[ElevenLabs Voices] Failed to get voice', {
      query: voiceIdOrName,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Resolve voice ID from name or ID
 */
export function resolveVoiceId(voiceNameOrId: string): string {
  // Check if it's a known popular voice name
  const popularVoiceId = POPULAR_VOICES[voiceNameOrId.toLowerCase() as keyof typeof POPULAR_VOICES];
  if (popularVoiceId) {
    logger.debug('[ElevenLabs Voices] Resolved popular voice', {
      name: voiceNameOrId,
      voiceId: popularVoiceId,
    });
    return popularVoiceId;
  }

  // Otherwise assume it's already a voice ID
  return voiceNameOrId;
}

/**
 * Recommended voice settings for different use cases
 */
export interface RecommendedSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
  speed: number;
}

/**
 * Get recommended voice settings for a use case
 */
export function getRecommendedSettings(
  useCase: 'podcast' | 'audiobook' | 'conversational' | 'dramatic',
): RecommendedSettings {
  const settings = {
    podcast: {
      stability: 0.7,
      similarity_boost: 0.75,
      style: 0.3,
      use_speaker_boost: true,
      speed: 1.0,
    },
    audiobook: {
      stability: 0.8,
      similarity_boost: 0.8,
      style: 0.2,
      use_speaker_boost: true,
      speed: 0.9,
    },
    conversational: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.5,
      use_speaker_boost: true,
      speed: 1.0,
    },
    dramatic: {
      stability: 0.4,
      similarity_boost: 0.7,
      style: 0.8,
      use_speaker_boost: true,
      speed: 1.1,
    },
  };

  return settings[useCase];
}

/**
 * List popular voices by category
 */
export function getPopularVoicesByCategory() {
  return {
    female: {
      rachel: POPULAR_VOICES.rachel,
      domi: POPULAR_VOICES.domi,
      bella: POPULAR_VOICES.bella,
      elli: POPULAR_VOICES.elli,
      emily: POPULAR_VOICES.emily,
      grace: POPULAR_VOICES.grace,
      lily: POPULAR_VOICES.lily,
      nicole: POPULAR_VOICES.nicole,
    },
    male: {
      clyde: POPULAR_VOICES.clyde,
      drew: POPULAR_VOICES.drew,
      paul: POPULAR_VOICES.paul,
      josh: POPULAR_VOICES.josh,
      adam: POPULAR_VOICES.adam,
      daniel: POPULAR_VOICES.daniel,
      ethan: POPULAR_VOICES.ethan,
      james: POPULAR_VOICES.james,
    },
    professional: {
      daniel: POPULAR_VOICES.daniel,
      josh: POPULAR_VOICES.josh,
      nicole: POPULAR_VOICES.nicole,
      matilda: POPULAR_VOICES.matilda,
      jeremy: POPULAR_VOICES.jeremy,
    },
    friendly: {
      paul: POPULAR_VOICES.paul,
      elli: POPULAR_VOICES.elli,
      thomas: POPULAR_VOICES.thomas,
      joseph: POPULAR_VOICES.joseph,
    },
    narrative: {
      adam: POPULAR_VOICES.adam,
      antoni: POPULAR_VOICES.antoni,
      michael: POPULAR_VOICES.michael,
    },
  };
}
