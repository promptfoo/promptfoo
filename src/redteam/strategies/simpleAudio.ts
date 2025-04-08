import { SingleBar, Presets } from 'cli-progress';
import { fetchWithCache } from '../../cache';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared';
import type { TestCase } from '../../types';
import invariant from '../../util/invariant';
import { getRemoteGenerationUrl, neverGenerateRemote } from '../remoteGeneration';
import { VERSION } from '../../constants';

/**
 * Converts text to audio using the remote API
 */
export async function textToAudio(text: string, language: string = 'en'): Promise<string> {
  try {
    logger.debug(`Using remote generation for audio task`);
    
    // Check if remote generation is disabled
    if (neverGenerateRemote()) {
      throw new Error('Remote generation is disabled but required for audio strategy');
    }
    
    const payload = {
      task: 'audio',
      text,
      language,
      version: VERSION,
      email: getUserEmail(),
    };

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
      throw new Error(`Error in remote audio generation: ${data.error}`);
    }

    logger.debug(`Received audio base64 from remote API (${data.audioBase64.length} chars)`);
    return data.audioBase64;
  } catch (error) {
    logger.error(`Error generating audio from text: ${error}`);
    // For backward compatibility, convert text to base64 if audio generation fails
    logger.warn('Falling back to simple base64 encoding of the text (not actual audio)');
    return Buffer.from(text).toString('base64');
  }
}

/**
 * Adds audio encoding to test cases
 */
export async function addAudioToBase64(
  testCases: TestCase[],
  injectVar: string,
  config: Record<string, any> = {},
): Promise<TestCase[]> {
  const audioTestCases: TestCase[] = [];
  const language = config.language || 'en';

  let progressBar: SingleBar | undefined;
  if (logger.level !== 'debug') {
    progressBar = new SingleBar(
      {
        format: 'Converting to Audio {bar} {percentage}% | ETA: {eta}s | {value}/{total}',
        hideCursor: true,
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

    // Convert text to audio and then to base64
    const base64Audio = await textToAudio(originalText, language);

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
        [injectVar]: base64Audio,
      },
      metadata: {
        ...testCase.metadata,
        strategyId: 'audio',
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
