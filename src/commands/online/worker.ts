import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';

import { z } from 'zod';
import logger from '../../logger';
import { evaluateTurn, loadOnlineConfig } from './evaluate';
import { prepareDirectory, readJson, TurnSchema, turnKey, writeJson } from './store';

const ReceiptSchema = z
  .object({
    eventId: z.string(),
    status: z.enum(['completed', 'error']),
    attemptId: z.string(),
    evalId: z.string().optional(),
  })
  .refine((receipt) => receipt.status === 'error' || Boolean(receipt.evalId));

async function shouldGrade(
  receiptPath: string,
  retryErrors: boolean,
  attemptId: string,
): Promise<boolean> {
  try {
    const receipt = ReceiptSchema.parse(await readJson(receiptPath));
    if (`${receipt.eventId}.json` !== path.basename(receiptPath)) {
      throw new Error('Receipt does not match event');
    }
    return receipt.status === 'error' && retryErrors && receipt.attemptId !== attemptId;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return true;
    }
    throw new Error('Cannot read online eval receipt; refusing to grade it again');
  }
}

export async function runOnlineWorker(options: {
  directory: string;
  configPath: string;
  once: boolean;
  retryErrors: boolean;
  interval: number;
  signal?: AbortSignal;
}): Promise<void> {
  const directory = path.resolve(options.directory);
  await prepareDirectory(directory);
  const events = path.join(directory, 'events');
  const results = path.join(directory, 'results');
  const reports = path.join(directory, 'reports');
  for (const folder of [events, results, reports]) {
    await prepareDirectory(folder);
  }
  // One worker per queue avoids duplicate paid grading. A crash leaves the lock in place;
  // recovery is explicit rather than risking two live workers based on PID heuristics.
  const lockPath = path.join(directory, 'worker.lock');
  const lock = await fs.open(lockPath, 'wx', 0o600).catch(() => {
    throw new Error('Online queue is locked; stop the other worker before removing worker.lock');
  });
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid }));
    const config = await loadOnlineConfig(options.configPath);
    const attemptId = randomUUID();
    // Receipts are immutable for this worker run. Avoid reopening all retained history
    // on every idle poll; a restart checks disk again and enables explicit error retries.
    const processed = new Set<string>();
    logger.info(`Watching online Agent events in ${directory}`);
    do {
      const files = (await fs.readdir(events)).filter((file) => /^[a-f0-9]{64}\.json$/.test(file));
      for (const file of files.sort()) {
        if (options.signal?.aborted) {
          return;
        }
        if (processed.has(file)) {
          continue;
        }
        const receiptPath = path.join(results, file);
        if (!(await shouldGrade(receiptPath, options.retryErrors, attemptId))) {
          processed.add(file);
          continue;
        }
        const id = file.slice(0, -5);
        try {
          const turn = TurnSchema.parse(await readJson(path.join(events, file)));
          if (turnKey(turn) !== id) {
            throw new Error('Online event content does not match its filename');
          }
          const result = await evaluateTurn(turn, id, config, reports, options.signal);
          await writeJson(
            receiptPath,
            {
              status: result.stats.errors > 0 ? 'error' : 'completed',
              eventId: id,
              attemptId,
              ...result,
            },
            true,
          );
          logger.info(
            `Online eval ${result.evalId}: ${result.stats.successes} passed, ${result.stats.failures} failed, ${result.stats.errors} errors`,
          );
        } catch {
          if (options.signal?.aborted) {
            return;
          }
          // Do not log the event or arbitrary provider error messages containing conversation data.
          await writeJson(
            receiptPath,
            { status: 'error', eventId: id, attemptId, error: 'Online grading failed' },
            true,
          );
          logger.error(
            `Online event ${id} could not be graded; fix the configuration and use --retry-errors`,
          );
        }
        processed.add(file);
      }
      if (options.once || options.signal?.aborted) {
        return;
      }
      await setTimeout(options.interval, undefined, { signal: options.signal }).catch((error) => {
        if (!options.signal?.aborted) {
          throw error;
        }
      });
    } while (!options.signal?.aborted);
  } finally {
    await lock.close();
    await fs.unlink(lockPath);
  }
}
