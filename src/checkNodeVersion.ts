import { engines } from '../package.json';

/**
 * Function to check the current Node version against the required version
 * Logs a warning and exits the process if the current Node version is not supported
 */
export const checkNodeVersion = (): void => {
  const requiredVersion = engines.node;

  const versionMatch = process.version.match(/^v(\d+)\.(\d+)\.(\d+)/);
  if (!versionMatch) {
    // Version mismatch is rare, so we can skip logger and use console.error
    console.error(
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
    // Version mismatch is rare, so we can skip logger and use console.error
    const errorMessage = `You are using Node.js ${major}.${minor}.${patch}. This version is not supported. Please use Node.js ${requiredVersion}.`;
    console.error(errorMessage);

    process.exitCode = 1;
    throw new Error(errorMessage);
  }
};
