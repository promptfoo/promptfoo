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

type StrictLogMethod = (message: string) => winston.Logger;
type StrictLogger = Omit<winston.Logger, keyof typeof LOG_LEVELS> & {
  [K in keyof typeof LOG_LEVELS]: StrictLogMethod;
};

export const consoleFormatter = winston.format.printf(
  (info: winston.Logform.TransformableInfo): string => {
    const message = info.message as string;

    // Call the callback if it exists
    if (globalLogCallback) {
      globalLogCallback(message);
    }

    if (info.level === 'error') {
      return chalk.red(message);
    } else if (info.level === 'warn') {
      return chalk.yellow(message);
    } else if (info.level === 'info') {
      return message;
    } else if (info.level === 'debug') {
      return chalk.cyan(message);
    }
    throw new Error(`Invalid log level: ${info.level}`);
  },
);

export const fileFormatter = winston.format.printf(
  (info: winston.Logform.TransformableInfo): string => {
    const timestamp = new Date().toISOString();
    const location = info.location ? ` ${info.location}` : '';
    return `${timestamp} [${info.level.toUpperCase()}]${location}: ${info.message}`;
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
  } else {
    throw new Error(`Invalid log level: ${level}`);
  }
}

// Wrapper enforces strict single-string argument logging
export const logger: StrictLogger = Object.assign({}, winstonLogger, {
  error: (message: string) => winstonLogger.error(message),
  warn: (message: string) => winstonLogger.warn(message),
  info: (message: string) => winstonLogger.info(message),
  debug: (message: string) => winstonLogger.debug(message),
  add: winstonLogger.add.bind(winstonLogger),
  remove: winstonLogger.remove.bind(winstonLogger),
  transports: winstonLogger.transports,
}) as StrictLogger & {
  add: typeof winstonLogger.add;
  remove: typeof winstonLogger.remove;
  transports: typeof winstonLogger.transports;
};

export default logger;
