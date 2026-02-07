import fs from 'fs';
import os from 'os';
import path from 'path';

import { Presets, SingleBar } from 'cli-progress';
import { execa } from 'execa';
import cliState from '../../cliState';
import logger from '../../logger';
import invariant from '../../util/invariant';
import { neverGenerateRemote } from '../remoteGeneration';

import type { TestCase } from '../../types/index';

function shouldShowProgressBar(): boolean {
  return !cliState.webUI && logger.level !== 'debug';
}

function getSystemFont(): string {
  const platform = os.platform();

  if (platform === 'darwin') {
    // macOS
    return '/System/Library/Fonts/Helvetica.ttc';
  } else if (platform === 'win32') {
    // Windows
    return 'C:/Windows/Fonts/arial.ttf';
  } else {
    // Linux - try common font paths
    const linuxFonts = [
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
      '/usr/share/fonts/dejavu/DejaVuSans.ttf',
    ];

    for (const fontPath of linuxFonts) {
      if (fs.existsSync(fontPath)) {
        return fontPath;
      }
    }

    // Fallback to a generic font name that ffmpeg might resolve
    return 'DejaVu-Sans';
  }
}

async function checkFfmpegAvailable(): Promise<void> {
  try {
    await execa('ffmpeg', ['-version']);
  } catch (error) {
    throw new Error(
      'To use the video strategy, FFmpeg must be installed on your system:\n' +
        '- macOS: brew install ffmpeg\n' +
        '- Ubuntu/Debian: apt-get install ffmpeg\n' +
        '- Windows: Download from ffmpeg.org\n' +
        `Error: ${error}`,
    );
  }
}

function escapeDrawtextString(text: string): string {
  // Escape special characters for FFmpeg's drawtext filter
  // See: https://ffmpeg.org/ffmpeg-filters.html#drawtext-1
  return text
    .replace(/\\/g, '\\\\') // Backslash must be escaped first
    .replace(/'/g, "'\\\\\\''") // Single quote
    .replace(/:/g, '\\:') // Colon
    .replace(/\n/g, '\\n') // Newline
    .replace(/\[/g, '\\[') // Left bracket
    .replace(/\]/g, '\\]') // Right bracket
    .replace(/%/g, '\\%'); // Percent
}

async function createTempVideoEnvironment(): Promise<{
  tempDir: string;
  outputPath: string;
  cleanup: () => void;
}> {
  const tempDir = path.join(os.tmpdir(), 'promptfoo-video');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const outputPath = path.join(tempDir, `output-video-${Date.now()}.mp4`);

  const cleanup = () => {
    try {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    } catch (error) {
      logger.warn(`Failed to clean up temporary files: ${error}`);
    }
  };

  return { tempDir, outputPath, cleanup };
}

export function getFallbackBase64(text: string): string {
  return Buffer.from(text).toString('base64');
}

async function textToVideo(text: string): Promise<string> {
  try {
    if (neverGenerateRemote()) {
      await checkFfmpegAvailable();
      const { outputPath, cleanup } = await createTempVideoEnvironment();

      try {
        const escapedText = escapeDrawtextString(text);
        const systemFont = getSystemFont();

        // Create a 5-second video with white background and text overlay
        await execa('ffmpeg', [
          '-f',
          'lavfi',
          '-i',
          'color=white:s=640x480:d=5',
          '-vf',
          `drawtext=fontfile=${systemFont}:text='${escapedText}':fontcolor=black:fontsize=24:x=(w-text_w)/2:y=(h-text_h)/2`,
          '-y', // Overwrite output file if it exists
          outputPath,
        ]);

        const videoData = fs.readFileSync(outputPath);
        const base64Video = videoData.toString('base64');
        cleanup();
        return base64Video;
      } catch (error) {
        logger.error(`Error creating video with ffmpeg: ${error}`);
        cleanup();
        throw error;
      }
    } else {
      throw new Error(
        'Local video generation requires FFmpeg to be installed. Future versions may support remote generation.',
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
          gracefulExit: true,
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
            originalText,
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
