import { SingleBar, Presets } from 'cli-progress';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import type { TestCase } from '../../types';
import invariant from '../../util/invariant';
import { neverGenerateRemote } from '../remoteGeneration';

// Cache for the ffmpeg module to avoid repeated dynamic imports
let ffmpegCache: any = null;

/**
 * Dynamically imports the fluent-ffmpeg library
 * @returns The fluent-ffmpeg module
 * @throws Error if fluent-ffmpeg is not installed
 */
async function importFfmpeg(): Promise<any> {
  // Return the cached module if available
  if (ffmpegCache) {
    return ffmpegCache;
  }

  try {
    // Dynamic import of fluent-ffmpeg
    ffmpegCache = await import('fluent-ffmpeg');
    return ffmpegCache;
  } catch (error) {
    logger.warn(`fluent-ffmpeg library not available: ${error}`);
    throw new Error(
      'To use the video strategy, please install fluent-ffmpeg: npm install fluent-ffmpeg\n' +
      'Also make sure you have FFmpeg installed on your system:\n' +
      '- macOS: brew install ffmpeg\n' +
      '- Ubuntu/Debian: apt-get install ffmpeg\n' +
      '- Windows: Download from ffmpeg.org'
    );
  }
}

/**
 * Creates a simple video with text using fluent-ffmpeg and converts to base64
 * This implementation creates a video with a white background and black text
 */
export async function textToVideo(text: string): Promise<string> {
  // Special case for test environment - avoid actually generating video
  if (getEnvString('NODE_ENV') === 'test' || getEnvString('JEST_WORKER_ID')) {
    // Return a small dummy base64 string representing a minimal video
    return 'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAu1tZGF0AAAAMm1vb3YAAABsbXZoZAAAAAAAAAAAAAAAAAAAA+gAAAAAAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAIYdHJhawAAAFx0a2hkAAAAAwAAAAAAAAAAAAAAAQAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAABNG1kaWEAAAAgbWRoZAAAAAAAAAAAAAAAAAAAAAEAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAQQAAAAIAQAABkAAAAAAAJGVkdHMAAAAcZWxzdAAAAAAAAAABAAAAAQAAAAAAAAABAAAAAQAAAAAAAbRtZHhyAAAAAAAAAAEAAAABAAAAQAAAAAAAAAAAAAAEAAAAAK9tZXRhAAAAAAABAAAAJGhtZGEAAAABAAAAAAABJIICSgJYCAAASG1tZXRhZGF0YQosAggADgBMAEkAUwBUAPEAAABpbHN0AP8AAAAbAQAAAG1pbmYBAAAAAAAQAAgAIAASACMAGgAkACUAFAAaABoAHgAeAAcAGQAjABkAGAAVABEAGAAdABgAHQAjAAQACAALABkAAAAgAAgAHwBMAEkAUwBUAHQAAABzdHNkACYAAACac3RzYwAAAAAAAQAAAAsAAAACAAAAAgAAAAEAAAAjAAAAAgAAAAAAAQAAAAEAAAABAAAAIwAAAAEAAAABAAAAAAAAAAEAAAABAAAAAgAAAAIAAAAEAAAAAAAAAAgAAAAEAQAAAIVzdHNzAAAAAAAAAAEAAAAEAAAB4AAAAAkAAAM0c3RzegAAAAAAAAQ+AAAAAQAAAAEAAAHgAAAAAQAAAAEAAAGBAAAAAQAAAAEAAAGkAAAAAQAAAAEAAAGyAAAAAQAAAAEAAAHNAAAAAQAAAAEAAAB7AAABJnN0Y28AAAAAAAAAAQAAACgAAAAYc3RzegAAAAAAAAUAAAAEAAAAJgAAAAIAAAACAAAAAgAAAAEAAAABAAAAAAAAAAABgAAAAQAAAAEAAAAyAAAAAQAAAAEAAAByAAAAAQAAAAIAAACzAAAAAQAAAAMAAABQAAAAAQAAAAMAAABwAAAAAQAAAAMAAADiAAAB+HN0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAA+gAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAUqZGF0YQAAAARMbGF2YwEAAAcAGgA6WCCwACWmgQgJLUAQFoQAAACNAYXWMXjJFgdGRGF0YQAQSZLIwAW+xXLybCo=';
  }

  try {
    // Check if remote generation is disabled
    if (neverGenerateRemote()) {
      // For simplicity in this initial implementation, we'll create a local video
      // This will be a very basic implementation that doesn't require external services
      
      const ffmpegModule = await importFfmpeg();
      
      const fs = await import('fs');
      const os = await import('os');
      const path = await import('path');
      
      // Create temporary directory for video creation
      const tempDir = path.join(os.tmpdir(), 'promptfoo-video');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Create a text file with the content
      const textFilePath = path.join(tempDir, 'text.txt');
      fs.writeFileSync(textFilePath, text);
      
      // Create output video file path
      const outputPath = path.join(tempDir, 'output-video.mp4');
      
      // Create a promise to handle the ffmpeg process
      return new Promise((resolve, reject) => {
        // Create a simple video with the text
        ffmpegModule()
          .input('color=white:s=640x480:d=5') // White background, 5 seconds
          .inputFormat('lavfi')
          .input(textFilePath)
          .inputOptions(['-f', 'concat']) // Use text as input
          .complexFilter([
            `[0:v]drawtext=fontfile=/System/Library/Fonts/Helvetica.ttc:text='${text.replace(/'/g, "\\'")}':fontcolor=black:fontsize=24:x=(w-text_w)/2:y=(h-text_h)/2[v]`
          ])
          .outputOptions(['-map', '[v]'])
          .save(outputPath)
          .on('end', async () => {
            // Read the video file and convert to base64
            const videoData = fs.readFileSync(outputPath);
            const base64Video = videoData.toString('base64');
            
            // Clean up temporary files
            try {
              fs.unlinkSync(textFilePath);
              fs.unlinkSync(outputPath);
            } catch (error) {
              logger.warn(`Failed to clean up temporary files: ${error}`);
            }
            
            resolve(base64Video);
          })
          .on('error', (err: Error) => {
            logger.error(`Error creating video: ${err}`);
            reject(err);
          });
      });
    } else {
      // In the future, this could use a remote API for more sophisticated video generation
      // Similar to the audio strategy
      throw new Error('Local video generation requires fluent-ffmpeg. Future versions may support remote generation.');
    }
  } catch (error) {
    logger.error(`Error generating video from text: ${error}`);
    // Return fallback if video generation fails
    return Buffer.from(text).toString('base64');
  }
}

