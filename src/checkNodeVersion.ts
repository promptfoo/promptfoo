import * as fs from 'fs';
import * as path from 'path';
import logger from './logger';

/**
 * Function to get the required Node version from package.json
 * @returns {string} The required Node version specified in package.json
 */
const getRequiredNodeVersion = (): string => {
  const packageJsonPath = path.resolve(__dirname, '../package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  return packageJson.engines.node;
};

/**
 * Function to check the current Node version against the required version
 * Logs a warning and exits the process if the current Node version is not supported
 */
export const checkNodeVersion = (): void => {
  const requiredVersion = getRequiredNodeVersion();

  const versionMatch = process.version.match(/^v(\d+)\.(\d+)\.(\d+)/);
  if (!versionMatch) {
    logger.warn(
      `Unexpected Node.js version format: ${process.version}. Please use Node.js ${requiredVersion}.`,
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
    logger.warn(
      `You are using Node.js ${major}.${minor}.${patch}. This version is not supported. Please use Node.js ${requiredVersion}.`,
    );
    process.exit(1);
  }
};
