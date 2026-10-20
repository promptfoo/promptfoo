import { randomUUID } from 'crypto';
import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';

import { Presets, SingleBar } from 'cli-progress';
import cliState from '../../cliState';
import logger from '../../logger';
import invariant from '../../util/invariant';
import { runCommand } from '../../util/runCommand';
import { neverGenerateRemote } from '../remoteGeneration';
import { appendPluginMetricSuffix } from './assertions';

import type { TestCase } from '../../types/index';

function shouldShowProgressBar(): boolean {
  return !cliState.webUI && logger.level !== 'debug';
}

async function getSystemFont(): Promise<string> {
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
      try {
        await fsPromises.access(fontPath);
        return fontPath;
      } catch {
        continue;
      }
    }

    // Fallback to a generic font name that ffmpeg might resolve
    return 'DejaVu-Sans';
  }
}

let ffmpegAvailable = false;

async function checkFfmpegAvailable(): Promise<void> {
  if (ffmpegAvailable) {
    return;
  }
  try {
    await runCommand('ffmpeg', ['-version']);
    ffmpegAvailable = true;
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

function escapeDrawtextValue(value: string): string {
  // Values are single-quoted in the filtergraph, then parsed again as drawtext
  // options. An apostrophe needs an escaped backslash to survive both parsers.
  // See: https://ffmpeg.org/ffmpeg-filters.html#Notes-on-filtergraph-escaping
  return value
    .replace(/\\/g, '\\\\') // Backslash must be escaped first (special even in single-quoted strings)
    .replace(/'/g, "'\\\\\\''") // Close quote, escape for both parsers, reopen quote
    .replace(/:/g, '\\:'); // Colon (option separator even within single-quoted values)
}

export function escapeDrawtextString(text: string): string {
  return escapeDrawtextValue(text)
    .replace(/\n/g, '\\n') // Newline
    .replace(/%/g, '%%'); // Percent: drawtext uses %{} expansion; %% is the literal
}

async function createTempVideoEnvironment() {
  const tempDir = path.join(os.tmpdir(), 'promptfoo-video');
  await fsPromises.mkdir(tempDir, { recursive: true });

  const outputPath = path.join(tempDir, `output-video-${randomUUID()}.mp4`);

  const cleanup = async () => {
    try {
      await fsPromises.unlink(outputPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      logger.warn(`Failed to clean up temporary files: ${error}`);
    }
  };

  return { outputPath, cleanup };
}

async function textToVideo(text: string): Promise<string> {
  try {
    if (neverGenerateRemote()) {
      await checkFfmpegAvailable();
      const { outputPath, cleanup } = await createTempVideoEnvironment();

      try {
        const escapedText = escapeDrawtextString(text);
        const escapedFont = escapeDrawtextValue(await getSystemFont());

        // Create a 5-second video with white background and text overlay
        await runCommand('ffmpeg', [
          '-f',
          'lavfi',
          '-i',
          'color=white:s=640x480:d=5',
          '-vf',
          `drawtext=fontfile='${escapedFont}':text='${escapedText}':fontcolor=black:fontsize=24:x=(w-text_w)/2:y=(h-text_h)/2`,
          '-y', // Overwrite output file if it exists
          outputPath,
        ]);

        const videoData = await fsPromises.readFile(outputPath);
        const base64Video = videoData.toString('base64');
        await cleanup();
        return base64Video;
      } catch (error) {
        logger.error(`Error creating video with ffmpeg: ${error}`);
        await cleanup();
        throw error;
      }
    } else {
      throw new Error(
        'Local video generation requires FFmpeg to be installed. Future versions may support remote generation.',
      );
    }
  } catch (error) {
    logger.error(`Error generating video from text: ${error}`);
    return Buffer.from(text).toString('base64');
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
          assert: appendPluginMetricSuffix(testCase, 'Video-Encoded'),
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
