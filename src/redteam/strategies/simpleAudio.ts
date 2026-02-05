import { Presets, SingleBar } from 'cli-progress';
import { fetchWithCache } from '../../cache';
import { VERSION } from '../../constants';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared';
import { isMediaStorageEnabled, storeMedia } from '../../storage';
import invariant from '../../util/invariant';
import { getRemoteGenerationUrl, neverGenerateRemote } from '../remoteGeneration';

import type { TestCase } from '../../types/index';

/**
 * Result of text-to-audio conversion
 */
export interface TextToAudioResult {
  /** Base64 encoded audio data */
  base64: string;
  /** Storage key if stored to media storage */
  storageKey?: string;
}

/**
 * Converts text to audio using the remote API
 * @throws Error if remote generation is disabled or if the API call fails
 */
export async function textToAudio(
  text: string,
  language: string = 'en',
  options?: { evalId?: string; storeToStorage?: boolean },
): Promise<TextToAudioResult> {
  // Check if remote generation is disabled
  if (neverGenerateRemote()) {
    throw new Error(
      'Remote generation is disabled but required for audio strategy. Please enable remote generation to use this strategy.',
    );
  }

  try {
    logger.debug(`Using remote generation for audio task`);

    const payload = {
      task: 'audio',
      text,
      language,
      version: VERSION,
      email: getUserEmail(),
    };

    interface AudioGenerationResponse {
      error?: string;
      audioBase64?: string;
    }

    const { data } = await fetchWithCache<AudioGenerationResponse>(
      getRemoteGenerationUrl(),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      REQUEST_TIMEOUT_MS,
    );

    if (data.error || !data.audioBase64) {
      throw new Error(
        `Error in remote audio generation: ${data.error || 'No audio data returned'}`,
      );
    }

    logger.debug(`Received audio base64 from remote API (${data.audioBase64.length} chars)`);
    const base64Audio = data.audioBase64;

    // Store to media storage if enabled
    const useStorage = options?.storeToStorage ?? isMediaStorageEnabled();
    if (useStorage) {
      try {
        const buffer = Buffer.from(base64Audio, 'base64');
        const { ref } = await storeMedia(buffer, {
          contentType: 'audio/mp3',
          mediaType: 'audio',
          originalText: text,
          strategyId: 'audio',
          evalId: options?.evalId,
        });
        logger.debug(`[Audio Strategy] Stored audio to: ${ref.key}`);
        return { base64: base64Audio, storageKey: ref.key };
      } catch (storageError) {
        logger.warn(`[Audio Strategy] Failed to store audio, using inline base64`, {
          error: storageError,
        });
      }
    }

    return { base64: base64Audio };
  } catch (error) {
    logger.error(`Error generating audio from text: ${error}`);
    throw new Error(
      `Failed to generate audio: ${error instanceof Error ? error.message : String(error)}. This strategy requires an active internet connection and access to the remote API.`,
    );
  }
}

/**
 * Adds audio encoding to test cases
 * @throws Error if the remote API for audio conversion is unavailable
 */
export async function addAudioToBase64(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any> = {},
): Promise<TestCase[]> {
  const audioTestCases: TestCase[] = [];
  const evalId = config.evalId;

  let progressBar: SingleBar | undefined;
  if (logger.level !== 'debug') {
    progressBar = new SingleBar(
      {
        format: 'Converting to Audio {bar} {percentage}% | ETA: {eta}s | {value}/{total}',
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
      `Audio encoding: testCase.vars is required, but got ${JSON.stringify(testCase)}`,
    );

    const originalText = String(testCase.vars[injectVar]);

    // Get language from test case metadata (set during plugin generation), fall back to config, then 'en'
    const language =
      testCase.metadata?.language ||
      testCase.metadata?.modifiers?.language ||
      config.language ||
      'en';

    // Convert text to audio using the remote API
    const audioResult = await textToAudio(originalText, language, { evalId });

    audioTestCases.push({
      ...testCase,
      assert: testCase.assert?.map((assertion) => ({
        ...assertion,
        metric: assertion.type?.startsWith('promptfoo:redteam:')
          ? `${assertion.type?.split(':').pop() || assertion.metric}/Audio-Encoded`
          : assertion.metric,
      })),
      vars: {
        ...testCase.vars,
        // Use base64 for the prompt (provider expects this)
        [injectVar]: audioResult.base64,
      },
      metadata: {
        ...testCase.metadata,
        strategyId: 'audio',
        originalText,
        // Store reference for later retrieval - include var name for sanitizer
        ...(audioResult.storageKey && {
          audioStorageKey: audioResult.storageKey,
          audioInjectVar: injectVar,
        }),
      },
    });

    if (progressBar) {
      progressBar.increment(1);
    } else {
      logger.debug(`Processed ${audioTestCases.length} of ${testCases.length}`);
    }
  }

  if (progressBar) {
    progressBar.stop();
  }

  return audioTestCases;
}
