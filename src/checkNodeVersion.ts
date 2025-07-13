import { engines } from '../package.json';

/**
 * Function to check the current Node version against the required version
 * Logs a warning and exits the process if the current Node version is not supported
 */
export const checkNodeVersion = async (): Promise<void> => {
  const requiredVersion = engines.node;

  const versionMatch = process.version.match(/^v(\d+)\.(\d+)\.(\d+)/);
  if (!versionMatch) {
    // Lazy load logger and chalk only when needed
    const [{ default: logger }, { default: chalk }] = await Promise.all([
      import('./logger'),
      import('chalk'),
    ]);
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
    // Lazy load chalk only when needed (logger not used in error case)
    const { default: chalk } = await import('chalk');
    process.exitCode = 1;
    throw new Error(
      chalk.yellow(
        `You are using Node.js ${major}.${minor}.${patch}. This version is not supported. Please use Node.js ${requiredVersion}.`,
      ),
    );
  }
};
