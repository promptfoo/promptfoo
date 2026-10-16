import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import { z } from 'zod';

export const MAX_EVENT_BYTES = 1024 * 1024;
const text = z.string().max(250_000);
export const AgentSchema = z.enum(['claude-code', 'codex', 'generic']);
export type Agent = z.infer<typeof AgentSchema>;
export const TurnSchema = z.object({
  version: z.literal(1),
  agent: AgentSchema,
  sessionId: z.string().min(1).max(512),
  turnId: z.string().min(1).max(512),
  input: text.min(1),
  output: text,
  capturedAt: z.iso.datetime(),
});
export type CapturedTurn = z.infer<typeof TurnSchema>;

export function onlineDirectory(): string {
  return path.join(
    process.env.PROMPTFOO_CONFIG_DIR || path.join(homedir(), '.promptfoo'),
    'online',
  );
}

export function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function turnKey(turn: CapturedTurn): string {
  // The timestamp is deliberately excluded: retries of the same completed turn deduplicate.
  return digest([turn.agent, turn.sessionId, turn.turnId, turn.input, turn.output]);
}

export async function prepareDirectory(directory: string): Promise<void> {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('Online data directory must be a real directory');
  }
  if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
    throw new Error('Online data directory must have mode 0700');
  }
}

export async function readJson(file: string): Promise<unknown> {
  // Windows does not expose O_NOFOLLOW. Reject links before opening on every platform;
  // O_NOFOLLOW additionally closes the substitution race where the OS supports it.
  const entry = await fs.lstat(file);
  if (!entry.isFile() || entry.isSymbolicLink()) {
    throw new Error('Online record must be a regular file, not a link');
  }
  const handle = await fs.open(
    file,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_EVENT_BYTES) {
      throw new Error('Online record must be a bounded regular file');
    }
    const buffer = Buffer.alloc(MAX_EVENT_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_EVENT_BYTES) {
      throw new Error('Online record exceeds size limit');
    }
    return JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
  } finally {
    await handle.close();
  }
}

/** Publish only complete files. Readers never see a partially written event or receipt. */
export async function writeJson(file: string, value: unknown, replace = false): Promise<void> {
  const body = JSON.stringify(value);
  if (Buffer.byteLength(body) > MAX_EVENT_BYTES) {
    throw new Error('Online record exceeds size limit');
  }
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, body, { flag: 'wx', mode: 0o600 });
    if (replace) {
      await fs.rename(temporary, file);
    } else {
      try {
        await fs.link(temporary, file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw error;
        }
      }
    }
  } finally {
    await fs.unlink(temporary).catch(() => {});
  }
}

export async function enqueue(directory: string, turn: CapturedTurn): Promise<string> {
  const parsed = TurnSchema.parse(turn);
  await prepareDirectory(directory);
  const events = path.join(directory, 'events');
  await prepareDirectory(events);
  const id = turnKey(parsed);
  await writeJson(path.join(events, `${id}.json`), parsed);
  return id;
}
