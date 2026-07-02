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
 * Redacts exact path representations from diagnostic text in one pass.
 * Root directories are deliberately excluded so unrelated separators are preserved.
 */
function getPathRedactionCandidates(filePath: string): Array<{ bounded: boolean; value: string }> {
  const normalizedPath = path.normalize(filePath);
  const basename = path.basename(filePath);
  const normalizedBasename = path.basename(normalizedPath);
  const candidates = new Map<string, boolean>([
    [filePath, false],
    [normalizedPath, false],
    [path.dirname(filePath), false],
    [path.dirname(normalizedPath), false],
    ...(basename.length >= 3 ? ([[basename, true]] as const) : []),
    ...(normalizedBasename.length >= 3 ? ([[normalizedBasename, true]] as const) : []),
  ]);
  try {
    candidates.set(pathToFileURL(normalizedPath).toString(), false);
  } catch {
    // Non-standard paths are still covered by the plain and normalized forms.
  }

  const roots = new Set([path.parse(filePath).root, path.parse(normalizedPath).root, '.', '']);
  return [...candidates]
    .filter(([candidate]) => !roots.has(candidate))
    .map(([value, bounded]) => ({ bounded, value }));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function redactPathsAndIdentifierFromText(
  text: string,
  filePaths: string[],
  identifier: string | undefined,
  pathReplacement: string = '[redacted path]',
  identifierReplacement: string = '[redacted identifier]',
): string {
  const replacements = new Map<string, { bounded: boolean; replacement: string }>();
  for (const filePath of filePaths) {
    for (const candidate of getPathRedactionCandidates(filePath)) {
      if (!replacements.has(candidate.value)) {
        replacements.set(candidate.value, {
          bounded: candidate.bounded,
          replacement: pathReplacement,
        });
      }
    }
  }
  if (identifier && !replacements.has(identifier)) {
    replacements.set(identifier, { bounded: true, replacement: identifierReplacement });
  }

  const patterns = [...replacements]
    .sort(([left], [right]) => right.length - left.length)
    .map(([value, entry]) =>
      entry.bounded
        ? `(?<![A-Za-z0-9_$])${escapeRegExp(value)}(?![A-Za-z0-9_$])`
        : escapeRegExp(value),
    );
  return patterns.length === 0
    ? text
    : text.replace(
        new RegExp(patterns.join('|'), 'g'),
        (match) => replacements.get(match)?.replacement ?? match,
      );
}

export function redactPathFromText(
  text: string,
  filePath: string,
  replacement: string = '[redacted path]',
): string {
  return redactPathsAndIdentifierFromText(text, [filePath], undefined, replacement);
}
