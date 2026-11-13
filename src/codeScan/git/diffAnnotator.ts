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

import type { LineRange } from '../../types/codeScan';

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

    // Removed lines do not exist in the new file. Preserve them, special markers
    // like "\ No newline at end of file", and the trailing empty split line as-is.
    if (line.startsWith('-') || line.startsWith('\\') || (line === '' && isLastLine)) {
      result.push(line);
    } else {
      // Added and context lines exist in the new file at currentNewLine.
      // Empty lines within hunks and other content are treated as context lines.
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
