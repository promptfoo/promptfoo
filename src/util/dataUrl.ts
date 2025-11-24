/**
 * Data URL parsing and manipulation utilities for vision model support
 * Implements RFC 2397 data URL parsing
 *
 * ## Data URL Format
 * Data URLs have the format: `data:<mimeType>;base64,<base64Data>`
 * Example: `data:image/jpeg;base64,/9j/4AAQSkZJRg...`
 *
 * ## Supported Image Formats
 * - JPEG/JPG (image/jpeg)
 * - PNG (image/png)
 * - GIF (image/gif)
 * - WebP (image/webp)
 * - BMP (image/bmp)
 * - TIFF (image/tiff)
 * - ICO (image/x-icon)
 * - AVIF (image/avif)
 * - HEIC/HEIF (image/heic)
 * - SVG (image/svg+xml)
 *
 * ## Provider Requirements
 * Different vision providers have different requirements:
 * - **OpenAI/Azure/Ollama**: Accept data URLs natively (no conversion needed)
 * - **Anthropic**: Expects raw base64 with separate media_type field
 * - **Google Gemini**: Expects raw base64 in inlineData.data field
 *
 * These utilities enable transparent conversion between formats, allowing
 * promptfoo to generate data URLs from file:// inputs while providers
 * automatically convert to their required format.
 */

export interface ParsedDataUrl {
  mimeType: string;
  base64Data: string;
}

/**
 * Check if a string is a data URL
 * @param value String to check
 * @returns true if value is a data URL (starts with "data:")
 *
 * @example
 * isDataUrl("data:image/jpeg;base64,/9j/...") // true
 * isDataUrl("/9j/4AAQSkZJRg...") // false
 * isDataUrl("https://example.com/image.jpg") // false
 */
export function isDataUrl(value: string): boolean {
  return typeof value === 'string' && value.startsWith('data:') && value.length > 5;
}

/**
 * Parse a data URL into its components
 * @param dataUrl Data URL string
 * @returns Parsed components (mimeType and base64Data) or null if invalid
 *
 * @example
 * parseDataUrl("data:image/jpeg;base64,/9j/...")
 * // { mimeType: "image/jpeg", base64Data: "/9j/..." }
 *
 * parseDataUrl("invalid") // null
 */
export function parseDataUrl(dataUrl: string): ParsedDataUrl | null {
  if (!isDataUrl(dataUrl)) {
    return null;
  }

  // Match: data:<mimeType>;base64,<data>
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    base64Data: match[2],
  };
}

/**
 * Extract base64 data from a data URL or return original if not a data URL
 * Useful for providers that expect raw base64 (Anthropic, Google)
 *
 * @param value Data URL or raw base64 string
 * @returns Raw base64 string (data URL prefix stripped if present)
 *
 * @example
 * extractBase64FromDataUrl("data:image/jpeg;base64,/9j/...")
 * // "/9j/..."
 *
 * extractBase64FromDataUrl("/9j/...") // "/9j/..." (unchanged)
 */
export function extractBase64FromDataUrl(value: string): string {
  const parsed = parseDataUrl(value);
  return parsed ? parsed.base64Data : value;
}
