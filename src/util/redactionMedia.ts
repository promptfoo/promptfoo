import { BLOB_SCHEME } from '../blobs/constants';

import type { ProviderResponse } from '../types';

const MAX_MEDIA_NODES = 10_000;

// Storage and browser callers only need a conservative classification. The local
// verifier supplies full HTML and Markdown parsers to distinguish inert markup.
export function hasPrivateMedia(
  response: ProviderResponse | null | undefined,
  richMarkup: (text: string) => boolean = (text) =>
    /!\[|<(?:input|link|style)\b|\b(?:style|srcdoc|on\w+)\s*=|javascript:/i.test(text),
): boolean {
  try {
    return inspectMedia(response, richMarkup);
  } catch {
    // Opaque SDK objects, throwing accessors and parser failures cannot establish a clean result.
    return true;
  }
}

function inspectMedia(
  response: ProviderResponse | null | undefined,
  richMarkup: (text: string) => boolean,
): boolean {
  const pending: unknown[] = [response];
  const seen = new Set<object>();
  const seenText = new Set<string>();
  let inspected = 0;
  let inspectedCharacters = 0;
  while (pending.length) {
    if (++inspected > MAX_MEDIA_NODES) {
      return true;
    }
    const value = pending.pop();
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
      return true;
    }
    if (typeof value === 'string') {
      let text = value;
      if (seenText.has(text)) {
        continue;
      }
      seenText.add(text);
      for (let depth = 0; ; depth++) {
        inspectedCharacters += text.length;
        if (inspectedCharacters > 16 * 1024 * 1024) {
          return true;
        }
        if (!/%[\da-f]{2}/i.test(text)) {
          break;
        }
        if (depth === 8) {
          return true;
        }
        try {
          text = decodeURIComponent(text);
        } catch {
          return true;
        }
      }
      if (
        text.includes(BLOB_SCHEME) ||
        /\bdata:\S|<(?:svg|img|audio|video|picture|source|object|embed|script|iframe)(?:\s|\/?>)/i.test(
          text,
        ) ||
        richMarkup(text)
      ) {
        return true;
      }
      if (/^\s*[[{"]/.test(text)) {
        // Bound allocations inside JSON.parse before traversing the parsed value.
        if (text.length > 1024 * 1024) {
          return true;
        }
        try {
          pending.push(JSON.parse(text));
        } catch {
          // Plain text is checked by the text verifier.
        }
      }
    } else if (value && typeof value === 'object' && !seen.has(value)) {
      const prototype = Object.getPrototypeOf(value);
      const remaining = MAX_MEDIA_NODES - inspected - pending.length;
      if (
        ArrayBuffer.isView(value) ||
        (Array.isArray(value)
          ? prototype !== Array.prototype || value.length > remaining
          : prototype !== null && prototype !== Object.prototype) ||
        typeof (value as { toJSON?: unknown }).toJSON === 'function'
      ) {
        return true;
      }
      seen.add(value);
      const record = value as Record<string, unknown>;
      const image = record.image as Record<string, unknown> | undefined;
      const audio = record.audio as ProviderResponse['audio'];
      const video = record.video as ProviderResponse['video'];
      if (
        record.redactionMediaOmitted === true ||
        record.isBase64 === true ||
        record.kind === 'file' ||
        record.fileWithBytes ||
        record.fileWithUri ||
        (record.type === 'Buffer' && Array.isArray(record.data)) ||
        (typeof record.b64_json === 'string' && record.b64_json.length > 0) ||
        (Array.isArray(record.images) && record.images.length > 0) ||
        ([record.mimeType, record.mime_type, record.mediaType, record.media_type].some(
          (mime) => typeof mime === 'string' && /^\s*(?:image|audio|video)\//i.test(mime),
        ) &&
          [
            record.data,
            record.raw,
            record.bytesBase64Encoded,
            record.base64Data,
            record.url,
            record.uri,
            record.fileUri,
            record.file_uri,
          ].some((payload) =>
            typeof payload === 'string'
              ? payload.length > 0
              : payload && typeof payload === 'object',
          )) ||
        (typeof record.type === 'string' &&
          /^(?:(?:input|output)_)?(?:image|audio|video)(?:_url)?$/.test(record.type)) ||
        image?.data ||
        image?.url ||
        image?.blobRef ||
        record.image_url ||
        record.audio_url ||
        record.video_url ||
        audio?.id ||
        audio?.data ||
        audio?.blobRef ||
        video
      ) {
        return true;
      }
      for (const key in record) {
        if (Object.hasOwn(record, key)) {
          if (pending.length + inspected + 2 > MAX_MEDIA_NODES) {
            return true;
          }
          const property = Object.getOwnPropertyDescriptor(record, key);
          if (!property || !('value' in property)) {
            return true;
          }
          pending.push(key, property.value);
        }
      }
    }
  }
  return false;
}
