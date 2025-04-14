import debounce from 'debounce';
import fs from 'fs';
import logger from '../logger';
import { getDbSignalPath } from './index';

/**
 * Updates the signal file with the current timestamp.
 * This is used to notify clients that there are new data available.
 */
export function updateSignalFile(): void {
  const filePath = getDbSignalPath();
  try {
    const now = new Date();
    logger.debug(`Writing to signal file ${filePath}`);
    fs.writeFileSync(filePath, now.toISOString());
    logger.debug('Successfully wrote to signal file');
  } catch (err) {
    logger.warn(`Failed to write database signal file: ${err}`);
  }
}

/**
 * Ensures the signal file exists, creating it if necessary.
 */
export function ensureSignalFile(): void {
  const filePath = getDbSignalPath();
  if (!fs.existsSync(filePath)) {
    logger.debug(`Creating signal file at ${filePath}`);
    fs.writeFileSync(filePath, new Date().toISOString());
  }
}

/**
 * Sets up a watcher on the signal file and calls the callback when it changes.
 * @param onChange - Callback function that is called when the signal file changes
 * @returns The watcher instance
 */
export function setupSignalWatcher(onChange: () => void): fs.FSWatcher {
  const filePath = getDbSignalPath();
  logger.debug(`Setting up file watcher on ${filePath}`);

  ensureSignalFile();

  try {
    const watcher = fs.watch(filePath);
    watcher.on('change', debounce(onChange, 250));

    watcher.on('error', (error) => {
      logger.warn(`File watcher error: ${error}`);
    });

    return watcher;
  } catch (error) {
    logger.warn(`Failed to set up file watcher: ${error}`);
    throw error;
  }
}
