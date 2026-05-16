import fsSync from 'fs';
import fs from 'fs/promises';
import path from 'path';

import chalk from 'chalk';
import debounce from 'debounce';
import dedent from 'dedent';
import cliState from '../cliState';
import logger from '../logger';
import { wrapTable } from '../table';
import telemetry from '../telemetry';
import { printBorder } from '../util/index';
import {
  findLogFile,
  formatFileSize,
  getLogDirectory,
  getLogFiles,
  readFirstLines,
  readLastLines,
} from '../util/logs';
import type { Command } from 'commander';

type LogType = 'debug' | 'error' | 'all';

/**
 * Applies syntax highlighting to log lines based on log level.
 * Uses stateful coloring so multi-line entries (stack traces, JSON) stay colored.
 */
function highlightLogLines(lines: string[], noColor: boolean): string {
  if (noColor) {
    return lines.join('\n');
  }

  type ColorFn = (s: string) => string;
  let currentColor: ColorFn = chalk.gray; // Default to gray for lines before any tag

  return lines
    .map((line) => {
      // Check for log level tags to update color state
      if (line.includes('[ERROR]')) {
        currentColor = chalk.red;
      } else if (line.includes('[WARN]')) {
        currentColor = chalk.yellow;
      } else if (line.includes('[DEBUG]')) {
        currentColor = chalk.cyan;
      } else if (line.includes('[INFO]')) {
        currentColor = chalk.white;
      }
      // Apply current color (persists for multi-line entries)
      return currentColor(line);
    })
    .join('\n');
}

/**
 * Prints a header with file information
 */
async function printLogHeader(logPath: string, isCurrentSession: boolean): Promise<void> {
  const stats = await fs.stat(logPath);

  printBorder();
  logger.info(chalk.bold(path.basename(logPath)));
  logger.info(chalk.gray(`Path: ${logPath}`));
  logger.info(chalk.gray(`Size: ${formatFileSize(stats.size)}`));
  logger.info(chalk.gray(`Modified: ${stats.mtime.toLocaleString()}`));

  if (isCurrentSession) {
    logger.info(chalk.yellow('Note: This is the log file for the current CLI session.'));
  }

  printBorder();
}

interface PrintOptions {
  lines?: number;
  head?: number;
  grep?: RegExp;
  noColor: boolean;
  noHeader?: boolean;
}

/**
 * Reads entire file content, with warning for large files
 */
async function readFileContent(filePath: string): Promise<string[]> {
  const stats = await fs.stat(filePath);

  // Warn about large files
  const ONE_MB = 1024 * 1024;
  if (stats.size > ONE_MB) {
    logger.warn(dedent`
      Log file is large (${formatFileSize(stats.size)}).
      Consider using ${chalk.cyan('-n <lines>')} to limit output.
    `);
  }

  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');

  // Remove trailing empty line if present
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines;
}

/**
 * Prints log file content to console with optional filtering
 */
async function printLogContent(logPath: string, options: PrintOptions): Promise<void> {
  const stats = await fs.stat(logPath);

  if (stats.size === 0) {
    logger.info(chalk.gray('Log file is empty.'));
    return;
  }

  let lines: string[];

  // Use streaming for tail/head operations on large files
  if (options.lines) {
    lines = await readLastLines(logPath, options.lines);
  } else if (options.head) {
    lines = await readFirstLines(logPath, options.head);
  } else {
    lines = await readFileContent(logPath);
  }

  // Apply grep filter if specified
  if (options.grep) {
    lines = lines.filter((line) => options.grep!.test(line));

    if (lines.length === 0) {
      logger.info(chalk.gray(`No lines matching pattern found.`));
      return;
    }
  }

  const output = highlightLogLines(lines, options.noColor);
  logger.info(output);
}

// Track active watchers for cleanup
let activeWatcher: fsSync.FSWatcher | null = null;
let cleanupHandler: (() => void) | null = null;

/**
 * Follows a log file in real-time (like tail -f)
 */
