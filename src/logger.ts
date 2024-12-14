import chalk from 'chalk';
import path from 'path';
import winston from 'winston';
import { getEnvString } from './envars';

export const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const consoleFormatter = winston.format.printf(
  (info: winston.Logform.TransformableInfo): string => {
    if (info.level === 'error') {
      return chalk.red(info.message as string);
    } else if (info.level === 'warn') {
      return chalk.yellow(info.message as string);
    } else if (info.level === 'info') {
      return info.message as string;
    } else if (info.level === 'debug') {
      return chalk.cyan(info.message as string);
    }
    throw new Error(`Invalid log level: ${info.level}`);
  },
);

const fileFormatter = winston.format.printf((info: winston.Logform.TransformableInfo): string => {
  const timestamp = new Date().toISOString();
  const location = info.location ? ` ${info.location}` : '';
  return `${timestamp} [${info.level.toUpperCase()}]${location}: ${info.message}`;
});

const logger = winston.createLogger({
  levels: LOG_LEVELS,
  transports: [
    new winston.transports.Console({
      level: getEnvString('LOG_LEVEL', 'info'),
      format: winston.format.combine(winston.format.simple(), consoleFormatter),
    }),
  ],
});

if (!getEnvString('PROMPTFOO_DISABLE_ERROR_LOG', '')) {
  logger.on('data', (chunk) => {
    if (
      chunk.level === 'error' &&
      !logger.transports.some((t) => t instanceof winston.transports.File)
    ) {
      // Only create the errors file if there are any errors
      const fileTransport = new winston.transports.File({
        filename: path.join(getEnvString('PROMPTFOO_LOG_DIR', '.'), 'promptfoo-errors.log'),
        level: 'error',
        format: winston.format.combine(winston.format.simple(), fileFormatter),
      });
      logger.add(fileTransport);

      // Re-log the error that triggered this so it's written to the file
      fileTransport.write(chunk);
    }
  });
}

export function getLogLevel() {
  return logger.transports[0].level;
}

export function setLogLevel(level: keyof typeof LOG_LEVELS) {
  if (level in LOG_LEVELS) {
    logger.transports[0].level = level;
  } else {
    throw new Error(`Invalid log level: ${level}`);
  }
}

export default logger;
