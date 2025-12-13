import fs from 'fs';
import path from 'path';

/**
 * Utility functions for working with log files
 */

export interface LogFileInfo {
  name: string;
  path: string;
  mtime: Date;
}

/**
 * Get all promptfoo log files from a directory, sorted by modification time (newest first)
 * @param logDir - Directory containing log files
 * @returns Array of log file information objects. Returns empty array if:
 *   - Directory doesn't exist
 *   - Directory exists but has no matching log files
 *   - An error occurs while reading the directory
 */
export function getLogFiles(logDir: string): LogFileInfo[] {
  if (!fs.existsSync(logDir)) {
    return [];
  }

  try {
    return fs
      .readdirSync(logDir)
      .filter((file) => file.startsWith('promptfoo-') && file.endsWith('.log'))
      .map((file) => ({
        name: file,
        path: path.join(logDir, file),
        mtime: fs.statSync(path.join(logDir, file)).mtime,
      }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // Sort by newest first
  } catch (_error) {
    // Return empty array on error - caller should check if directory exists to distinguish errors
    return [];
  }
}
