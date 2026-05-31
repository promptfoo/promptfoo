import fs from 'fs';

import debounce from 'debounce';
import logger from '../logger';
import { getDbSignalPath } from './index';

/**
 * A classified signal-file event. `type` is the latest mutation, but a coalesced signal can
 * carry BOTH components regardless of `type`: an update component and a delete component
 * (`deletedEvalIds`, or "all evals deleted"). The update component is a SET of scoped eval ids
 * (`updatedEvalIds`) so that back-to-back scoped updates inside the debounce window all survive
 * coalescing; `evalId` is the latest of them, kept for the legacy single-update path and
 * {@link readSignalEvalId}. `refreshLatest` marks an unscoped "refresh to the latest eval" update
 * (a bare {@link updateSignalFile} call) so it survives alongside scoped ids or a delete when
 * coalesced. Use {@link updateEvalIds} / {@link hasUpdateComponent} / {@link hasUnscopedUpdate} /
 * {@link hasDeleteComponent} rather than the raw fields to decide what to emit, so a
 * `type:'update'` payload carrying `deletedEvalIds` still drops those evals.
 */
export interface DatabaseSignal {
  type: 'delete' | 'update';
  evalId?: string;
  updatedEvalIds?: string[];
  deletedEvalIds?: string[];
  /** An unscoped "refresh the latest eval" component preserved through coalescing. */
  refreshLatest?: boolean;
}

const SIGNAL_WATCHER_DEBOUNCE_MS = 250;

/**
 * The legacy `evalId:timestamp` text format can't be told apart from a stray short token, so
 * {@link readLegacySignalEvalId} only recovers eval ids at least this long. Generated ids
 * (`eval-<rand>-<iso>`) always clear it; a short caller-provided id (e.g. an imported `demo`) is
 * written as JSON instead, which stores the id explicitly and survives the round trip.
 */
const MIN_LEGACY_EVAL_ID_LENGTH = 9;

/** Whether {@link readLegacySignalEvalId} can recover this id from the legacy text format. */
function isLegacyRecoverableEvalId(evalId: string): boolean {
  return evalId.length >= MIN_LEGACY_EVAL_ID_LENGTH;
}

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
 * If another signal is still pending in the watcher's debounce window, this folds it into a
 * combined JSON payload so no refresh is lost — scoped updates, a pending unscoped "refresh
 * latest", and pending deletes all survive coalescing. When nothing is pending it keeps the
 * compact legacy `evalId:timestamp` text.
 * This read-modify-write is best-effort within a single process; concurrent writes from separate
 * processes can still race the unlocked file, in which case a dropped signal self-heals on the
 * next one.
 * @param evalId - Optional eval ID that triggered the update
 */
export function updateSignalFile(evalId?: string): void {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const pending = readPendingSignal(now);
  const pendingUpdateIds = pending ? updateEvalIds(pending) : [];
  const pendingHasDelete = pending ? hasDeleteComponent(pending) : false;
  const pendingHasUnscopedUpdate = pending ? hasUnscopedUpdate(pending) : false;
  const updatedEvalIds = [...new Set([...pendingUpdateIds, ...(evalId ? [evalId] : [])])];
  // This write should also refresh the latest eval if it is itself unscoped, or if it must carry a
  // pending unscoped "refresh latest" that the legacy text can't encode beside a scoped id.
  const refreshLatest = evalId === undefined || pendingHasUnscopedUpdate;

  // Coalesce into JSON when there's something to preserve beyond this single update — a pending
  // delete, a pending scoped update for a different eval, or an unscoped "refresh latest" that must
  // travel alongside a scoped id — so the common per-result run stays on the compact legacy
  // `evalId:timestamp` text. A short eval id also forces JSON: the legacy reader can't recover it
  // (see isLegacyRecoverableEvalId), so it would otherwise degrade to an unscoped refresh and leave
  // a page pinned to that eval stale. A bare unscoped update with nothing pending stays a plain
  // timestamp — the reader already treats that as "refresh latest".
  const needsCoalesce =
    pendingHasDelete ||
    pendingUpdateIds.some((id) => id !== evalId) ||
    (refreshLatest && updatedEvalIds.length > 0);
  const evalIdNeedsJson = evalId !== undefined && !isLegacyRecoverableEvalId(evalId);
  if (needsCoalesce || evalIdNeedsJson) {
    writeSignalFile(
      JSON.stringify({
        type: 'update',
        evalId,
        updatedEvalIds: updatedEvalIds.length > 0 ? updatedEvalIds : undefined,
        deletedEvalIds: pendingHasDelete ? (pending?.deletedEvalIds ?? []) : undefined,
        refreshLatest: refreshLatest ? true : undefined,
        timestamp: nowIso,
      }),
    );
    return;
  }
  writeSignalFile(evalId ? `${evalId}:${nowIso}` : nowIso);
}

