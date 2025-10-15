import fs from 'fs';
import path from 'path';

import chalk from 'chalk';
import winston from 'winston';
import cliState from './cliState';
import { getEnvString } from './envars';
import { getConfigDirectoryPath } from './util/config/manage';
import { safeJsonStringify } from './util/json';
import { sanitizeObject, sanitizeUrl } from './util/sanitizer';
import { getDateTimeForFilename } from './util/time';

const MAX_LOG_FILES = 50;

type LogCallback = (message: string) => void;

export let globalLogCallback: LogCallback | null = null;

export function setLogCallback(callback: LogCallback | null) {
  globalLogCallback = callback;
}

// Global configuration for structured logging
let useStructuredLogging = false;

export function setStructuredLogging(enabled: boolean) {
  useStructuredLogging = enabled;
}

export function disableConsoleLogging() {
  winstonLogger.transports.forEach((transport) => {
    if (transport instanceof winston.transports.Console) {
      transport.silent = true;
    }
  });
}

export function enableConsoleLogging() {
  winstonLogger.transports.forEach((transport) => {
    if (transport instanceof winston.transports.Console) {
      transport.silent = false;
    }
  });
}

function getErrorLogPath(): string {
  if (!cliState.errorLogPath) {
    cliState.errorLogPath = path.join(
      getLogDirectory(),
      `promptfoo-errors-${getDateTimeForFilename()}.log`,
    );
  }
  return cliState.errorLogPath;
}

export const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

/**
 * Context object for sanitized logging
 * Allows passing structured data that will be automatically sanitized
 */
