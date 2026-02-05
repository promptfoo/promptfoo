import fs from 'fs';
import path from 'path';

import chalk from 'chalk';
import winston from 'winston';
import cliState from './cliState';
import { getEnvBool, getEnvString } from './envars';
import { getConfigDirectoryPath } from './util/config/manage';
import { safeJsonStringify } from './util/json';
import { getLogFiles } from './util/logFiles';
import { sanitizeObject, sanitizeUrl } from './util/sanitizer';
import { addLogToTestContext } from './util/testLogContext';

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
  body?: unknown;
  queryParams?: Record<string, string>;
  [key: string]: unknown;
}

// Lazy source map support - only loaded when debug is enabled
export let sourceMapSupportInitialized = false;

// Shutdown state tracking - prevents writes once logger closure begins
let isLoggerShuttingDown = false;

// Setter for testing purposes
export function setLoggerShuttingDown(value: boolean): void {
  isLoggerShuttingDown = value;
}

// Getter for testing purposes
export function getLoggerShuttingDown(): boolean {
  return isLoggerShuttingDown;
}

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
    const error = new Error('stack trace capture');
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

/**
 * Log input can be a simple string or a structured object with message field.
 * Structured objects are used when setStructuredLogging(true) is enabled.
 */
type LogInput = string | { message: string; [key: string]: unknown };
type StrictLogMethod = (input: LogInput) => winston.Logger;
type StrictLogger = Omit<winston.Logger, keyof typeof LOG_LEVELS> & {
  [K in keyof typeof LOG_LEVELS]: StrictLogMethod;
};

/**
 * Extracts the actual message string from potentially nested info objects
 */