/** True when the signal carries an update component (a scoped or unscoped eval refresh). */
export function hasUpdateComponent(signal: DatabaseSignal): boolean {
  return (
    signal.type === 'update' ||
    signal.evalId !== undefined ||
    (signal.updatedEvalIds?.length ?? 0) > 0 ||
    signal.refreshLatest === true
  );
}

/**
 * True when the signal asks to refresh the latest eval (an unscoped update component): the
 * `refreshLatest` marker, or a bare update with no scoped ids (e.g. a legacy bare timestamp). The
 * watcher emits {@link Eval.latest} for these, so a root `/eval` view follows new evals even when a
 * coalesced signal also carries scoped updates or a delete.
 */
export function hasUnscopedUpdate(signal: DatabaseSignal): boolean {
  return (
    signal.refreshLatest === true ||
    (hasUpdateComponent(signal) && updateEvalIds(signal).length === 0)
  );
}

/** True when the signal carries a delete component (specific ids or "all evals deleted"). */
export function hasDeleteComponent(signal: DatabaseSignal): boolean {
  return signal.type === 'delete' || signal.deletedEvalIds !== undefined;
}

/**
 * True when a delete component means "all evals were deleted" rather than a specific id list.
 * "All" is encoded as `undefined` by direct delete callers and as `[]` when a pending delete-all
 * is folded into a JSON update, so both count. Only meaningful for a signal that actually carries
 * a delete component (see {@link hasDeleteComponent}); an update-only signal has no ids either.
 */
export function isAllEvalsDeleted(deletedEvalIds: string[] | undefined): boolean {
  return deletedEvalIds === undefined || deletedEvalIds.length === 0;
}

/**
 * The distinct scoped eval ids an update signal refreshes, newest last. Empty for an unscoped
 * update (which means "refresh to the latest eval"). Prefers the accumulated `updatedEvalIds`
 * set and falls back to the single `evalId` for legacy/simple signals.
 */
export function updateEvalIds(signal: DatabaseSignal): string[] {
  if (signal.updatedEvalIds && signal.updatedEvalIds.length > 0) {
    return signal.updatedEvalIds;
  }
  return signal.evalId ? [signal.evalId] : [];
}

/**
 * Parses signal-file content as a combined JSON payload, returning the classified signal and
 * its timestamp (used for the debounce-window check), or null if it is not a JSON signal.
 */
