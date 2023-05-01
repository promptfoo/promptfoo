import chalk from 'chalk';
import winston from 'winston';

const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const customFormatter = winston.format.printf(({ level, message, ...args }) => {
  if (level === 'error') {
    return chalk.red(message);
  } else if (level === 'warn') {
    return chalk.yellow(message);
  } else if (level === 'info') {
    return message;
  } else if (level === 'debug') {
    return chalk.cyan(message);
  }
  throw new Error(`Invalid log level: ${level}`);
});

const logger = winston.createLogger({
  levels: logLevels,
  format: winston.format.combine(winston.format.simple(), customFormatter),
  transports: [new winston.transports.Console()],
});

export function setLogLevel(level: keyof typeof logLevels) {
  if (logLevels.hasOwnProperty(level)) {
    logger.transports[0].level = level;
  } else {
    throw new Error(`Invalid log level: ${level}`);
  }
}

export default logger;
