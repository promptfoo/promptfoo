/**
 * Pronunciation Dictionaries for ElevenLabs TTS
 *
 * Allows custom pronunciation rules for technical terms, brand names,
 * acronyms, and domain-specific vocabulary.
 */

import { XMLBuilder } from 'fast-xml-parser';
import logger from '../../../logger';
import { ElevenLabsClient } from '../client';

/**
 * Pronunciation rule definition
 */
export interface PronunciationRule {
  word: string; // The word to apply custom pronunciation to
  phoneme?: string; // IPA or CMU phoneme representation
  alphabet?: 'ipa' | 'cmu'; // Phonetic alphabet to use
  pronunciation?: string; // Alternative spelling-based pronunciation
}

/**
 * Pronunciation dictionary metadata
 */
export interface PronunciationDictionary {
  id: string;
  name: string;
  description?: string;
  version_id: string;
  created_at?: string;
}

/**
 * Create a pronunciation dictionary from rules
 */
export async function createPronunciationDictionary(
  client: ElevenLabsClient,
  name: string,
  rules: PronunciationRule[],
  description?: string,
): Promise<PronunciationDictionary> {
  logger.debug('[ElevenLabs Pronunciation] Creating dictionary', {
    name,
    ruleCount: rules.length,
  });

  // Validate rules
  if (rules.length === 0) {
    throw new Error('At least one pronunciation rule is required');
  }

  for (const rule of rules) {
    if (!rule.word) {
      throw new Error('Each pronunciation rule must have a word');
    }
    if (!rule.phoneme && !rule.pronunciation) {
      throw new Error(`Rule for word "${rule.word}" must have either phoneme or pronunciation`);
    }
  }

  // Build the dictionary file content
  const dictionaryContent = new XMLBuilder({ ignoreAttributes: false, format: true }).build({
    '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
    lexicon: {
      '@_version': '1.0',
      '@_xmlns': 'http://www.w3.org/2005/01/pronunciation-lexicon',
      '@_alphabet': 'ipa',
      '@_xml:lang': 'en-US',
      lexeme: rules.map((rule) => ({
        grapheme: rule.word,
        ...(rule.phoneme
          ? {
              phoneme: {
                '#text': rule.phoneme,
                '@_alphabet': rule.alphabet === 'cmu' ? 'cmu-arpabet' : 'ipa',
              },
            }
          : { alias: rule.pronunciation }),
      })),
    },
  });

  // Create FormData for multipart upload
  const formData = new FormData();
  formData.append('name', name);
  formData.append(
    'description',
    description || `Auto-generated pronunciation dictionary - ${name}`,
  );
  formData.append(
    'file',
    new Blob([dictionaryContent], { type: 'application/pls+xml' }),
    'dictionary.pls',
  );

  // Create dictionary via API
  const response = await client.post<{
    id: string;
    name: string;
    version_id: string;
    created_at: string;
  }>('/pronunciation-dictionaries/add-from-file', formData);

  logger.debug('[ElevenLabs Pronunciation] Dictionary created', {
    dictionaryId: response.id,
    versionId: response.version_id,
  });

  return {
    id: response.id,
    name: response.name,
    version_id: response.version_id,
    description,
    created_at: response.created_at,
  };
}
