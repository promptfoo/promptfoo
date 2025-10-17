import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

function storeRoot() {
  return process.env.PROMPTFOO_HOME ?? path.join(os.homedir(), '.promptfoo');
}
function pointerPath(scope: string) {
  return path.join(storeRoot(), `baseline.${scope}.json`);
}

export async function setBaselinePointer(filePath: string, scope = 'global') {
  const p = pointerPath(scope);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify({ scope, path: filePath }), 'utf8');
}
export async function getBaselinePointer(scope = 'global') {
  try { return JSON.parse(await fs.readFile(pointerPath(scope), 'utf8')).path as string; }
  catch { return null; }
}
export async function clearBaselinePointer(scope = 'global') {
  try { await fs.unlink(pointerPath(scope)); } catch {}
}
