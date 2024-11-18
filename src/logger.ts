import chalk from 'chalk';
import winston from 'winston';
import { getEnvString } from './envars';

export const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const customFormatter = winston.format.printf((info: winston.Logform.TransformableInfo): string => {
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
});

const logger = winston.createLogger({
  levels: LOG_LEVELS,
  format: winston.format.combine(winston.format.simple(), customFormatter),
  transports: [
    new winston.transports.Console({
      level: getEnvString('LOG_LEVEL', 'info'),
    }),
  ],
});

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
