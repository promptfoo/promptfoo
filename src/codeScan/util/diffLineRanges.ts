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

import { annotateDiffWithLineRanges } from '../git/diffAnnotator';
import { parseHunkHeader } from './diffHunkParser';

import type { LineRange } from '../../types/codeScan';

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
 * @@ -10,3 +10,3 @@
 *    context
 * -  removed
 * +  added
 *    context`;
 *
 * const ranges = extractValidLineRanges(diff);
 * // Map { 'src/foo.ts' => [{ start: 10, end: 12 }] }
 * ```
 */
export function extractValidLineRanges(unifiedDiff: string): FileLineRanges {
  const ranges: FileLineRanges = new Map();

  for (const patch of splitFilePatches(unifiedDiff)) {
    // Only file headers before the first hunk identify the path. Added source
    // text can itself look like a +++ header, so never search inside a hunk.
    const lines = patch.split('\n');
    const hunkStart = lines.findIndex((line) => line.startsWith('@@ '));
    const headers = hunkStart === -1 ? lines : lines.slice(0, hunkStart);
    const header = headers.find((line) => line.startsWith('+++ '))?.slice(4);
    const filePath = header && decodeNewFilePath(header);
    if (!filePath) {
      continue;
    }

    const { lineRanges } = annotateDiffWithLineRanges(patch);
    if (lineRanges.length > 0) {
      ranges.set(filePath, lineRanges);
    }
  }

  return ranges;
}

function* splitFilePatches(diff: string): Generator<string> {
  const lines = diff.split('\n');
  let start = 0;
  let remaining = 0;
  for (const [index, line] of lines.entries()) {
    // Unified diffs may omit Git's section markers. Only recognize their
    // ---/+++ header pair outside a hunk, where it cannot be source content.
    if (
      line.startsWith('diff --git ') ||
      (remaining === 0 && line.startsWith('--- ') && lines[index + 1]?.startsWith('+++ '))
    ) {
      if (index > start) {
        yield `${lines.slice(start, index).join('\n')}\n`;
      }
      start = index;
      remaining = 0;
    }
    const hunk = parseHunkHeader(line);
    if (hunk) {
      remaining = hunk.oldCount + hunk.newCount;
    } else if (remaining > 0 && !line.startsWith('\\')) {
      remaining = Math.max(0, remaining - (line.startsWith('+') || line.startsWith('-') ? 1 : 2));
    }
  }
  yield lines.slice(start).join('\n');
}

function decodeNewFilePath(rawHeader: string): string | null {
  // Git appends a tab to unquoted paths containing spaces. Literal tabs in
  // filenames are always escaped inside a quoted path.
  const header = rawHeader.split('\t', 1)[0];
  let filePath = header;
  if (header.startsWith('"')) {
    if (!header.endsWith('"')) {
      return null;
    }
    const body = header.slice(1, -1);
    const parts = [...body.matchAll(/\\([0-3][0-7]{2}|.)|([^\\]+)/gs)];
    if (parts.map((part) => part[0]).join('') !== body) {
      return null;
    }
    const escapes: Record<string, string> = {
      a: '\x07',
      b: '\b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t',
      v: '\v',
      '"': '"',
      '\\': '\\',
    };
    const bytes: Buffer[] = [];
    for (const [, escaped, text] of parts) {
      if (text !== undefined) {
        if (text.includes('"')) {
          return null;
        }
        bytes.push(Buffer.from(text));
      } else if (/^[0-7]{3}$/.test(escaped)) {
        bytes.push(Buffer.from([Number.parseInt(escaped, 8)]));
      } else if (escapes[escaped] === undefined) {
        return null;
      } else {
        bytes.push(Buffer.from(escapes[escaped]));
      }
    }
    // Git quotes UTF-8 bytes as octal, which JSON string decoding cannot handle.
    filePath = Buffer.concat(bytes).toString('utf8');
  }
  return filePath.startsWith('b/') ? filePath.slice(2) : null;
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
  // Missing or equal start lines make a single-line comment. Also ensure start <= end:
  // if start > end after clamping, make it single-line.
  if (
    clampedStartLine === null ||
    clampedStartLine > clampedEndLine ||
    clampedStartLine === clampedEndLine
  ) {
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
