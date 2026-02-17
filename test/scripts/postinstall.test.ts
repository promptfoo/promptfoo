import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installHook } from '../../scripts/postinstall.mjs';

describe('postinstall hook installer', () => {
  let tempDir: string;
  const MARKER = '# Pre-commit hook for linting changed files';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'postinstall-test-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should skip silently when .git directory does not exist', () => {
    const result = installHook(tempDir);
    expect(result.installed).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it('should skip silently when .git is a file (worktrees)', () => {
    fs.writeFileSync(path.join(tempDir, '.git'), 'gitdir: /some/other/path');
    const result = installHook(tempDir);
    expect(result.installed).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it('should skip when source pre-commit script is missing', () => {
    fs.mkdirSync(path.join(tempDir, '.git'), { recursive: true });
    // No scripts/pre-commit created
    const result = installHook(tempDir);
    expect(result.installed).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it('should install the hook when .git exists and source script exists', () => {
    fs.mkdirSync(path.join(tempDir, '.git'), { recursive: true });
    const scriptsDir = path.join(tempDir, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(path.join(scriptsDir, 'pre-commit'), `#!/bin/bash\n${MARKER}\necho "lint"`);

    const result = installHook(tempDir);

    expect(result.installed).toBe(true);
    expect(result.method).toBeDefined();
    expect(fs.existsSync(path.join(tempDir, '.git', 'hooks', 'pre-commit'))).toBe(true);
  });

  it('should create .git/hooks directory if it does not exist', () => {
    fs.mkdirSync(path.join(tempDir, '.git'), { recursive: true });
    const scriptsDir = path.join(tempDir, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(path.join(scriptsDir, 'pre-commit'), `#!/bin/bash\n${MARKER}`);

    installHook(tempDir);

    expect(fs.existsSync(path.join(tempDir, '.git', 'hooks'))).toBe(true);
  });

  it('should use symlink on Unix and copy on Windows', () => {
    fs.mkdirSync(path.join(tempDir, '.git'), { recursive: true });
    const scriptsDir = path.join(tempDir, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(path.join(scriptsDir, 'pre-commit'), `#!/bin/bash\n${MARKER}`);

    const result = installHook(tempDir);

    expect(result.installed).toBe(true);
    if (os.platform() === 'win32') {
      expect(result.method).toBe('copy');
    } else {
      expect(result.method).toBe('symlink');
    }
  });

  it('should fall back to copy when symlink fails on Unix', () => {
    fs.mkdirSync(path.join(tempDir, '.git'), { recursive: true });
    const scriptsDir = path.join(tempDir, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(path.join(scriptsDir, 'pre-commit'), `#!/bin/bash\n${MARKER}`);

    // Force symlinkSync to throw so the copy fallback is exercised
    const originalSymlinkSync = fs.symlinkSync;
    vi.spyOn(fs, 'symlinkSync').mockImplementation(() => {
      throw new Error('symlink not supported');
    });

    const result = installHook(tempDir);

    expect(result.installed).toBe(true);
    expect(result.method).toBe('copy');

    fs.symlinkSync = originalSymlinkSync;
  });

  it('should replace an existing promptfoo hook (idempotent)', () => {
    fs.mkdirSync(path.join(tempDir, '.git', 'hooks'), { recursive: true });
    const scriptsDir = path.join(tempDir, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });

    const hookContent = `#!/bin/bash\n${MARKER}\necho "old version"`;
    fs.writeFileSync(path.join(scriptsDir, 'pre-commit'), `#!/bin/bash\n${MARKER}\necho "new"`);
    fs.writeFileSync(path.join(tempDir, '.git', 'hooks', 'pre-commit'), hookContent);

    const result = installHook(tempDir);

    expect(result.installed).toBe(true);
  });

  it('should preserve an existing non-promptfoo hook', () => {
    fs.mkdirSync(path.join(tempDir, '.git', 'hooks'), { recursive: true });
    const scriptsDir = path.join(tempDir, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(path.join(scriptsDir, 'pre-commit'), `#!/bin/bash\n${MARKER}`);

    const userHook = '#!/bin/bash\necho "my custom hook"';
    const hookPath = path.join(tempDir, '.git', 'hooks', 'pre-commit');
    fs.writeFileSync(hookPath, userHook);

    const result = installHook(tempDir);

    expect(result.installed).toBe(false);
    // Verify the user hook is unchanged
    expect(fs.readFileSync(hookPath, 'utf-8')).toBe(userHook);
  });

  it('should produce hook content that matches the source script', () => {
    fs.mkdirSync(path.join(tempDir, '.git'), { recursive: true });
    const scriptsDir = path.join(tempDir, 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });

    const sourceContent = `#!/bin/bash\n${MARKER}\necho "lint check"`;
    fs.writeFileSync(path.join(scriptsDir, 'pre-commit'), sourceContent);

    const result = installHook(tempDir);
    expect(result.installed).toBe(true);

    const hookPath = path.join(tempDir, '.git', 'hooks', 'pre-commit');
    if (result.method === 'copy') {
      expect(fs.readFileSync(hookPath, 'utf-8')).toBe(sourceContent);
    } else {
      // Symlink — resolved content should match
      const resolvedPath = fs.realpathSync(hookPath);
      expect(fs.readFileSync(resolvedPath, 'utf-8')).toBe(sourceContent);
    }
  });
});
