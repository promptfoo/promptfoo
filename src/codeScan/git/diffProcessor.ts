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
import textExtensions from 'text-extensions';
import logger from '../../logger';
import { DiffProcessorError, type FileRecord } from '../../types/codeScan';
import { isInDenylist, MAX_BLOB_SIZE_BYTES, MAX_PATCH_SIZE_BYTES } from '../constants/filtering';
import { isShareableContent, isShareablePath } from '../mcp/sharing';
import { isTextBlob } from './blobText';
import { readGitBlob, runGit } from './command';
import { annotateDiffWithLineRanges } from './diffAnnotator';
import { parseRawDiff } from './rawDiffParser';

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
  fullScan: boolean,
): Promise<FileRecord[]> {
  const range = `${base}...${compare}`;
  // Scope to this checkout directory but retain repository-relative paths for GitHub comments.
  const scope = fullScan
    ? ['--no-renames', '--no-relative', '--no-textconv', '--no-ext-diff', range, '--', '.']
    : [range];
  // Run git diff --raw and --numstat in parallel
  const [raw, numstat] = await Promise.all([
    runGit(repoPath, [
      ...(fullScan ? ['--no-replace-objects'] : []),
      'diff',
      '--raw',
      '-z',
      '--no-color',
      '--no-ext-diff',
      '--no-abbrev',
      ...scope,
    ]),
    runGit(repoPath, [
      ...(fullScan ? ['--no-replace-objects'] : []),
      'diff',
      '--numstat',
      '-z',
      ...scope,
    ]),
  ]);

  const rawFiles = parseRawDiff(raw, fullScan).filter(
    (file) => !fullScan || isShareablePath(file.path),
  );
  const numstatMap = parseNumstat(numstat);

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
  fullScan: boolean,
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
  const output = await runGit(
    repoPath,
    [
      ...(fullScan ? ['--no-replace-objects'] : []),
      'cat-file',
      '--batch-check=%(objectname) %(objecttype) %(objectsize)',
    ],
    {
      input: shaList,
    },
  );

  const sizeMap = new Map<string, number>();

  for (const line of output.split('\n')) {
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
    return isTextBlob(await readGitBlob(repoPath, sha));
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
async function determineTextStatusForFile(
  repoPath: string,
  file: FileRecord,
  fullScan: boolean,
): Promise<FileRecord> {
  if (file.skipReason) {
    return file;
  }

  // Step 1: Check against known text/binary extension lists
  const extensionType = getExtensionType(file.path);

  let textStatus = extensionType === 'text';

  // A full scan inspects both complete physical blobs, including content outside the patch.
  if (fullScan && extensionType !== 'binary') {
    for (const sha of [file.shaA, file.shaB]) {
      if (sha && !isShareableContent((await readGitBlob(repoPath, sha, true)).toString('utf8'))) {
        return { ...file, skipReason: 'excluded from full scan' };
      }
    }
    textStatus = true;
  } else if (extensionType === 'unknown') {
    const checkSha = file.shaB || file.shaA;
    textStatus = checkSha ? await isBlobText(repoPath, checkSha) : false;
  }

  return {
    ...file,
    isText: textStatus,
    ...(!textStatus && { skipReason: 'binary' }),
  };
}

async function determineTextStatus(
  repoPath: string,
  files: FileRecord[],
  fullScan: boolean,
): Promise<FileRecord[]> {
  return async.mapLimit(files, TEXT_DETECTION_CONCURRENCY, async (file: FileRecord) =>
    determineTextStatusForFile(repoPath, file, fullScan),
  );
}

async function generatePatchForFile(
  repoPath: string,
  base: string,
  compare: string,
  file: FileRecord,
  fullScan: boolean,
): Promise<FileRecord> {
  const filePath = file.path;
  try {
    // Git's literal file pathspec also matches descendants when a file turns into a
    // directory. The trailing-slash exclusion keeps just this checked file.
    const paths = fullScan
      ? [`:(top,literal)${filePath}`, `:(top,literal,exclude)${filePath}/`]
      : [filePath];
    let patch = await runGit(
      repoPath,
      [
        ...(fullScan ? ['--no-replace-objects'] : []),
        'diff',
        '--patch',
        '--unified=3',
        '--no-color',
        '--no-ext-diff',
        ...(fullScan
          ? [
              '--no-textconv',
              '--no-renames',
              '--no-relative',
              '--src-prefix=a/',
              '--dst-prefix=b/',
              '--raw',
              '--no-abbrev',
              '-z',
            ]
          : []),
        `${base}...${compare}`,
        '--',
        ...paths,
      ],
      {
        maxBuffer: MAX_PATCH_SIZE_BYTES,
      },
    );

    if (fullScan) {
      // A Git pathspec may still select additional paths (e.g. via GIT_ICASE_PATHSPECS).
      // Accept exactly the one raw record whose path and blob IDs were inspected.
      const separator = patch.indexOf('\0\0');
      const entries = separator < 0 ? [] : parseRawDiff(patch.slice(0, separator));
      const entry = entries[0];
      if (
        entries.length !== 1 ||
        entry.path !== filePath ||
        entry.shaA !== file.shaA ||
        entry.shaB !== file.shaB ||
        entry.status !== file.status
      ) {
        return { ...file, skipReason: 'excluded from full scan' };
      }
      patch = patch.slice(separator + 2);
    }

    // Double check patch size
    const patchSize = Buffer.byteLength(patch, 'utf8');
    if (patchSize > MAX_PATCH_SIZE_BYTES) {
      return { ...file, skipReason: 'patch too large' };
    }

    // Annotate the patch with line numbers and extract valid line ranges
    const { annotatedDiff, lineRanges } = annotateDiffWithLineRanges(patch);

    return { ...file, patch: annotatedDiff, lineRanges };
  } catch (err) {
    if (fullScan) {
      // Git errors can contain checkout paths or blob content.
      return { ...file, skipReason: 'diff error' };
    }
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
  fullScan: boolean,
): Promise<FileRecord[]> {
  return async.mapLimit(files, PATCH_CONCURRENCY, async (file: FileRecord) => {
    if (file.skipReason) {
      return file;
    }

    return await generatePatchForFile(repoPath, base, compare, file, fullScan);
  });
}

export async function processDiff(
  repoPath: string,
  base: string,
  compare: string = 'HEAD',
  fullScan = false,
): Promise<FileRecord[]> {
  try {
    if (fullScan) {
      // Pin the two revisions across discovery, blob inspection and patch generation.
      [base, compare] = await Promise.all(
        [base, compare].map(async (ref) =>
          (
            await runGit(repoPath, [
              '--no-replace-objects',
              'rev-parse',
              '--verify',
              '--end-of-options',
              `${ref}^{commit}`,
            ])
          ).trim(),
        ),
      );
    }
    // Step 1: Discover changed files
    let files = await discoverChangedFiles(repoPath, base, compare, fullScan);

    if (files.length === 0) {
      return files;
    }

    // Step 2: Filter denylist (early exit)
    files = filterDenylist(files);

    // Check for remaining files
    if (!files.some((file) => !file.skipReason)) {
      return fullScan ? [] : files;
    }

    // Step 3: Collect blob sizes and filter large files
    const sizeMap = await collectBlobSizes(repoPath, files, fullScan);
    files = attachBlobSizesAndFilter(files, sizeMap);

    // Check for remaining files
    if (!files.some((file) => !file.skipReason)) {
      return fullScan ? [] : files;
    }

    // Step 4: Determine text/binary status
    files = await determineTextStatus(repoPath, files, fullScan);

    // Check for remaining files
    if (!files.some((file) => !file.skipReason)) {
      return fullScan ? [] : files;
    }

    // Step 5: Generate per-file patches
    const patches = await generatePatches(repoPath, base, compare, files, fullScan);
    return fullScan ? patches.filter((file) => !file.skipReason && file.patch) : patches;
  } catch (error) {
    if (fullScan) {
      throw new DiffProcessorError('Failed to process the full-scan diff');
    }
    if (error instanceof DiffProcessorError) {
      throw error;
    }
    throw new DiffProcessorError(
      `Failed to process diff: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
