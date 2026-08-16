import { isJavascriptFile } from '../fileExtensions';

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
 * Extracts the file path and function name from a file:// URL
 * @param fileUrl The file:// URL (e.g., "file://path/to/file.js:functionName")
 * @returns The file path and optional function name
 */
export function parseFileUrl(fileUrl: string): { filePath: string; functionName?: string } {
  if (!fileUrl.startsWith('file://')) {
    throw new Error('URL must start with file://');
  }

  const urlWithoutProtocol = fileUrl.slice('file://'.length);
  let separatorIndex = urlWithoutProtocol.lastIndexOf(':');

  while (separatorIndex > 1) {
    const candidateFilePath = urlWithoutProtocol.slice(0, separatorIndex);

    // Only executable function files support a :functionName suffix. Scanning
    // backward preserves colons in paths and Ruby namespace separators.
    if (
      isJavascriptFile(candidateFilePath) ||
      candidateFilePath.endsWith('.py') ||
      candidateFilePath.endsWith('.rb')
    ) {
      return {
        filePath: normalizeFilePath(candidateFilePath),
        functionName: urlWithoutProtocol.slice(separatorIndex + 1),
      };
    }

    separatorIndex = urlWithoutProtocol.lastIndexOf(':', separatorIndex - 1);
  }

  return {
    filePath: normalizeFilePath(urlWithoutProtocol),
  };
}
