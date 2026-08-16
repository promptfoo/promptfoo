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
  const separatorIndex = urlWithoutProtocol.lastIndexOf(':');
  const candidateFilePath = urlWithoutProtocol.slice(0, separatorIndex);

  if (
    separatorIndex > 1 &&
    (isJavascriptFile(candidateFilePath) ||
      candidateFilePath.endsWith('.py') ||
      candidateFilePath.endsWith('.rb'))
  ) {
    return {
      filePath: normalizeFilePath(candidateFilePath),
      functionName: urlWithoutProtocol.slice(separatorIndex + 1),
    };
  }

  // Ruby permits namespaced function names such as Checks::check_value. In
  // that one case the function separator is the colon immediately after .rb.
  const rubySeparatorIndex = urlWithoutProtocol.lastIndexOf('.rb:');
  if (rubySeparatorIndex > -1) {
    return {
      filePath: normalizeFilePath(urlWithoutProtocol.slice(0, rubySeparatorIndex + 3)),
      functionName: urlWithoutProtocol.slice(rubySeparatorIndex + 4),
    };
  }

  return {
    filePath: normalizeFilePath(urlWithoutProtocol),
  };
}
