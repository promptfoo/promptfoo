import { createHash } from 'node:crypto';
import { appendFileSync, lstatSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';

/** Validate an explicit disposable destination; never create or reuse another run's state. */
function configuration(directory, runId, delayMs, mode) {
  if (
    typeof directory !== 'string' ||
    !path.isAbsolute(directory) ||
    !lstatSync(path.resolve(directory)).isDirectory() ||
    readdirSync(directory).length !== 0
  ) {
    throw new Error(
      'VOICE_EVAL_STATE_DIR must be an existing, empty, absolute, nonsymlink directory.',
    );
  }
  if (typeof runId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(runId)) {
    throw new Error('Set VOICE_EVAL_RUN_ID to a unique 8–80 character run identifier.');
  }
  if (!Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > 10_000) {
    throw new Error('VOICE_EVAL_TOOL_DELAY_MS must be an integer from 0 to 10000.');
  }
  if (mode !== 'available' && mode !== 'unavailable') {
    throw new Error('VOICE_EVAL_TOOL_MODE must be available or unavailable.');
  }
  // Parent aliases such as macOS /tmp -> /private/tmp are fine. The actual leaf
  // must be a directory, not a symlink, and every write uses its canonical path.
  return { directory: realpathSync(directory), runId, delayMs, mode };
}

function parseReservation(raw) {
  const value = JSON.parse(raw);
  const keys = ['guest_name', 'date', 'time', 'party_size'];
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(value, key)) ||
    typeof value.guest_name !== 'string' ||
    !value.guest_name.trim() ||
    value.guest_name.length > 80 ||
    typeof value.date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.date) ||
    new Date(`${value.date}T00:00:00Z`).toISOString().slice(0, 10) !== value.date ||
    typeof value.time !== 'string' ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.time) ||
    !Number.isInteger(value.party_size) ||
    value.party_size < 1 ||
    value.party_size > 8
  ) {
    throw new Error(
      'Expected guest_name, a valid ISO date, HH:MM time, and party_size from 1 to 8.',
    );
  }
  return value;
}

/**
 * A local application fixture, not a booking service. Each successful operation is a
 * durable ledger entry. It accepts any valid date so the evaluator can catch wrong
 * dates and duplicate operations instead of the fixture silently repairing them.
 */
export function createReservationHandler(directory, runId, delayMs = 2000, mode = 'available') {
  const config = configuration(directory, runId, delayMs, mode);
  const ledgerPath = path.join(config.directory, 'reservation-ledger.jsonl');
  // The code is absent from caller/target prompts and is revealed only by the tool result.
  const digest = createHash('sha256').update(config.runId).digest();
  const confirmationCode = String(digest.readUInt32BE(0) % 1_000_000).padStart(6, '0');
  let initialized = false;
  let sequence = 0;
  let pending = Promise.resolve();

  const append = (event) => {
    if (!initialized) {
      writeFileSync(
        ledgerPath,
        `${JSON.stringify({
          version: 1,
          kind: 'run',
          scenarioId: 'reservation-correction-v1',
          runId: config.runId,
          mode: config.mode,
          createdAt: new Date().toISOString(),
          ...(config.mode === 'available' ? { confirmationCode } : {}),
        })}\n`,
        { flag: 'wx', mode: 0o600 },
      );
      initialized = true;
    }
    appendFileSync(ledgerPath, `${JSON.stringify(event)}\n`);
  };

  return (name, rawArgs, signal) => {
    const operation = pending.then(async () => {
      signal?.throwIfAborted();
      const startedAt = new Date().toISOString();
      const operationId = ++sequence;
      let args;
      try {
        if (name !== 'create_reservation') {
          throw new Error('Unknown tool.');
        }
        if (typeof rawArgs !== 'string' || Buffer.byteLength(rawArgs) > 4096) {
          throw new Error('Tool arguments must be a JSON string of at most 4096 bytes.');
        }
        args = parseReservation(rawArgs);
      } catch {
        const result = { status: 'rejected', error: 'Invalid reservation tool or arguments.' };
        append({ kind: 'tool_result', operationId, name, startedAt, result });
        return JSON.stringify(result);
      }

      // A real delay exercises speech while backend work is pending. Cancellation
      // prevents a write rather than returning a successful-looking tool result.
      await setTimeout(config.delayMs, undefined, { signal });
      signal?.throwIfAborted();
      const result =
        config.mode === 'unavailable'
          ? {
              status: 'unavailable',
              error: 'Reservation service unavailable. No reservation was created.',
            }
          : {
              status: 'confirmed',
              reservation: {
                id: `${config.runId}-${operationId}`,
                ...args,
                confirmation_code: confirmationCode,
              },
            };
      append({
        kind: 'tool_result',
        operationId,
        name,
        args,
        startedAt,
        completedAt: new Date().toISOString(),
        result,
      });
      return JSON.stringify(result);
    });
    pending = operation.catch(() => {});
    return operation;
  };
}

// Validation occurs when Promptfoo loads the callback, before it opens Live sessions.
// Use one process, one scenario, and one fresh directory per repetition.
export default createReservationHandler(
  process.env.VOICE_EVAL_STATE_DIR,
  process.env.VOICE_EVAL_RUN_ID,
  Number(process.env.VOICE_EVAL_TOOL_DELAY_MS ?? 2000),
  process.env.VOICE_EVAL_TOOL_MODE ?? 'available',
);