export interface SanitizedLogContext {
  url?: string;
  headers?: Record<string, string>;
  body?: any;
  queryParams?: Record<string, string>;
  [key: string]: any;
}

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
      !winstonLogger.transports.some(
        (t) => t instanceof winston.transports.File && t.filename.includes('promptfoo-errors'),
      )
    ) {
      // Only create the errors file if there are any errors
      const fileTransport = new winston.transports.File({
        filename: getErrorLogPath(),
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

function getLogDirectory(): string {
  const envVarOverride = getEnvString('PROMPTFOO_LOG_DIR', '');

  if (envVarOverride !== '') {
    try {
      if (!fs.existsSync(envVarOverride)) {
        fs.mkdirSync(envVarOverride, { recursive: true });
      }
      return envVarOverride;
    } catch (error) {
      logger.error(
        `Error creating or accessing  log directory set by PROMPTFOO_LOG_DIR (${envVarOverride}), reverting to default: ${error}`,
      );
    }
  }

  const configDir = getConfigDirectoryPath(true);
  const logDir = path.join(configDir, 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  return logDir;
}

/**
 * Creates log directory and cleans up old log files
 */
function setupLogDirectory(): string {
  const logDir = getLogDirectory();

  // Clean up old log files
  try {
    const logFiles = fs
      .readdirSync(logDir)
      .filter((file) => file.includes('promptfoo-') && file.endsWith('.log'))
      .map((file) => ({
        name: file,
        path: path.join(logDir, file),
        mtime: fs.statSync(path.join(logDir, file)).mtime,
      }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime()); // Sort by newest first

    // Remove old files
    if (logFiles.length >= MAX_LOG_FILES) {
      logFiles.slice(MAX_LOG_FILES).forEach((file) => {
        try {
          fs.unlinkSync(file.path);
        } catch (error) {
          logger.warn(`Error removing old log file: ${file.name} ${error}`);
        }
      });
    }
  } catch (error) {
    logger.warn(`Error cleaning up old log files: ${error}`);
  }

  return logDir;
}

/**
 * Creates a new log file for the current CLI run
 */
function createRunLogFile(timestamp: string): string {
  const logDir = setupLogDirectory();
  const logFile = path.join(logDir, `promptfoo-debug-${timestamp}.log`);
  return logFile;
}

// Create a file transport for the current run
let runLogTransport: winston.transports.FileTransportInstance | null = null;

/**
 * Initialize per-run logging
 */
export function initializeRunLogging(): void {
  if (runLogTransport) {
    return;
  }

  const timestamp = getDateTimeForFilename();

  cliState.errorLogPath = path.join(getLogDirectory(), `promptfoo-errors-${timestamp}.log`);

  try {
    const logFile = createRunLogFile(timestamp);
    cliState.debugLogPath = logFile;
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

// Internal logger implementation
let internalLogger: StrictLogger = Object.assign({}, winstonLogger, {
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
 * Replace the logger instance with a custom logger
 * Useful for integrating with external logging systems
 * @param customLogger - Logger instance that implements the required interface
 * @throws Error if customLogger is missing required methods
 */
export function setLogger(customLogger: Pick<StrictLogger, 'debug' | 'info' | 'warn' | 'error'>) {
  // Validate that customLogger is not null or undefined
  if (!customLogger || typeof customLogger !== 'object') {
    throw new Error('Custom logger must be a valid object with required logging methods.');
  }

  // Runtime validation guards
  const requiredMethods = ['debug', 'info', 'warn', 'error'] as const;

  const missingMethods = requiredMethods.filter(
    (method) => typeof customLogger[method] !== 'function',
  );

  if (missingMethods.length > 0) {
    throw new Error(
      `Custom logger is missing required methods: ${missingMethods.join(', ')}. ` +
        'Logger must implement { debug: Function; info: Function; warn: Function; error: Function }',
    );
  }

  internalLogger = customLogger as StrictLogger;
}

/**
 * Sanitizes context object for logging using generic sanitization
 */
function sanitizeContext(context: SanitizedLogContext): Record<string, any> {
  // Special handling for URLs to preserve the URL-specific sanitization logic
  const contextWithSanitizedUrls: Record<string, any> = {};

  for (const [key, value] of Object.entries(context)) {
    if (key === 'url' && typeof value === 'string') {
      contextWithSanitizedUrls[key] = sanitizeUrl(value);
    } else {
      contextWithSanitizedUrls[key] = value;
    }
  }

  // Apply generic object sanitization to handle all sensitive fields
  return sanitizeObject(contextWithSanitizedUrls, { context: 'log context' });
}

/**
 * Creates a log method that accepts an optional context parameter
 * If context is provided, it will be sanitized and formatted
 */
function createLogMethodWithContext(
  level: keyof typeof LOG_LEVELS,
): (message: string, context?: SanitizedLogContext) => void {
  return (message: string, context?: SanitizedLogContext) => {
    if (!context) {
      internalLogger[level](message);
      return;
    }

    const sanitized = sanitizeContext(context);
    const contextStr = safeJsonStringify(sanitized, true);
    internalLogger[level](`${message}\n${contextStr}`);
  };
}

// Wrapper that delegates to the current logger instance
const logger = {
  error: createLogMethodWithContext('error'),
  warn: createLogMethodWithContext('warn'),
  info: createLogMethodWithContext('info'),
  debug: createLogMethodWithContext('debug'),
  add: (transport: winston.transport) =>
    internalLogger.add ? internalLogger.add(transport) : undefined,
  remove: (transport: winston.transport) =>
    internalLogger.remove ? internalLogger.remove(transport) : undefined,
  get transports() {
    return internalLogger.transports || [];
  },
  get level() {
    return internalLogger.transports?.[0]?.level || 'info';
  },
  set level(newLevel: string) {
    if (internalLogger.transports?.[0]) {
      internalLogger.transports[0].level = newLevel;
    }
  },
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
  requestBody: BodyInit | null | undefined;
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
  const logObject = {
    message: 'API request',
    url: sanitizeUrl(url),
    method: requestMethod,
    requestBody: sanitizeObject(requestBody, { context: 'request body' }),
    ...(response && {
      status: response.status,
      statusText: response.statusText,
    }),
    ...(responseText && { response: responseText }),
  };

  if (useStructuredLogging) {
    logMethod(sanitizeObject(logObject, { context: 'log object for structured logging' }));
  } else {
    logMethod(`Api Request`, logObject);
  }
}

// Initialize source maps if debug is enabled at startup
if (getEnvString('LOG_LEVEL', 'info') === 'debug') {
  initializeSourceMapSupport();
}

export default logger;
