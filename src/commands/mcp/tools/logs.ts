import fs from 'fs/promises';

import { z } from 'zod';
import {
  formatFileSize,
  getLogDirectory,
  getLogFiles,
  type LogFileInfo,
  readFirstLines,
  readLastLines,
} from '../../../util/logs';
import { paginate } from '../lib/performance';
import { createToolResponse } from '../lib/utils';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Maximum number of lines to return in a single read_logs call
 * to prevent overwhelming responses
 */
const MAX_LINES = 1000;
const DEFAULT_LINES = 100;

/**
 * Filters lines by a grep pattern (case-insensitive regex)
 */
function filterByPattern(lines: string[], pattern: string): string[] {
  try {
    const regex = new RegExp(pattern, 'i');
    return lines.filter((line) => regex.test(line));
  } catch {
    // If invalid regex, fall back to simple string match
    const lowerPattern = pattern.toLowerCase();
    return lines.filter((line) => line.toLowerCase().includes(lowerPattern));
  }
}

/**
 * Tool to list available log files
 * Provides metadata about each file for easier navigation
 */
export function registerListLogsTool(server: McpServer) {
  server.tool(
    'list_logs',
    {
      type: z
        .enum(['debug', 'error', 'all'])
        .optional()
        .default('all')
        .describe('Filter by log type: debug, error, or all (default: all)'),
      page: z
        .number()
        .int()
        .positive()
        .optional()
        .default(1)
        .describe('Page number for pagination (default: 1)'),
      pageSize: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe('Number of items per page (1-100, default: 20)'),
    },
    async (args) => {
      const { type = 'all', page = 1, pageSize = 20 } = args;

      try {
        const logFiles = await getLogFiles(type);

        if (logFiles.length === 0) {
          return createToolResponse('list_logs', true, {
            logs: [],
            pagination: { page: 1, pageSize, totalItems: 0, totalPages: 0 },
            summary: {
              logDirectory: getLogDirectory(),
              totalFiles: 0,
              filterType: type,
              message: 'No log files found. Run an evaluation to generate logs.',
            },
          });
        }

        // Format log files for response
        const formattedLogs = logFiles.map((log: LogFileInfo) => ({
          name: log.name,
          path: log.path,
          type: log.type,
          size: log.size,
          sizeFormatted: formatFileSize(log.size),
          modified: log.mtime.toISOString(),
          modifiedRelative: getRelativeTime(log.mtime),
        }));

        // Apply pagination
        const paginatedResult = paginate(formattedLogs, { page, pageSize });

        // Calculate summary stats
        const debugCount = logFiles.filter((l: LogFileInfo) => l.type === 'debug').length;
        const errorCount = logFiles.filter((l: LogFileInfo) => l.type === 'error').length;
        const totalSize = logFiles.reduce((sum: number, l: LogFileInfo) => sum + l.size, 0);

        return createToolResponse('list_logs', true, {
          logs: paginatedResult.data,
          pagination: paginatedResult.pagination,
          summary: {
            logDirectory: getLogDirectory(),
            totalFiles: logFiles.length,
            debugFiles: debugCount,
            errorFiles: errorCount,
            totalSize: formatFileSize(totalSize),
            filterType: type,
          },
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return createToolResponse(
          'list_logs',
          false,
          undefined,
          `Failed to list log files: ${errorMessage}`,
        );
      }
    },
  );
}

/**
 * Tool to read log file contents with filtering options
 */
export function registerReadLogsTool(server: McpServer) {
  server.tool(
    'read_logs',
    {
      file: z
        .string()
        .optional()
        .describe(
          'Log file to read: filename, partial name, or "latest" (default). Use list_logs to see available files.',
        ),
      type: z
        .enum(['debug', 'error', 'all'])
        .optional()
        .default('debug')
        .describe('Log type when selecting latest file (default: debug)'),
      lines: z
        .number()
        .int()
        .min(1)
        .max(MAX_LINES)
        .optional()
        .default(DEFAULT_LINES)
        .describe(
          `Number of lines to return from end of file (1-${MAX_LINES}, default: ${DEFAULT_LINES})`,
        ),
      head: z
        .boolean()
        .optional()
        .default(false)
        .describe('If true, read from beginning instead of end (default: false)'),
      grep: z
        .string()
        .optional()
        .describe('Filter lines by pattern (case-insensitive regex or substring match)'),
    },
    async (args) => {
      const { file, type = 'debug', lines = DEFAULT_LINES, head = false, grep } = args;

      try {
        // Resolve which file to read
        let targetFile: LogFileInfo | undefined;

        if (!file || file === 'latest') {
          // Get the most recent file of the specified type
          const logFiles = await getLogFiles(type === 'all' ? 'debug' : type);
          if (logFiles.length === 0) {
            return createToolResponse(
              'read_logs',
              false,
              undefined,
              `No ${type} log files found. Run an evaluation to generate logs.`,
            );
          }
          targetFile = logFiles[0]; // Already sorted by mtime, newest first
        } else {
          // Try to find the specified file
          const logFiles = await getLogFiles('all');

          // Try exact match first
          targetFile = logFiles.find((l: LogFileInfo) => l.name === file || l.path === file);

          // Try partial match
          if (!targetFile) {
            targetFile = logFiles.find(
              (l: LogFileInfo) => l.name.includes(file) || l.name.startsWith(file),
            );
          }

          if (!targetFile) {
            return createToolResponse(
              'read_logs',
              false,
              undefined,
              `Log file not found: "${file}". Use list_logs to see available files.`,
            );
          }
        }

        // Check file exists and get stats
        const stats = await fs.stat(targetFile.path);
        if (!stats.isFile()) {
          return createToolResponse(
            'read_logs',
            false,
            undefined,
            `Path is not a file: ${targetFile.path}`,
          );
        }

        // Read the file content
        let content: string[];
        if (head) {
          content = await readFirstLines(targetFile.path, lines);
        } else {
          content = await readLastLines(targetFile.path, lines);
        }

        // Apply grep filter if specified
        if (grep) {
          content = filterByPattern(content, grep);
        }

        // Build response
        const response = {
          file: {
            name: targetFile.name,
            path: targetFile.path,
            type: targetFile.type,
            size: formatFileSize(targetFile.size),
            modified: targetFile.mtime.toISOString(),
          },
          content: content.join('\n'),
          metadata: {
            linesReturned: content.length,
            linesRequested: lines,
            readMode: head ? 'head' : 'tail',
            grepPattern: grep || null,
            truncated: content.length >= lines && !grep,
          },
        };

        return createToolResponse('read_logs', true, response);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return createToolResponse(
          'read_logs',
          false,
          undefined,
          `Failed to read log file: ${errorMessage}`,
        );
      }
    },
  );
}

/**
 * Helper to format relative time
 */
function getRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}

/**
 * Register all logs tools
 */
export function registerLogTools(server: McpServer) {
  registerListLogsTool(server);
  registerReadLogsTool(server);
}
