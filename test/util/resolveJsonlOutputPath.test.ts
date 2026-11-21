import { EventEmitter } from 'node:events';
import * as nodePath from 'node:path';
import type { Stats, WriteStream } from 'node:fs';

import { afterAll, describe, expect, it, vi } from 'vitest';

type FileSystemMocks = ReturnType<typeof createMockFileSystem>;
type MockWriteStream = EventEmitter & {
  closed: boolean;
  destroyed: boolean;
  write: WriteStream['write'];
  end: WriteStream['end'];
};

const windowsPath = nodePath.win32;
const extendedUncPrefix = '\\\\?\\UNC\\';

function extendedUncRoot(server: string, share: string, namespace = 'UNC'): string {
  return `${extendedUncPrefix.replace('UNC', namespace)}${server}\\${share}\\`;
}

function createEnoent(filePath: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`ENOENT: no such file or directory, stat '${filePath}'`), {
    code: 'ENOENT',
    path: filePath,
  });
}

function createStats({
  directory = false,
  symlink = false,
}: {
  directory?: boolean;
  symlink?: boolean;
} = {}): Stats {
  return {
    isDirectory: () => directory,
    isSymbolicLink: () => symlink,
  } as Stats;
}

function createMockFileSystem() {
  const existingDirectories = new Set<string>();
  const symlinks = new Map<string, string>();
  const streamedRows: string[] = [];

  const lstat = (filePath: string) => {
    if (symlinks.has(filePath)) {
      return createStats({ symlink: true });
    }
    if (existingDirectories.has(filePath)) {
      return createStats({ directory: true });
    }
    throw createEnoent(filePath);
  };

  const readlink = (filePath: string) => {
    const target = symlinks.get(filePath);
    if (!target) {
      throw createEnoent(filePath);
    }
    return target;
  };

  const realpathSync = Object.assign(vi.fn(), {
    native: vi.fn((filePath: string) => {
      throw createEnoent(filePath);
    }),
  });
  const realpath = vi.fn(async (filePath: string) => {
    throw createEnoent(filePath);
  });
  const mkdirSync = vi.fn((filePath: string) => {
    existingDirectories.add(filePath);
  });
  const mkdir = vi.fn(async (filePath: string) => {
    existingDirectories.add(filePath);
  });
  const createWriteStream = vi.fn(() => {
    const stream = new EventEmitter() as MockWriteStream;
    stream.closed = false;
    stream.destroyed = false;
    stream.write = ((chunk: string | Uint8Array, callback?: (error?: Error | null) => void) => {
      streamedRows.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
      callback?.();
      return true;
    }) as WriteStream['write'];
    stream.end = (() => {
      stream.closed = true;
      queueMicrotask(() => stream.emit('close'));
      return stream;
    }) as WriteStream['end'];
    return stream;
  });

  const sync = {
    createWriteStream,
    lstatSync: vi.fn(lstat),
    mkdirSync,
    readlinkSync: vi.fn(readlink),
    realpathSync,
  };
  const promises = {
    lstat: vi.fn(async (filePath: string) => lstat(filePath)),
    mkdir,
    readlink: vi.fn(async (filePath: string) => readlink(filePath)),
    realpath,
  };

  return {
    sync,
    promises,
    streamedRows,
    reset() {
      existingDirectories.clear();
      symlinks.clear();
      streamedRows.length = 0;
      sync.createWriteStream.mockClear();
      sync.lstatSync.mockClear();
      sync.mkdirSync.mockClear();
      sync.readlinkSync.mockClear();
      sync.realpathSync.mockClear();
      sync.realpathSync.native.mockClear();
      promises.lstat.mockClear();
      promises.mkdir.mockClear();
      promises.readlink.mockClear();
      promises.realpath.mockClear();
    },
    setDirectory(filePath: string) {
      existingDirectories.add(filePath);
    },
    setSymlink(filePath: string, target: string) {
      symlinks.set(filePath, target);
    },
  };
}

async function loadJsonlModules(fileSystem: FileSystemMocks) {
  vi.resetModules();
  vi.doMock('path', async (importOriginal) => {
    const actual = await importOriginal<typeof import('path')>();
    return { ...actual, ...actual.win32, default: actual.win32 };
  });
  vi.doMock('fs', () => fileSystem.sync);
  vi.doMock('fs/promises', () => ({ ...fileSystem.promises, default: fileSystem.promises }));

  const pathModule = await import('../../src/util/exportToFile/resolveJsonlOutputPath');
  const writerModule = await import('../../src/util/exportToFile/writeToFile');
  return { ...pathModule, JsonlFileWriter: writerModule.JsonlFileWriter };
}

