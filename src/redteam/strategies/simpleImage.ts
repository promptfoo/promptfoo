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

/**
 * Dynamically imports the sharp library
 * @returns The sharp module or null if not available
 */
async function importSharp() {
  try {
    // Dynamic import of sharp
    return await import('sharp');
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
      },
      metadata: {
        ...testCase.metadata,
        ...(testCase.metadata?.harmCategory && { harmCategory: testCase.metadata.harmCategory }),
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