function parseSignalJson(content: string): { signal: DatabaseSignal; timestamp?: string } | null {
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
      const updatedEvalIds =
        'updatedEvalIds' in parsed ? toStringEvalIds(parsed.updatedEvalIds) : undefined;
      const deletedEvalIds =
        'deletedEvalIds' in parsed ? toStringEvalIds(parsed.deletedEvalIds) : undefined;
      const timestamp =
        'timestamp' in parsed && typeof parsed.timestamp === 'string'
          ? parsed.timestamp
          : undefined;
      const refreshLatest =
        'refreshLatest' in parsed && parsed.refreshLatest === true ? true : undefined;
      return {
        signal: { type: parsed.type, evalId, updatedEvalIds, deletedEvalIds, refreshLatest },
        timestamp,
      };
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
      return withinWindow(json.timestamp) ? json.signal : null;
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
 * debounce window also carries forward a pending update — scoped ids or an unscoped "refresh
 * latest" — so neither refresh is lost (same-process best-effort, like {@link updateSignalFile};
 * cross-process writes can still race).
 * Pre-PR view servers don't understand this JSON and read it back as "no eval id", falling back
 * to broadcasting the latest eval — a benign degradation, so the view server and CLI should be
 * on matching versions for delete-aware refreshes.
 */
export function updateSignalFileForDeletedEvals(deletedEvalIds?: string[]): void {
  const now = Date.now();
  const pending = readPendingSignal(now);
  const pendingDelete = pending && hasDeleteComponent(pending) ? pending : null;
  // Merge new deletes with any pending in the window. "All evals deleted" — encoded as undefined
  // by direct callers, or as [] when a delete-all was folded into a pending update — wins over a
  // specific id list, so a coalescing chain never downgrades a delete-all to one id.
  const mergedDeletedEvalIds = !pendingDelete
    ? deletedEvalIds
    : isAllEvalsDeleted(pendingDelete.deletedEvalIds) || isAllEvalsDeleted(deletedEvalIds)
      ? undefined
      : [...new Set([...(pendingDelete.deletedEvalIds ?? []), ...(deletedEvalIds ?? [])])];
  // Carry forward every pending scoped update so a quick create/import-then-delete still
  // refreshes clients to the newly written eval(s) rather than only processing the delete.
  const carriedUpdateIds = pending && hasUpdateComponent(pending) ? updateEvalIds(pending) : [];
  // Carry a pending unscoped "refresh latest" too, so a bare update followed by an unrelated
  // delete still refreshes a root `/eval` view whose displayed eval was not deleted.
  const carriedRefreshLatest = pending ? hasUnscopedUpdate(pending) : false;

  writeSignalFile(
    JSON.stringify({
      type: 'delete',
      deletedEvalIds: mergedDeletedEvalIds,
      evalId: carriedUpdateIds[carriedUpdateIds.length - 1],
      updatedEvalIds: carriedUpdateIds.length > 0 ? carriedUpdateIds : undefined,
      refreshLatest: carriedRefreshLatest ? true : undefined,
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
  return evalId && isLegacyRecoverableEvalId(evalId) ? evalId : undefined;
}

/**
 * Reads and classifies the signal file into a {@link DatabaseSignal}. It understands the
 * legacy `evalId:timestamp` (or bare timestamp) text written by {@link updateSignalFile} and
 * the JSON payload written by the delete/combined writers. A JSON payload may carry BOTH an
 * update component (`updatedEvalIds` — possibly several ids when scoped updates coalesced) and a
 * delete component (`deletedEvalIds`) when mutations were coalesced inside the watcher's debounce
 * window. Malformed/half-written content or a read error degrades to an unscoped `{type:'update'}`.
 */
export function readSignalFile(): DatabaseSignal {
  const filePath = getDbSignalPath();
  try {
    const content = fs.readFileSync(filePath, 'utf8').trim();
    const json = parseSignalJson(content);
    if (json) {
      return json.signal;
    }
    return { type: 'update', evalId: readLegacySignalEvalId(content) };
  } catch {
    return { type: 'update' };
  }
}

/**
 * Reads the signal file and returns its scoped eval ID, if present. A pure delete signal has no
 * `evalId` and returns undefined; a delete that coalesced a pending scoped update returns that
 * carried id. Use {@link readSignalFile} for the full {@link DatabaseSignal} including deletes.
 * @returns The scoped eval ID from the signal, or undefined if none
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