async function followLogFile(logPath: string, noColor: boolean): Promise<void> {
  // Get initial file size
  let position: number;
  try {
    const stats = await fs.stat(logPath);
    position = stats.size;
  } catch {
    position = 0;
  }

  logger.info(chalk.gray(`Following ${path.basename(logPath)}... (Ctrl+C to stop)\n`));

  // Print existing content first (last 20 lines)
  if (position > 0) {
    const lastLines = await readLastLines(logPath, 20);
    if (lastLines.length > 0) {
      logger.info(highlightLogLines(lastLines, noColor));
    }
    // Re-read position after reading content to avoid race condition
    const stats = await fs.stat(logPath);
    position = stats.size;
  }

  // Create watcher with debouncing to handle rapid file changes
  const watcher = fsSync.watch(logPath);
  activeWatcher = watcher;

  const handleChange = debounce(async () => {
    try {
      const stats = await fs.stat(logPath);
      const newSize = stats.size;

      if (newSize > position) {
        // Read only the new content
        const fileHandle = await fs.open(logPath, 'r');
        try {
          const buffer = Buffer.alloc(newSize - position);
          await fileHandle.read(buffer, 0, newSize - position, position);

          const newContent = buffer.toString('utf-8');
          const newLines = newContent.split('\n').filter((line) => line.length > 0);
          if (newLines.length > 0) {
            process.stdout.write(highlightLogLines(newLines, noColor) + '\n');
          }
          position = newSize;
        } finally {
          await fileHandle.close();
        }
      } else if (newSize < position) {
        // File was truncated/rotated
        logger.info(chalk.yellow('Log file was rotated, resetting position...'));
        position = newSize;
      }
    } catch (error) {
      // File may have been rotated or deleted
      logger.debug(`Error reading log file: ${error instanceof Error ? error.message : error}`);
    }
  }, 100);

  watcher.on('change', handleChange);

  watcher.on('error', (error) => {
    logger.warn(`File watcher error: ${error}`);
  });

  // Cleanup function
  const cleanup = () => {
    if (activeWatcher) {
      activeWatcher.close();
      activeWatcher = null;
    }
    if (cleanupHandler) {
      process.removeListener('SIGINT', cleanupHandler);
      process.removeListener('SIGTERM', cleanupHandler);
      cleanupHandler = null;
    }
  };

  cleanupHandler = () => {
    cleanup();
    process.exitCode = 0;
  };

  // Register cleanup handlers
  process.once('SIGINT', cleanupHandler);
  process.once('SIGTERM', cleanupHandler);

  // Keep process alive until interrupted
  await new Promise<void>((resolve) => {
    // This promise resolves when cleanup is called
    const checkInterval = setInterval(() => {
      if (!activeWatcher) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);
  });
}

/**
 * Lists available log files in a table format
 */
async function listLogFiles(type: LogType): Promise<void> {
  const files = await getLogFiles(type);

  if (files.length === 0) {
    const logDir = getLogDirectory();
    logger.info(dedent`
      No log files found.

      Log files are created when running commands like ${chalk.cyan('promptfoo eval')}.
      Log directory: ${chalk.gray(logDir)}
    `);
    return;
  }

  const tableData = files.map((file, index) => ({
    '#': String(index + 1),
    filename: file.name,
    type: file.type,
    size: formatFileSize(file.size),
    modified: file.mtime.toLocaleString(),
  }));

  const columnWidths = {
    '#': 4,
    filename: 50,
    type: 8,
    size: 10,
    modified: 22,
  };

  logger.info(wrapTable(tableData, columnWidths) as string);
  printBorder();

  logger.info(`Run ${chalk.green('promptfoo logs <filename>')} to view a specific log file.`);
  logger.info(`Log directory: ${chalk.gray(getLogDirectory())}`);
}

/**
 * Resolves the log path based on user input or defaults to most recent
 */
async function resolveLogPath(file: string | undefined, type: LogType): Promise<string | null> {
  if (file) {
    return findLogFile(file, type);
  }

  // Check if current session has a log file
  if (type === 'all' || type === 'debug') {
    // Prefer debug log (contains all levels) but fall back to error log
    if (cliState.debugLogFile) {
      try {
        await fs.access(cliState.debugLogFile);
        return cliState.debugLogFile;
      } catch {
        // File doesn't exist, continue
      }
    }
  }

  if (type === 'all' || type === 'error') {
    if (cliState.errorLogFile) {
      try {
        await fs.access(cliState.errorLogFile);
        return cliState.errorLogFile;
      } catch {
        // File doesn't exist, continue
      }
    }
  }

  // Fall back to most recent log file of the requested type
  const files = await getLogFiles(type);
  return files.length > 0 ? files[0].path : null;
}

export function logsCommand(program: Command) {
  const logsCmd = program
    .command('logs [file]')
    .description('View promptfoo log files')
    .option('--type <type>', 'Log type: debug, error, or all', 'all')
    .option('-n, --lines <count>', 'Number of lines to display from end')
    .option('--head <count>', 'Number of lines to display from start')
    .option('-f, --follow', 'Follow log file in real-time', false)
    .option('-l, --list', 'List available log files', false)
    .option('-g, --grep <pattern>', 'Filter lines matching pattern (case-insensitive regex)')
    .option('--no-color', 'Disable syntax highlighting')
    .action(
      async (
        file: string | undefined,
        cmdObj: {
          type: string;
          lines?: string;
          head?: string;
          follow: boolean;
          list: boolean;
          grep?: string;
          color: boolean;
        },
      ) => {
        telemetry.record('command_used', {
          name: 'logs',
          type: cmdObj.type,
          follow: cmdObj.follow,
          list: cmdObj.list,
          hasGrep: !!cmdObj.grep,
          hasLines: !!cmdObj.lines,
          hasHead: !!cmdObj.head,
        });

        try {
          // Validate --type option
          const validTypes = ['debug', 'error', 'all'] as const;
          if (!validTypes.includes(cmdObj.type as LogType)) {
            logger.error(
              `Invalid log type: ${cmdObj.type}. Must be one of: ${validTypes.join(', ')}`,
            );
            process.exitCode = 1;
            return;
          }
          const logType = cmdObj.type as LogType;

          // Validate numeric options
          if (cmdObj.lines) {
            const lineCount = parseInt(cmdObj.lines, 10);
            if (isNaN(lineCount) || lineCount <= 0) {
              logger.error('--lines must be a positive number');
              process.exitCode = 1;
              return;
            }
          }
          if (cmdObj.head) {
            const headCount = parseInt(cmdObj.head, 10);
            if (isNaN(headCount) || headCount <= 0) {
              logger.error('--head must be a positive number');
              process.exitCode = 1;
              return;
            }
          }

          // Validate grep pattern
          let grepPattern: RegExp | undefined;
          if (cmdObj.grep) {
            try {
              grepPattern = new RegExp(cmdObj.grep, 'i');
            } catch {
              logger.error(
                `Invalid grep pattern: "${cmdObj.grep}" is not a valid regular expression`,
              );
              process.exitCode = 1;
              return;
            }
          }

          // Handle list mode
          if (cmdObj.list) {
            await listLogFiles(logType);
            return;
          }

          // Resolve the log path
          const logPath = await resolveLogPath(file, logType);

          if (!logPath) {
            const logDir = getLogDirectory();
            if (file) {
              logger.error(dedent`
                Log file not found: ${chalk.bold(file)}

                Run ${chalk.cyan('promptfoo logs --list')} to see available log files.
              `);
            } else {
              logger.error(dedent`
                No log files found.

                Log files are created when running commands like ${chalk.cyan('promptfoo eval')}.
                Log directory: ${chalk.gray(logDir)}
              `);
            }
            process.exitCode = 1;
            return;
          }

          // Check file permissions
          try {
            await fs.access(logPath, fsSync.constants.R_OK);
          } catch {
            logger.error(`Permission denied: Cannot read ${logPath}`);
            process.exitCode = 1;
            return;
          }

          // Determine if this is the current session's log
          const isCurrentSession =
            logPath === cliState.debugLogFile || logPath === cliState.errorLogFile;

          // Handle follow mode
          if (cmdObj.follow) {
            await followLogFile(logPath, !cmdObj.color);
            return;
          }

          // Print header and content
          await printLogHeader(logPath, isCurrentSession);

          await printLogContent(logPath, {
            lines: cmdObj.lines ? parseInt(cmdObj.lines, 10) : undefined,
            head: cmdObj.head ? parseInt(cmdObj.head, 10) : undefined,
            grep: grepPattern,
            noColor: !cmdObj.color,
          });
        } catch (error) {
          logger.error(`Failed to read logs: ${error instanceof Error ? error.message : error}`);
          process.exitCode = 1;
        }
      },
    );

  // Subcommand: promptfoo logs list
  logsCmd
    .command('list')
    .description('List available log files')
    .option('--type <type>', 'Log type: debug, error, or all', 'all')
    .action(async (cmdObj: { type: string }) => {
      telemetry.record('command_used', {
        name: 'logs list',
        type: cmdObj.type,
      });

      const validTypes = ['debug', 'error', 'all'] as const;
      if (!validTypes.includes(cmdObj.type as LogType)) {
        logger.error(`Invalid log type: ${cmdObj.type}. Must be one of: ${validTypes.join(', ')}`);
        process.exitCode = 1;
        return;
      }
      await listLogFiles(cmdObj.type as LogType);
    });
}
