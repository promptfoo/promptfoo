/**
 * Multi-voice conversation support for ElevenLabs Agents
 *
 * Enables different voices for different characters in conversations
 */

import logger from '../../../logger';
import { ElevenLabsClient } from '../client';
import type { MultiVoiceConfig } from './types';

/**
 * Configure multi-voice support for an agent
 */
export async function configureMultiVoice(
  client: ElevenLabsClient,
  agentId: string,
  config: MultiVoiceConfig,
): Promise<void> {
  logger.debug('[ElevenLabs Multi-voice] Configuring multi-voice', {
    agentId,
    characterCount: config.characters.length,
  });

  await client.post(`/convai/agents/${agentId}/multi-voice`, {
    characters: config.characters.map((char) => ({
      name: char.name,
      voice_id: char.voiceId,
      role: char.role,
    })),
    default_voice_id: config.defaultVoiceId,
  });

  logger.debug('[ElevenLabs Multi-voice] Multi-voice configured successfully', {
    agentId,
    characters: config.characters.map((c) => c.name),
  });
}

/**
 * Validate multi-voice configuration
 */
export function validateMultiVoiceConfig(config: MultiVoiceConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate characters array
  if (!config.characters || config.characters.length === 0) {
    errors.push('At least one character is required for multi-voice');
  }

  // Validate each character
  const characterNames = new Set<string>();

  for (const char of config.characters) {
    // Check name
    if (!char.name || char.name.trim().length === 0) {
      errors.push('Character name is required');
    } else if (characterNames.has(char.name)) {
      errors.push(`Duplicate character name: ${char.name}`);
    } else {
      characterNames.add(char.name);
    }

    // Check voice ID
    if (!char.voiceId || char.voiceId.trim().length === 0) {
      errors.push(`Voice ID is required for character: ${char.name || 'unnamed'}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Parse speaker labels from conversation text
 *
 * Detects patterns like:
 * - "Alice: Hello there!"
 * - "[Bob] How are you?"
 * - "Charlie >> Great!"
 */
export function parseSpeakerLabels(text: string): Array<{
  speaker: string;
  message: string;
}> {
  const turns: Array<{ speaker: string; message: string }> = [];

  // Match various speaker label patterns
  const patterns = [
    /^([A-Za-z]+):\s*(.+)$/gim, // "Name: message"
    /^\[([A-Za-z]+)\]\s*(.+)$/gim, // "[Name] message"
    /^([A-Za-z]+)\s*>>\s*(.+)$/gim, // "Name >> message"
  ];

  for (const pattern of patterns) {
    const matches = [...text.matchAll(pattern)];

    if (matches.length > 0) {
      for (const match of matches) {
        turns.push({
          speaker: match[1].trim(),
          message: match[2].trim(),
        });
      }
      break; // Use first matching pattern
    }
  }

  return turns;
}

/**
 * Match speakers to configured characters
 */
export function matchSpeakersToCharacters(
  speakers: string[],
  characters: MultiVoiceConfig['characters'],
): Map<string, string> {
  const speakerToVoice = new Map<string, string>();

  for (const speaker of speakers) {
    // Try exact match first
    const exactMatch = characters.find(
      (char) => char.name.toLowerCase() === speaker.toLowerCase(),
    );

    if (exactMatch) {
      speakerToVoice.set(speaker, exactMatch.voiceId);
      continue;
    }

    // Try partial match
    const partialMatch = characters.find((char) =>
      char.name.toLowerCase().includes(speaker.toLowerCase()) ||
      speaker.toLowerCase().includes(char.name.toLowerCase()),
    );

    if (partialMatch) {
      speakerToVoice.set(speaker, partialMatch.voiceId);
    }
  }

  return speakerToVoice;
}

/**
 * Predefined multi-voice scenarios
 */
export const MULTI_VOICE_PRESETS = {
  // Customer service: Agent + Customer
  customerService: {
    characters: [
      { name: 'Agent', voiceId: '21m00Tcm4TlvDq8ikWAM', role: 'Support representative' }, // Rachel
      { name: 'Customer', voiceId: '2EiwWnXFnvU5JabPnv8n', role: 'Customer' }, // Clyde
    ],
    defaultVoiceId: '21m00Tcm4TlvDq8ikWAM',
  },

  // Sales call: Sales rep + Prospect
  salesCall: {
    characters: [
      { name: 'SalesRep', voiceId: 'pNInz6obpgDQGcFmaJgB', role: 'Sales representative' }, // Adam
      { name: 'Prospect', voiceId: 'EXAVITQu4vr4xnSDxMaL', role: 'Potential customer' }, // Bella
    ],
    defaultVoiceId: 'pNInz6obpgDQGcFmaJgB',
  },

  // Interview: Interviewer + Candidate
  interview: {
    characters: [
      { name: 'Interviewer', voiceId: 'AZnzlk1XvdvUeBnXmlld', role: 'Hiring manager' }, // Domi
      { name: 'Candidate', voiceId: 'ErXwobaYiN019PkySvjV', role: 'Job candidate' }, // Antoni
    ],
    defaultVoiceId: 'AZnzlk1XvdvUeBnXmlld',
  },

  // Podcast: Host + Guest
  podcast: {
    characters: [
      { name: 'Host', voiceId: 'TxGEqnHWrfWFTfGW9XjX', role: 'Podcast host' }, // Josh
      { name: 'Guest', voiceId: 'MF3mGyEYCl7XYWbV9V6O', role: 'Guest speaker' }, // Elli
    ],
    defaultVoiceId: 'TxGEqnHWrfWFTfGW9XjX',
  },

  // News broadcast: Anchor + Reporter
  newsBroadcast: {
    characters: [
      { name: 'Anchor', voiceId: 'onwK4e9ZLuTAKqWW03F9', role: 'News anchor' }, // Daniel
      { name: 'Reporter', voiceId: 'LcfcDJNUP1GQjkzn1xUU', role: 'Field reporter' }, // Emily
    ],
    defaultVoiceId: 'onwK4e9ZLuTAKqWW03F9',
  },

  // Drama: Multiple characters
  drama: {
    characters: [
      { name: 'Hero', voiceId: 'pNInz6obpgDQGcFmaJgB', role: 'Protagonist' }, // Adam
      { name: 'Villain', voiceId: 'VR6AewLTigWG4xSOukaG', role: 'Antagonist' }, // Arnold
      { name: 'Narrator', voiceId: 'TxGEqnHWrfWFTfGW9XjX', role: 'Story narrator' }, // Josh
    ],
    defaultVoiceId: 'TxGEqnHWrfWFTfGW9XjX',
  },
};

/**
 * Get multi-voice preset by name
 */
export function getMultiVoicePreset(
  presetName: keyof typeof MULTI_VOICE_PRESETS,
): MultiVoiceConfig {
  const preset = MULTI_VOICE_PRESETS[presetName];

  if (!preset) {
    throw new Error(`Unknown multi-voice preset: ${presetName}`);
  }

  return preset;
}
