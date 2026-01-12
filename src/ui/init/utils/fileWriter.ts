/**
 * File Writer - Write files to disk with progress tracking.
 *
 * Handles file creation, existence checking, and progress callbacks
 * for the init wizard's file writing step.
 */

import * as fs from 'fs';
import * as path from 'path';

import type { FileToWrite } from '../machines/initMachine.types';

export interface WriteResult {
  success: boolean;
  filesWritten: string[];
  filesSkipped: string[];
  errors: Array<{ path: string; error: string }>;
}

export interface WriteOptions {
  /** Callback for each file written */
  onFileWritten?: (filePath: string) => void;
  /** Callback for each file skipped */
  onFileSkipped?: (filePath: string) => void;
  /** Callback for progress updates */
  onProgress?: (current: number, total: number) => void;
}

/**
 * Check which files already exist in the target directory.
 */
export async function checkExistingFiles(files: FileToWrite[]): Promise<FileToWrite[]> {
  return files.map((file) => ({
    ...file,
    exists: fs.existsSync(file.path),
  }));
}

/**
 * Write files to disk with progress tracking.
 */
export async function writeFiles(
  files: FileToWrite[],
  options: WriteOptions = {},
): Promise<WriteResult> {
  const result: WriteResult = {
    success: true,
    filesWritten: [],
    filesSkipped: [],
    errors: [],
  };

  const { onFileWritten, onFileSkipped, onProgress } = options;
  let processed = 0;

  for (const file of files) {
    try {
      // Skip files that exist and shouldn't be overwritten
      if (file.exists && !file.overwrite) {
        result.filesSkipped.push(file.path);
        onFileSkipped?.(file.path);
        processed++;
        onProgress?.(processed, files.length);
        continue;
      }

      // Ensure directory exists
      const dir = path.dirname(file.path);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write file
      fs.writeFileSync(file.path, file.content, 'utf-8');
      result.filesWritten.push(file.path);
      onFileWritten?.(file.path);
    } catch (error) {
      result.success = false;
      result.errors.push({
        path: file.path,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    processed++;
    onProgress?.(processed, files.length);

    // Small delay for visual feedback
    await sleep(50);
  }

  return result;
}

/**
 * Create a directory if it doesn't exist.
 */
export function ensureDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Check if a path is writable.
 */
export function isWritable(dirPath: string): boolean {
  try {
    const testFile = path.join(dirPath, `.promptfoo-write-test-${Date.now()}`);

    // Try to create the directory if it doesn't exist
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Try to write a test file
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a relative or absolute path.
 */
export function resolvePath(inputPath: string): string {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }
  return path.resolve(process.cwd(), inputPath);
}

/**
 * Get the relative path from the current directory.
 */
export function getRelativePath(absolutePath: string): string {
  return path.relative(process.cwd(), absolutePath);
}

/**
 * Normalize a directory path.
 */
export function normalizeDirectory(dirPath: string): string {
  // Handle empty or '.' as current directory
  if (!dirPath || dirPath === '.') {
    return process.cwd();
  }

  // Resolve to absolute path
  return resolvePath(dirPath);
}

/**
 * Get a safe filename from a string.
 */
export function safeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Small sleep utility for visual feedback.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
