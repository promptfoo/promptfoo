import fs from 'fs';
import path from 'path';

export interface LogFileInfo {
  name: string;
  path: string;
  mtime: Date;
}

/**
 * Get all promptfoo log files from a directory, sorted by modification time (newest first).
 *
 * @param logDir - Directory containing log files
 * @returns Array of log file information objects, sorted by newest first.
 *          Returns empty array if directory doesn't exist or has no matching log files.
 * @throws Error if directory exists but cannot be read (permissions, I/O errors, etc.)
 */
export function getLogFiles(logDir: string): LogFileInfo[] {
  let entries: fs.Dirent[];
  try {
    // Use withFileTypes to avoid separate statSync calls for each file
    entries = fs.readdirSync(logDir, { withFileTypes: true });
  } catch (error) {
    // Directory doesn't exist or can't be read
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const logFiles: LogFileInfo[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith('promptfoo-') || !entry.name.endsWith('.log')) {
      continue;
    }

    const filePath = path.join(logDir, entry.name);
    try {
      // We still need statSync for mtime since Dirent doesn't include it
      const stat = fs.statSync(filePath);
      logFiles.push({
        name: entry.name,
        path: filePath,
        mtime: stat.mtime,
      });
    } catch (error) {
      // File may have been deleted between readdir and stat (race condition)
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Skip this file and continue with others
        continue;
      }
      throw error;
    }
  }

  return logFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
}
