import fs from 'fs';

import debounce from 'debounce';
import logger from '../logger';
import { getDbSignalPath } from './index';

/**
 * Updates the signal file with the current timestamp and optional eval ID.
 * This is used to notify clients that there are new data available.
 * @param evalId - Optional eval ID that triggered the update
 */
export function updateSignalFile(evalId?: string): void {
  const filePath = getDbSignalPath();
  try {
    const now = new Date();
    // Format: evalId:timestamp (evalId is optional)
    const content = evalId ? `${evalId}:${now.toISOString()}` : now.toISOString();
    fs.writeFileSync(filePath, content);
  } catch (err) {
    logger.warn(`Failed to write database signal file: ${err}`);
  }
}

/**
 * Reads the signal file and returns the eval ID if present.
 * @returns The eval ID from the signal file, or undefined if not present
 */
export function readSignalEvalId(): string | undefined {
  const filePath = getDbSignalPath();
  try {
    const content = fs.readFileSync(filePath, 'utf8').trim();
    // Format: evalId:timestamp or just timestamp
    if (content.includes(':')) {
      const evalId = content.split(':')[0];
      // Basic validation: eval IDs are typically UUIDs or formatted IDs
      if (evalId && evalId.length > 8) {
        return evalId;
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Ensures the signal file exists, creating it if necessary.
 */
function ensureSignalFile(): void {
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
