/**
 * Diff Annotator
 *
 * Adds absolute line numbers to unified diff format for easier LLM processing.
 * This eliminates the need for LLMs to manually calculate line numbers from hunk headers.
 */

import { parseHunkHeader } from '../util/diffHunkParser';

/**
 * Annotate a single file unified diff patch with absolute line numbers.
 *
 * For each line that exists in the NEW file (context lines and added lines),
 * prepends the absolute line number in the format "L##: ".
 *
 * Removed lines (starting with "-") are not annotated since they don't exist in the new file.
 *
 * @param patch - Raw unified diff patch string from git diff
 * @returns Annotated patch with line numbers prepended to new file lines
 *
 * @example
 * Input:
 * ```
 * @@ -18,20 +20,64 @@
 *   context line
 * - removed line
 * + added line
 * ```
 *
 * Output:
 * ```
 * @@ -18,20 +20,64 @@
 * L20:   context line
 * -     removed line
 * L21: + added line
 * ```
 */
export function annotateSingleFileDiffWithLineNumbers(patch: string): string {
  if (!patch || patch.trim() === '') {
    return patch;
  }

  const lines = patch.split('\n');
  const result: string[] = [];
  let currentNewLine = 0;
  let inHunk = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isLastLine = i === lines.length - 1;
    // Check if this is a hunk header: @@ -start,count +start,count @@
    const hunkHeader = parseHunkHeader(line);

    if (hunkHeader) {
      // Extract the starting line number for the new file (right side)
      currentNewLine = hunkHeader.newStart;
      inHunk = true;
      // Hunk headers are not annotated
      result.push(line);
      continue;
    }

    // If we haven't encountered a hunk yet, preserve the line as-is
    // (file headers like "diff --git", "---", "+++" etc.)
    if (!inHunk) {
      result.push(line);
      continue;
    }

    // Process lines within a hunk
    if (line.startsWith('-')) {
      // Removed line - doesn't exist in new file, no line number
      result.push(line);
    } else if (line.startsWith('+')) {
      // Added line - exists in new file at currentNewLine
      result.push(`L${currentNewLine}: ${line}`);
      currentNewLine++;
    } else if (line.startsWith(' ')) {
      // Context line - exists in new file at currentNewLine
      result.push(`L${currentNewLine}: ${line}`);
      currentNewLine++;
    } else if (line.startsWith('\\')) {
      // Special marker like "\ No newline at end of file" - preserve as-is
      result.push(line);
    } else if (line === '' && isLastLine) {
      // Trailing empty line (from string split) - preserve as-is without annotation
      result.push(line);
    } else {
      // Empty lines within hunks or other content - treat as context line
      result.push(`L${currentNewLine}: ${line}`);
      currentNewLine++;
    }
  }

  return result.join('\n');
}
