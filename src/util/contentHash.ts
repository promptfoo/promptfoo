/**
 * Content hash utilities for computing SHA-256 hashes of files and directories.
 * Used for model deduplication and verification.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../logger';

/**
 * Compute SHA-256 hash of a file using streaming to handle large files efficiently.
 * @param filePath - Absolute path to the file
 * @returns Promise resolving to hex-encoded SHA-256 hash
 */
export async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) =>
      reject(new Error(`Failed to hash file ${filePath}: ${err.message}`)),
    );
  });
}

/**
 * Recursively collect all file paths in a directory, sorted for deterministic hashing.
 * @param dirPath - Absolute path to directory
 * @returns Promise resolving to sorted array of file paths
 */
async function collectFiles(dirPath: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await collectFiles(fullPath);
      files.push(...subFiles);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files.sort(); // Sort for deterministic ordering
}

/**
 * Compute SHA-256 hash of all files in a directory.
 * Hash is computed by concatenating (relative_path || file_hash) for each file, sorted by path.
 * This creates a content-addressable hash similar to Git's tree objects.
 *
 * @param dirPath - Absolute path to directory
 * @returns Promise resolving to hex-encoded SHA-256 hash
 */
export async function hashDirectory(dirPath: string): Promise<string> {
  const files = await collectFiles(dirPath);
  const hash = crypto.createHash('sha256');

  for (const file of files) {
    const relativePath = path.relative(dirPath, file);
    const fileHash = await hashFile(file);

    // Combine relative path and file hash (similar to Git's approach)
    hash.update(`${relativePath}\0${fileHash}\0`);
  }

  return hash.digest('hex');
}

/**
 * Compute SHA-256 content hash for a file or directory.
 * This is the main function used for model deduplication.
 *
 * @param modelPath - Absolute path to file or directory
 * @returns Promise resolving to hex-encoded SHA-256 hash
 * @throws Error if path doesn't exist or cannot be accessed
 */
export async function computeContentHash(modelPath: string): Promise<string> {
  try {
    const stats = await fs.promises.stat(modelPath);

    if (stats.isFile()) {
      logger.debug(`Computing content hash for file: ${modelPath}`);
      return await hashFile(modelPath);
    } else if (stats.isDirectory()) {
      logger.debug(`Computing content hash for directory: ${modelPath}`);
      return await hashDirectory(modelPath);
    } else {
      throw new Error(`Path is neither file nor directory: ${modelPath}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to compute content hash for ${modelPath}: ${message}`);
  }
}
