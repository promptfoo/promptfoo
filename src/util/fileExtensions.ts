import {
  isAudioFile,
  isImageFile,
  isJavascriptFile,
  isVideoFile,
  JAVASCRIPT_EXTENSIONS,
} from '../validation/fileExtensions';

export { isAudioFile, isImageFile, isJavascriptFile, isVideoFile, JAVASCRIPT_EXTENSIONS };

// Matches the leading slash + Windows drive prefix from canonical `file:///C:/...`
// URLs (e.g. `/C:/` or `/C:\`). Only stripped on Windows so POSIX paths that
// legitimately start with `/X:` (a directory literally named `X:`) are preserved.
const WIN32_DRIVE_PREFIX = /^\/[A-Za-z]:[\\/]/;

function normalizeFilePath(filePath: string): string {
  if (process.platform === 'win32' && WIN32_DRIVE_PREFIX.test(filePath)) {
    return filePath.slice(1);
  }
  return filePath;
}

/**
 * Extracts the file path and optional function name from a `file://` URL.
 *
 * Splits at the last colon whose prefix is a script file (JS/TS, `.py`, `.rb`),
 * so colons in directories and file names stay part of the path. Ruby
 * namespaced methods (`Validators::Format.check_length`) place the function
 * after the colon that follows the `.rb` file; backtrack to that colon only
 * when the suffix contains `::`, so multi-colon data file names such as
 * `data.js:2026-05-27T12:00:00.json` stay intact. Colons at index 0 or 1 are
 * never separators.
 *
 * Examples:
 *   `file://callbacks.js`                        → `{ filePath: 'callbacks.js' }`
 *   `file://callbacks.js:fn`                     → `{ filePath: 'callbacks.js', functionName: 'fn' }`
 *   `file://assert.rb:Validators::Format.check`  → `{ filePath: 'assert.rb', functionName: 'Validators::Format.check' }`
 *   `file://dir:name/assert.rb:Mod::fn`          → `{ filePath: 'dir:name/assert.rb', functionName: 'Mod::fn' }`
 *   `file://dir:name/hooks.js:handler`           → `{ filePath: 'dir:name/hooks.js', functionName: 'handler' }`
 *   `file://C:/cb.js:fn`                         → `{ filePath: 'C:/cb.js', functionName: 'fn' }`
 *   `file://C:`                                  → `{ filePath: 'C:' }` (drive-letter colon preserved)
 *   `file://2026-05-27T12:00:00.js`              → `{ filePath: '2026-05-27T12:00:00.js' }` (colon is part of path)
 *   `file://data.js:2026-05-27T12:00:00.json`     → `{ filePath: 'data.js:2026-05-27T12:00:00.json' }` (data file, no suffix)
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

  // The function suffix normally follows the script file at the last colon,
  // so colons in directories and earlier file names stay in the path.
  const lastColonIndex = urlWithoutProtocol.lastIndexOf(':');
  if (lastColonIndex > 1) {
    const candidateFilePath = urlWithoutProtocol.slice(0, lastColonIndex);
    const functionName = urlWithoutProtocol.slice(lastColonIndex + 1);
    if (
      isScriptFilePath(candidateFilePath) &&
      !(candidateFilePath.endsWith('.rb') && /[\\/]/.test(functionName))
    ) {
      return {
        filePath: normalizeFilePath(candidateFilePath),
        functionName,
      };
    }
  }

  // Ruby namespaced methods (Validators::Format.check) put the function after
  // the first colon following the .rb file. Backtrack only for that shape so
  // multi-colon data file names such as data.js:2026-05-27T12:00:00.json stay
  // intact.
  let colonIndex = lastColonIndex;
  while (colonIndex > 1) {
    const candidateFilePath = urlWithoutProtocol.slice(0, colonIndex);
    const functionName = urlWithoutProtocol.slice(colonIndex + 1);
    if (
      candidateFilePath.endsWith('.rb') &&
      functionName.includes('::') &&
      !/[\\/]/.test(functionName)
    ) {
      return {
        filePath: normalizeFilePath(candidateFilePath),
        functionName,
      };
    }
    colonIndex = urlWithoutProtocol.lastIndexOf(':', colonIndex - 1);
  }

  return {
    filePath: normalizeFilePath(urlWithoutProtocol),
  };
}

export function isScriptFilePath(filePath: string): boolean {
  return isJavascriptFile(filePath) || filePath.endsWith('.py') || filePath.endsWith('.rb');
}
