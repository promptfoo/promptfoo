import fs from 'fs';

import debounce from 'debounce';
import logger from '../logger';
import { getDbSignalPath } from './index';

export interface DatabaseSignal {
  type: 'delete' | 'update';
  evalId?: string;
  deletedEvalIds?: string[];
}

const SIGNAL_WATCHER_DEBOUNCE_MS = 250;

function writeSignalFile(content: string): void {
  const filePath = getDbSignalPath();
  try {
    fs.writeFileSync(filePath, content);
  } catch (err) {
    logger.warn(`Failed to write database signal file: ${err}`);
  }
}

/**
 * Updates the signal file with the current timestamp and optional eval ID.
 * This is used to notify clients that there are new data available.
 * @param evalId - Optional eval ID that triggered the update
 */
export function updateSignalFile(evalId?: string): void {
  const now = new Date().toISOString();
  // Preserve the legacy evalId:timestamp update format. The reader matches the trailing
  // ISO timestamp because generated eval IDs can themselves contain colons.
  writeSignalFile(evalId ? `${evalId}:${now}` : now);
}

function readPendingDeletedEvalIds(now: number): string[] | undefined | null {
  try {
    const content = fs.readFileSync(getDbSignalPath(), 'utf8').trim();
    const parsed = JSON.parse(content) as unknown;
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      !('type' in parsed) ||
      parsed.type !== 'delete' ||
      !('timestamp' in parsed) ||
      typeof parsed.timestamp !== 'string'
    ) {
      return null;
    }

    const elapsed = now - Date.parse(parsed.timestamp);
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > SIGNAL_WATCHER_DEBOUNCE_MS) {
      return null;
    }

    if (!('deletedEvalIds' in parsed)) {
      return undefined;
    }
    if (!Array.isArray(parsed.deletedEvalIds)) {
      return null;
    }
    return parsed.deletedEvalIds.filter((evalId): evalId is string => typeof evalId === 'string');
  } catch {
    return null;
  }
}

/**
 * Signals that one or more evals were deleted. Unlike updates (which keep the legacy
 * `evalId:timestamp` text format), deletions use a JSON payload so the watcher can tell
 * clients exactly which evals to drop. Pre-PR view servers don't understand this JSON and
 * read it back as "no eval id", falling back to broadcasting the latest eval — a benign
 * degradation, so the view server and CLI should be on matching versions for delete-aware
 * refreshes.
 */
export function updateSignalFileForDeletedEvals(deletedEvalIds?: string[]): void {
  const now = Date.now();
  const pendingDeletedEvalIds = readPendingDeletedEvalIds(now);
  const mergedDeletedEvalIds =
    pendingDeletedEvalIds === null
      ? deletedEvalIds
      : pendingDeletedEvalIds === undefined || deletedEvalIds === undefined
        ? undefined
        : [...new Set([...pendingDeletedEvalIds, ...deletedEvalIds])];

  writeSignalFile(
    JSON.stringify({
      type: 'delete',
      deletedEvalIds: mergedDeletedEvalIds,
      timestamp: new Date(now).toISOString(),
    }),
  );
}

function readLegacySignalEvalId(content: string): string | undefined {
  if (/^\d{4}-\d{2}-\d{2}T/.test(content)) {
    return undefined;
  }

  const legacyScopedSignal = content.match(/^(.*):\d{4}-\d{2}-\d{2}T/);
  const evalId = legacyScopedSignal?.[1];
  return evalId && evalId.length > 8 ? evalId : undefined;
}

export function readSignalFile(): DatabaseSignal {
  const filePath = getDbSignalPath();
  try {
    const content = fs.readFileSync(filePath, 'utf8').trim();
    try {
      const parsed = JSON.parse(content) as unknown;
      if (parsed !== null && typeof parsed === 'object' && 'type' in parsed) {
        const deletedEvalIds =
          'deletedEvalIds' in parsed && Array.isArray(parsed.deletedEvalIds)
            ? parsed.deletedEvalIds.filter((evalId): evalId is string => typeof evalId === 'string')
            : undefined;
        if (parsed.type === 'delete') {
          return { type: 'delete', deletedEvalIds };
        }
      }
    } catch {}

    return { type: 'update', evalId: readLegacySignalEvalId(content) };
  } catch {
    return { type: 'update' };
  }
}

/**
 * Reads the signal file and returns the eval ID if present.
 * @returns The eval ID from the signal file, or undefined if not present
 */
export function readSignalEvalId(): string | undefined {
  return readSignalFile().evalId;
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
    watcher.on('change', debounce(onChange, SIGNAL_WATCHER_DEBOUNCE_MS));

    watcher.on('error', (error) => {
      logger.warn(`File watcher error: ${error}`);
    });

    return watcher;
  } catch (error) {
    logger.warn(`Failed to set up file watcher: ${error}`);
    throw error;
  }
}
