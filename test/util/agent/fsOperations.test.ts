import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fsPromisesMock = vi.hoisted(() => ({
  actualReadFile: undefined as undefined | typeof fs.readFile,
  readFileSpy: vi.fn(),
}));

function getActualReadFile(): typeof fs.readFile {
  if (!fsPromisesMock.actualReadFile) {
    throw new Error('readFile mock not initialized');
  }
  return fsPromisesMock.actualReadFile;
}

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  fsPromisesMock.actualReadFile = actual.readFile.bind(actual);
  fsPromisesMock.readFileSpy.mockImplementation(getActualReadFile());

  return {
    ...actual,
    readFile: fsPromisesMock.readFileSpy,
  };
});

import { readFile } from '../../../src/util/agent/fsOperations';

describe('agent fsOperations readFile', () => {
  let rootDir: string;

  beforeEach(async () => {
    fsPromisesMock.readFileSpy.mockReset();
    fsPromisesMock.readFileSpy.mockImplementation(getActualReadFile());
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-fs-operations-'));
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it('returns the full contents for files within the size limit', async () => {
    await fs.writeFile(path.join(rootDir, 'small.txt'), 'small file contents', 'utf8');

    await expect(readFile('small.txt', rootDir)).resolves.toBe('small file contents');
  });

  it('returns full multibyte content when decoded length fits within the limit', async () => {
    const multibyteContent = '你'.repeat(60_000);
    await fs.writeFile(path.join(rootDir, 'multibyte.txt'), multibyteContent, 'utf8');

    await expect(readFile('multibyte.txt', rootDir)).resolves.toBe(multibyteContent);
  });

  it('truncates very large files without using fs.readFile', async () => {
    const maxFileSize = 100_000;
    const oversizedContent = 'a'.repeat(450_000);
    await fs.writeFile(path.join(rootDir, 'large.txt'), oversizedContent, 'utf8');

    const result = await readFile('large.txt', rootDir);

    expect(fsPromisesMock.readFileSpy).not.toHaveBeenCalled();
    expect(result).toBe(
      oversizedContent.slice(0, maxFileSize) +
        `\n\n[truncated — file is ${oversizedContent.length} bytes]`,
    );
  });
});
