import fs from 'fs';
import path from 'path';

import chalk from 'chalk';
import dedent from 'dedent';
import type { Command } from 'commander';

import cliState from '../cliState';
import logger from '../logger';
import { wrapTable } from '../table';
import { printBorder } from '../util/index';
import { findLogFile, formatFileSize, getLogDirectory, getLogFiles } from '../util/logs';

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
  let currentColor: ColorFn = (s) => s;

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
function printLogHeader(logPath: string, isCurrentSession: boolean): void {
  const stats = fs.statSync(logPath);

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
  grep?: string;
  noColor: boolean;
  noHeader?: boolean;
}

/**
 * Prints log file content to console with optional filtering
 */
async function printLogContent(logPath: string, options: PrintOptions): Promise<void> {
  const stats = fs.statSync(logPath);

  if (stats.size === 0) {
    logger.info(chalk.gray('Log file is empty.'));
    return;
  }

  // Warn about large files
  const ONE_MB = 1024 * 1024;
  if (stats.size > ONE_MB && !options.lines && !options.head) {
    logger.warn(dedent`
      Log file is large (${formatFileSize(stats.size)}).
      Consider using ${chalk.cyan('-n <lines>')} to limit output.
    `);
  }

  const content = fs.readFileSync(logPath, 'utf-8');
  let lines = content.split('\n');

  // Remove trailing empty line if present
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }

  // Apply grep filter if specified
  if (options.grep) {
    const pattern = new RegExp(options.grep, 'i');
    lines = lines.filter((line) => pattern.test(line));

    if (lines.length === 0) {
      logger.info(chalk.gray(`No lines matching "${options.grep}" found.`));
      return;
    }
  }

  if (options.head) {
    lines = lines.slice(0, options.head);
  } else if (options.lines) {
    lines = lines.slice(-options.lines);
  }

  const output = highlightLogLines(lines, options.noColor);
  logger.info(output);
}

/**
 * Follows a log file in real-time (like tail -f)
 */
async function followLogFile(logPath: string, noColor: boolean): Promise<void> {
  let position = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;

  logger.info(chalk.gray(`Following ${path.basename(logPath)}... (Ctrl+C to stop)\n`));

  // Print existing content first (last 20 lines)
  if (position > 0) {
    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.length > 0);
    const lastLines = lines.slice(-20);
    if (lastLines.length > 0) {
      logger.info(highlightLogLines(lastLines, noColor));
    }
    position = fs.statSync(logPath).size;
  }

  const watcher = fs.watch(logPath, (eventType) => {
    if (eventType === 'change') {
      try {
        const newSize = fs.statSync(logPath).size;
        if (newSize > position) {
          const fd = fs.openSync(logPath, 'r');
          const buffer = Buffer.alloc(newSize - position);
          fs.readSync(fd, buffer, 0, newSize - position, position);
          fs.closeSync(fd);

          const newContent = buffer.toString('utf-8');
          const newLines = newContent.split('\n').filter((line) => line.length > 0);
          if (newLines.length > 0) {
            process.stdout.write(highlightLogLines(newLines, noColor) + '\n');
          }
          position = newSize;
        }
      } catch {
        // File may have been rotated or deleted
      }
    }
  });

  // Handle cleanup on exit
  process.on('SIGINT', () => {
    watcher.close();
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}

/**
 * Lists available log files in a table format
 */
async function listLogFiles(type: LogType): Promise<void> {
  const files = getLogFiles(type);

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
    filename: 45,
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
function resolveLogPath(file: string | undefined, type: LogType): string | null {
  if (file) {
    return findLogFile(file, type);
  }

  // Check if current session has a log file
  if (type === 'all') {
    // Prefer debug log (contains all levels) but fall back to error log
    if (cliState.debugLogFile && fs.existsSync(cliState.debugLogFile)) {
      return cliState.debugLogFile;
    }
    if (cliState.errorLogFile && fs.existsSync(cliState.errorLogFile)) {
      return cliState.errorLogFile;
    }
  } else {
    const sessionLogFile = type === 'error' ? cliState.errorLogFile : cliState.debugLogFile;
    if (sessionLogFile && fs.existsSync(sessionLogFile)) {
      return sessionLogFile;
    }
  }

  // Fall back to most recent log file of the requested type
  const files = getLogFiles(type);
  return files.length > 0 ? files[0].path : null;
}

export function logsCommand(program: Command) {
  const logsCmd = program
    .command('logs [file]')
    .description('View promptfoo log files')
    .option('--type <type>', 'Log type: debug, error, or all', 'debug')
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

          // Handle list mode
          if (cmdObj.list) {
            await listLogFiles(logType);
            return;
          }

          // Resolve the log path
          const logPath = resolveLogPath(file, logType);

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
            fs.accessSync(logPath, fs.constants.R_OK);
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
          printLogHeader(logPath, isCurrentSession);

          await printLogContent(logPath, {
            lines: cmdObj.lines ? parseInt(cmdObj.lines, 10) : undefined,
            head: cmdObj.head ? parseInt(cmdObj.head, 10) : undefined,
            grep: cmdObj.grep,
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
      const validTypes = ['debug', 'error', 'all'] as const;
      if (!validTypes.includes(cmdObj.type as LogType)) {
        logger.error(`Invalid log type: ${cmdObj.type}. Must be one of: ${validTypes.join(', ')}`);
        process.exitCode = 1;
        return;
      }
      await listLogFiles(cmdObj.type as LogType);
    });
}
