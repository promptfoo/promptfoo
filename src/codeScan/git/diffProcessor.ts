/**
 * Diff Processor
 *
 * Focused pipeline for processing git diffs:
 * 1. Discover changed files
 * 2. Filter denylist (early exit)
 * 3. Collect blob sizes and filter large files
 * 4. Determine text/binary status
 * 5. Generate per-file patches
 */

import path from 'path';

import async from 'async';
import binaryExtensions from 'binary-extensions';
import { isText } from 'istextorbinary';
import textExtensions from 'text-extensions';
import logger from '../../logger';
import { DiffProcessorError } from '../../types/codeScan';
import { runCommand } from '../../util/runCommand';
import { isInDenylist, MAX_BLOB_SIZE_BYTES, MAX_PATCH_SIZE_BYTES } from '../constants/filtering';
import { annotateDiffWithLineRanges } from './diffAnnotator';
import { parseRawDiff } from './rawDiffParser';

import type { FileRecord } from '../../types/codeScan';

interface NumstatEntry {
  linesAdded: number;
  linesRemoved: number;
}

const PATCH_CONCURRENCY = 8;
const TEXT_DETECTION_CONCURRENCY = 16;

/**
 * Parse git diff --numstat -z output.
 * Normal entries: added\tremoved\tpath\0
 * Renames/copies: added\tremoved\t\0oldpath\0newpath\0
 */
function parseNumstat(numstatOutput: string): Map<string, NumstatEntry> {
  const map = new Map<string, NumstatEntry>();
  const records = numstatOutput.split('\0');

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const firstTab = record.indexOf('\t');
    const secondTab = record.indexOf('\t', firstTab + 1);
    if (firstTab === -1 || secondTab === -1) {
      continue;
    }

    const added = record.slice(0, firstTab);
    const removed = record.slice(firstTab + 1, secondTab);
    let filePath = record.slice(secondTab + 1);
    if (!filePath) {
      // Rename/copy records carry both paths separately; raw diff uses the destination.
      i += 2;
      filePath = records[i];
    }
    if (!filePath) {
      continue;
    }

    map.set(filePath, {
      linesAdded: added === '-' ? 0 : Number.parseInt(added, 10),
      linesRemoved: removed === '-' ? 0 : Number.parseInt(removed, 10),
    });
  }

  return map;
}

async function discoverChangedFiles(
  repoPath: string,
  base: string,
  compare: string,
): Promise<FileRecord[]> {
  // Run git diff --raw and --numstat in parallel
  const [rawResult, numstatResult] = await Promise.all([
    runCommand(
      'git',
      ['diff', '--raw', '-z', '--no-color', '--no-ext-diff', '--no-abbrev', `${base}...${compare}`],
      {
        cwd: repoPath,
      },
    ),
    runCommand('git', ['diff', '--numstat', '-z', `${base}...${compare}`], {
      cwd: repoPath,
    }),
  ]);

  const rawFiles = parseRawDiff(rawResult.stdout);
  const numstatMap = parseNumstat(numstatResult.stdout);

  // Merge the data
  return rawFiles.map((file) => {
    const stats = numstatMap.get(file.path);
    return {
      path: file.path,
      status: file.status,
      shaA: file.shaA,
      shaB: file.shaB,
      linesAdded: stats?.linesAdded,
      linesRemoved: stats?.linesRemoved,
    };
  });
}

function filterDenylist(files: FileRecord[]): FileRecord[] {
  return files.map((file) => {
    if (isInDenylist(file.path)) {
      return { ...file, skipReason: 'denylist' };
    }
    return file;
  });
}

async function collectBlobSizes(
  repoPath: string,
  files: FileRecord[],
): Promise<Map<string, number>> {
  const shas = new Set<string>();

  for (const file of files) {
    if (file.skipReason) {
      continue; // Skip files already marked for skipping
    }

    if (file.shaA) {
      shas.add(file.shaA);
    }
    if (file.shaB) {
      shas.add(file.shaB);
    }
  }

  if (shas.size === 0) {
    return new Map();
  }

  // Use git cat-file --batch-check
  const shaList = Array.from(shas).join('\n');
  const result = await runCommand(
    'git',
    ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'],
    {
      cwd: repoPath,
      input: shaList,
    },
  );

  const sizeMap = new Map<string, number>();

  for (const line of result.stdout.split('\n')) {
    if (!line.trim()) {
      continue;
    }

    const parts = line.split(/\s+/);
    if (parts.length < 3) {
      continue;
    }

    const sha = parts[0];
    const size = Number.parseInt(parts[2], 10);

    sizeMap.set(sha, size);
  }

  return sizeMap;
}

function attachBlobSizesAndFilter(files: FileRecord[], sizeMap: Map<string, number>): FileRecord[] {
  return files.map((file) => {
    if (file.skipReason) {
      return file; // Already skipped
    }

    const beforeSize = file.shaA ? sizeMap.get(file.shaA) : undefined;
    const afterSize = file.shaB ? sizeMap.get(file.shaB) : undefined;

    // Check if either side exceeds threshold
    const tooLarge =
      (beforeSize !== undefined && beforeSize > MAX_BLOB_SIZE_BYTES) ||
      (afterSize !== undefined && afterSize > MAX_BLOB_SIZE_BYTES);

    return {
      ...file,
      beforeSizeBytes: beforeSize,
      afterSizeBytes: afterSize,
      ...(tooLarge && { skipReason: 'too large' }),
    };
  });
}

