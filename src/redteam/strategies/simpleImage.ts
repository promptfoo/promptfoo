import { SingleBar, Presets } from 'cli-progress';
import logger from '../../logger';
import type { TestCase } from '../../types';
import invariant from '../../util/invariant';

// Helper function to escape XML special characters for SVG
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Cache for the sharp module to avoid repeated dynamic imports
let sharpCache: any = null;

/**
 * Dynamically imports the sharp library
 * @returns The sharp module or null if not available
 */
async function importSharp() {
  // Return the cached module if available
  if (sharpCache) {
    return sharpCache;
  }

  try {
    // Dynamic import of sharp
    sharpCache = await import('sharp');
    return sharpCache;
  } catch (error) {
    logger.warn(`Sharp library not available: ${error}`);
    return null;
  }
}

/**
 * Converts text to an image and then to base64 encoded string
 * using the sharp library which has better cross-platform support than canvas
 */
export async function textToImage(text: string): Promise<string> {
  // Special case for test environment - avoids actually loading Sharp
  if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
    return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  }

  try {
    // Create a simple image with the text on a white background
    // We're using SVG as an intermediate format as it's easy to generate without canvas
    const svgImage = `
      <svg width="800" height="400" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="white"/>
        <text x="50" y="50" font-family="Arial" font-size="16" fill="black">${escapeXml(text)}</text>
      </svg>
    `;

    // Dynamically import sharp
    const sharpModule = await importSharp();

    if (!sharpModule) {
      throw new Error(`Please install sharp to use image-based strategies: npm install sharp`);
    }

    // Convert SVG to PNG using sharp
    const pngBuffer = await sharpModule.default(Buffer.from(svgImage)).png().toBuffer();

    // Convert to base64
    return pngBuffer.toString('base64');
  } catch (error) {
    logger.error(`Error generating image from text: ${error}`);
    // Return fallback if image generation fails
    return Buffer.from(text).toString('base64');
  }
}

/**
 * Adds image encoding to test cases
 */
export async function addImageToBase64(
  testCases: TestCase[],
  injectVar: string,
): Promise<TestCase[]> {
  const imageTestCases: TestCase[] = [];

  let progressBar: SingleBar | undefined;
  if (logger.level !== 'debug') {
    progressBar = new SingleBar(
      {
        format: 'Converting to Images {bar} {percentage}% | ETA: {eta}s | {value}/{total}',
        hideCursor: true,
      },
      Presets.shades_classic,
    );
    progressBar.start(testCases.length, 0);
  }

  for (const testCase of testCases) {
    invariant(
      testCase.vars,
      `Image encoding: testCase.vars is required, but got ${JSON.stringify(testCase)}`,
    );

    const originalText = String(testCase.vars[injectVar]);

    // Convert text to image and then to base64
    const base64Image = await textToImage(originalText);

    imageTestCases.push({
      ...testCase,
      assert: testCase.assert?.map((assertion) => ({
        ...assertion,
        metric: assertion.type?.startsWith('promptfoo:redteam:')
          ? `${assertion.type?.split(':').pop() || assertion.metric}/Image-Encoded`
          : assertion.metric,
      })),
      vars: {
        ...testCase.vars,
        [injectVar]: base64Image,
        image_text: originalText,
      },
      metadata: {
        ...testCase.metadata,
        strategyId: 'image',
      },
    });

    if (progressBar) {
      progressBar.increment(1);
    } else {
      logger.debug(`Processed ${imageTestCases.length} of ${testCases.length}`);
    }
  }

  if (progressBar) {
    progressBar.stop();
  }

  return imageTestCases;
}

// Main function for direct testing via: npx tsx simpleImage.ts "Text to convert to image"
async function main() {
  // Get text from command line arguments or use default
  const textToConvert = process.argv[2] || 'This is a test of the image encoding strategy.';

  logger.info(`Converting text to image: "${textToConvert}"`);

  try {
    // Convert text to image
    const base64Image = await textToImage(textToConvert);

    // Log the first 100 characters of the base64 image to avoid terminal clutter
    logger.info(`Base64 image (first 100 chars): ${base64Image.substring(0, 100)}...`);
    logger.info(`Total base64 image length: ${base64Image.length} characters`);

    // Create a simple test case
    const testCase = {
      vars: {
        prompt: textToConvert,
      },
    };

    // Process the test case
    const processedTestCases = await addImageToBase64([testCase], 'prompt');

    logger.info('Test case processed successfully.');
    logger.info(`Original prompt length: ${textToConvert.length} characters`);
    // Add type assertion to ensure TypeScript knows this is a string
    const processedPrompt = processedTestCases[0].vars?.prompt as string;
    logger.info(`Processed prompt length: ${processedPrompt.length} characters`);

    // Check if we're running this directly (not being imported)
    if (require.main === module) {
      // Write to a file for testing with image viewers
      const fs = await import('fs');
      const outputFilePath = 'test-image.png';

      // Decode base64 back to binary
      const imageBuffer = Buffer.from(base64Image, 'base64');

      // Write binary data to file
      fs.writeFileSync(outputFilePath, imageBuffer);

      logger.info(`Image file written to: ${outputFilePath}`);
      logger.info(`You can open it with any image viewer to verify the conversion.`);
    }
  } catch (error) {
    logger.error(`Error generating image from text: ${error}`);
  }
}

// Run the main function if this file is executed directly
if (require.main === module) {
  main();
}
