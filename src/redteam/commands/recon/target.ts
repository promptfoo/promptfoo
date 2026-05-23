import * as fs from 'fs';
import * as path from 'path';

import { minimatch } from 'minimatch';
import { DEFAULT_EXCLUSIONS } from './prompt';

const MINIMATCH_OPTIONS = {
  dot: true,
  nocase: process.platform === 'win32',
  nonegate: true,
} as const;

export interface PreparedReconTarget {
  directory: string;
  excludedPatterns: string[];
  copiedFiles: number;
  skippedEntries: number;
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function normalizePattern(pattern: string): string {
  return toPosixPath(pattern).replace(/^\.?\//, '').replace(/\/+$/, '');
}

function hasGlobMagic(pattern: string): boolean {
  return /[*?[\]{}()+@]/.test(pattern);
}

function matchesPlainPathSegment(relativePath: string, pattern: string): boolean {
  if (hasGlobMagic(pattern)) {
    return false;
  }

  return (
    relativePath === pattern ||
    relativePath.startsWith(`${pattern}/`) ||
    relativePath.endsWith(`/${pattern}`) ||
    relativePath.includes(`/${pattern}/`)
  );
}

function matchesDirectoryGlob(relativePath: string, pattern: string): boolean {
  if (!pattern.endsWith('/**')) {
    return false;
  }

  const directoryPattern = pattern.slice(0, -3);
  return matchesPlainPathSegment(relativePath, directoryPattern);
}

export function buildReconExclusions(additionalExclusions?: string[]): string[] {
  return [...DEFAULT_EXCLUSIONS, ...(additionalExclusions || [])]
    .map((pattern) => normalizePattern(pattern.trim()))
    .filter((pattern) => pattern.length > 0);
}

export function isReconPathExcluded(relativePath: string, exclusions: string[]): boolean {
  const normalizedPath = toPosixPath(relativePath).replace(/^\.?\//, '');
  if (!normalizedPath) {
    return false;
  }

  return exclusions.some((pattern) => {
    if (matchesPlainPathSegment(normalizedPath, pattern) || matchesDirectoryGlob(normalizedPath, pattern)) {
      return true;
    }

    return (
      minimatch(normalizedPath, pattern, MINIMATCH_OPTIONS) ||
      minimatch(normalizedPath, `**/${pattern}`, MINIMATCH_OPTIONS)
    );
  });
}

/**
 * Copies only non-excluded regular files into an isolated snapshot directory.
 *
 * Recon providers receive this snapshot instead of the source checkout, so
 * prompt injection or model mistakes cannot read files hidden by `.env*` or
 * user-provided `--exclude` patterns.
 */
export function prepareReconTarget(
  targetDirectory: string,
  scratchpadDirectory: string,
  additionalExclusions?: string[],
): PreparedReconTarget {
  const exclusions = buildReconExclusions(additionalExclusions);
  const snapshotRoot = path.join(scratchpadDirectory, 'target');
  const snapshotDirectory = path.join(snapshotRoot, path.basename(targetDirectory) || 'codebase');
  let copiedFiles = 0;
  let skippedEntries = 0;

  fs.mkdirSync(snapshotDirectory, { recursive: true, mode: 0o700 });

  const copyEntry = (sourcePath: string, destinationPath: string, relativePath: string): void => {
    if (relativePath && isReconPathExcluded(relativePath, exclusions)) {
      skippedEntries += 1;
      return;
    }

    const stats = fs.lstatSync(sourcePath);
    if (stats.isSymbolicLink()) {
      skippedEntries += 1;
      return;
    }

    if (stats.isDirectory()) {
      fs.mkdirSync(destinationPath, { recursive: true, mode: 0o700 });
      for (const entry of fs.readdirSync(sourcePath, { withFileTypes: true })) {
        const childRelativePath = relativePath
          ? `${relativePath}/${entry.name}`
          : entry.name;
        copyEntry(
          path.join(sourcePath, entry.name),
          path.join(destinationPath, entry.name),
          childRelativePath,
        );
      }
      return;
    }

    if (!stats.isFile()) {
      skippedEntries += 1;
      return;
    }

    fs.mkdirSync(path.dirname(destinationPath), { recursive: true, mode: 0o700 });
    fs.copyFileSync(sourcePath, destinationPath);
    copiedFiles += 1;
  };

  copyEntry(targetDirectory, snapshotDirectory, '');

  return {
    directory: snapshotDirectory,
    excludedPatterns: exclusions,
    copiedFiles,
    skippedEntries,
  };
}
