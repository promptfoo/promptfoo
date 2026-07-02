import { isJavascriptFile } from './fileExtensions';

export { isJavascriptFile } from './fileExtensions';

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
 * Extracts a filesystem path and optional named function from a file:// URL.
 */
export function parseFileUrl(fileUrl: string): { filePath: string; functionName?: string } {
  if (!fileUrl.startsWith('file://')) {
    throw new Error('URL must start with file://');
  }

  const urlWithoutProtocol = fileUrl.slice('file://'.length);
  const lastColonIndex = urlWithoutProtocol.lastIndexOf(':');

  if (lastColonIndex > 1) {
    const candidateFilePath = urlWithoutProtocol.slice(0, lastColonIndex);
    const candidateFunctionName = urlWithoutProtocol.slice(lastColonIndex + 1);

    // Only executable function files support a :functionName suffix. This preserves
    // colons that are part of a valid file or directory name on POSIX systems.
    if (
      (!isJavascriptFile(candidateFilePath) && !candidateFilePath.endsWith('.py')) ||
      /[\\/]/.test(candidateFunctionName)
    ) {
      return {
        filePath: normalizeFilePath(urlWithoutProtocol),
      };
    }

    return {
      filePath: normalizeFilePath(candidateFilePath),
      functionName: candidateFunctionName,
    };
  }

  return {
    filePath: normalizeFilePath(urlWithoutProtocol),
  };
}

/**
 * Splits a Ruby assertion path from its optional method suffix while preserving
 * ordinary paths whose segment after `.rb:` contains a path separator.
 */
export function parseRubyFileReference(
  filePath: string,
): { filePath: string; functionName: string } | undefined {
  const match = /^(.*\.rb):([^/\\]+)$/i.exec(filePath);
  return match ? { filePath: match[1], functionName: match[2] } : undefined;
}
