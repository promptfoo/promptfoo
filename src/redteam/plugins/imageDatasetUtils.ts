import logger from '../../logger';
import { parseChatPrompt } from '../../providers/shared';
import { fetchWithProxy } from '../../util/fetch/index';

/** Extract actual request text without copying image payloads into the grading rubric. */
export function getImageDatasetRequestText(prompt: unknown, image: unknown): string {
  if (typeof prompt !== 'string') {
    return '';
  }
  const imageUri = typeof image === 'string' ? image.trim() : '';
  const payload = imageUri.slice(imageUri.indexOf(',') + 1).replace(/\s/g, '');
  const selectedPayload = /^[\w+/=-]+$/.test(payload) ? payload : '';
  const redactImages = (text: string) => {
    const chunks: string[] = [];
    let end = 0;
    for (const match of text.matchAll(/data:[^\s,]*;base64,/gi)) {
      if (match.index < end) {
        continue;
      }
      const start = match.index + match[0].length;
      let cursor = start;
      let matched = 0;
      // Match only the selected payload across whitespace, stopping before any
      // following prose. Never build a regex proportional to the image size.
      while (cursor < text.length && matched < selectedPayload.length) {
        if (/\s/.test(text[cursor])) {
          cursor++;
        } else if (text[cursor] === selectedPayload[matched]) {
          matched++;
          cursor++;
        } else {
          break;
        }
      }
      if (!selectedPayload || matched !== selectedPayload.length) {
        cursor = start;
      }
      while (cursor < text.length && /[\w+/=-]/.test(text[cursor])) {
        cursor++;
      }
      chunks.push(text.slice(end, match.index));
      end = cursor;
    }
    return [...chunks, text.slice(end)].join('').trim();
  };
  let parsed: unknown;
  try {
    parsed = parseChatPrompt<unknown>(prompt, prompt);
  } catch {
    // Other targets accept literal text beginning with braces. Never fall back to
    // copying malformed native image objects, which may contain bare base64 data.
    return /(?:^|[\s,{])["']?(?:image|source|inline_?data)["']?\s*:/i.test(prompt)
      ? ''
      : redactImages(prompt);
  }
  const request = parsed as { system_instruction?: unknown; contents?: unknown[] } | null;
  const messages = Array.isArray(parsed)
    ? parsed
    : Array.isArray(request?.contents)
      ? request.contents
      : [parsed];
  const system = request?.system_instruction;
  if (system) {
    messages.unshift(
      typeof system === 'object'
        ? { ...system, role: 'system' }
        : { role: 'system', content: system },
    );
  }
  return messages
    .map((message) => {
      if (typeof message === 'string') {
        return redactImages(message);
      }
      if (!message || typeof message !== 'object') {
        return '';
      }
      const { role, content, parts } = message as Record<string, unknown>;
      const body = content ?? parts ?? message;
      const text = (Array.isArray(body) ? body : [body])
        .map((part) => {
          if (typeof part === 'string') {
            return redactImages(part);
          }
          return part &&
            typeof part.text === 'string' &&
            (part.type === undefined || ['text', 'input_text', 'output_text'].includes(part.type))
            ? redactImages(part.text)
            : '';
        })
        .filter(Boolean)
        .join('\n');
      if (!text) {
        return '';
      }
      return ['system', 'developer', 'user', 'assistant', 'model', 'tool'].includes(String(role))
        ? `${role}: ${text}`
        : text;
    })
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Detect image format from buffer
 */
function detectImageFormat(buffer: Buffer): string {
  // Check PNG signature
  if (buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    return 'image/png';
  }
  // Check GIF signature
  const gif = buffer.subarray(0, 6);
  if (gif.equals(Buffer.from('GIF87a')) || gif.equals(Buffer.from('GIF89a'))) {
    return 'image/gif';
  }
  // Check WebP signature
  if (
    buffer.subarray(0, 4).equals(Buffer.from('RIFF')) &&
    buffer.subarray(8, 12).equals(Buffer.from('WEBP'))
  ) {
    return 'image/webp';
  }
  // Default to JPEG for unknown formats
  return 'image/jpeg';
}

/**
 * Fetches an image from a URL and converts it to base64
 * @param url - The URL of the image to fetch
 * @param pluginId - The plugin ID for logging purposes
 * @returns Base64 encoded image with data URI prefix, or null on failure
 */
export async function fetchImageAsBase64(url: string, pluginId: string): Promise<string | null> {
  try {
    logger.debug(`[${pluginId}] Fetching image from URL`);
    const response = await fetchWithProxy(url);

    if (!response.ok) {
      logger.warn(`[${pluginId}] Failed to fetch image: ${response.statusText}`);
      return null;
    }

    // Get image as array buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Convert to base64
    const base64 = buffer.toString('base64');

    // Determine MIME type from response headers or detect from buffer
    let contentType = response.headers.get('content-type');
    if (!contentType || contentType === 'binary/octet-stream') {
      contentType = detectImageFormat(buffer);
    }

    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    logger.error(
      `[${pluginId}] Error fetching image: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/**
 * Fisher-Yates shuffle algorithm for unbiased randomization
 * @param array - Array to shuffle
 * @returns Shuffled array (mutates in place and returns same array)
 */
export function fisherYatesShuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Safe string field getter with default value
 */
export function getStringField(field: unknown, defaultValue: string = ''): string {
  return typeof field === 'string' ? field : defaultValue;
}