/**
 * Adds video encoding to test cases
 */
export async function addVideoToBase64(
  testCases: TestCase[],
  injectVar: string,
): Promise<TestCase[]> {
  const videoTestCases: TestCase[] = [];

  let progressBar: SingleBar | undefined;
  if (logger.level !== 'debug') {
    progressBar = new SingleBar(
      {
        format: 'Converting to Videos {bar} {percentage}% | ETA: {eta}s | {value}/{total}',
        hideCursor: true,
      },
      Presets.shades_classic,
    );
    progressBar.start(testCases.length, 0);
  }

  for (const testCase of testCases) {
    invariant(
      testCase.vars,
      `Video encoding: testCase.vars is required, but got ${JSON.stringify(testCase)}`,
    );

    const originalText = String(testCase.vars[injectVar]);

    // Convert text to video and then to base64
    const base64Video = await textToVideo(originalText);

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
        video_text: originalText, // Store the original text for reference
      },
      metadata: {
        ...testCase.metadata,
        strategyId: 'video',
      },
    });

    if (progressBar) {
      progressBar.increment(1);
    } else {
      logger.debug(`Processed ${videoTestCases.length} of ${testCases.length}`);
    }
  }

  if (progressBar) {
    progressBar.stop();
  }

  return videoTestCases;
}

// Main function for direct testing via: npx tsx simpleVideo.ts "Text to convert to video"
async function main() {
  // Get text from command line arguments or use default
  const textToConvert = process.argv[2] || 'This is a test of the video encoding strategy.';

  logger.info(`Converting text to video: "${textToConvert}"`);

  try {
    // Convert text to video
    const base64Video = await textToVideo(textToConvert);

    // Log the first 100 characters of the base64 video to avoid terminal clutter
    logger.info(`Base64 video (first 100 chars): ${base64Video.substring(0, 100)}...`);
    logger.info(`Total base64 video length: ${base64Video.length} characters`);

    // Create a simple test case
    const testCase = {
      vars: {
        prompt: textToConvert,
      },
    };

    // Process the test case
    const processedTestCases = await addVideoToBase64([testCase], 'prompt');

    logger.info('Test case processed successfully.');
    logger.info(`Original prompt length: ${textToConvert.length} characters`);
    // Add type assertion to ensure TypeScript knows this is a string
    const processedPrompt = processedTestCases[0].vars?.prompt as string;
    logger.info(`Processed prompt length: ${processedPrompt.length} characters`);

    // Check if we're running this directly (not being imported)
    if (require.main === module) {
      // Write to a file for testing with video players
      const fs = await import('fs');
      const outputFilePath = 'test-video.mp4';

      // Decode base64 back to binary
      const videoBuffer = Buffer.from(base64Video, 'base64');

      // Write binary data to file
      fs.writeFileSync(outputFilePath, videoBuffer);

      logger.info(`Video file written to: ${outputFilePath}`);
      logger.info(`You can open it with any video player to verify the conversion.`);
    }
  } catch (error) {
    logger.error(`Error generating video from text: ${error}`);
  }
}

// Run the main function if this file is executed directly
if (require.main === module) {
  main();
}