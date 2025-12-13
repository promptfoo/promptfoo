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
 * @returns Array of log file information objects
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
    // Return empty array on error - caller can handle logging
    return [];
  }
}
