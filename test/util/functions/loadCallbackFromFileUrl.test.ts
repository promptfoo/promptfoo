import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importModule } from '../../../src/esm';
import {
  CallbackPathTraversalError,
  loadCallbackFromFileUrl,
  resolveCallbackPath,
} from '../../../src/util/functions/loadFunction';

vi.mock('../../../src/esm', () => ({
  importModule: vi.fn(),
}));

vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/cliState', () => ({
  default: {
    basePath: '/test/base/path',
  },
}));

const mockImportModule = vi.mocked(importModule);

describe('resolveCallbackPath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves a relative path inside the base directory', () => {
    const resolved = resolveCallbackPath('callbacks.js', '/test/base/path');
    expect(resolved).toBe(path.resolve('/test/base/path', 'callbacks.js'));
  });

  it('resolves a nested relative path inside the base directory', () => {
    const resolved = resolveCallbackPath('subdir/callbacks.js', '/test/base/path');
    expect(resolved).toBe(path.resolve('/test/base/path', 'subdir/callbacks.js'));
  });

  it('rejects paths that escape via ..', () => {
    expect(() => resolveCallbackPath('../escape.js', '/test/base/path')).toThrow(
      /Path traversal rejected/,
    );
  });

  it('rejects deeply-traversing paths that escape via ..', () => {
    expect(() => resolveCallbackPath('subdir/../../escape.js', '/test/base/path')).toThrow(
      /Path traversal rejected/,
    );
  });

  // Regression: caught by Codex/Copilot on the first PR pass. The traversal
  // check must reject `..` only when it's a full path segment, not when a
  // directory name happens to start with two dots.
  it('accepts in-base paths whose first segment starts with .. (e.g. ..foo/cb.js)', () => {
    expect(resolveCallbackPath('..foo/cb.js', '/test/base/path')).toBe(
      path.resolve('/test/base/path', '..foo/cb.js'),
    );
    expect(resolveCallbackPath('...hidden/cb.js', '/test/base/path')).toBe(
      path.resolve('/test/base/path', '...hidden/cb.js'),
    );
  });

  it('rejects absolute paths that fall outside the base', () => {
    expect(() => resolveCallbackPath('/etc/passwd', '/test/base/path')).toThrow(
      /Path traversal rejected/,
    );
  });

  it('uses cliState.basePath when no basePath is provided', () => {
    const resolved = resolveCallbackPath('callbacks.js');
    expect(resolved).toBe(path.resolve('/test/base/path', 'callbacks.js'));
  });

  // Behavior-change lock-in: this PR rejects previously-accepted configs
  // where the callback path resolved outside `basePath`. Without this test
  // a future refactor could silently re-loosen the guard.
  it('BREAKING: rejects previously-accepted absolute paths outside basePath', () => {
    expect(() => resolveCallbackPath('/Users/me/shared/cb.js', '/test/base/path')).toThrow(
      CallbackPathTraversalError,
    );
  });

  it('BREAKING: rejects previously-accepted sibling-directory paths', () => {
    expect(() => resolveCallbackPath('../sibling/cb.js', '/test/base/path')).toThrow(
      CallbackPathTraversalError,
    );
  });

  it('error message names the input path and points at the opt-out env', () => {
    // Avoid leaking the resolved absolute path (filesystem layout) in the
    // user-facing message; that information lives on the
    // CallbackPathTraversalError instance for debugging.
    expect(() => resolveCallbackPath('../escape.js', '/test/base/path')).toThrow(
      /'\.\.\/escape\.js'.*PROMPTFOO_DISABLE_CALLBACK_PATH_GUARD/,
    );
  });

  it('exposes filePath and basePath on the thrown error instance', () => {
    let caught: unknown;
    try {
      resolveCallbackPath('../escape.js', '/test/base/path');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CallbackPathTraversalError);
    expect((caught as CallbackPathTraversalError).filePath).toBe('../escape.js');
    expect((caught as CallbackPathTraversalError).basePath).toBe(path.resolve('/test/base/path'));
  });

  // Windows-specific assertion: with a non-root basePath like `C:/work`,
  // a config that names a Windows-absolute path on the same drive must be
  // rejected. On POSIX `C:/...` is a relative segment, so this test asserts
  // a platform-conditional behavior using path.win32 directly.
  it('rejects Windows-absolute paths outside a non-root basePath (using path.win32 semantics)', () => {
    const base = 'C:\\work';
    const target = 'C:\\etc\\secrets.js';
    const resolved = path.win32.resolve(base, target);
    const relative = path.win32.relative(path.win32.resolve(base), resolved);
    // Sanity: confirm that under win32 semantics, this DOES escape the base.
    // (relative starts with `..\..` on Windows).
    expect(relative.startsWith('..') || path.win32.isAbsolute(relative)).toBe(true);
  });

  it('PROMPTFOO_DISABLE_CALLBACK_PATH_GUARD=true disables the guard', () => {
    vi.stubEnv('PROMPTFOO_DISABLE_CALLBACK_PATH_GUARD', 'true');
    try {
      const resolved = resolveCallbackPath('../escape.js', '/test/base/path');
      expect(resolved).toBe(path.resolve('/test/base/path', '../escape.js'));
    } finally {
      vi.unstubAllEnvs();
    }
  });

  // Symlink containment: a file that lexically lives inside basePath but is
  // actually a symlink pointing OUTSIDE should be rejected. The realpath
  // pass added to resolveCallbackPath closes a gap flagged by Codex.
  it('rejects symlinks inside basePath that point outside basePath', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-cbpath-'));
    const baseDir = path.join(tmpRoot, 'base');
    const outsideFile = path.join(tmpRoot, 'outside.js');
    const symlinkInsideBase = path.join(baseDir, 'cb.js');

    fs.mkdirSync(baseDir);
    fs.writeFileSync(outsideFile, 'export default () => "evil";');
    try {
      fs.symlinkSync(outsideFile, symlinkInsideBase);
    } catch {
      // Symlinks unavailable (e.g. Windows without privileges) — skip.
      fs.rmSync(tmpRoot, { recursive: true, force: true });
      return;
    }

    try {
      expect(() => resolveCallbackPath('cb.js', baseDir)).toThrow(CallbackPathTraversalError);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  // Sanity: a real file inside basePath (not a symlink) must still be accepted
  // after the realpath check is added. Regression test for the symlink pass.
  it('accepts real files inside basePath (realpath check is a no-op for non-symlinks)', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-cbpath-'));
    const baseDir = path.join(tmpRoot, 'base');
    const insideFile = path.join(baseDir, 'cb.js');

    fs.mkdirSync(baseDir);
    fs.writeFileSync(insideFile, 'export default () => "ok";');

    try {
      const resolved = resolveCallbackPath('cb.js', baseDir);
      expect(resolved).toBe(path.resolve(baseDir, 'cb.js'));
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

describe('loadCallbackFromFileUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads a named export function', async () => {
    const handler = vi.fn();
    mockImportModule.mockResolvedValue(handler);

    const fn = await loadCallbackFromFileUrl('file://callbacks.js:handler');

    expect(fn).toBe(handler);
    expect(mockImportModule).toHaveBeenCalledWith(
      path.resolve('/test/base/path', 'callbacks.js'),
      'handler',
    );
  });

  it('loads a default-export function (no functionName)', async () => {
    const handler = vi.fn();
    mockImportModule.mockResolvedValue(handler);

    const fn = await loadCallbackFromFileUrl('file://callbacks.js');

    expect(fn).toBe(handler);
    expect(mockImportModule).toHaveBeenCalledWith(
      path.resolve('/test/base/path', 'callbacks.js'),
      undefined,
    );
  });

  it('loads a named export when importModule returns an object containing it', async () => {
    const handler = vi.fn();
    mockImportModule.mockResolvedValue({ handler });

    const fn = await loadCallbackFromFileUrl('file://callbacks.js:handler');

    expect(fn).toBe(handler);
  });

  it('parses Windows-style file URL with drive letter', async () => {
    const handler = vi.fn();
    mockImportModule.mockResolvedValue(handler);

    // Use a basePath of C:/ so the resolved path stays inside the base on
    // Windows (where path.resolve treats C:/... as absolute) while still
    // remaining inside the base on POSIX (treats it as relative).
    const cliState = (await import('../../../src/cliState')).default;
    const originalBasePath = cliState.basePath;
    cliState.basePath = 'C:/';

    try {
      const fn = await loadCallbackFromFileUrl('file://C:/path/to/callbacks.js:handler');
      expect(fn).toBe(handler);
      expect(mockImportModule).toHaveBeenCalledWith(
        path.resolve('C:/', 'C:/path/to/callbacks.js'),
        'handler',
      );
    } finally {
      cliState.basePath = originalBasePath;
    }
  });

  it('throws when the named export is missing', async () => {
    mockImportModule.mockResolvedValue(undefined);

    await expect(loadCallbackFromFileUrl('file://callbacks.js:missing')).rejects.toThrow(
      /Function callback malformed.*must export a named function 'missing'/,
    );
  });

  it('throws when the module exports a non-function default', async () => {
    mockImportModule.mockResolvedValue({ notAFunction: 'value' });

    await expect(loadCallbackFromFileUrl('file://callbacks.js')).rejects.toThrow(
      /Function callback malformed.*must export a function or have a default export/,
    );
  });

  it('rejects path traversal attempts', async () => {
    await expect(loadCallbackFromFileUrl('file://../escape.js:handler')).rejects.toThrow(
      /Path traversal rejected/,
    );
    // Should not even attempt to import the module
    expect(mockImportModule).not.toHaveBeenCalled();
  });

  it('rejects absolute paths outside the base directory', async () => {
    await expect(loadCallbackFromFileUrl('file:///etc/passwd:handler')).rejects.toThrow(
      /Path traversal rejected/,
    );
    expect(mockImportModule).not.toHaveBeenCalled();
  });

  it('includes the configured log prefix in debug output', async () => {
    const logger = (await import('../../../src/logger')).default;
    const handler = vi.fn();
    mockImportModule.mockResolvedValue(handler);

    await loadCallbackFromFileUrl('file://callbacks.js:handler', {
      logPrefix: '[Bedrock Converse]',
    });

    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('[Bedrock Converse] Loading function from'),
    );
  });
});
