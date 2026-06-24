/**
 * Array of supported JavaScript and TypeScript file extensions
 */
export const JAVASCRIPT_EXTENSIONS = ['js', 'cjs', 'mjs', 'ts', 'cts', 'mts'];

/**
 * Checks if a file is a JavaScript or TypeScript file based on its extension.
 *
 * @param filePath - The path of the file to check.
 * @returns True if the file has a JavaScript or TypeScript extension, false otherwise.
 */
export function isJavascriptFile(filePath: string): boolean {
  return new RegExp(`\\.(${JAVASCRIPT_EXTENSIONS.join('|')})$`, 'i').test(filePath);
}

/**
 * Checks if a file has a Python source extension.
 *
 * @param filePath - The path of the file to check.
 * @returns True if the file has a Python source extension, false otherwise.
 */
export function isPythonFile(filePath: string): boolean {
  return !/[?#]/.test(filePath) && filePath.toLowerCase().endsWith('.py');
}

/**
 * Parses a Python file path with an optional function selector.
 */
export function parsePythonFileReference(
  filePath: string,
): { filePath: string; functionName?: string } | undefined {
  if (/[?#]/.test(filePath)) {
    return undefined;
  }

  const separator = filePath.lastIndexOf(':');
  if (separator > 1) {
    const candidateFilePath = filePath.slice(0, separator);
    if (isPythonFile(candidateFilePath)) {
      const functionName = filePath.slice(separator + 1);
      const parts = functionName.split('.');
      if (parts.length <= 2 && parts.every((part) => part.length > 0 && !/[\\/:?#]/.test(part))) {
        return { filePath: candidateFilePath, functionName };
      }
    }
  }

  return isPythonFile(filePath) ? { filePath } : undefined;
}

/**
 * Splits a script file path from its optional function selector.
 */
export function parseExecutableFileReference(filePath: string): {
  filePath: string;
  functionName?: string;
} {
  const pythonReference = parsePythonFileReference(filePath);
  if (pythonReference) {
    return pythonReference;
  }

  const separator = filePath.lastIndexOf(':');
  if (separator > 1) {
    const candidateFilePath = filePath.slice(0, separator);
    if (isJavascriptFile(candidateFilePath) || candidateFilePath.endsWith('.rb')) {
      return {
        filePath: candidateFilePath,
        functionName: filePath.slice(separator + 1),
      };
    }
  }

  // Ruby selectors may contain namespace separators (for example,
  // Validators::Format.check_length), so the final colon is not necessarily
  // the separator after the file path.
  const rubyMarker = filePath.lastIndexOf('.rb:');
  if (rubyMarker !== -1) {
    const rubySeparator = rubyMarker + '.rb'.length;
    return {
      filePath: filePath.slice(0, rubySeparator),
      functionName: filePath.slice(rubySeparator + 1),
    };
  }

  return { filePath };
}

/**
 * Checks if a file is an image file based on its extension. Non-exhaustive list.
 *
 * @param filePath - The path of the file to check.
 * @returns True if the file has an image extension, false otherwise.
 */
export function isImageFile(filePath: string): boolean {
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
  const fileExtension = filePath.split('.').pop()?.toLowerCase() || '';
  return imageExtensions.includes(fileExtension);
}

/**
 * Checks if a file is a video file based on its extension. Non-exhaustive list.
 *
 * @param filePath - The path of the file to check.
 * @returns True if the file has a video extension, false otherwise.
 */
export function isVideoFile(filePath: string): boolean {
  const videoExtensions = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'wmv', 'mkv', 'm4v'];
  const fileExtension = filePath.split('.').pop()?.toLowerCase() || '';
  return videoExtensions.includes(fileExtension);
}

/**
 * Checks if a file is an audio file based on its extension. Non-exhaustive list.
 *
 * @param filePath - The path of the file to check.
 * @returns True if the file has an audio extension, false otherwise.
 */
export function isAudioFile(filePath: string): boolean {
  const audioExtensions = ['wav', 'mp3', 'ogg', 'aac', 'm4a', 'flac', 'wma', 'aiff', 'opus'];
  const fileExtension = filePath.split('.').pop()?.toLowerCase() || '';
  return audioExtensions.includes(fileExtension);
}
