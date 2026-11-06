import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { readJsonFile, writeReportFile } from '../../src/metamorphic/io';

const directories: string[] = [];
async function directory() {
  const dir = await mkdtemp(path.join(tmpdir(), 'metamorphic-io-'));
  directories.push(dir);
  return dir;
}
afterEach(async () => {
  for (const dir of directories.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});
describe('bounded JSON files', () => {
  it('rejects oversized and non UTF-8 input before analysis', async () => {
    const dir = await directory();
    const file = path.join(dir, 'input.json');
    await writeFile(file, '{"large":"123456789"}');
    await expect(readJsonFile(file, 10)).rejects.toThrow(/byte limit/);
    await writeFile(file, Buffer.from([0xff, 0xfe]));
    await expect(readJsonFile(file, 10)).rejects.toThrow(/UTF-8/);
  });
  it('does not disclose malformed input content', async () => {
    const dir = await directory();
    const file = path.join(dir, 'input.json');
    await writeFile(file, 'private-api-key');
    await expect(readJsonFile(file, 100)).rejects.toThrow('Input is not valid JSON');
  });
  it('writes atomically without overwriting existing output', async () => {
    const dir = await directory();
    const file = path.join(dir, 'report.json');
    await writeReportFile(file, 'first', 100);
    await expect(writeReportFile(file, 'second', 100)).rejects.toThrow(/already exists/);
    expect(await readFile(file, 'utf8')).toBe('first');
  });
  it('enforces the output byte limit', async () => {
    const dir = await directory();
    await expect(writeReportFile(path.join(dir, 'report.json'), 'longer', 3)).rejects.toThrow(
      /byte limit/,
    );
  });
});
