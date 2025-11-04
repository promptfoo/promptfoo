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

import { execa } from 'execa';
import { minimatch } from 'minimatch';
import mime from 'mime-types';
import { isText } from 'istextorbinary';
import pLimit from 'p-limit';
import fs from 'fs/promises';
import path from 'path';
import type { FileRecord } from '../../../types/codeScan';
import { annotateDiffWithLineNumbers } from './diffAnnotator';

interface RawDiffEntry {
  path: string;
  status: string;
  shaA: string | null;
  shaB: string | null;
}

interface NumstatEntry {
  linesAdded: number;
  linesRemoved: number;
}

const DENYLIST_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.venv/**',
  '**/__pycache__/**',
  '**/*.lock',
  '**/package-lock.json',
  '**/yarn.lock',
  '**/pnpm-lock.yaml',
  '**/Cargo.lock',
  '**/poetry.lock',
  '**/composer.lock',
  '**/Pipfile.lock',
  '**/*.min.js',
  '**/*.map',
  '**/*.bin',
  '**/*.exe',
  '**/*.dll',
  '**/*.so',
  '**/*.dylib',
  '**/*.zip',
  '**/*.tar',
  '**/*.gz',
  '**/*.jpg',
  '**/*.jpeg',
  '**/*.png',
  '**/*.gif',
  '**/*.pdf',
  '**/*.mp4',
  '**/*.mov',
];

const MAX_BLOB_SIZE_BYTES = 500 * 1024; // 500 KB
const MAX_PATCH_SIZE_BYTES = 200 * 1024; // 200 KB

const PATCH_CONCURRENCY = 8;
const TEXT_DETECTION_CONCURRENCY = 16;


/**
 * Known text file extensions for programming languages
 * These override MIME type detection for common false positives
 */
const TEXT_FILE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.java', '.c', '.cpp', '.h', '.hpp',
  '.go', '.rs', '.php', '.swift', '.kt', '.scala',
  '.css', '.scss', '.sass', '.less',
  '.html', '.htm', '.xml', '.svg',
  '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg',
  '.md', '.txt', '.rst', '.adoc',
  '.sh', '.bash', '.zsh', '.fish',
  '.sql', '.graphql', '.proto',
  '.vue', '.svelte', '.astro',
  '.tf', '.hcl',
]);

export class DiffProcessorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiffProcessorError';
  }
}

function isInDenylist(filePath: string): boolean {
  return DENYLIST_PATTERNS.some((pattern) => minimatch(filePath, pattern));
}

/**
 * Parse git diff --raw output
 * Format: :oldmode newmode oldsha newsha status\0path\0
 */
function parseRawDiff(rawOutput: string): RawDiffEntry[] {
  const entries = rawOutput.split('\0').filter(Boolean);
  const results: RawDiffEntry[] = [];

  for (let i = 0; i < entries.length; i += 2) {
    const metaLine = entries[i];
    const filePath = entries[i + 1];

    if (!metaLine || !filePath) continue;

    // Parse: :100644 100644 abc123... def456... M
    const parts = metaLine.trim().split(/\s+/);
    if (parts.length < 5) continue;

    const shaA = parts[2] === '0000000000000000000000000000000000000000' ? null : parts[2];
    const shaB = parts[3] === '0000000000000000000000000000000000000000' ? null : parts[3];
    const status = parts[4];

    results.push({ path: filePath, status, shaA, shaB });
  }

  return results;
}

/**
 * Parse git diff --numstat output
 * Format: added\tremoved\tpath
 */
function parseNumstat(numstatOutput: string): Map<string, NumstatEntry> {
  const map = new Map<string, NumstatEntry>();

  for (const line of numstatOutput.split('\n')) {
    if (!line.trim()) continue;

    const parts = line.split('\t');
    if (parts.length < 3) continue;

    const added = parts[0] === '-' ? 0 : Number.parseInt(parts[0], 10);
    const removed = parts[1] === '-' ? 0 : Number.parseInt(parts[1], 10);
    const path = parts[2];

    map.set(path, { linesAdded: added, linesRemoved: removed });
  }

  return map;
}

