/**
 * Git raw diff parser
 * Extracted for testing without ESM dependencies
 */

export interface RawDiffEntry {
  path: string;
  oldPath?: string;
  status: string;
  shaA: string | null;
  shaB: string | null;
}

/**
 * Parse git diff --raw -z output
 *
 * Format for normal operations (M, A, D):
 *   :oldmode newmode oldsha newsha status\0path\0
 *
 * Format for renames/copies (R, C):
 *   :oldmode newmode oldsha newsha status\0oldpath\0newpath\0
 *
 * Note: Rename/Copy status includes similarity (e.g., R100, R90, C100)
 */
export function parseRawDiff(rawOutput: string): RawDiffEntry[] {
  const entries = rawOutput.split('\0').filter(Boolean);
  const results: RawDiffEntry[] = [];

  let i = 0;
  while (i < entries.length) {
    const metaLine = entries[i];
    i++;

    if (!metaLine || i >= entries.length) {
      break;
    }

    // Parse: :100644 100644 abc123... def456... M (or R100, C100, etc)
    const parts = metaLine.trim().split(/\s+/);
    if (parts.length < 5) {
      continue;
    }

    const shaA = parts[2] === '0000000000000000000000000000000000000000' ? null : parts[2];
    const shaB = parts[3] === '0000000000000000000000000000000000000000' ? null : parts[3];
    const status = parts[4];

    // Check if this is a rename or copy operation
    // Status will be like: R100, R90, C100, C95, etc.
    const isRenameOrCopy = status.startsWith('R') || status.startsWith('C');

    if (isRenameOrCopy) {
      // Renames and copies have TWO paths: oldpath and newpath
      // Format: metadata\0oldpath\0newpath\0
      const oldPath = entries[i];
      i++;
      const newPath = entries[i];
      i++;

      if (!oldPath || !newPath) {
        continue;
      }

      // Use the new/destination path as the main path
      results.push({ path: newPath, oldPath, status, shaA, shaB });
    } else {
      // Normal operations (M, A, D) have ONE path
      // Format: metadata\0path\0
      const filePath = entries[i];
      i++;

      if (!filePath) {
        continue;
      }

      results.push({ path: filePath, status, shaA, shaB });
    }
  }

  return results;
}
