import chalk from 'chalk';
import path from 'path';
import winston from 'winston';
import { getEnvString } from './envars';

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
let sourceMapSupportInitialized = false;

async function initializeSourceMapSupport(): Promise<void> {
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
function getCallerLocation(): string {
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
export const logger: StrictLogger = Object.assign({}, winstonLogger, {
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

// Initialize source maps if debug is enabled at startup
if (getEnvString('LOG_LEVEL', 'info') === 'debug') {
  initializeSourceMapSupport();
}

export default logger;

export { sourceMapSupportInitialized, initializeSourceMapSupport, getCallerLocation };
