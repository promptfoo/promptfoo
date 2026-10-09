/**
 * File Filtering Constants
 *
 * Shared constants for code scan file filtering used by both CLI and server.
 * Kept separate so server callers do not load the diff-processing pipeline.
 */

import { minimatch } from 'minimatch';

export const DENYLIST_PATTERNS = [
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

export const MAX_BLOB_SIZE_BYTES = 500 * 1024; // 500 KB
export const MAX_PATCH_SIZE_BYTES = 200 * 1024; // 200 KB

export function isInDenylist(filePath: string): boolean {
  return DENYLIST_PATTERNS.some((pattern) => minimatch(filePath, pattern));
}