function extractMessage(info: winston.Logform.TransformableInfo): string {
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

export function getLogLevel(): LogLevel {
  return winstonLogger.transports[0].level as LogLevel;
}

export function setLogLevel(level: LogLevel) {
  if (level in LOG_LEVELS) {
    winstonLogger.transports[0].level = level;

    if (level === 'debug') {
      void initializeSourceMapSupport();
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
 * Respects PROMPTFOO_LOG_DIR environment variable to customize log location
 */
function setupLogDirectory(): string {
  const configDir = getConfigDirectoryPath(true);
  const logDir = getEnvString('PROMPTFOO_LOG_DIR')
    ? path.resolve(getEnvString('PROMPTFOO_LOG_DIR')!)
    : path.join(configDir, 'logs');

  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Clean up old log files
  try {
    const logFiles = getLogFiles(logDir);

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
function createRunLogFile(
  level: 'debug' | 'error',
  { date = new Date() }: { date?: Date } = {},
): string {
  const logDir = setupLogDirectory();
  const timestamp = date.toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
  const logFile = path.join(logDir, `promptfoo-${level}-${timestamp}.log`);
  return logFile;
}

/**
 * Initialize per-run logging
 */
export function initializeRunLogging(): void {
  try {
    const date = new Date();
    if (!getEnvBool('PROMPTFOO_DISABLE_DEBUG_LOG', false)) {
      cliState.debugLogFile = createRunLogFile('debug', { date });
      const runLogTransport = new winston.transports.File({
        filename: cliState.debugLogFile,
        level: 'debug', // Capture all levels in the file
        format: winston.format.combine(winston.format.simple(), fileFormatter),
      });
      winstonLogger.add(runLogTransport);
    }

    if (!getEnvBool('PROMPTFOO_DISABLE_ERROR_LOG', false)) {
      cliState.errorLogFile = createRunLogFile('error', { date });
      const errorLogTransport = new winston.transports.File({
        filename: cliState.errorLogFile,
        level: 'error',
        format: winston.format.combine(winston.format.simple(), fileFormatter),
      });
      winstonLogger.add(errorLogTransport);
    }
  } catch (error) {
    logger.warn(`Error creating run log file: ${error}`);
  }
}

/**
 * Creates a logger method for the specified log level.
 * Accepts either a string message or a structured object with a message field.
 */
function createLogMethod(level: keyof typeof LOG_LEVELS): StrictLogMethod {
  return (input: LogInput) => {
    const location =
      level === 'debug' ? getCallerLocation() : isDebugEnabled() ? getCallerLocation() : '';

    if (level === 'debug') {
      void initializeSourceMapSupport();
    }

    // Handle both string and structured object inputs
    const message = typeof input === 'string' ? input : input.message;
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
function sanitizeContext(context: SanitizedLogContext): Record<string, unknown> {
  // Special handling for URLs to preserve the URL-specific sanitization logic
  const contextWithSanitizedUrls: Record<string, unknown> = {};

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
 * Creates a log method that accepts an optional context parameter.
 * If context is provided, it will be sanitized and formatted.
 *
 * When structured logging is enabled (via setStructuredLogging(true)):
 * - Passes { message, ...context } object to the logger
 * - Ideal for cloud logging integrations that expect structured data
 *
 * When structured logging is disabled (default):
 * - Formats context as JSON string appended to message
 * - Suitable for CLI/console output
 */
function createLogMethodWithContext(
  level: keyof typeof LOG_LEVELS,
): (message: string, context?: SanitizedLogContext) => void {
  return (message: string, context?: SanitizedLogContext) => {
    // Prevent new writes once shutdown starts
    if (isLoggerShuttingDown) {
      return;
    }

    // Capture to test context if active
    // Without --verbose: only capture 'error' level
    // With --verbose: capture all levels
    const shouldCapture = level === 'error' || isDebugEnabled();
    if (shouldCapture) {
      const fullMessage = context
        ? `${message}\n${safeJsonStringify(sanitizeContext(context), true)}`
        : message;
      addLogToTestContext(level, fullMessage);
    }

    // Continue with normal logging (file transports still get everything)
    if (!context) {
      internalLogger[level](message);
      return;
    }

    const sanitized = sanitizeContext(context);

    if (useStructuredLogging) {
      // Structured mode: pass object with message field for cloud logging systems
      internalLogger[level]({ message, ...sanitized });
    } else {
      // Default mode: format as string for CLI/console output
      const contextStr = safeJsonStringify(sanitized, true);
      internalLogger[level](`${message}\n${contextStr}`);
    }
  };
}

/**
 * Log entry captured during test execution
 */
export interface TestLogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
}

/**
 * Child logger interface with test-scoped log capture
 */
export interface ChildLogger {
  error: (message: string, context?: SanitizedLogContext) => void;
  warn: (message: string, context?: SanitizedLogContext) => void;
  info: (message: string, context?: SanitizedLogContext) => void;
  debug: (message: string, context?: SanitizedLogContext) => void;
  /** Retrieve all captured logs for this test */
  getLogs: () => TestLogEntry[];
}

// Maximum log entries per child logger to prevent memory issues
const MAX_CHILD_LOG_ENTRIES = 50;

/**
 * Creates a child logger method that captures logs to a buffer and writes
 * to file transports, but skips console output. Console output will be
 * displayed by the reporter when the test completes.
 */
function createChildLogMethod(
  level: keyof typeof LOG_LEVELS,
  logBuffer: TestLogEntry[],
  _metadata: { testIdx: number; promptIdx: number },
): (message: string, context?: SanitizedLogContext) => void {
  return (message: string, context?: SanitizedLogContext) => {
    if (isLoggerShuttingDown) {
      return;
    }

    // Capture to this test's buffer (respecting verbose setting)
    const shouldCapture = level === 'error' || isDebugEnabled();
    if (shouldCapture && logBuffer.length < MAX_CHILD_LOG_ENTRIES) {
      const fullMessage = context
        ? `${message}\n${safeJsonStringify(sanitizeContext(context), true)}`
        : message;
      logBuffer.push({ level, message: fullMessage, timestamp: Date.now() });
    }

    // Log to file transports only (skip console to avoid duplicate output)
    // The reporter will display captured logs when the test completes
    const location = level === 'debug' || isDebugEnabled() ? getCallerLocation() : '';
    if (level === 'debug') {
      void initializeSourceMapSupport();
    }

    const fullMessage = context
      ? `${message}\n${safeJsonStringify(sanitizeContext(context), true)}`
      : message;

    // Write directly to file transports, skipping console
    // We need to format the message ourselves since we're bypassing Winston's pipeline
    const timestamp = new Date().toISOString();
    const locationStr = location ? ` ${location}` : '';
    const formattedMessage = `${timestamp} [${level.toUpperCase()}]${locationStr}: ${fullMessage}`;

    for (const transport of winstonLogger.transports) {
      if (!(transport instanceof winston.transports.Console)) {
        const info = {
          level,
          message: fullMessage,
          location,
          [Symbol.for('level')]: level,
          // Pre-formatted message for the transport to write directly
          [Symbol.for('message')]: formattedMessage,
        };
        transport.log?.(info, () => {});
      }
    }
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
  /**
   * Create a child logger for test-scoped log capture.
   * Each child logger has its own buffer that captures logs during test execution.
   * @param metadata - Test metadata (testIdx, promptIdx) for identification
   * @returns A child logger with the same interface plus getLogs() method
   */
  child(metadata: { testIdx: number; promptIdx: number }): ChildLogger {
    const logBuffer: TestLogEntry[] = [];

    return {
      error: createChildLogMethod('error', logBuffer, metadata),
      warn: createChildLogMethod('warn', logBuffer, metadata),
      info: createChildLogMethod('info', logBuffer, metadata),
      debug: createChildLogMethod('debug', logBuffer, metadata),
      getLogs: () => [...logBuffer],
    };
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
    // Pass message and context separately to use the wrapper's structured logging path.
    // This ensures proper typing and consistent handling with other structured log calls.
    const { message, ...context } = logObject;
    logMethod(message, context);
  } else {
    logMethod('Api Request', logObject);
  }
}

/**
 * Close all file transports and cleanup logger resources
 * Should be called during graceful shutdown to prevent event loop hanging
 *
 * IMPORTANT: All logging should be done BEFORE calling this function
 */
export async function closeLogger(): Promise<void> {
  // Set shutdown flag FIRST to prevent new writes during cleanup
  setLoggerShuttingDown(true);
  try {
    const fileTransports = winstonLogger.transports.filter(
      (transport) => transport instanceof winston.transports.File,
    );

    if (fileTransports.length === 0) {
      return;
    }

    // Add temporary error handlers to catch "write after end" errors during shutdown.
    // This can happen due to a race condition where the pipe from winston's Transform
    // stream still has data when _final() calls transport.end(). The error handlers
    // prevent this from becoming an uncaught exception that crashes the process.
    const errorHandlers = new Map<winston.transport, (err: Error) => void>();
    for (const transport of fileTransports) {
      const handler = (err: Error) => {
        // Silently ignore "write after end" errors during shutdown - this is expected
        // when the logger has buffered data that races with transport closing
        if (err?.message?.includes('write after end')) {
          return;
        }
        console.error(`Transport error during shutdown: ${err}`);
      };
      errorHandlers.set(transport, handler);
      transport.on('error', handler);
    }

    // Use winstonLogger.end() instead of ending transports directly.
    // This properly triggers winston's _final() method which:
    // 1. Waits for all piped data to flush through the transform stream
    // 2. Calls transport.end() on each transport in sequence
    // 3. Waits for each transport's 'finish' event before proceeding
    // This significantly reduces "write after end" errors from data still in the pipeline.
    await new Promise<void>((resolve) => {
      winstonLogger.once('finish', resolve);
      winstonLogger.end();
    });

    // Remove error handlers and file transports
    for (const transport of fileTransports) {
      const handler = errorHandlers.get(transport);
      if (handler) {
        transport.off('error', handler);
      }
      winstonLogger.remove(transport);
    }
  } catch (error) {
    // Can't use logger here since we're shutting it down
    console.error(`Error closing logger: ${error}`);
  }
}

// Initialize source maps if debug is enabled at startup
if (getEnvString('LOG_LEVEL', 'info') === 'debug') {
  void initializeSourceMapSupport();
}

export default logger;
