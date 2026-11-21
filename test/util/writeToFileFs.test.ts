import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JsonlFileWriter } from '../../src/util/exportToFile/writeToFile';

// Unmocked counterpart to writeToFile.test.ts: pins the real-stream assumptions the
// writer relies on — createWriteStream's default emitClose means 'close' always fires
// (close() can never hang), and the file descriptor is released before close() resolves
// so the file and its directory can be removed immediately (the Windows ENOTEMPTY race).
describe('JsonlFileWriter (real filesystem)', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-jsonl-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes concurrent rows in order to a new directory and releases the file on close', async () => {
    const parent = path.join(dir, 'nested', 'deep');
    const file = path.join(parent, 'out.jsonl');
    const writer = new JsonlFileWriter(file);
    await Promise.all([writer.write({ a: 1 }), writer.write({ b: 2 })]);
    await writer.close();

    const lines = fs.readFileSync(file, 'utf-8').trim().split('\n');
    expect(lines.map((line) => JSON.parse(line))).toEqual([{ a: 1 }, { b: 2 }]);

    // Non-recursive removal fails (EBUSY/ENOTEMPTY on Windows) if the fd is still held.
    fs.rmSync(file);
    fs.rmdirSync(parent);
  });

  it('creates a dangling symlink target parent before the first write', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const link = path.join(dir, 'out.jsonl');
    const target = path.join(dir, 'nested', 'deep', 'out.jsonl');
    fs.symlinkSync(path.relative(path.dirname(link), target), link);

    const writer = new JsonlFileWriter(link);
    await writer.write({ a: 1 });
    await writer.close();

    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(link)).toBe(path.relative(path.dirname(link), target));
    expect(fs.readFileSync(target, 'utf-8')).toBe('{"a":1}\n');
  });

  it('creates missing parents behind an intermediate directory symlink', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const link = path.join(dir, 'out.jsonl');
    const directoryLink = path.join(dir, 'linked-dir');
    const target = path.join(dir, 'missing-parent', 'nested', 'out.jsonl');
    fs.symlinkSync(path.join(path.basename(directoryLink), 'out.jsonl'), link);
    fs.symlinkSync(path.relative(path.dirname(directoryLink), path.dirname(target)), directoryLink);

    const writer = new JsonlFileWriter(link);
    await writer.write({ a: 1 });
    await writer.close();

    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(directoryLink).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(target, 'utf-8')).toBe('{"a":1}\n');
  });

  it('resolves dot-dot after following an intermediate symlink', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const link = path.join(dir, 'out.jsonl');
    const pivot = path.join(dir, 'pivot');
    const target = path.join(dir, 'real', 'nested', 'result.jsonl');
    const lexicalBlocker = path.join(dir, 'nested');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.mkdirSync(path.join(dir, 'real', 'inner'), { recursive: true });
    fs.writeFileSync(lexicalBlocker, 'keep this file');
    fs.symlinkSync(path.join('real', 'inner'), pivot);
    fs.symlinkSync(['pivot', '..', 'nested', 'result.jsonl'].join(path.sep), link);

    const writer = new JsonlFileWriter(link);
    await writer.write({ a: 1 });
    await writer.close();

    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(target, 'utf-8')).toBe('{"a":1}\n');
    expect(fs.readFileSync(lexicalBlocker, 'utf-8')).toBe('keep this file');
  });

  it('resolves an existing output after following a symlink before dot-dot', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const pivot = path.join(dir, 'pivot');
    const outputPath = `${dir}${path.sep}${['pivot', '..', 'nested', 'result.jsonl'].join(path.sep)}`;
    const target = path.join(dir, 'real', 'nested', 'result.jsonl');
    const lexicalBlocker = path.join(dir, 'nested');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.mkdirSync(path.join(dir, 'real', 'inner'), { recursive: true });
    fs.writeFileSync(target, '{"old":true}\n');
    fs.writeFileSync(lexicalBlocker, 'keep this file');
    fs.symlinkSync(path.join('real', 'inner'), pivot);

    const writer = new JsonlFileWriter(outputPath);
    await writer.write({ a: 1 });
    await writer.close();

    expect(fs.readFileSync(target, 'utf-8')).toBe('{"a":1}\n');
    expect(fs.readFileSync(lexicalBlocker, 'utf-8')).toBe('keep this file');
  });

  it('creates a missing component before resolving a following dot-dot', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const link = path.join(dir, 'out.jsonl');
    const target = path.join(dir, 'nested', 'result.jsonl');
    fs.mkdirSync(path.dirname(target));
    fs.symlinkSync(['missing', '..', 'nested', 'result.jsonl'].join(path.sep), link);

    const writer = new JsonlFileWriter(link);
    await writer.write({ a: 1 });
    await writer.close();

    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.statSync(path.join(dir, 'missing')).isDirectory()).toBe(true);
    expect(fs.readFileSync(target, 'utf-8')).toBe('{"a":1}\n');
  });

  it('allows revisiting the same symlink after dot-dot traversal', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const link = path.join(dir, 'out.jsonl');
    const alias = path.join(dir, 'alias');
    const target = path.join(dir, 'physical', 'inner', 'nested', 'result.jsonl');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.mkdirSync(path.join(dir, 'physical', 'nested'), { recursive: true });
    fs.symlinkSync(path.join('physical', 'inner'), alias);
    fs.symlinkSync(['alias', '..', '..', 'alias', 'nested', 'result.jsonl'].join(path.sep), link);

    const writer = new JsonlFileWriter(link);
    await writer.write({ a: 1 });
    await writer.close();

    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(target, 'utf-8')).toBe('{"a":1}\n');
  });

  it('preserves ENOTDIR when a regular file precedes dot-dot', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const link = path.join(dir, 'out.jsonl');
    const blocker = path.join(dir, 'blocker');
    fs.writeFileSync(blocker, 'keep this file');
    fs.symlinkSync(['blocker', '..', 'nested', 'result.jsonl'].join(path.sep), link);

    const writer = new JsonlFileWriter(link);
    await expect(writer.write({ a: 1 })).rejects.toMatchObject({
      cause: expect.objectContaining({ code: 'ENOTDIR' }),
    });

    expect(fs.readFileSync(blocker, 'utf-8')).toBe('keep this file');
    expect(fs.existsSync(path.join(dir, 'nested'))).toBe(false);
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
  });

  it('preserves a trailing separator on a dangling symlink target', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const link = path.join(dir, 'out.jsonl');
    const target = path.join(dir, 'missing-target.jsonl');
    fs.symlinkSync(`${path.basename(target)}${path.sep}`, link);

    const writer = new JsonlFileWriter(link);
    const writeError = await writer.write({ a: 1 }).catch((error: unknown) => error);

    expect(fs.existsSync(target)).toBe(false);
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(link)).toBe(`${path.basename(target)}${path.sep}`);
    expect(writeError).toMatchObject({
      cause: expect.objectContaining({ code: expect.stringMatching(/^(ENOENT|EISDIR)$/) }),
    });
  });

  it.each([
    { targetType: 'relative', absoluteTargets: false },
    { targetType: 'absolute', absoluteTargets: true },
  ])('follows a chain of $targetType dangling symlinks', async ({ absoluteTargets }) => {
    if (process.platform === 'win32') {
      return;
    }

    const outputPath = path.join(dir, 'out.jsonl');
    const currentPath = path.join(dir, 'current.jsonl');
    const target = path.join(dir, 'nested', 'deep', 'missing.jsonl');
    const outputTarget = absoluteTargets
      ? currentPath
      : path.relative(path.dirname(outputPath), currentPath);
    const currentTarget = absoluteTargets
      ? target
      : path.relative(path.dirname(currentPath), target);
    fs.symlinkSync(outputTarget, outputPath);
    fs.symlinkSync(currentTarget, currentPath);

    const writer = new JsonlFileWriter(outputPath);
    await writer.write({ a: 1 });
    await writer.close();

    expect(fs.lstatSync(outputPath).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(outputPath)).toBe(outputTarget);
    expect(fs.lstatSync(currentPath).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(currentPath)).toBe(currentTarget);
    expect(fs.readFileSync(target, 'utf-8')).toBe('{"a":1}\n');
  });

  it('writes through a symlink to an existing target without replacing the link', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const outputPath = path.join(dir, 'out.jsonl');
    const target = path.join(dir, 'existing.jsonl');
    const symlinkTarget = path.basename(target);
    fs.writeFileSync(target, '{"old":true}\n');
    fs.symlinkSync(symlinkTarget, outputPath);

    const writer = new JsonlFileWriter(outputPath);
    await writer.write({ a: 1 });
    await writer.close();

    expect(fs.lstatSync(outputPath).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(outputPath)).toBe(symlinkTarget);
    expect(fs.readFileSync(target, 'utf-8')).toBe('{"a":1}\n');
  });

  it('rejects a symlink cycle with ELOOP instead of hanging', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const outputPath = path.join(dir, 'out.jsonl');
    const currentPath = path.join(dir, 'current.jsonl');
    fs.symlinkSync(path.basename(currentPath), outputPath);
    fs.symlinkSync(path.basename(outputPath), currentPath);

    const writer = new JsonlFileWriter(outputPath);
    await expect(writer.write({ a: 1 })).rejects.toMatchObject({
      message: expect.stringContaining(`Failed to write JSONL output ${outputPath}:`),
      cause: expect.objectContaining({ code: 'ELOOP' }),
    });
    expect(fs.lstatSync(outputPath).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(currentPath).isSymbolicLink()).toBe(true);
  });

  it('can retry a write after parent directory creation fails', async () => {
    const parent = path.join(dir, 'nested');
    fs.writeFileSync(parent, 'occupied');
    const file = path.join(parent, 'out.jsonl');
    const writer = new JsonlFileWriter(file);

    await expect(writer.write({ a: 1 })).rejects.toMatchObject({
      message: expect.stringContaining(`Failed to write JSONL output ${file}:`),
      cause: expect.objectContaining({ code: expect.any(String) }),
    });

    fs.unlinkSync(parent);
    await writer.write({ b: 2 });
    await writer.close();
    expect(fs.readFileSync(file, 'utf-8')).toBe('{"b":2}\n');
  });

  it('resolves a second close() call on an already-closed stream', async () => {
    const writer = new JsonlFileWriter(path.join(dir, 'out.jsonl'));
    await writer.write({ a: 1 });
    await writer.close();
    await expect(writer.close()).resolves.toBeUndefined();
  });

  it('leaves the destination untouched when nothing was written', async () => {
    const file = path.join(dir, 'nested', 'deep', 'never.jsonl');
    await expect(new JsonlFileWriter(file).close()).resolves.toBeUndefined();
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.existsSync(path.dirname(file))).toBe(false);
  });

  it('rejects close() when the stream failed mid-run', async () => {
    const file = path.join(dir, 'broken.jsonl');
    const writer = new JsonlFileWriter(file);
    await writer.write({ a: 1 });
    // Destroy with an error to simulate an fd failure between writes; the recorded
    // pre-flush error must reject close() rather than be swallowed.
    (writer as unknown as { writeStream: { destroy: (error: Error) => void } }).writeStream.destroy(
      new Error('EBADF: bad file descriptor'),
    );

    await expect(writer.close()).rejects.toThrow(
      `Failed to close JSONL output ${file}: EBADF: bad file descriptor`,
    );
  });
});
