import { SingleBar, Presets } from 'cli-progress';
import { fetchWithCache } from '../../cache';
import { getUserEmail } from '../../globalConfig/accounts';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared';
import type { TestCase } from '../../types';
import invariant from '../../util/invariant';
import { getRemoteGenerationUrl, neverGenerateRemote, shouldGenerateRemote } from '../remoteGeneration';
import { VERSION } from '../../constants';

// Types for the node-gtts module
type GttsInstance = {
  stream(text: string): NodeJS.ReadableStream;
};

type GttsModule = {
  default(lang: string): GttsInstance;
};

/**
 * Dynamically imports the node-gtts library
 * @returns The gTTS module or null if not available
 */
async function importGtts(): Promise<GttsModule | null> {
  try {
    // Dynamic import of gtts
    return (await import('node-gtts')) as GttsModule;
  } catch (error) {
    logger.warn(`node-gtts library not available: ${error}`);
    return null;
  }
}

/**
 * Converts text to audio using remote API, with fallback to local node-gtts
 */
export async function textToAudio(text: string, language: string = 'en'): Promise<string> {
  // Check if we should use remote generation
  if (shouldGenerateRemote()) {
    try {
      logger.debug(`Using remote generation for audio task`);
      
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
        logger.error(`Error in remote audio generation: ${data.error}`);
        // Fall back to local generation
        logger.info('Falling back to local audio generation');
      } else {
        logger.debug(`Received audio base64 from remote API (${data.audioBase64.length} chars)`);
        return data.audioBase64;
      }
    } catch (error) {
      logger.warn(`Error using remote generation for audio task: ${error}`);
      // Fall back to local generation
      logger.info('Falling back to local audio generation due to error');
    }
  }

  // Local fallback implementation
  try {
    // Dynamically import gtts
    const gttsModule = await importGtts();

    if (!gttsModule) {
      throw new Error(
        `Please install node-gtts to use audio-based strategies: npm install node-gtts`,
      );
    }

    // Initialize gtts with specified language
    const gtts = gttsModule.default(language);

    // Get audio stream
    const audioStream = gtts.stream(text);

    // Collect stream data in chunks
    const chunks: Buffer[] = [];

    // Convert stream to buffer using promises
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      audioStream.on('data', (chunk: Buffer) => chunks.push(chunk));
      audioStream.on('error', reject);
      audioStream.on('end', () => resolve(Buffer.concat(chunks)));
    });

    // Convert to base64
    return buffer.toString('base64');
  } catch (error) {
    logger.error(`Error generating audio from text: ${error}`);
    // Fallback to base64 encoding of the original text if audio generation fails
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

// Main function for direct testing via: npx tsx simpleAudio.ts "Text to convert to audio"
async function main() {
  // Get text from command line arguments or use default
  const textToConvert = process.argv[2] || 'This is a test of the audio encoding strategy.';
  const language = process.argv[3] || 'en';

  logger.info(`Converting text to audio: "${textToConvert}" [language: ${language}]`);

  try {
    // Convert text to audio
    const base64Audio = await textToAudio(textToConvert, language);

    // Log the first 100 characters of the base64 audio to avoid terminal clutter
    logger.info(`Base64 audio (first 100 chars): ${base64Audio.substring(0, 100)}...`);
    logger.info(`Total base64 audio length: ${base64Audio.length} characters`);

    // Create a simple test case
    const testCase = {
      vars: {
        prompt: textToConvert,
      },
    };

    // Process the test case
    const processedTestCases = await addAudioToBase64([testCase], 'prompt', { language });

    logger.info('Test case processed successfully.');
    logger.info(`Original prompt length: ${textToConvert.length} characters`);
    // Add type assertion to ensure TypeScript knows this is a string
    const processedPrompt = processedTestCases[0].vars?.prompt as string;
    logger.info(`Processed prompt length: ${processedPrompt.length} characters`);

    // Check if we're running this directly (not being imported)
    if (require.main === module) {
      // Write to a file for testing with audio players
      const fs = await import('fs');
      const outputFilePath = 'test-audio.mp3';

      // Decode base64 back to binary
      const audioBuffer = Buffer.from(base64Audio, 'base64');

      // Write binary data to file
      fs.writeFileSync(outputFilePath, audioBuffer);

      logger.info(`Audio file written to: ${outputFilePath}`);
      logger.info(`You can play it using any audio player to verify the conversion.`);
    }
  } catch (error) {
    logger.error(`Error generating audio from text: ${error}`);
  }
}

// Run the main function if this file is executed directly
if (require.main === module) {
  main();
}
