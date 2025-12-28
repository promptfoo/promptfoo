/**
 * Diff Line Range Extractor
 *
 * Utilities for extracting valid line ranges from unified diffs and
 * clamping comment line numbers to valid positions for GitHub PR reviews.
 *
 * GitHub PR review comments can only be placed on lines that appear in the diff
 * (changed lines + context lines). This module helps validate and adjust line
 * numbers to ensure comments can be posted successfully.
 */

import { parseHunkHeader } from './diffHunkParser';

/**
 * Represents a range of valid line numbers in a file's diff
 */
export interface LineRange {
  start: number;
  end: number;
}

/**
 * Map of file paths to their valid line ranges in the diff
 */
export type FileLineRanges = Map<string, LineRange[]>;

/**
 * Result of clamping a comment's line range
 */
export interface ClampedLines {
  startLine: number | null;
  line: number;
}

/**
 * Extract valid line ranges from a unified diff.
 *
 * Parses a multi-file unified diff (like what GitHub returns for a PR)
 * and extracts the valid line ranges for each file. These ranges represent
 * lines that can receive PR review comments.
 *
 * @param unifiedDiff - Full unified diff string (may contain multiple files)
 * @returns Map of file paths to their valid line ranges in the NEW file
 *
 * @example
 * ```typescript
 * const diff = `diff --git a/src/foo.ts b/src/foo.ts
 * --- a/src/foo.ts
 * +++ b/src/foo.ts
 * @@ -10,7 +10,8 @@
 *    context
 * -  removed
 * +  added
 *    context`;
 *
 * const ranges = extractValidLineRanges(diff);
 * // Map { 'src/foo.ts' => [{ start: 10, end: 17 }] }
 * ```
 */
export function extractValidLineRanges(unifiedDiff: string): FileLineRanges {
  const ranges: FileLineRanges = new Map();

  if (!unifiedDiff || unifiedDiff.trim() === '') {
    return ranges;
  }

  const lines = unifiedDiff.split('\n');
  let currentFile: string | null = null;
  let currentRanges: LineRange[] = [];
  let currentNewLine = 0;
  let hunkStartLine = 0;

  for (const line of lines) {
    // Match file header: diff --git a/path b/path
    // or +++ b/path (for new file path)
    const fileMatch = line.match(/^\+\+\+ b\/(.+)$/);
    if (fileMatch) {
      // Close current hunk if we have one (before switching files)
      if (currentFile && hunkStartLine > 0 && currentNewLine > hunkStartLine) {
        currentRanges.push({
          start: hunkStartLine,
          end: currentNewLine - 1,
        });
      }

      // Save previous file's ranges
      if (currentFile && currentRanges.length > 0) {
        ranges.set(currentFile, currentRanges);
      }

      currentFile = fileMatch[1];
      currentRanges = [];
      currentNewLine = 0;
      hunkStartLine = 0;
      continue;
    }

    // Match hunk header: @@ -old,count +new,count @@
    const hunkHeader = parseHunkHeader(line);
    if (hunkHeader && currentFile) {
      // Save the previous hunk's range if we have one
      if (hunkStartLine > 0 && currentNewLine > hunkStartLine) {
        currentRanges.push({
          start: hunkStartLine,
          end: currentNewLine - 1,
        });
      }

      // Start tracking new hunk
      hunkStartLine = hunkHeader.newStart;
      currentNewLine = hunkHeader.newStart;

      // For hunks with 0 lines in new file (pure deletion), don't start a range
      if (hunkHeader.newCount === 0) {
        hunkStartLine = 0;
      }
      continue;
    }

    // Track line numbers within hunks
    if (currentFile && hunkStartLine > 0) {
      if (line.startsWith('-')) {
        // Removed line - doesn't exist in new file
        continue;
      } else if (line.startsWith('+') || line.startsWith(' ') || line === '') {
        // Added line, context line, or empty line within hunk
        currentNewLine++;
      } else if (line.startsWith('\\')) {
        // Special marker like "\ No newline at end of file" - skip
        continue;
      }
    }
  }

  // Save the last file's ranges
  if (currentFile) {
    if (hunkStartLine > 0 && currentNewLine > hunkStartLine) {
      currentRanges.push({
        start: hunkStartLine,
        end: currentNewLine - 1,
      });
    }
    if (currentRanges.length > 0) {
      ranges.set(currentFile, currentRanges);
    }
  }

  return ranges;
}

