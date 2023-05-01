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
  } else if (level === 'verbose') {
    return chalk.cyan(message);
  }
});

const logger = winston.createLogger({
  levels: logLevels,
  format: winston.format.combine(winston.format.simple(), customFormatter),
  transports: [new winston.transports.Console()],
});

export default logger;
