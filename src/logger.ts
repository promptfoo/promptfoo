import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

import chalk from 'chalk';
import winston from 'winston';
import { getEnvString } from './envars';
import { getConfigDirectoryPath } from './util/config/manage';
import { sanitizeBody, sanitizeUrl } from './util/sanitizer';

const MAX_LOG_FILES = 50;

// Promisified fs operations for Node.js 20+ modernization
const fsAccess = promisify(fs.access);
const fsMkdir = promisify(fs.mkdir);
const fsReaddir = promisify(fs.readdir);
const fsStat = promisify(fs.stat);
const fsUnlink = promisify(fs.unlink);

type LogCallback = (message: string) => void;
export let globalLogCallback: LogCallback | null = null;

export function setLogCallback(callback: LogCallback | null) {
  globalLogCallback = callback;
}

export const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

// Lazy source map support - only loaded when debug is enabled
export let sourceMapSupportInitialized = false;

export async function initializeSourceMapSupport(): Promise<void> {
  if (!sourceMapSupportInitialized) {
    try {
      const sourceMapSupport = await import('source-map-support');
      sourceMapSupport.install();
      sourceMapSupportInitialized = true;
    } catch {
      // Ignore errors. This happens in the production build, because source-map-support is a dev dependency.
    }
  }
}

/**
 * Gets the caller location (filename and line number)
 * @returns String with file location information
 */
export function getCallerLocation(): string {
  try {
    const error = new Error();
    const stack = error.stack?.split('\n') || [];

    // Skip first 3 lines (Error, getCallerLocation, and the logger method)
    const callerLine = stack[3];

    if (callerLine) {
      // Handle different stack trace formats
      const matchParens = callerLine.match(/at (?:.*) \((.+):(\d+):(\d+)\)/);
      const matchNormal = callerLine.match(/at (.+):(\d+):(\d+)/);

      const match = matchParens || matchNormal;
      if (match) {
        // matchParens has filePath at index 1, matchNormal has it at index 1 too
        const filePath = match[1];
        const line = match[2];

        // Get just the filename from the path
        const fileName = path.basename(filePath);
        return `[${fileName}:${line}]`;
      }
    }
  } catch {
    // Silently handle any errors in stack trace parsing
  }

  return '';
}

type StrictLogMethod = (message: string) => winston.Logger;
type StrictLogger = Omit<winston.Logger, keyof typeof LOG_LEVELS> & {
  [K in keyof typeof LOG_LEVELS]: StrictLogMethod;
};

/**
 * Extracts the actual message string from potentially nested info objects
 */
function extractMessage(info: any): string {
  if (typeof info.message === 'object' && info.message !== null && 'message' in info.message) {
    return typeof info.message.message === 'string'
      ? info.message.message
      : String(info.message.message);
  }

  return typeof info.message === 'string' ? info.message : JSON.stringify(info.message);
}

export const consoleFormatter = winston.format.printf(
  (info: winston.Logform.TransformableInfo): string => {
    const message = extractMessage(info);

    // Call the callback if it exists
    if (globalLogCallback) {
      globalLogCallback(message);
    }

    const location = info.location ? `${info.location} ` : '';

    if (info.level === 'error') {
      return chalk.red(`${location}${message}`);
    } else if (info.level === 'warn') {
      return chalk.yellow(`${location}${message}`);
    } else if (info.level === 'info') {
      return `${location}${message}`;
    } else if (info.level === 'debug') {
      return `${chalk.cyan(location)}${message}`;
    }
    throw new Error(`Invalid log level: ${info.level}`);
  },
);

export const fileFormatter = winston.format.printf(
  (info: winston.Logform.TransformableInfo): string => {
    const timestamp = new Date().toISOString();
    const location = info.location ? ` ${info.location}` : '';
    const message = extractMessage(info);

    return `${timestamp} [${info.level.toUpperCase()}]${location}: ${message}`;
  },
);

export const winstonLogger = winston.createLogger({
  levels: LOG_LEVELS,
  transports: [
    new winston.transports.Console({
      level: getEnvString('LOG_LEVEL', 'info'),
      format: winston.format.combine(winston.format.simple(), consoleFormatter),
    }),
  ],
});

if (!getEnvString('PROMPTFOO_DISABLE_ERROR_LOG', '')) {
  winstonLogger.on('data', (chunk) => {
    if (
      chunk.level === 'error' &&
      !winstonLogger.transports.some((t) => t instanceof winston.transports.File)
    ) {
      // Only create the errors file if there are any errors
      const fileTransport = new winston.transports.File({
        filename: path.join(getEnvString('PROMPTFOO_LOG_DIR', '.'), 'promptfoo-errors.log'),
        level: 'error',
        format: winston.format.combine(winston.format.simple(), fileFormatter),
      });
      winstonLogger.add(fileTransport);

      // Re-log the error that triggered this so it's written to the file
      fileTransport.write(chunk);
    }
  });
}

