import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isPathWithinDir } from '../../src/util/isPathWithinDir';

describe('isPathWithinDir', () => {
  let testRoot: string;
  let workspace: string;
  let outsideDir: string;

  beforeEach(async () => {
    testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'permissions-test-'));
    workspace = path.join(testRoot, 'workspace');
    outsideDir = path.join(testRoot, 'outside');

    await fs.mkdir(workspace);
    await fs.mkdir(outsideDir);
    await fs.mkdir(path.join(workspace, 'subdir'));

    await fs.writeFile(path.join(workspace, 'file.txt'), 'test');
    await fs.writeFile(path.join(workspace, 'subdir', 'nested.txt'), 'test');
    await fs.writeFile(path.join(outsideDir, 'external.txt'), 'test');

    // Create a symlink that points outside the workspace (for symlink attack testing)
    await fs.symlink(path.join(outsideDir, 'external.txt'), path.join(workspace, 'evil-symlink'));
  });

  afterEach(async () => {
    await fs.rm(testRoot, { recursive: true, force: true });
  });

  it('should allow files within directory', async () => {
    await expect(isPathWithinDir('file.txt', workspace)).resolves.toBe(true);
    await expect(isPathWithinDir('./file.txt', workspace)).resolves.toBe(true);
    await expect(isPathWithinDir('subdir/nested.txt', workspace)).resolves.toBe(true);
    await expect(isPathWithinDir('./subdir/nested.txt', workspace)).resolves.toBe(true);
    await expect(isPathWithinDir(path.join(workspace, 'file.txt'), workspace)).resolves.toBe(true);
  });

  it('should block files outside directory using relative paths', async () => {
    await expect(isPathWithinDir('../outside/external.txt', workspace)).resolves.toBe(false);
    await expect(isPathWithinDir('../../external.txt', workspace)).resolves.toBe(false);
  });

  it('should block files outside directory using absolute paths', async () => {
    await expect(isPathWithinDir('/etc/hosts', workspace)).resolves.toBe(false);
    await expect(isPathWithinDir(path.join(outsideDir, 'external.txt'), workspace)).resolves.toBe(
      false,
    );
  });

  it('should block access to parent directory', async () => {
    await expect(isPathWithinDir('..', workspace)).resolves.toBe(false);
    await expect(isPathWithinDir('../', workspace)).resolves.toBe(false);
  });

  it('should allow directory itself', async () => {
    await expect(isPathWithinDir('.', workspace)).resolves.toBe(true);
    await expect(isPathWithinDir(workspace, workspace)).resolves.toBe(true);
  });

  it('should handle path traversal attempts', async () => {
    await expect(isPathWithinDir('subdir/../../outside/external.txt', workspace)).resolves.toBe(
      false,
    );
  });

  it('should block symlinks that point outside directory (symlink attack)', async () => {
    await expect(isPathWithinDir('evil-symlink', workspace)).resolves.toBe(false);
  });

  it('should allow non-existent paths within directory (for Write tool)', async () => {
    await expect(isPathWithinDir('nonexistent.txt', workspace)).resolves.toBe(true);
    await expect(isPathWithinDir('subdir/new-file.txt', workspace)).resolves.toBe(true);

    await expect(isPathWithinDir('../nonexistent.txt', workspace)).resolves.toBe(false);
    await expect(isPathWithinDir('../../nonexistent.txt', workspace)).resolves.toBe(false);
  });

  it('should throw error immediately if directory itself does not exist', async () => {
    const nonExistentDir = path.join(testRoot, 'does-not-exist');

    await expect(isPathWithinDir('file.txt', nonExistentDir)).rejects.toThrow(
      'Directory does not exist or is inaccessible',
    );
    await expect(isPathWithinDir('subdir/file.txt', nonExistentDir)).rejects.toThrow(
      'Directory does not exist or is inaccessible',
    );
  });
});