afterAll(() => {
  vi.doUnmock('path');
  vi.doUnmock('fs');
  vi.doUnmock('fs/promises');
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('JSONL output path preparation (Windows path emulation)', () => {
  it('writes directly under a drive root without trying to create the root', async () => {
    const fileSystem = createMockFileSystem();
    const modules = await loadJsonlModules(fileSystem);
    const output = 'D:\\out.jsonl';
    const writer = new modules.JsonlFileWriter(output);
    await writer.write({ row: 1 });
    await writer.close();
    expect(fileSystem.streamedRows).toEqual(['{"row":1}\n']);
    expect(fileSystem.sync.mkdirSync).not.toHaveBeenCalled();
    await modules.createJsonlOutputDirectories(await modules.resolveJsonlOutputPath(output));
    expect(fileSystem.promises.mkdir).not.toHaveBeenCalled();
  });

  it('handles direct, symlink, and current-directory paths under the extended UNC share root', async () => {
    const fileSystem = createMockFileSystem();
    const modules = await loadJsonlModules(fileSystem);
    const root = extendedUncRoot('server', 'share');
    const outputPath = `${root}nested\\out.jsonl`;
    expect(windowsPath.parse(outputPath).root).toBe(extendedUncPrefix);

    const writer = new modules.JsonlFileWriter(outputPath);
    await writer.write({ row: 1 });
    await writer.close();
    expect(fileSystem.sync.createWriteStream).toHaveBeenCalled();
    expect(fileSystem.streamedRows).toEqual(['{"row":1}\n']);
    expect(fileSystem.sync.mkdirSync.mock.calls.map(([directory]) => directory)).toEqual([
      `${root}nested`,
    ]);

    fileSystem.reset();
    const asyncPlan = await modules.resolveJsonlOutputPath(outputPath);
    await modules.createJsonlOutputDirectories(asyncPlan);
    expect(asyncPlan).toEqual({ targetPath: outputPath, parentDirectories: [`${root}nested`] });
    expect(fileSystem.promises.mkdir.mock.calls.map(([directory]) => directory)).toEqual([
      `${root}nested`,
    ]);

    for (const separatorVariant of [
      '//?/UNC/server/share/nested/out.jsonl',
      '\\\\?\\UNC/server\\share/nested\\out.jsonl',
      '\\\\?\\UNC/server/share/nested/out.jsonl',
      '//?/UNC\\server\\share\\nested\\out.jsonl',
      String.raw`\\?//UNC/server/share/nested/out.jsonl`,
    ]) {
      fileSystem.reset();
      expect(modules.resolveJsonlOutputPathSync(separatorVariant)).toEqual({
        targetPath: separatorVariant,
        parentDirectories: [`${root}nested`],
      });
    }

    fileSystem.reset();
    const mixedSeparatorDotDot = '//?/UNC/server/share/nested/../..\\out.jsonl';
    expect(modules.resolveJsonlOutputPathSync(mixedSeparatorDotDot)).toEqual({
      targetPath: mixedSeparatorDotDot,
      parentDirectories: [`${root}nested`],
    });
    expect(fileSystem.sync.lstatSync.mock.calls.map(([filePath]) => filePath)).toEqual([
      `${root}nested`,
      `${root}out.jsonl`,
    ]);

    fileSystem.reset();
    const sourceRoot = '\\\\source-server\\source-share\\';
    const targetRoot = extendedUncRoot('target-server', 'target-share', 'unc');
    const link = `${sourceRoot}alias`;
    fileSystem.setDirectory(`${targetRoot}existing`);
    fileSystem.setSymlink(link, `${targetRoot}existing\\`);
    const symlinkPlan = await modules.resolveJsonlOutputPath(`${link}\\nested\\out.jsonl`);
    expect(symlinkPlan).toEqual({
      targetPath: `${targetRoot}existing\\nested\\out.jsonl`,
      parentDirectories: [`${targetRoot}existing\\nested`],
    });

    for (const { input, parent } of [
      { input: 'nested\\out.jsonl', parent: 'repo\\nested' },
      { input: '\\nested\\out.jsonl', parent: 'nested' },
    ]) {
      fileSystem.reset();
      const cwd = `${root}repo`;
      fileSystem.setDirectory(cwd);
      vi.spyOn(process, 'cwd').mockReturnValue(cwd);
      const expectedPlan = { targetPath: input, parentDirectories: [`${root}${parent}`] };
      expect(modules.resolveJsonlOutputPathSync(input)).toEqual(expectedPlan);
      await expect(modules.resolveJsonlOutputPath(input)).resolves.toEqual(expectedPlan);
      vi.restoreAllMocks();
    }

    fileSystem.reset();
    for (const namespace of ['UNC', 'unc', 'UnC']) {
      const caseRoot = extendedUncRoot('server', 'share', namespace);
      const casePath = `${caseRoot}nested\\out.jsonl`;
      expect(modules.resolveJsonlOutputPathSync(casePath)).toEqual({
        targetPath: casePath,
        parentDirectories: [`${caseRoot}nested`],
      });
      fileSystem.reset();
    }

    const standardUnc = '\\\\server\\share\\nested\\out.jsonl';
    const extendedDrive = '\\\\?\\C:\\nested\\out.jsonl';
    expect(modules.resolveJsonlOutputPathSync(standardUnc)).toEqual({
      targetPath: standardUnc,
      parentDirectories: ['\\\\server\\share\\nested'],
    });
    fileSystem.reset();
    expect(modules.resolveJsonlOutputPathSync(extendedDrive)).toEqual({
      targetPath: extendedDrive,
      parentDirectories: ['\\\\?\\C:\\nested'],
    });

    fileSystem.reset();
    const rootParentPath = `${root}..\\nested\\out.jsonl`;
    expect(modules.resolveJsonlOutputPathSync(rootParentPath)).toEqual({
      targetPath: rootParentPath,
      parentDirectories: [`${root}nested`],
    });
  });
});
