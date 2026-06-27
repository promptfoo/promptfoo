/**
 * Path resolution utilities that work with both regular paths and file:// URLs
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'path';

/**
 * Check if a file path is absolute, handling both regular paths and URLs
 * @param filePath - The file path to check
 * @returns True if the path is absolute
 */
function isAbsolute(filePath: string): boolean {
  if (!filePath) {
    return false;
  }

  // Treat any URL scheme as absolute to avoid mangling URLs in join/resolve
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(filePath)) {
    if (filePath.startsWith('file://')) {
      try {
        return path.isAbsolute(fileURLToPath(filePath));
      } catch {
        // Handle non-standard but common variants like file://C:/...
        return true;
      }
    }
    return true; // e.g., http(s)://, data://, etc.
  }

  return path.isAbsolute(filePath);
}

/**
 * Safely resolves a path - only calls resolve() if the last path is relative
 * Leaves absolute paths and absolute URLs unchanged
 *
 * @param paths - The path segments to resolve
 * @returns The resolved path if last path is relative, or the last path if it's absolute
 */
export function safeResolve(...paths: string[]): string {
  const lastPath = paths[paths.length - 1] || '';
  if (isAbsolute(lastPath)) {
    return lastPath;
  }
  return path.resolve(...paths);
}

/**
 * Safely joins paths - only joins if the last path is relative
 * If the last path is absolute or an absolute URL, returns it directly
 *
 * @param paths - The path segments to join
 * @returns The joined path if last path is relative, or the last path if it's absolute
 */
export function safeJoin(...paths: string[]): string {
  const lastPath = paths[paths.length - 1] || '';
  if (isAbsolute(lastPath)) {
    return lastPath;
  }
  return path.join(...paths);
}

/**
 * Redacts a file path and its identifying path components from diagnostic text.
 * Root directories are deliberately excluded so unrelated separators are preserved.
 */
export function redactPathFromText(
  text: string,
  filePath: string,
  replacement: string = '[redacted path]',
): string {
  const normalizedPath = path.normalize(filePath);
  const candidates = new Set([
    filePath,
    normalizedPath,
    path.dirname(filePath),
    path.dirname(normalizedPath),
    path.basename(filePath),
    path.basename(normalizedPath),
  ]);
  for (const candidatePath of [filePath, normalizedPath]) {
    let current = path.dirname(candidatePath);
    const root = path.parse(current).root;
    while (current && current !== root && current !== '.') {
      candidates.add(path.basename(current));
      current = path.dirname(current);
    }
  }
  try {
    candidates.add(pathToFileURL(normalizedPath).toString());
  } catch {
    // Non-standard paths are still covered by the plain and normalized forms.
  }

  const roots = new Set([path.parse(filePath).root, path.parse(normalizedPath).root, '.', '']);
  return [...candidates]
    .filter((candidate) => !roots.has(candidate))
    .sort((left, right) => right.length - left.length)
    .reduce((redacted, candidate) => redacted.split(candidate).join(replacement), text);
}
