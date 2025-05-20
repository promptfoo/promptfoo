import { SingleBar, Presets } from 'cli-progress';
import fs from 'fs';
import os from 'os';
import path from 'path';
import cliState from '../../cliState';
import logger from '../../logger';
import type { TestCase } from '../../types';
import invariant from '../../util/invariant';
import { neverGenerateRemote } from '../remoteGeneration';

let ffmpegCache: any = null;

function shouldShowProgressBar(): boolean {
  return !cliState.webUI && logger.level !== 'debug';
}

export async function importFfmpeg(): Promise<any> {
  if (ffmpegCache) {
    return ffmpegCache;
  }

  try {
    ffmpegCache = await import('fluent-ffmpeg');
    return ffmpegCache;
  } catch (error) {
    logger.warn(`fluent-ffmpeg library not available: ${error}`);
    throw new Error(
      'To use the video strategy, please install fluent-ffmpeg: npm install fluent-ffmpeg\n' +
        'Also make sure you have FFmpeg installed on your system:\n' +
        '- macOS: brew install ffmpeg\n' +
        '- Ubuntu/Debian: apt-get install ffmpeg\n' +
        '- Windows: Download from ffmpeg.org',
    );
  }
}

export async function createTempVideoEnvironment(text: string): Promise<{
  tempDir: string;
  textFilePath: string;
  outputPath: string;
  cleanup: () => void;
}> {
  const tempDir = path.join(os.tmpdir(), 'promptfoo-video');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const textFilePath = path.join(tempDir, 'text.txt');
  const outputPath = path.join(tempDir, 'output-video.mp4');

  fs.writeFileSync(textFilePath, text);

  const cleanup = () => {
    try {
      if (fs.existsSync(textFilePath)) {
        fs.unlinkSync(textFilePath);
      }
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    } catch (error) {
      logger.warn(`Failed to clean up temporary files: ${error}`);
    }
  };

  return { tempDir, textFilePath, outputPath, cleanup };
}

export function getFallbackBase64(text: string): string {
  return Buffer.from(text).toString('base64');
}

export async function textToVideo(text: string): Promise<string> {
  try {
    if (neverGenerateRemote()) {
      const ffmpegModule = await importFfmpeg();
      const { textFilePath, outputPath, cleanup } = await createTempVideoEnvironment(text);

      return new Promise((resolve, reject) => {
        ffmpegModule()
          .input('color=white:s=640x480:d=5')
          .inputFormat('lavfi')
          .input(textFilePath)
          .inputOptions(['-f', 'concat'])
          .complexFilter([
            `[0:v]drawtext=fontfile=/System/Library/Fonts/Helvetica.ttc:text='${text.replace(/'/g, "\\'")}':fontcolor=black:fontsize=24:x=(w-text_w)/2:y=(h-text_h)/2[v]`,
          ])
          .outputOptions(['-map', '[v]'])
          .save(outputPath)
          .on('end', async () => {
            try {
              const videoData = fs.readFileSync(outputPath);
              const base64Video = videoData.toString('base64');
              cleanup();
              resolve(base64Video);
            } catch (error) {
              logger.error(`Error processing video output: ${error}`);
              cleanup();
              reject(error);
            }
          })
          .on('error', (err: Error) => {
            logger.error(`Error creating video: ${err}`);
            cleanup();
            reject(err);
          });
      });
    } else {
      throw new Error(
        'Local video generation requires fluent-ffmpeg. Future versions may support remote generation.',
      );
    }
  } catch (error) {
    logger.error(`Error generating video from text: ${error}`);
    return getFallbackBase64(text);
  }
}

export function createProgressBar(total: number): {
  increment: () => void;
  stop: () => void;
} {
  let progressBar: SingleBar | undefined;

  if (shouldShowProgressBar()) {
    try {
      progressBar = new SingleBar(
        {
          format: 'Converting to Videos {bar} {percentage}% | ETA: {eta}s | {value}/{total}',
          hideCursor: true,
        },
        Presets.shades_classic,
      );

      try {
        progressBar.start(total, 0);
      } catch (error) {
        logger.warn(`Failed to start progress bar: ${error}`);
        progressBar = undefined;
      }
    } catch (error) {
      logger.warn(`Failed to create progress bar: ${error}`);
    }
  }

  return {
    increment: () => {
      if (progressBar) {
        try {
          progressBar.increment(1);
        } catch (error) {
          logger.warn(`Failed to increment progress bar: ${error}`);
          progressBar = undefined;
        }
      }
    },
    stop: () => {
      if (progressBar) {
        try {
          progressBar.stop();
        } catch (error) {
          logger.warn(`Failed to stop progress bar: ${error}`);
        }
      }
    },
  };
}

export async function addVideoToBase64(
  testCases: TestCase[],
  injectVar: string,
  videoGenerator: (text: string) => Promise<string> = textToVideo,
): Promise<TestCase[]> {
  const videoTestCases: TestCase[] = [];
  const progress = createProgressBar(testCases.length);

  try {
    for (const testCase of testCases) {
      try {
        invariant(
          testCase.vars,
          `Video encoding: testCase.vars is required, but got ${JSON.stringify(testCase)}`,
        );

        const originalText = String(testCase.vars[injectVar]);
        const base64Video = await videoGenerator(originalText);

        videoTestCases.push({
          ...testCase,
          assert: testCase.assert?.map((assertion) => ({
            ...assertion,
            metric: assertion.type?.startsWith('promptfoo:redteam:')
              ? `${assertion.type?.split(':').pop() || assertion.metric}/Video-Encoded`
              : assertion.metric,
          })),
          vars: {
            ...testCase.vars,
            [injectVar]: base64Video,
            video_text: originalText,
          },
          metadata: {
            ...testCase.metadata,
            strategyId: 'video',
          },
        });
      } catch (error) {
        logger.error(`Error processing test case: ${error}`);
        throw error;
      } finally {
        progress.increment();

        if (logger.level === 'debug') {
          logger.debug(`Processed ${videoTestCases.length} of ${testCases.length}`);
        }
      }
    }

    return videoTestCases;
  } finally {
    progress.stop();
  }
}

export async function writeVideoFile(base64Video: string, outputFilePath: string): Promise<void> {
  try {
    const videoBuffer = Buffer.from(base64Video, 'base64');
    fs.writeFileSync(outputFilePath, videoBuffer);
    logger.info(`Video file written to: ${outputFilePath}`);
  } catch (error) {
    logger.error(`Failed to write video file: ${error}`);
    throw error;
  }
}

export async function main(): Promise<void> {
  const textToConvert = process.argv[2] || 'This is a test of the video encoding strategy.';

  logger.info(`Converting text to video: "${textToConvert}"`);

  try {
    const base64Video = await textToVideo(textToConvert);

    logger.info(`Base64 video (first 100 chars): ${base64Video.substring(0, 100)}...`);
    logger.info(`Total base64 video length: ${base64Video.length} characters`);

    const testCase = {
      vars: {
        prompt: textToConvert,
      },
    };

    const processedTestCases = await addVideoToBase64([testCase], 'prompt');

    logger.info('Test case processed successfully.');
    logger.info(`Original prompt length: ${textToConvert.length} characters`);
    const processedPrompt = processedTestCases[0].vars?.prompt as string;
    logger.info(`Processed prompt length: ${processedPrompt.length} characters`);

    if (require.main === module) {
      await writeVideoFile(base64Video, 'test-video.mp4');
      logger.info(`You can open it with any video player to verify the conversion.`);
    }
  } catch (error) {
    logger.error(`Error generating video from text: ${error}`);
  }
}

if (require.main === module) {
  main();
}
