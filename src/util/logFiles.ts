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
  if (!fs.existsSync(logDir)) {
    return [];
  }

  const files = fs.readdirSync(logDir);
  const logFiles: LogFileInfo[] = [];

  for (const file of files) {
    if (!file.startsWith('promptfoo-') || !file.endsWith('.log')) {
      continue;
    }

    const filePath = path.join(logDir, file);
    try {
      const stat = fs.statSync(filePath);
      logFiles.push({
        name: file,
        path: filePath,
        mtime: stat.mtime,
      });
    } catch {
      // File may have been deleted between readdir and stat (race condition)
      // Skip this file and continue with others
    }
  }

  return logFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
}