async function isBlobText(repoPath: string, sha: string): Promise<boolean> {
  try {
    const result = await runCommand('git', ['cat-file', 'blob', sha], {
      cwd: repoPath,
      encoding: 'buffer',
    });

    // isText can return boolean | null, treat null as false
    return isText(null, result.stdout) === true;
  } catch {
    return false;
  }
}

/**
 * Check file extension against known text and binary extension lists
 * @returns 'text' if known text extension, 'binary' if known binary extension, 'unknown' otherwise
 */
function getExtensionType(filePath: string): 'text' | 'binary' | 'unknown' {
  const ext = path.extname(filePath).toLowerCase().slice(1); // Remove leading dot

  if (textExtensions.includes(ext)) {
    return 'text';
  }

  if (binaryExtensions.includes(ext)) {
    return 'binary';
  }

  return 'unknown';
}

/**
 * Determine text/binary status for a single file
 * Uses 2-tier approach: extension lists first, then blob content analysis for unknown extensions
 */
async function determineTextStatusForFile(repoPath: string, file: FileRecord): Promise<FileRecord> {
  if (file.skipReason) {
    return file;
  }

  // Step 1: Check against known text/binary extension lists
  const extensionType = getExtensionType(file.path);

  let textStatus = extensionType === 'text';

  // Step 2: For unknown extensions, analyze blob content
  if (extensionType === 'unknown') {
    const checkSha = file.shaB || file.shaA;
    textStatus = checkSha ? await isBlobText(repoPath, checkSha) : false;
  }

  return {
    ...file,
    isText: textStatus,
    ...(!textStatus && { skipReason: 'binary' }),
  };
}

async function determineTextStatus(repoPath: string, files: FileRecord[]): Promise<FileRecord[]> {
  return async.mapLimit(files, TEXT_DETECTION_CONCURRENCY, async (file: FileRecord) =>
    determineTextStatusForFile(repoPath, file),
  );
}

async function generatePatchForFile(
  repoPath: string,
  base: string,
  compare: string,
  file: FileRecord,
): Promise<FileRecord> {
  const filePath = file.path;
  try {
    const result = await runCommand(
      'git',
      [
        'diff',
        '--patch',
        '--unified=3',
        '--no-color',
        '--no-ext-diff',
        `${base}...${compare}`,
        '--',
        filePath,
      ],
      {
        cwd: repoPath,
        maxBuffer: MAX_PATCH_SIZE_BYTES,
      },
    );

    const patch = result.stdout;

    // Double check patch size
    const patchSize = Buffer.byteLength(patch, 'utf8');
    if (patchSize > MAX_PATCH_SIZE_BYTES) {
      return { ...file, skipReason: 'patch too large' };
    }

    // Annotate the patch with line numbers and extract valid line ranges
    const { annotatedDiff, lineRanges } = annotateDiffWithLineRanges(patch);

    return { ...file, patch: annotatedDiff, lineRanges };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Check if error is due to maxBuffer exceeded
    if (errorMessage.includes('maxBuffer') || errorMessage.includes('stdout maxBuffer')) {
      logger.debug(
        `git diff --patch ${filePath} exceeded maxBuffer (${MAX_PATCH_SIZE_BYTES} bytes) - patch too large`,
      );
      return { ...file, skipReason: 'patch too large' };
    }

    // Other git diff errors
    logger.debug(`git diff --patch ${filePath} failed: ${errorMessage} - skipping file`);
    return { ...file, skipReason: 'diff error' };
  }
}

async function generatePatches(
  repoPath: string,
  base: string,
  compare: string,
  files: FileRecord[],
): Promise<FileRecord[]> {
  return async.mapLimit(files, PATCH_CONCURRENCY, async (file: FileRecord) => {
    if (file.skipReason) {
      return file;
    }

    return await generatePatchForFile(repoPath, base, compare, file);
  });
}

export async function processDiff(
  repoPath: string,
  base: string,
  compare: string = 'HEAD',
): Promise<FileRecord[]> {
  try {
    // Step 1: Discover changed files
    let files = await discoverChangedFiles(repoPath, base, compare);

    if (files.length === 0) {
      return files;
    }

    // Step 2: Filter denylist (early exit)
    files = filterDenylist(files);

    // Check for remaining files
    if (!files.some((file) => !file.skipReason)) {
      return files;
    }

    // Step 3: Collect blob sizes and filter large files
    const sizeMap = await collectBlobSizes(repoPath, files);
    files = attachBlobSizesAndFilter(files, sizeMap);

    // Check for remaining files
    if (!files.some((file) => !file.skipReason)) {
      return files;
    }

    // Step 4: Determine text/binary status
    files = await determineTextStatus(repoPath, files);

    // Check for remaining files
    if (!files.some((file) => !file.skipReason)) {
      return files;
    }

    // Step 5: Generate per-file patches
    return await generatePatches(repoPath, base, compare, files);
  } catch (error) {
    if (error instanceof DiffProcessorError) {
      throw error;
    }
    throw new DiffProcessorError(
      `Failed to process diff: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
