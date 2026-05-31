import fs from 'fs';

import debounce from 'debounce';
import logger from '../logger';
import { getDbSignalPath } from './index';

/**
 * A classified signal-file event. `type` is the latest mutation, but a coalesced signal can
 * carry BOTH components regardless of `type`: an update component (`evalId`, or an unscoped
 * update) and a delete component (`deletedEvalIds`, or "all evals deleted"). Use
 * {@link hasUpdateComponent} / {@link hasDeleteComponent} rather than `type` alone to decide
 * what to emit, so a `type:'update'` payload carrying `deletedEvalIds` still drops those evals.
 */
export interface DatabaseSignal {
  type: 'delete' | 'update';
  evalId?: string;
  deletedEvalIds?: string[];
}

const SIGNAL_WATCHER_DEBOUNCE_MS = 250;

/** Returns the string entries of an unknown value, or undefined if it is not an array. */
function toStringEvalIds(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((evalId): evalId is string => typeof evalId === 'string')
    : undefined;
}

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
 *
 * If a delete signal is still pending in the watcher's debounce window, this update folds the
 * pending deletes into a combined JSON payload so the watcher still drops the removed evals
 * (the eval-then-delete / delete-then-eval interleavings would otherwise lose one signal).
 * @param evalId - Optional eval ID that triggered the update
 */
export function updateSignalFile(evalId?: string): void {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const pending = readPendingSignal(now);
  if (pending && hasDeleteComponent(pending)) {
    writeSignalFile(
      JSON.stringify({
        type: 'update',
        evalId,
        deletedEvalIds: pending.deletedEvalIds ?? [],
        timestamp: nowIso,
      }),
    );
    return;
  }
  // Preserve the legacy evalId:timestamp update format. The reader matches the trailing
  // ISO timestamp because generated eval IDs can themselves contain colons.
  writeSignalFile(evalId ? `${evalId}:${nowIso}` : nowIso);
}

/** True when the signal carries an update component (a scoped or unscoped eval refresh). */
export function hasUpdateComponent(signal: DatabaseSignal): boolean {
  return signal.type === 'update' || signal.evalId !== undefined;
}

/** True when the signal carries a delete component (specific ids or "all evals deleted"). */
export function hasDeleteComponent(signal: DatabaseSignal): boolean {
  return signal.type === 'delete' || signal.deletedEvalIds !== undefined;
}

/** Parses signal-file content as a combined JSON payload, or null if it is not one. */
function parseSignalJson(content: string): (DatabaseSignal & { timestamp?: string }) | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'type' in parsed &&
      (parsed.type === 'delete' || parsed.type === 'update')
    ) {
      const evalId =
        'evalId' in parsed && typeof parsed.evalId === 'string' ? parsed.evalId : undefined;
      const deletedEvalIds =
        'deletedEvalIds' in parsed ? toStringEvalIds(parsed.deletedEvalIds) : undefined;
      const timestamp =
        'timestamp' in parsed && typeof parsed.timestamp === 'string'
          ? parsed.timestamp
          : undefined;
      return { type: parsed.type, evalId, deletedEvalIds, timestamp };
    }
  } catch {}
  return null;
}

/**
 * Reads the signal file only if it was written within the watcher's debounce window, so a
 * writer can fold a not-yet-observed signal into its own write instead of clobbering it.
 * Returns null when the file is stale (outside the window), unreadable, or unparseable.
 */
function readPendingSignal(now: number): DatabaseSignal | null {
  const withinWindow = (timestamp: string | undefined): boolean => {
    if (timestamp === undefined) {
      return false;
    }
    const elapsed = now - Date.parse(timestamp);
    return Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= SIGNAL_WATCHER_DEBOUNCE_MS;
  };

  try {
    const content = fs.readFileSync(getDbSignalPath(), 'utf8').trim();
    const json = parseSignalJson(content);
    if (json) {
      return withinWindow(json.timestamp)
        ? { type: json.type, evalId: json.evalId, deletedEvalIds: json.deletedEvalIds }
        : null;
    }

    // Legacy text format: `evalId:timestamp` or a bare timestamp.
    const legacyTimestamp = content.match(/(\d{4}-\d{2}-\d{2}T[0-9:.]+Z?)$/)?.[1];
    if (!withinWindow(legacyTimestamp)) {
      return null;
    }
    return { type: 'update', evalId: readLegacySignalEvalId(content) };
  } catch {
    return null;
  }
}

/**
 * Signals that one or more evals were deleted. Deletions use a JSON payload so the watcher can
 * tell clients exactly which evals to drop (whereas a plain update keeps the legacy
 * `evalId:timestamp` text format unless it has to fold in a pending delete). A delete in the
 * debounce window also carries forward a pending scoped update so neither refresh is lost.
 * Pre-PR view servers don't understand this JSON and read it back as "no eval id", falling back
 * to broadcasting the latest eval — a benign degradation, so the view server and CLI should be
 * on matching versions for delete-aware refreshes.
 */
export function updateSignalFileForDeletedEvals(deletedEvalIds?: string[]): void {
  const now = Date.now();
  const pending = readPendingSignal(now);
  const pendingDelete = pending && hasDeleteComponent(pending) ? pending : null;
  // Merge the new deletes with any pending deletes in the window (undefined on either side
  // means "all evals deleted" and wins).
  const mergedDeletedEvalIds = !pendingDelete
    ? deletedEvalIds
    : pendingDelete.deletedEvalIds === undefined || deletedEvalIds === undefined
      ? undefined
      : [...new Set([...pendingDelete.deletedEvalIds, ...deletedEvalIds])];
  // Carry forward a pending scoped update so a quick create/import-then-delete still refreshes
  // clients to the newly written eval rather than only processing the delete.
  const carriedEvalId = pending && hasUpdateComponent(pending) ? pending.evalId : undefined;

  writeSignalFile(
    JSON.stringify({
      type: 'delete',
      deletedEvalIds: mergedDeletedEvalIds,
      evalId: carriedEvalId,
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

/**
 * Reads and classifies the signal file into a {@link DatabaseSignal}. It understands the
 * legacy `evalId:timestamp` (or bare timestamp) text written by {@link updateSignalFile} and
 * the JSON payload written by the delete/combined writers. A JSON payload may carry BOTH an
 * `evalId` (update component) and `deletedEvalIds` (delete component) when two mutations were
 * coalesced inside the watcher's debounce window. Malformed/half-written content or a read
 * error degrades to an unscoped `{type:'update'}`.
 */
export function readSignalFile(): DatabaseSignal {
  const filePath = getDbSignalPath();
  try {
    const content = fs.readFileSync(filePath, 'utf8').trim();
    const json = parseSignalJson(content);
    if (json) {
      return { type: json.type, evalId: json.evalId, deletedEvalIds: json.deletedEvalIds };
    }
    return { type: 'update', evalId: readLegacySignalEvalId(content) };
  } catch {
    return { type: 'update' };
  }
}

/**
 * Reads the signal file and returns the scoped eval ID of an update signal, if present.
 * Delete signals (JSON payloads) carry no `evalId` and therefore return undefined here; use
 * {@link readSignalFile} to access the full {@link DatabaseSignal} including `deletedEvalIds`.
 * @returns The eval ID from an update signal, or undefined if not present
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
