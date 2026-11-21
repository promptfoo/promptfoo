/** Supported JavaScript and TypeScript extensions. */
export const JAVASCRIPT_EXTENSIONS = ['js', 'cjs', 'mjs', 'ts', 'cts', 'mts'];

/** Matches JavaScript and TypeScript extensions case-insensitively. */
export function isJavascriptFile(filePath: string): boolean {
  return new RegExp(`\\.(${JAVASCRIPT_EXTENSIONS.join('|')})$`, 'i').test(filePath);
}

/** Recognizes a non-exhaustive set of image extensions. */
export function isImageFile(filePath: string): boolean {
  const imageExtensions = [
    'jpg',
    'jpeg',
    'png',
    'gif',
    'bmp',
    'webp',
    'svg',
    'heic',
    'heif',
    'avif',
    'tif',
    'tiff',
  ];
  const fileExtension = filePath.split('.').pop()?.toLowerCase() || '';
  return imageExtensions.includes(fileExtension);
}

/** Recognizes a non-exhaustive set of video extensions. */
export function isVideoFile(filePath: string): boolean {
  const videoExtensions = [
    'mp4',
    'mpeg',
    'mpg',
    'webm',
    'ogg',
    'mov',
    'avi',
    'flv',
    'wmv',
    'mkv',
    'm4v',
    '3gp',
    '3gpp',
  ];
  const fileExtension = filePath.split('.').pop()?.toLowerCase() || '';
  return videoExtensions.includes(fileExtension);
}

/** Recognizes a non-exhaustive set of audio extensions. */
export function isAudioFile(filePath: string): boolean {
  const audioExtensions = [
    'wav',
    'mp3',
    'ogg',
    'aac',
    'm4a',
    'flac',
    'wma',
    'aif',
    'aiff',
    'aifc',
    'opus',
  ];
  const fileExtension = filePath.split('.').pop()?.toLowerCase() || '';
  return audioExtensions.includes(fileExtension);
}

// Matches the leading slash + Windows drive prefix from canonical `file:///C:/...`
// URLs (e.g. `/C:/` or `/C:\`). Only stripped on Windows so POSIX paths that
// legitimately start with `/X:` (a directory literally named `X:`) are preserved.
const WIN32_DRIVE_PREFIX = /^\/[A-Za-z]:[\\/]/;

function normalizeFilePath(filePath: string): string {
  if (
    typeof process !== 'undefined' &&
    process.platform === 'win32' &&
    WIN32_DRIVE_PREFIX.test(filePath)
  ) {
    return filePath.slice(1);
  }
  return filePath;
}

/**
 * Extracts the file path and optional function name from a `file://` URL.
 *
 * Splits at the **last** `:` rather than the first so Windows drive-letter
 * prefixes (`C:`, `D:`, ...) are preserved in `filePath`. The `lastColonIndex
 * > 1` guard prevents splitting at a leading drive-letter colon (`file://C:`
 * with no function name) or at the empty-path edge case (`file://:fn`). Only
 * JavaScript and Python callback files support the named-export suffix, so
 * colons in other valid POSIX paths remain part of the path.
 *
 * Examples:
 *   `file://callbacks.js`             → `{ filePath: 'callbacks.js' }`
 *   `file://callbacks.js:fn`          → `{ filePath: 'callbacks.js', functionName: 'fn' }`
 *   `file://C:/cb.js:fn`              → `{ filePath: 'C:/cb.js', functionName: 'fn' }`
 *   `file://C:`                       → `{ filePath: 'C:' }` (drive-letter colon preserved)
 *   `file://2026-05-27T12:00:00.js`   → `{ filePath: '2026-05-27T12:00:00.js' }` (colon is part of path)
 *
 * @param fileUrl The `file://` URL.
 * @returns The file path and optional function name.
 * @throws If `fileUrl` does not start with `file://`.
 */
export function parseFileUrl(fileUrl: string): { filePath: string; functionName?: string } {
  if (!fileUrl.startsWith('file://')) {
    throw new Error('URL must start with file://');
  }

  const urlWithoutProtocol = fileUrl.slice('file://'.length);
  const lastColonIndex = urlWithoutProtocol.lastIndexOf(':');

  if (lastColonIndex > 1) {
    const candidateFilePath = urlWithoutProtocol.slice(0, lastColonIndex);

    // Only executable function files support a :functionName suffix. This preserves
    // colons that are part of a valid file or directory name on POSIX systems.
    if (!isJavascriptFile(candidateFilePath) && !candidateFilePath.endsWith('.py')) {
      return {
        filePath: normalizeFilePath(urlWithoutProtocol),
      };
    }

    return {
      filePath: normalizeFilePath(candidateFilePath),
      functionName: urlWithoutProtocol.slice(lastColonIndex + 1),
    };
  }

  return {
    filePath: normalizeFilePath(urlWithoutProtocol),
  };
}
