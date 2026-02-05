/**
 * Shared utilities for parsing unified diff hunk headers.
 *
 * Used by both diffAnnotator (for adding line number annotations)
 * and diffLineRanges (for extracting valid line ranges).
 */

/**
 * Parsed information from a unified diff hunk header.
 *
 * A hunk header looks like: @@ -10,7 +20,8 @@ optional context
 * This represents: "starting at line 10 in old file (7 lines) and
 * line 20 in new file (8 lines)"
 */
export interface HunkHeader {
  /** Starting line number in the old file */
  oldStart: number;
  /** Number of lines in the old file (default 1 if not specified) */
  oldCount: number;
  /** Starting line number in the new file */
  newStart: number;
  /** Number of lines in the new file (default 1 if not specified) */
  newCount: number;
}

/**
 * Regular expression to match unified diff hunk headers.
 *
 * Format: @@ -oldStart[,oldCount] +newStart[,newCount] @@
 * The count is optional and defaults to 1 if not present.
 *
 * Examples:
 * - @@ -10,7 +20,8 @@ -> old: 10,7  new: 20,8
 * - @@ -1 +1 @@        -> old: 1,1  new: 1,1
 * - @@ -0,0 +1,5 @@    -> old: 0,0  new: 1,5 (new file)
 */
export const HUNK_HEADER_REGEX = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Parse a unified diff hunk header line.
 *
 * @param line - A line that may be a hunk header
 * @returns Parsed hunk information, or null if not a hunk header
 *
 * @example
 * ```typescript
 * parseHunkHeader('@@ -10,7 +20,8 @@ function foo() {')
 * // Returns: { oldStart: 10, oldCount: 7, newStart: 20, newCount: 8 }
 *
 * parseHunkHeader('regular code line')
 * // Returns: null
 * ```
 */
export function parseHunkHeader(line: string): HunkHeader | null {
  const match = line.match(HUNK_HEADER_REGEX);
  if (!match) {
    return null;
  }

  return {
    oldStart: parseInt(match[1], 10),
    oldCount: match[2] ? parseInt(match[2], 10) : 1,
    newStart: parseInt(match[3], 10),
    newCount: match[4] ? parseInt(match[4], 10) : 1,
  };
}

/**
 * Determines which type of line this is within a diff hunk.
 *
 * @param line - A line within a diff hunk
 * @returns The type of line
 */
export type DiffLineType = 'context' | 'added' | 'removed' | 'marker' | 'other';

export function getDiffLineType(line: string): DiffLineType {
  if (line.startsWith('-')) {
    return 'removed';
  }
  if (line.startsWith('+')) {
    return 'added';
  }
  if (line.startsWith(' ')) {
    return 'context';
  }
  if (line.startsWith('\\')) {
    // Special marker like "\ No newline at end of file"
    return 'marker';
  }
  return 'other';
}
