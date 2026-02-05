/**
 * Diff Annotator
 *
 * Adds absolute line numbers to unified diff format for easier LLM processing.
 * This eliminates the need for LLMs to manually calculate line numbers from hunk headers.
 *
 * Also extracts valid line ranges for each file, which can be used to validate
 * and clamp comment line numbers for GitHub PR reviews.
 */

import { parseHunkHeader } from '../util/diffHunkParser';

import type { LineRange } from '../util/diffLineRanges';

export interface AnnotationResult {
  annotatedDiff: string;
  lineRanges: LineRange[];
}

/**
 * Annotate a unified diff patch with absolute line numbers and extract valid line ranges.
 */
export function annotateDiffWithLineRanges(patch: string): AnnotationResult {
  if (!patch || patch.trim() === '') {
    return { annotatedDiff: patch, lineRanges: [] };
  }

  const lines = patch.split('\n');
  const result: string[] = [];
  const lineRanges: LineRange[] = [];
  let currentNewLine = 0;
  let inHunk = false;
  let hunkStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isLastLine = i === lines.length - 1;
    // Check if this is a hunk header: @@ -start,count +start,count @@
    const hunkHeader = parseHunkHeader(line);

    if (hunkHeader) {
      // Save the previous hunk's range if we have one
      if (hunkStartLine > 0 && currentNewLine > hunkStartLine) {
        lineRanges.push({
          start: hunkStartLine,
          end: currentNewLine - 1,
        });
      }

      // Extract the starting line number for the new file (right side)
      currentNewLine = hunkHeader.newStart;
      inHunk = true;

      // Start tracking new hunk (unless it's a pure deletion with 0 new lines)
      hunkStartLine = hunkHeader.newCount === 0 ? 0 : hunkHeader.newStart;

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

  // Save the last hunk's range
  if (hunkStartLine > 0 && currentNewLine > hunkStartLine) {
    lineRanges.push({
      start: hunkStartLine,
      end: currentNewLine - 1,
    });
  }

  return {
    annotatedDiff: result.join('\n'),
    lineRanges,
  };
}

/**
 * Annotate a single file unified diff patch with absolute line numbers.
 *
 * This is a convenience wrapper around annotateDiffWithLineRanges that
 * returns only the annotated diff string.
 *
 * @param patch - Raw unified diff patch string from git diff
 * @returns Annotated patch with line numbers prepended to new file lines
 */
export function annotateSingleFileDiffWithLineNumbers(patch: string): string {
  return annotateDiffWithLineRanges(patch).annotatedDiff;
}
