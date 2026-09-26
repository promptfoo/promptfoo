import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type CopiesModule = typeof import('../../src/providers/workingDirectoryCopies');

describe('workingDirectoryCopies', () => {
  let fixtureDir: string;
  let copies: CopiesModule;
  let onceSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    // A fresh module registers its own exit handler.
    vi.resetModules();
    onceSpy = vi.spyOn(process, 'once');
    copies = await import('../../src/providers/workingDirectoryCopies');
    fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-copies-test-'));
    await fs.writeFile(path.join(fixtureDir, 'README.md'), 'fixture');
  });

  afterEach(async () => {
    await copies.releaseWorkingDirectoryCopies('test');
    vi.restoreAllMocks();
    await fs.rm(fixtureDir, { recursive: true, force: true });
  });

  const exists = (dir: string) =>
    fs.access(dir).then(
      () => true,
      () => false,
    );

  it('reports only live copies as owned', async () => {
    const copy = await copies.copyWorkingDirectory(fixtureDir, 'test');

    expect(copies.isWorkingDirectoryCopy(copy.workingDir)).toBe(true);
    expect(copies.isWorkingDirectoryCopy(path.join(copy.workingDir, '..', 'workspace'))).toBe(true);
    expect(copies.isWorkingDirectoryCopy(fixtureDir)).toBe(false);
    expect(copies.isWorkingDirectoryCopy('/etc')).toBe(false);

    await copy.settle(true);
    await copies.releaseWorkingDirectoryCopies('test');
    expect(copies.isWorkingDirectoryCopy(copy.workingDir)).toBe(false);
    expect(await exists(copy.workingDir)).toBe(false);
  });

  it('removes copies still in use when the process exits', async () => {
    // An eval that times out exits before the aborted SDK call settles.
    const copy = await copies.copyWorkingDirectory(fixtureDir, 'test');
    try {
      await copies.releaseWorkingDirectoryCopies('test');
      expect(await exists(copy.workingDir)).toBe(true);

      const exitHandler = onceSpy.mock.calls.find((call: unknown[]) => call[0] === 'exit')?.[1];
      expect(exitHandler).toBeTypeOf('function');
      (exitHandler as () => void)();

      expect(await exists(copy.workingDir)).toBe(false);
    } finally {
      await copy.settle(false);
    }
  });
});
