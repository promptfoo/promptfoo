/**
 * Advanced TTS Strategy with Audio Perturbation Support
 *
 * This strategy converts text to speech using the Gemini TTS API and applies various
 * audio perturbation effects to simulate real-world audio conditions or challenging
 * scenarios for testing AI systems.
 *
 * Available perturbation effects include:
 * - static: Crackling/static noise
 * - radio: AM/FM radio interference
 * - phone: Telephone/VoIP quality
 * - underwater: Muffled underwater sound
 * - crowd: Background crowd noise
 * - And many more...
 *
 * The strategy can be used to test how well AI systems handle audio input under
 * various acoustic conditions and distortions.
 */

import { Presets, SingleBar } from 'cli-progress';
import { fetchWithCache } from '../../cache';
import { VERSION } from '../../constants';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared';
import invariant from '../../util/invariant';
import { getRemoteGenerationUrl, neverGenerateRemote } from '../remoteGeneration';

import type { TestCase } from '../../types';

// Perturbation presets matching the server implementation
export type PerturbationPreset =
  | 'none'
  | 'static' // Static/crackling effect
  | 'radio' // Radio/interference effect
  | 'bitcrush' // Digital distortion/aliasing
  | 'phone' // Telephone/VoIP quality with compression
  | 'reverb' // Echo/hall effect (speakerphone, large room)
  | 'underwater' // Muffled/underwater sound
  | 'crowd' // Background crowd noise (cocktail party)
  | 'wind' // Wind/outdoor interference
  | 'distance' // Through wall/next room effect
  | 'walkie' // Walkie-talkie with squelch
  | 'announcement' // PA system/airport/train station
  | 'vintage' // Old recording (vinyl/tape)
  | 'dropout' // Packet loss/stuttering
  | 'machinery' // Background AC/fan/engine noise
  | 'random'; // Randomly select from all available effects

// Available voices from Gemini API
export const GEMINI_VOICES = [
  'Zephyr',
  'Puck',
  'Charon',
  'Kore',
  'Fenrir',
  'Leda',
  'Orus',
  'Aoede',
  'Callirrhoe',
  'Autonoe',
  'Enceladus',
  'Iapetus',
  'Umbriel',
  'Algieba',
  'Despina',
  'Erinome',
  'Algenib',
  'Rasalgethi',
  'Laomedeia',
  'Achernar',
  'Alnilam',
  'Schedar',
  'Gacrux',
  'Pulcherrima',
  'Achird',
  'Zubenelgenubi',
  'Vindemiatrix',
  'Sadachbia',
  'Sadaltager',
  'Sulafat',
] as const;

export type GeminiVoice = (typeof GEMINI_VOICES)[number];

export interface TtsConfig {
  voiceName?: GeminiVoice;
  accent?: string;
  perturbation?: {
    preset: PerturbationPreset;
    intensity?: number; // 0-1, defaults to 0.5
  };
}

/**
 * Converts text to audio using the TTS endpoint with perturbation support
 * @throws Error if remote generation is disabled or if the API call fails
 */
export async function textToTtsWithPerturbation(
  text: string,
  config: TtsConfig = {},
): Promise<string> {
  // Check if remote generation is disabled
  if (neverGenerateRemote()) {
    throw new Error(
      'Remote generation is disabled but required for TTS strategy. Please enable remote generation to use this strategy.',
    );
  }

  try {
    logger.debug(`Using remote generation for TTS task with perturbation`);

    const payload = {
      task: 'tts',
      text,
      accent: config.accent || '',
      voiceName: config.voiceName || 'Kore',
      perturbation: config.perturbation || { preset: 'random', intensity: 0.5 },
      version: VERSION,
      email: getUserEmail(),
    };

    logger.debug(
      `TTS payload: ${JSON.stringify({
        ...payload,
        text: text.substring(0, 50) + '...', // Log first 50 chars only
      })}`,
    );

    const { data } = await fetchWithCache(
      getRemoteGenerationUrl(),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      REQUEST_TIMEOUT_MS,
    );

    if (data.error) {
      throw new Error(`Error in remote TTS generation: ${data.error}`);
    }

    logger.debug(`Received TTS audio base64 from remote API (${data.audioBase64.length} chars)`);
    return data.audioBase64;
  } catch (error) {
    logger.error(`Error generating TTS audio from text: ${error}`);
    throw new Error(
      `Failed to generate TTS audio: ${error instanceof Error ? error.message : String(error)}. This strategy requires an active internet connection and access to the remote API.`,
    );
  }
}

