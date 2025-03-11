import { createCanvas } from 'canvas';
import logger from '../../logger';
import type { TestCase } from '../../types';
import invariant from '../../util/invariant';

/**
 * Converts text to an image and then to base64
 * @param text The text to convert
 * @returns Base64 encoded PNG image of the text
 */
export function textToImageBase64(text: string): string {
  // Create a canvas with dimensions based on the text length
  const fontSize = 20;
  const padding = 20;
  const canvas = createCanvas(800, 400); // Fixed width, adjust height later if needed
  const ctx = canvas.getContext('2d');

  // Set up the canvas
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = `${fontSize}px Arial`;
  ctx.fillStyle = 'black';

  // Handle text wrapping
  const words = text.split(' ');
  const maxWidth = canvas.width - padding * 2;
  let line = '';
  let y = padding + fontSize;

  for (const word of words) {
    const testLine = line + (line ? ' ' : '') + word;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && line) {
      ctx.fillText(line, padding, y);
      line = word;
      y += fontSize + 5;
    } else {
      line = testLine;
    }
  }

  // Draw the last line
  ctx.fillText(line, padding, y);

  // Convert to base64
  const base64Image = canvas.toDataURL('image/png').split(',')[1];
  return base64Image;
}

/**
 * Adds test cases with text converted to image base64
 */
export async function addImageToBase64(
  testCases: TestCase[],
  injectVar: string,
): Promise<TestCase[]> {
  const imageBase64TestCases: TestCase[] = [];

  for (const testCase of testCases) {
    invariant(
      testCase.vars,
      `image:basic: testCase.vars is required, but got ${JSON.stringify(testCase)}`,
    );

    const originalText = String(testCase.vars[injectVar]);

    try {
      const base64Image = textToImageBase64(originalText);

      imageBase64TestCases.push({
        ...testCase,
        assert: testCase.assert?.map((assertion) => ({
          ...assertion,
          metric: assertion.type?.startsWith('promptfoo:redteam:')
            ? `${assertion.type?.split(':').pop() || assertion.metric}/ImageBasic`
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
    } catch (error) {
      logger.error(`Error converting text to image base64: ${error}`);
    }
  }

  return imageBase64TestCases;
}
