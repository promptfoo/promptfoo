const dedent = require('dedent');

/**
 * Detects MIME type from base64 magic numbers
 *
 * Note: This is duplicated from src/evaluatorHelpers.ts to keep the example
 * self-contained and runnable without dependencies on core promptfoo internals.
 *
 * Magic numbers (base64-encoded file signatures):
 * - JPEG: /9j/
 * - PNG: iVBORw0KGgo
 * - GIF: R0lGODlh or R0lGODdh
 * - WebP: UklGR (RIFF)
 * - BMP: Qk0 or Qk1
 * - TIFF: SUkq or TU0A
 * - ICO: AAABAA
 */
function getMimeTypeFromBase64(base64Data) {
  if (base64Data.startsWith('/9j/')) {
    return 'image/jpeg';
  } else if (base64Data.startsWith('iVBORw0KGgo')) {
    return 'image/png';
  } else if (base64Data.startsWith('R0lGODlh') || base64Data.startsWith('R0lGODdh')) {
    return 'image/gif';
  } else if (base64Data.startsWith('UklGR')) {
    return 'image/webp';
  } else if (base64Data.startsWith('Qk0') || base64Data.startsWith('Qk1')) {
    return 'image/bmp';
  } else if (base64Data.startsWith('SUkq') || base64Data.startsWith('TU0A')) {
    return 'image/tiff';
  } else if (base64Data.startsWith('AAABAA')) {
    return 'image/x-icon';
  }
  // Fallback to JPEG if no magic number is matched
  return 'image/jpeg';
}

module.exports = (context) => {
  return [
    {
      role: 'system',
      content: dedent`
        You are an AI assistant tasked with analyzing and classifying images. Your goal is to determine the type of clothing item depicted in the image and provide additional relevant information.

        Please analyze the image and provide:
        1. Classification (must be one of: T-shirt/top, Trouser, Pullover, Dress, Coat, Sandal, Shirt, Sneaker, Bag, Ankle boot)
        2. Primary color or color scheme
        3. Notable features or patterns
        4. Approximate style or era (e.g., modern, vintage, classic)
        5. Confidence level (1-10, where 1 is least confident and 10 is most confident)
        6. Brief reasoning for the classification

        Provide your response as a JSON object with the following structure:
        {
          "classification": string (one of the allowed categories),
          "color": string,
          "features": string,
          "style": string,
          "confidence": number (1-10),
          "reasoning": string
        }
      `,
    },
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: `data:${getMimeTypeFromBase64(context.vars.image_base64)};base64,${
              context.vars.image_base64
            }`,
          },
        },
      ],
    },
  ];
};