/**
 * Check if a line number is valid for a given file in the diff.
 *
 * @param filepath - Path to the file
 * @param line - Line number to check
 * @param ranges - Map of file paths to valid line ranges
 * @returns true if the line is within a valid range
 */
export function isLineInDiff(filepath: string, line: number, ranges: FileLineRanges): boolean {
  const fileRanges = ranges.get(filepath);
  if (!fileRanges) {
    return false;
  }

  return fileRanges.some((range) => line >= range.start && line <= range.end);
}

/**
 * Find the nearest valid line to a given line number.
 *
 * If the line is already valid, returns it unchanged.
 * If the line is in a gap between hunks, returns the end of the previous hunk.
 * If the line is before all hunks, returns the start of the first hunk.
 * If the line is after all hunks, returns the end of the last hunk.
 *
 * @param filepath - Path to the file
 * @param line - Line number to clamp
 * @param ranges - Map of file paths to valid line ranges
 * @returns The clamped line number, or null if file not in diff
 */
export function clampToValidLine(
  filepath: string,
  line: number,
  ranges: FileLineRanges,
): number | null {
  const fileRanges = ranges.get(filepath);
  if (!fileRanges || fileRanges.length === 0) {
    return null;
  }

  // If already valid, return as-is
  if (isLineInDiff(filepath, line, ranges)) {
    return line;
  }

  // Sort ranges by start line
  const sortedRanges = [...fileRanges].sort((a, b) => a.start - b.start);

  // If line is before all ranges, return start of first range
  if (line < sortedRanges[0].start) {
    return sortedRanges[0].start;
  }

  // If line is after all ranges, return end of last range
  const lastRange = sortedRanges[sortedRanges.length - 1];
  if (line > lastRange.end) {
    return lastRange.end;
  }

  // Line is in a gap - find the closest range
  for (let i = 0; i < sortedRanges.length - 1; i++) {
    const currentRange = sortedRanges[i];
    const nextRange = sortedRanges[i + 1];

    // Check if line is in the gap between current and next range
    if (line > currentRange.end && line < nextRange.start) {
      // Return end of current range (comment on last visible line before gap)
      return currentRange.end;
    }
  }

  // Shouldn't reach here, but return end of last range as fallback
  return lastRange.end;
}

/**
 * Clamp a comment's line range to valid diff lines.
 *
 * Handles both single-line and multi-line comments:
 * - If both startLine and line are valid, returns them unchanged
 * - If startLine is valid but line extends into a gap, clamps line to valid range
 * - If startLine is invalid, clamps both to a valid range
 *
 * @param filepath - Path to the file
 * @param startLine - Start line of the comment (null for single-line)
 * @param endLine - End line of the comment
 * @param ranges - Map of file paths to valid line ranges
 * @returns Clamped line numbers, or null if file not in diff
 */
export function clampCommentLines(
  filepath: string,
  startLine: number | null | undefined,
  endLine: number | null | undefined,
  ranges: FileLineRanges,
): ClampedLines | null {
  const fileRanges = ranges.get(filepath);
  if (!fileRanges || fileRanges.length === 0 || endLine == null) {
    return null;
  }

  // Clamp the end line
  const clampedEndLine = clampToValidLine(filepath, endLine, ranges);
  if (clampedEndLine === null) {
    return null;
  }

  // If no start line, it's a single-line comment
  if (startLine == null) {
    return {
      startLine: null,
      line: clampedEndLine,
    };
  }

  // Clamp the start line
  const clampedStartLine = clampToValidLine(filepath, startLine, ranges);
  if (clampedStartLine === null) {
    return {
      startLine: null,
      line: clampedEndLine,
    };
  }

  // Ensure start <= end (if start > end after clamping, make it single-line)
  if (clampedStartLine > clampedEndLine) {
    return {
      startLine: null,
      line: clampedEndLine,
    };
  }

  // If start and end are the same, make it single-line
  if (clampedStartLine === clampedEndLine) {
    return {
      startLine: null,
      line: clampedEndLine,
    };
  }

  return {
    startLine: clampedStartLine,
    line: clampedEndLine,
  };
}
