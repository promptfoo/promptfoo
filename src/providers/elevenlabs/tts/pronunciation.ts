/**
 * Pronunciation Dictionaries for ElevenLabs TTS
 *
 * Allows custom pronunciation rules for technical terms, brand names,
 * acronyms, and domain-specific vocabulary.
 */

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
  const dictionaryContent = rules
    .map((rule) => {
      if (rule.phoneme) {
        return `${rule.word}\t${rule.phoneme}${rule.alphabet ? `\t${rule.alphabet}` : ''}`;
      }
      return `${rule.word}\t${rule.pronunciation}`;
    })
    .join('\n');

  // Create FormData for multipart upload
  const formData = new FormData();
  formData.append('name', name);
  formData.append(
    'description',
    description || `Auto-generated pronunciation dictionary - ${name}`,
  );
  formData.append('file', new Blob([dictionaryContent], { type: 'text/plain' }), 'dictionary.pls');

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

/**
 * Apply pronunciation dictionary to TTS request headers
 */
export function applyPronunciationDictionary(
  dictionaryId: string,
  versionId: string = 'latest',
): Record<string, string> {
  const locators = [
    {
      pronunciation_dictionary_id: dictionaryId,
      version_id: versionId,
    },
  ];

  return {
    'xi-pronunciation-dictionary-locators': JSON.stringify(locators),
  };
}

/**
 * Apply multiple pronunciation dictionaries
 */
export function applyPronunciationDictionaries(
  dictionaries: Array<{ id: string; versionId?: string }>,
): Record<string, string> {
  const locators = dictionaries.map((dict) => ({
    pronunciation_dictionary_id: dict.id,
    version_id: dict.versionId || 'latest',
  }));

  return {
    'xi-pronunciation-dictionary-locators': JSON.stringify(locators),
  };
}

/**
 * Get pronunciation dictionary by ID
 */
export async function getPronunciationDictionary(
  client: ElevenLabsClient,
  dictionaryId: string,
): Promise<PronunciationDictionary> {
  logger.debug('[ElevenLabs Pronunciation] Fetching dictionary', { dictionaryId });

  const response = await client.get<{
    id: string;
    name: string;
    description: string;
    version_id: string;
    created_at: string;
  }>(`/pronunciation-dictionaries/${dictionaryId}`);

  return {
    id: response.id,
    name: response.name,
    description: response.description,
    version_id: response.version_id,
    created_at: response.created_at,
  };
}

/**
 * List all pronunciation dictionaries
 */
export async function listPronunciationDictionaries(
  client: ElevenLabsClient,
): Promise<PronunciationDictionary[]> {
  logger.debug('[ElevenLabs Pronunciation] Listing dictionaries');

  const response = await client.get<{
    pronunciation_dictionaries: Array<{
      id: string;
      name: string;
      description: string;
      version_id: string;
      created_at: string;
    }>;
  }>('/pronunciation-dictionaries');

  return response.pronunciation_dictionaries.map((dict) => ({
    id: dict.id,
    name: dict.name,
    description: dict.description,
    version_id: dict.version_id,
    created_at: dict.created_at,
  }));
}

/**
 * Delete pronunciation dictionary
 */
export async function deletePronunciationDictionary(
  client: ElevenLabsClient,
  dictionaryId: string,
): Promise<void> {
  logger.debug('[ElevenLabs Pronunciation] Deleting dictionary', { dictionaryId });

  await client.delete(`/pronunciation-dictionaries/${dictionaryId}`);

  logger.debug('[ElevenLabs Pronunciation] Dictionary deleted', { dictionaryId });
}

/**
 * Common pronunciation rules for technical terms
 */
export const COMMON_TECH_PRONUNCIATIONS: PronunciationRule[] = [
  // Programming languages
  { word: 'Python', pronunciation: 'pie-thon' },
  { word: 'JavaScript', pronunciation: 'java-script' },
  { word: 'TypeScript', pronunciation: 'type-script' },
  { word: 'SQL', pronunciation: 'sequel' },
  { word: 'PostgreSQL', pronunciation: 'post-gres-Q-L' },
  { word: 'MySQL', pronunciation: 'my-sequel' },

  // Cloud providers
  { word: 'AWS', pronunciation: 'A-W-S' },
  { word: 'Azure', pronunciation: 'azh-er' },
  { word: 'GCP', pronunciation: 'G-C-P' },

  // AI/ML terms
  { word: 'LLM', pronunciation: 'L-L-M' },
  { word: 'GPT', pronunciation: 'G-P-T' },
  { word: 'API', pronunciation: 'A-P-I' },
  { word: 'JSON', pronunciation: 'jay-sawn' },
  { word: 'YAML', pronunciation: 'yam-mel' },

  // Company names
  { word: 'OpenAI', pronunciation: 'open-A-I' },
  { word: 'Anthropic', pronunciation: 'an-throw-pick' },
  { word: 'ElevenLabs', pronunciation: 'eleven-labs' },
];

/**
 * Create a tech-focused pronunciation dictionary
 */
export async function createTechPronunciationDictionary(
  client: ElevenLabsClient,
  additionalRules: PronunciationRule[] = [],
): Promise<PronunciationDictionary> {
  const allRules = [...COMMON_TECH_PRONUNCIATIONS, ...additionalRules];

  return createPronunciationDictionary(
    client,
    `tech-dict-${Date.now()}`,
    allRules,
    'Technical terms and programming vocabulary',
  );
}
