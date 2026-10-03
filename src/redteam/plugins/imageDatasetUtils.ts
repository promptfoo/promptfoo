import logger from '../../logger';
import { parseChatPrompt } from '../../providers/shared';
import { fetchWithProxy } from '../../util/fetch/index';

/** Preserve actual request context while keeping image payloads out of the rubric. */
export function getImageDatasetRequestText(
  prompt: unknown,
  inputVars: Record<string, unknown> = {},
  selectedImage?: unknown,
): string {
  if (typeof prompt !== 'string') {
    return '';
  }
  // Other input images help identify byte boundaries, but are never attached to the judge.
  const images = Object.values(Object.getOwnPropertyDescriptors(inputVars))
    .filter((descriptor) => descriptor.enumerable)
    .map((descriptor) => descriptor.value)
    // Only the explicitly selected media may have internal whitespace. Other
    // variables can contain a whole request beginning with an image URI.
    .filter((value) => typeof value === 'string' && !/\s/.test(value.trim()));
  const payloads = [selectedImage, ...images]
    .filter(
      (value): value is string =>
        typeof value === 'string' && /^\s*data:image\/[^,]*;base64,/i.test(value),
    )
    .map((value) => value.slice(value.indexOf(',') + 1).replace(/\s/g, ''))
    .filter((value) => /^[\w+/=-]+$/.test(value))
    .sort((a, b) => b.length - a.length);
  const imageBoundaryError =
    'Image grading cannot distinguish wrapped image data from request text. Use a single-line data URI variable or structured media field.';
  const redactImages = (text: string) => {
    const chunks: string[] = [];
    let end = 0;
    for (const match of text.matchAll(/data:[^\s,]*;base64,/gi)) {
      if (match.index < end) {
        continue;
      }
      const start = match.index + match[0].length;
      let cursor = start;
      const known = payloads.some((payload) => {
        cursor = start;
        let matched = 0;
        // Compare known bytes across whitespace without constructing an image-sized regex.
        while (cursor < text.length && matched < payload.length) {
          if (/\s/.test(text[cursor])) {
            cursor++;
          } else if (text[cursor] === payload[matched]) {
            matched++;
            cursor++;
          } else {
            break;
          }
        }
        return matched === payload.length && !/[\w+/=-]/.test(text[cursor] ?? '');
      });
      if (!known) {
        cursor = start;
      }
      while (cursor < text.length && /[\w+/=-]/.test(text[cursor])) {
        cursor++;
      }
      // Base64 and ordinary words share an alphabet. Without known image bytes,
      // whitespace cannot tell us where a wrapped payload ends and a query begins.
      if (!known && (text[cursor] === '\\' || /^\s+[\w+/=-]/.test(text.slice(cursor)))) {
        throw new Error(imageBoundaryError);
      }
      chunks.push(text.slice(end, match.index));
      end = cursor;
    }
    let redacted = [...chunks, text.slice(end)].join('');
    // Custom request templates can send known image bytes without the URI prefix.
    if (payloads.includes(redacted.replace(/\s/g, ''))) {
      return '';
    }
    for (const payload of payloads) {
      redacted = redacted.split(payload).join('');
    }
    const remaining = redacted.replace(/\s/g, '');
    if (payloads.some((payload) => remaining.includes(payload))) {
      throw new Error(imageBoundaryError);
    }
    return redacted.trim();
  };
  const jsonContainer = /^\s*(?:\{|\[\s*(?:["[{\]]|-?\d|true\b|false\b|null\b))/;
  const mediaType =
    /^(?:image|image_url|input_image|audio|input_audio|video|file|input_file|base64)$/;
  const mediaContainerField =
    /^(?:images?|image_url|input_image|input_audio|inline_?data|file_?data)$/i;
  const mediaMime = /^(?:image|audio|video)\//i;
  const rejectMalformedMedia = (text: string) => {
    const yaml = /^\s*- role:/.test(text);
    if (!yaml && (!jsonContainer.test(text) || !text.includes('{'))) {
      return;
    }
    // JSON property markers require an object, not just bracket-prefixed prose.
    const properties = yaml
      ? /(?:[{,]|\n|^)\s*(?:-\s*)?["']?(\w+)["']?\s*:\s*["']?([\w/.-]*)/g
      : /[{,]\s*["']?(\w+)["']?\s*:\s*["']?([\w/.-]*)/g;
    const markedMedia = [...text.matchAll(properties)].some(
      ([, key, value]) =>
        mediaContainerField.test(key) ||
        key === 'source' ||
        (key === 'type' && mediaType.test(value)) ||
        (['mimeType', 'mime_type', 'media_type'].includes(key) && mediaMime.test(value)),
    );
    if (markedMedia) {
      throw new Error(
        'Image grading cannot safely read malformed media. Use valid JSON or YAML with a structured media field.',
      );
    }
  };
  let parsed: unknown;
  try {
    parsed = parseChatPrompt<unknown>(prompt, prompt);
  } catch {
    // Preserve literal brace-prefixed requests, but never copy malformed native media.
    rejectMalformedMedia(prompt);
    return redactImages(prompt);
  }
  let hasText = false;
  const sanitize = (
    value: unknown,
    key = '',
    literalText = false,
    mediaContainer = false,
    literalData = false,
  ): unknown => {
    if (Array.isArray(value)) {
      return value
        .map((part) => sanitize(part, key, literalText, mediaContainer, literalData))
        .filter((part) => part !== undefined);
    }
    if (value && typeof value === 'object') {
      const object = value as Record<string, unknown>;
      const media =
        mediaContainer ||
        mediaType.test(String(object.type)) ||
        [object.mimeType, object.mime_type, object.media_type].some(
          (mime) => typeof mime === 'string' && mediaMime.test(mime),
        );
      const nativeMessage = [
        'system',
        'developer',
        'user',
        'assistant',
        'model',
        'tool',
        'function',
      ].includes(String(object.role));
      const nativeTextPart =
        typeof object.text === 'string' &&
        [undefined, 'text', 'input_text', 'output_text'].some((type) => type === object.type);
      return Object.fromEntries(
        Object.entries(object).flatMap(([field, child]) => {
          // Encoded payload fields are opaque even when JSON represents their
          // bytes as Buffer/typed-array objects. Their containers may carry text.
          if (
            !literalData &&
            ((media &&
              /^(?:data|bytes|url|uri|base64|file_?(?:data|uri|url|id)|s3Location)$/i.test(
                field,
              )) ||
              (key === 'source' && field === 'bytes' && typeof child !== 'number'))
          ) {
            return [];
          }
          const toolData =
            literalData ||
            (object.type === 'tool_use' && field === 'input') ||
            (key === 'functionCall' && field === 'args') ||
            (key === 'functionResponse' && field === 'response');
          const toolText =
            (object.type === 'function_call' && field === 'arguments') ||
            (object.type === 'function_call_output' && field === 'output') ||
            (object.type === 'tool_result' && field === 'content') ||
            (['function', 'function_call'].includes(key) &&
              typeof object.name === 'string' &&
              field === 'arguments');
          const mediaField =
            !literalData && (mediaContainerField.test(field) || (media && field === 'source'));
          const sanitized = sanitize(
            child,
            field,
            literalText ||
              toolData ||
              toolText ||
              (nativeMessage && ['content', 'parts'].includes(field)) ||
              (nativeTextPart && field === 'text'),
            mediaField,
            toolData,
          );
          return sanitized === undefined ? [] : [[field, sanitized]];
        }),
      );
    }
    if (mediaContainer) {
      return undefined;
    }
    if (typeof value === 'string') {
      // HTTP targets may parse JSON stored inside another request field.
      if (!literalText && jsonContainer.test(value)) {
        try {
          return sanitize(JSON.parse(value));
        } catch (error) {
          if (!(error instanceof SyntaxError)) {
            throw error;
          }
          rejectMalformedMedia(value);
        }
      }
      const text = redactImages(value);
      if (text && !['role', 'type', 'mimeType', 'mime_type', 'media_type'].includes(key)) {
        hasText = true;
      }
      return text || undefined;
    }
    hasText ||= value !== undefined && value !== null;
    return value;
  };
  const sanitized = sanitize(parsed);
  return hasText ? (typeof sanitized === 'string' ? sanitized : JSON.stringify(sanitized)) : '';
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
