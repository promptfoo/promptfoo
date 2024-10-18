import chalk from 'chalk';
import winston from 'winston';
import { getEnvString } from './envars';
import { safeJsonStringify } from './util/json';

export const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
} as const;

export type LogLevel = keyof typeof LOG_LEVELS;

export type LogContext = 'default' | 'database';

export interface ContextLogger {
  error(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
  level: LogLevel;
}

type LogMessage = string;

function createContextTransport(context: LogContext, level: string) {
  return new winston.transports.Console({
    level,
    format: winston.format.printf(({ level, message, context }) => {
      const formattedMessage = context ? `[${context}] ${message}` : message;
      if (level === 'error') {
        return chalk.red(formattedMessage);
      } else if (level === 'warn') {
        return chalk.yellow(formattedMessage);
      } else if (level === 'info') {
        return formattedMessage;
      } else if (level === 'debug') {
        return chalk.cyan(formattedMessage);
      }
      throw new Error(`Invalid log level: ${level}`);
    }),
  });
}

const logger = winston.createLogger({
  levels: LOG_LEVELS,
  transports: [
    createContextTransport('default', getEnvString('LOG_LEVEL', 'info')),
    createContextTransport('database', getEnvString('DB_LOG_LEVEL', 'info')),
  ],
});

export function setContextLogging(context: LogContext, enabled: boolean) {
  const transport = logger.transports.find((t: any) => t.name === context);
  if (transport) {
    transport.silent = !enabled;
  } else {
    console.warn(`No transport found for context: ${context}`);
  }
}

const contextLogger: ContextLogger = {
  error: (message: LogMessage, context?: LogContext) => {
    logger.error(message, { context });
  },
  warn: (message: LogMessage, context?: LogContext) => {
    logger.warn(message, { context });
  },
  info: (message: LogMessage, context?: LogContext) => {
    logger.info(message, { context });
  },
  debug: (message: LogMessage, context?: LogContext) => {
    logger.debug(message, { context });
  },
  get level() {
    return logger.level as LogLevel;
  },
  set level(newLevel: LogLevel) {
    logger.level = newLevel;
  },
};

export function getLogLevel(): LogLevel {
  return getEnvString('LOG_LEVEL', 'info') as LogLevel;
}

export function setLogLevel(level: LogLevel, context?: LogContext) {
  console.log(`Setting log level to: ${level}`);
  logger.transports.forEach((transport: winston.transport) => {
    if (context && transport.name !== context) {
      return;
    }
    transport.level = level;
    console.log(`Set ${safeJsonStringify(transport)} transport to level: ${level}`);
  });
}

export default contextLogger;