/**
 * Adds TTS audio with perturbation to test cases
 *
 * This strategy converts text to speech using the TTS endpoint with various audio perturbation effects.
 *
 * @param testCases - The test cases to process
 * @param injectVar - The variable to inject the audio into
 * @param config - Configuration options:
 *   - voiceName: The Gemini voice to use (default: 'Kore')
 *   - accent: Optional accent modifier for the voice
 *   - perturbation: Audio effect settings
 *     - preset: The perturbation effect to apply (e.g., 'phone', 'radio', 'underwater')
 *     - intensity: Effect strength from 0-1 (default: 0.5)
 *   - randomizePerturbation: If true, randomly selects perturbation for each test case
 *
 * @example
 * // Apply phone effect to all test cases
 * await addTtsWithPerturbation(testCases, 'prompt', {
 *   voiceName: 'Zephyr',
 *   perturbation: { preset: 'phone', intensity: 0.7 }
 * });
 *
 * @example
 * // Randomize perturbations across test cases
 * await addTtsWithPerturbation(testCases, 'prompt', {
 *   randomizePerturbation: true
 * });
 *
 * @throws Error if the remote API for TTS conversion is unavailable
 */
export async function addTtsWithPerturbation(
  testCases: TestCase[],
  injectVar: string,
  config: TtsConfig & { randomizePerturbation?: boolean } = {},
): Promise<TestCase[]> {
  const ttsTestCases: TestCase[] = [];

  // Available perturbation presets for randomization
  const perturbationPresets: PerturbationPreset[] = [
    'static',
    'radio',
    'bitcrush',
    'phone',
    'reverb',
    'underwater',
    'crowd',
    'wind',
    'distance',
    'walkie',
    'announcement',
    'vintage',
    'dropout',
    'machinery',
  ];

  let progressBar: SingleBar | undefined;
  if (logger.level !== 'debug' && false) {
    progressBar = new SingleBar(
      {
        format:
          'Converting to TTS with Perturbation {bar} {percentage}% | ETA: {eta}s | {value}/{total}',
        hideCursor: true,
        gracefulExit: true,
      },
      Presets.shades_classic,
    );
    progressBar.start(testCases.length, 0);
  }

  for (const testCase of testCases) {
    invariant(
      testCase.vars,
      `TTS encoding: testCase.vars is required, but got ${JSON.stringify(testCase)}`,
    );

    const originalText = String(testCase.vars[injectVar]);

    // Determine perturbation settings
    let perturbationConfig = config.perturbation || {
      preset: 'random' as PerturbationPreset,
      intensity: 0.5,
    };

    // If randomization is enabled, pick a random perturbation for each test case
    if (config.randomizePerturbation) {
      const randomPreset =
        perturbationPresets[Math.floor(Math.random() * perturbationPresets.length)];
      const randomIntensity = Math.random(); // 0-1
      perturbationConfig = {
        preset: randomPreset,
        intensity: randomIntensity,
      };
      logger.debug(
        `Randomized perturbation: ${randomPreset} with intensity ${randomIntensity.toFixed(2)}`,
      );
    }

    try {
      // Convert text to TTS audio with perturbation
      const base64Audio = await textToTtsWithPerturbation(originalText, {
        voiceName: config.voiceName,
        accent: config.accent,
        perturbation: perturbationConfig,
      });

      ttsTestCases.push({
        ...testCase,
        assert: testCase.assert?.map((assertion) => ({
          ...assertion,
          metric: assertion.type?.startsWith('promptfoo:redteam:')
            ? `${assertion.type?.split(':').pop() || assertion.metric}/TTS-${perturbationConfig.preset}`
            : assertion.metric,
        })),
        vars: {
          ...testCase.vars,
          [injectVar]: base64Audio,
        },
        metadata: {
          ...testCase.metadata,
          strategyId: 'advancedTts',
          originalText,
          ttsConfig: {
            voiceName: config.voiceName,
            accent: config.accent,
            perturbation: perturbationConfig,
          },
        },
      });
    } catch (error) {
      logger.warn(
        `Skipping test case due to TTS generation error: ${error instanceof Error ? error.message : String(error)}`,
      );
      logger.debug(
        `Failed text: "${originalText.substring(0, 100)}${originalText.length > 100 ? '...' : ''}"`,
      );
      // Skip this test case and continue with the next one
    }

    if (progressBar) {
      progressBar.increment(1);
    } else {
      logger.debug(
        `Processed ${ttsTestCases.length} of ${testCases.length} with ${perturbationConfig.preset} perturbation`,
      );
    }
  }

  if (progressBar) {
    progressBar.stop();
  }

  return ttsTestCases;
}
