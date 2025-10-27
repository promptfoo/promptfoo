// src/store/lastRun.ts
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

function storeRoot() {
  return process.env.PROMPTFOO_HOME ?? path.join(os.homedir(), '.promptfoo');
}
const LAST_FILE = 'lastRun.json';

function lastPath() {
  return path.join(storeRoot(), LAST_FILE);
}

export async function setLastRunPointer(filePath: string) {
  const p = lastPath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify({ path: filePath }, null, 2), 'utf8');
}

export async function getLastRunPointer(): Promise<string | null> {
  try {
    const txt = await fs.readFile(lastPath(), 'utf8');
    return JSON.parse(txt).path as string;
  } catch {
    return null;
  }
}
