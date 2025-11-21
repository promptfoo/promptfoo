import { Presets, SingleBar } from 'cli-progress';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import invariant from '../../util/invariant';

import type { TestCase } from '../../types/index';

const SVG_WIDTH = 800;
const SVG_MIN_HEIGHT = 400;
const FONT_SIZE = 16;
const LINE_HEIGHT = Math.round(FONT_SIZE * 1.5);
const HORIZONTAL_PADDING = 50;
const VERTICAL_PADDING = 40;
const WORD_WRAP_CHAR_WIDTH_FACTOR = 0.6;

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

function wrapTextToLines(text: string, maxLineWidthPx: number, fontSize: number): string[] {
  const averageCharWidth = fontSize * WORD_WRAP_CHAR_WIDTH_FACTOR;
  const maxCharsPerLine = Math.max(1, Math.floor(maxLineWidthPx / averageCharWidth));
  const normalizedText = text.replace(/\r\n/g, '\n');
  const wrappedLines: string[] = [];

  for (const paragraph of normalizedText.split('\n')) {
    if (paragraph.trim() === '') {
      wrappedLines.push('');
      continue;
    }

    const words = paragraph.split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      if (!word) {
        continue;
      }

      if (word.length > maxCharsPerLine) {
        if (currentLine) {
          wrappedLines.push(currentLine);
          currentLine = '';
        }

        let sliceIndex = 0;
        while (sliceIndex < word.length) {
          const slice = word.slice(sliceIndex, sliceIndex + maxCharsPerLine);
          if (slice.length === maxCharsPerLine) {
            wrappedLines.push(slice);
          } else {
            currentLine = slice;
          }
          sliceIndex += maxCharsPerLine;
        }
        continue;
      }

      if (!currentLine) {
        currentLine = word;
      } else if (currentLine.length + 1 + word.length <= maxCharsPerLine) {
        currentLine = `${currentLine} ${word}`;
      } else {
        wrappedLines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine) {
      wrappedLines.push(currentLine);
    }
  }

  return wrappedLines;
}

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
async function textToImage(text: string): Promise<string> {
  // Special case for test environment - avoids actually loading Sharp
  if (getEnvString('NODE_ENV') === 'test' || getEnvString('JEST_WORKER_ID')) {
    return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  }

  try {
    // Create a simple image with the text on a white background
    // We're using SVG as an intermediate format as it's easy to generate without canvas
    const textAreaWidth = SVG_WIDTH - HORIZONTAL_PADDING * 2;
    const wrappedLines = wrapTextToLines(text, textAreaWidth, FONT_SIZE);
    const linesToRender = wrappedLines.length > 0 ? wrappedLines : [''];
    const contentHeight = linesToRender.length * LINE_HEIGHT;
    const svgHeight = Math.max(SVG_MIN_HEIGHT, VERTICAL_PADDING * 2 + contentHeight);
    const baselineY = VERTICAL_PADDING + FONT_SIZE;

    const textContent = linesToRender
      .map((line, index) => {
        const safeLine = escapeXml(line || ' ');
        if (index === 0) {
          return safeLine;
        }
        return `<tspan x="${HORIZONTAL_PADDING}" dy="${LINE_HEIGHT}">${safeLine}</tspan>`;
      })
      .join('');

    const svgImage = `
      <svg width="${SVG_WIDTH}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="white"/>
        <text x="${HORIZONTAL_PADDING}" y="${baselineY}" font-family="Arial" font-size="${FONT_SIZE}" fill="black" xml:space="preserve">${textContent}</text>
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
        gracefulExit: true,
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
        originalText,
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
