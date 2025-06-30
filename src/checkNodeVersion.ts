import chalk from 'chalk';
import { engines } from '../package.json';
import logger from './logger';

/**
 * Function to check the current Node version against the required version
 * Logs a warning and exits the process if the current Node version is not supported
 */
export const checkNodeVersion = (): void => {
  const requiredVersion = engines.node;

  const versionMatch = process.version.match(/^v(\d+)\.(\d+)\.(\d+)/);
  if (!versionMatch) {
    logger.warn(
      chalk.yellow(
        `Unexpected Node.js version format: ${process.version}. Please use Node.js ${requiredVersion}.`,
      ),
    );
    return;
  }

  const [major, minor, patch] = versionMatch.slice(1).map(Number);
  const [requiredMajor, requiredMinor, requiredPatch] = requiredVersion
    .replace('>=', '')
    .split('.')
    .map(Number);

  if (
    major < requiredMajor ||
    (major === requiredMajor && minor < requiredMinor) ||
    (major === requiredMajor && minor === requiredMinor && patch < requiredPatch)
  ) {
    process.exitCode = 1;
    throw new Error(
      chalk.yellow(
        `You are using Node.js ${major}.${minor}.${patch}. This version is not supported. Please use Node.js ${requiredVersion}.`,
      ),
    );
  }
};