async function discoverChangedFiles(repoPath: string, base: string, compare: string): Promise<FileRecord[]> {
  // Run git diff --raw and --numstat in parallel
  const [rawResult, numstatResult] = await Promise.all([
    execa('git', ['diff', '--raw', '-z', '--no-color', '--no-ext-diff', '--no-abbrev', `${base}...${compare}`], {
      cwd: repoPath,
    }),
    execa('git', ['diff', '--numstat', `${base}...${compare}`], {
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

async function collectBlobSizes(repoPath: string, files: FileRecord[]): Promise<Map<string, number>> {
  const shas = new Set<string>();

  for (const file of files) {
    if (file.skipReason) continue; // Skip files already marked for skipping

    if (file.shaA) shas.add(file.shaA);
    if (file.shaB) shas.add(file.shaB);
  }

  if (shas.size === 0) {
    return new Map();
  }

  // Use git cat-file --batch-check
  const shaList = Array.from(shas).join('\n');
  const result = await execa('git', ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], {
    cwd: repoPath,
    input: shaList,
  });

  const sizeMap = new Map<string, number>();

  for (const line of result.stdout.split('\n')) {
    if (!line.trim()) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;

    const sha = parts[0];
    const size = Number.parseInt(parts[2], 10);

    sizeMap.set(sha, size);
  }

  return sizeMap;
}

function attachBlobSizesAndFilter(files: FileRecord[], sizeMap: Map<string, number>): FileRecord[] {
  return files.map((file) => {
    if (file.skipReason) return file; // Already skipped

    const beforeSize = file.shaA ? sizeMap.get(file.shaA) : undefined;
    const afterSize = file.shaB ? sizeMap.get(file.shaB) : undefined;

    // Check if either side exceeds threshold
    if (
      (beforeSize !== undefined && beforeSize > MAX_BLOB_SIZE_BYTES) ||
      (afterSize !== undefined && afterSize > MAX_BLOB_SIZE_BYTES)
    ) {
      return {
        ...file,
        beforeSizeBytes: beforeSize,
        afterSizeBytes: afterSize,
        skipReason: 'too large',
      };
    }

    return {
      ...file,
      beforeSizeBytes: beforeSize,
      afterSizeBytes: afterSize,
    };
  });
}

async function isBlobText(repoPath: string, sha: string): Promise<boolean> {
  try {
    const result = await execa('git', ['cat-file', 'blob', sha], {
      cwd: repoPath,
      encoding: 'buffer',
      maxBuffer: 4096,
    });

    // Convert Uint8Array to Buffer and check if text
    const buffer = Buffer.from(result.stdout);
    const textCheck = isText(null, buffer);

    // isText can return boolean | null, treat null as false
    return textCheck === true;
  } catch {
    return false;
  }
}

function hasTextExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return TEXT_FILE_EXTENSIONS.has(ext);
}

/**
 * Determine text/binary status for a single file
 * Uses hybrid approach: MIME type first, then blob content for uncertain cases
 */
async function determineTextStatusForFile(repoPath: string, file: FileRecord): Promise<FileRecord> {
  if (file.skipReason) {
    return file;
  }

  // Step 1: Check if it has a known programming language extension
  if (hasTextExtension(file.path)) {
    return {
      ...file,
      isText: true,
    };
  }

  // Step 2: Check MIME type by extension
  const mimeType = mime.lookup(file.path) || 'application/octet-stream';

  // If MIME suggests text, trust it
  if (mimeType.startsWith('text/') || mimeType.includes('json') || mimeType.includes('xml')) {
    return {
      ...file,
      isText: true,
    };
  }

  // Step 3: MIME suggests binary - double-check by reading blob content
  const checkSha = file.shaB || file.shaA;
  if (!checkSha) {
    return {
      ...file,
      isText: false,
      skipReason: 'binary',
    };
  }

  const textStatus = await isBlobText(repoPath, checkSha);

  if (textStatus) {
    return {
      ...file,
      isText: true,
    };
  } else {
    return {
      ...file,
      isText: false,
      skipReason: 'binary',
    };
  }
}

async function determineTextStatus(repoPath: string, files: FileRecord[]): Promise<FileRecord[]> {
  const limit = pLimit(TEXT_DETECTION_CONCURRENCY);

  const tasks = files.map((file) =>
    limit(() => determineTextStatusForFile(repoPath, file))
  );

  return Promise.all(tasks);
}

function sanitizePathForFilename(filePath: string): string {
  return filePath.replace(/[/\\:*?"<>|]/g, '_');
}

async function generatePatchForFile(repoPath: string, base: string, compare: string, filePath: string): Promise<string | null> {
  try {
    const result = await execa(
      'git',
      ['diff', '--patch', '--unified=3', '--no-color', '--no-ext-diff', `${base}...${compare}`, '--', filePath],
      {
        cwd: repoPath,
      },
    );

    const patch = result.stdout;

    // Check patch size
    if (patch.length > MAX_PATCH_SIZE_BYTES) {
      return null;
    }

    // Annotate the patch with line numbers for easier LLM processing
    const annotatedPatch = annotateDiffWithLineNumbers(patch);

    return annotatedPatch;
  } catch {
    return null;
  }
}

async function generatePatches(repoPath: string, base: string, compare: string, files: FileRecord[]): Promise<FileRecord[]> {
  const limit = pLimit(PATCH_CONCURRENCY);
  const results: FileRecord[] = [];
  const tasks = files.map((file) =>
    limit(async () => {
      if (file.skipReason) {
        return file;
      }

      const patch = await generatePatchForFile(repoPath, base, compare, file.path);

      if (patch === null) {
        return {
          ...file,
          skipReason: 'patch too large',
        };
      }

      return {
        ...file,
        patch,
      };
    }),
  );

  const settled = await Promise.all(tasks);
  results.push(...settled);

  return results;
}

export async function processDiff(repoPath: string, base: string, compare: string = 'HEAD'): Promise<FileRecord[]> {
  try {
    // Step 1: Discover changed files
    let files = await discoverChangedFiles(repoPath, base, compare);

    if (files.length === 0) {
      throw new DiffProcessorError('No changed files found');
    }

    // Step 2: Filter denylist (early exit)
    files = filterDenylist(files);

    // Count remaining files
    const remainingAfterDenylist = files.filter((f) => !f.skipReason).length;
    if (remainingAfterDenylist === 0) {
      throw new DiffProcessorError('All files filtered by denylist');
    }

    // Step 3: Collect blob sizes and filter large files
    const sizeMap = await collectBlobSizes(repoPath, files);
    files = attachBlobSizesAndFilter(files, sizeMap);

    // Count remaining files
    const remainingAfterSizeFilter = files.filter((f) => !f.skipReason).length;
    if (remainingAfterSizeFilter === 0) {
      throw new DiffProcessorError('All files filtered by size threshold');
    }

    // Step 4: Determine text/binary status
    files = await determineTextStatus(repoPath, files);

    // Count remaining files
    const remainingAfterBinaryFilter = files.filter((f) => !f.skipReason).length;
    if (remainingAfterBinaryFilter === 0) {
      throw new DiffProcessorError('All files filtered as binary');
    }

    // Step 5: Generate per-file patches
    files = await generatePatches(repoPath, base, compare, files);

    // Final count
    const finalIncludedFiles = files.filter((f) => !f.skipReason && f.patch).length;
    if (finalIncludedFiles === 0) {
      throw new DiffProcessorError('No files included after processing');
    }

    return files;
  } catch (error) {
    if (error instanceof DiffProcessorError) {
      throw error;
    }
    throw new DiffProcessorError(
      `Failed to process diff: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
