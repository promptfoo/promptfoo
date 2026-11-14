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

/**
 * Splits an extension reference on its colons, keeping the colon of a Windows drive letter
 * (file://C:/path/to/hooks.js:beforeAll or file:///C:/path/to/hooks.js:beforeAll) inside the
 * file path, as the runtime does.
 */
export function splitExtensionReference(value: string): string[] {
  const driveLetter = /^file:\/\/\/?[a-zA-Z]:(?=[\\/])/.exec(value);
  if (!driveLetter) {
    return value.split(':');
  }
  const [filePath, ...rest] = value.slice(driveLetter[0].length).split(':');
  return ['file', `${driveLetter[0].slice('file:'.length)}${filePath}`, ...rest];
}