export function getLogLevel(): LogLevel {
  return winstonLogger.transports[0].level as LogLevel;
}

export function setLogLevel(level: LogLevel) {
  if (level in LOG_LEVELS) {
    winstonLogger.transports[0].level = level;

    if (level === 'debug') {
      initializeSourceMapSupport();
    }
  } else {
    throw new Error(`Invalid log level: ${level}`);
  }
}

export function isDebugEnabled(): boolean {
  return getLogLevel() === 'debug';
}

/**
 * Creates log directory and cleans up old log files
 */
async function setupLogDirectory(): Promise<string> {
  const configDir = getConfigDirectoryPath(true);
  const logDir = path.join(configDir, 'logs');

  try {
    await fsAccess(logDir);
  } catch {
    await fsMkdir(logDir, { recursive: true });
  }

  // Clean up old log files
  try {
    const files = await fsReaddir(logDir);
    const logFiles = await Promise.all(
      files
        .filter((file) => file.startsWith('promptfoo-') && file.endsWith('.log'))
        .map(async (file) => {
          const filePath = path.join(logDir, file);
          const stats = await fsStat(filePath);
          return {
            name: file,
            path: filePath,
            mtime: stats.mtime,
          };
        }),
    );

    logFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // Sort by newest first

    // Remove old files
    if (logFiles.length >= MAX_LOG_FILES) {
      const filesToRemove = logFiles.slice(MAX_LOG_FILES);
      await Promise.all(
        filesToRemove.map(async (file) => {
          try {
            await fsUnlink(file.path);
          } catch (error) {
            logger.warn(`Error removing old log file: ${file.name} ${error}`);
          }
        }),
      );
    }
  } catch (error) {
    logger.warn(`Error cleaning up old log files: ${error}`);
  }

  return logDir;
}

/**
 * Creates a new log file for the current CLI run
 */
async function createRunLogFile(): Promise<string> {
  const logDir = await setupLogDirectory();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
  const logFile = path.join(logDir, `promptfoo-${timestamp}.log`);
  return logFile;
}

// Create a file transport for the current run
let runLogTransport: winston.transports.FileTransportInstance | null = null;

/**
 * Initialize per-run logging
 */
export async function initializeRunLogging(): Promise<void> {
  if (runLogTransport) {
    return;
  }

  try {
    const logFile = await createRunLogFile();
    runLogTransport = new winston.transports.File({
      filename: logFile,
      level: 'debug', // Capture all levels in the file
      format: winston.format.combine(winston.format.simple(), fileFormatter),
    });

    winstonLogger.add(runLogTransport);
  } catch (error) {
    logger.warn(`Error creating run log file: ${error}`);

    runLogTransport = null;
  }
}

/**
 * Creates a logger method for the specified log level
 */
function createLogMethod(level: keyof typeof LOG_LEVELS): StrictLogMethod {
  return (message: string) => {
    const location =
      level === 'debug' ? getCallerLocation() : isDebugEnabled() ? getCallerLocation() : '';

    if (level === 'debug') {
      initializeSourceMapSupport();
    }

    return winstonLogger[level]({ message, location });
  };
}

// Wrapper enforces strict single-string argument logging
const logger: StrictLogger = Object.assign({}, winstonLogger, {
  error: createLogMethod('error'),
  warn: createLogMethod('warn'),
  info: createLogMethod('info'),
  debug: createLogMethod('debug'),
  add: winstonLogger.add.bind(winstonLogger),
  remove: winstonLogger.remove.bind(winstonLogger),
  transports: winstonLogger.transports,
}) as StrictLogger & {
  add: typeof winstonLogger.add;
  remove: typeof winstonLogger.remove;
  transports: typeof winstonLogger.transports;
};

/**
 * Logs request/response details in a formatted way
 * @param url - Request URL
 * @param requestBody - Request body object
 * @param response - Response object (optional)
 * @param error - Whether to log as error (true) or debug (false)
 */
export async function logRequestResponse(options: {
  url: string;
  requestBody: any;
  requestMethod: string;
  response?: Response | null;
  error?: boolean;
}): Promise<void> {
  const { url, requestBody, requestMethod, response, error } = options;

  const logMethod = error ? logger.error : logger.debug;

  let responseText = '';
  if (response) {
    try {
      responseText = await response.clone().text();
    } catch {
      responseText = 'Unable to read response';
    }
  }

  const details = [
    `URL: ${sanitizeUrl(url)}`,
    `Method: ${requestMethod}`,
    `Request Body: ${JSON.stringify(sanitizeBody(requestBody), null, 2)}`,
    response ? `Status: ${response.status} ${response.statusText}` : '',
    responseText ? `Response: ${responseText}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const message = `API request:\n${details}`;
  logMethod(message);
}

// Initialize source maps if debug is enabled at startup
if (getEnvString('LOG_LEVEL', 'info') === 'debug') {
  initializeSourceMapSupport();
}

export default logger;
