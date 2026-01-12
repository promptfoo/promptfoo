import fsSync, { createReadStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import readline from 'readline';

import { getEnvString } from '../envars';
import logger from '../logger';
import { getConfigDirectoryPath } from './config/manage';

export interface LogFileInfo {
  name: string;
  path: string;
  mtime: Date;
  type: 'debug' | 'error';
  size: number;
}

/**
 * Gets the log directory path, respecting PROMPTFOO_LOG_DIR environment variable
 */
export function getLogDirectory(): string {
  const configDir = getConfigDirectoryPath(true);
  const customLogDir = getEnvString('PROMPTFOO_LOG_DIR');
  return customLogDir ? path.resolve(customLogDir) : path.join(configDir, 'logs');
}

/**
 * Gets all log files from the logs directory, sorted by modification time (newest first)
 * @param type - Filter by log type: 'debug', 'error', or 'all'
 */
export async function getLogFiles(type: 'debug' | 'error' | 'all' = 'all'): Promise<LogFileInfo[]> {
  const logDir = getLogDirectory();

  try {
    await fs.access(logDir);
  } catch {
    return [];
  }

  try {
    const files = await fs.readdir(logDir);
    const logFiles: LogFileInfo[] = [];

    for (const file of files) {
      if (!file.startsWith('promptfoo-') || !file.endsWith('.log')) {
        continue;
      }
      if (type !== 'all' && !file.includes(`-${type}-`)) {
        continue;
      }

      const filePath = path.join(logDir, file);
      try {
        const stats = await fs.stat(filePath);
        const logType: 'debug' | 'error' = file.includes('-error-') ? 'error' : 'debug';
        logFiles.push({
          name: file,
          path: filePath,
          mtime: stats.mtime,
          type: logType,
          size: stats.size,
        });
      } catch {
        // Skip files we can't stat
        continue;
      }
    }

    return logFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  } catch (error) {
    logger.error(`Error reading log directory: ${error}`);
    return [];
  }
}

/**
 * Synchronous version of getLogFiles for use in contexts where async is not possible
 * @deprecated Use the async getLogFiles when possible
 */
export function getLogFilesSync(type: 'debug' | 'error' | 'all' = 'all'): LogFileInfo[] {
  const logDir = getLogDirectory();

  if (!fsSync.existsSync(logDir)) {
    return [];
  }

  try {
    return fsSync
      .readdirSync(logDir)
      .filter((file) => {
        if (!file.startsWith('promptfoo-') || !file.endsWith('.log')) {
          return false;
        }
        if (type === 'all') {
          return true;
        }
        return file.includes(`-${type}-`);
      })
      .map((file): LogFileInfo => {
        const filePath = path.join(logDir, file);
        const stats = fsSync.statSync(filePath);
        const logType: 'debug' | 'error' = file.includes('-error-') ? 'error' : 'debug';
        return {
          name: file,
          path: filePath,
          mtime: stats.mtime,
          type: logType,
          size: stats.size,
        };
      })
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  } catch (error) {
    logger.error(`Error reading log directory: ${error}`);
    return [];
  }
}

/**
 * Finds a log file by identifier (full path, filename, or partial match)
 * @param identifier - File path, name, or partial name to search for
 * @param type - Log type to filter by
 */
export function findLogFile(
  identifier: string,
  type: 'debug' | 'error' | 'all' = 'all',
): string | null {
  // Check if it's a full path that exists
  if (path.isAbsolute(identifier) && fsSync.existsSync(identifier)) {
    return identifier;
  }

  const logDir = getLogDirectory();

  // Check if it's a filename in the logs directory
  const fullPath = path.join(logDir, identifier);
  if (fsSync.existsSync(fullPath)) {
    return fullPath;
  }

  // Try fuzzy matching (prefix/contains) - use sync version here since this is called from resolveLogPath
  const files = getLogFilesSync(type);
  const match = files.find((f) => f.name.includes(identifier) || f.name.startsWith(identifier));

  return match?.path || null;
}

/**
 * Formats a file size in bytes to a human-readable string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Reads the last N lines from a file using streaming (memory efficient).
 * For small files (<1MB), reads the entire file and slices.
 * For large files, streams line by line keeping only the last N.
 */
export async function readLastLines(filePath: string, lineCount: number): Promise<string[]> {
  const stats = await fs.stat(filePath);

  // For small files, just read the whole thing - it's faster
  const ONE_MB = 1024 * 1024;
  if (stats.size < ONE_MB) {
    const content = await fs.readFile(filePath, 'utf-8');
    const allLines = content.split('\n');
    // Remove trailing empty line if present
    if (allLines.length > 0 && allLines[allLines.length - 1] === '') {
      allLines.pop();
    }
    return allLines.slice(-lineCount);
  }

  // For large files, stream and keep only the last N lines
  const lines: string[] = [];
  const rl = readline.createInterface({
    input: createReadStream(filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    lines.push(line);
    if (lines.length > lineCount) {
      lines.shift();
    }
  }

  return lines;
}

/**
 * Reads the first N lines from a file using streaming (memory efficient).
 * Stops reading as soon as N lines are collected.
 */
export async function readFirstLines(filePath: string, lineCount: number): Promise<string[]> {
  const lines: string[] = [];
  const rl = readline.createInterface({
    input: createReadStream(filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    lines.push(line);
    if (lines.length >= lineCount) {
      rl.close();
      break;
    }
  }

  return lines;
}
