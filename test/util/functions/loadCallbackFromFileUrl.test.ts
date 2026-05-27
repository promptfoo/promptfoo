import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importModule } from '../../../src/esm';
import {
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
      /Path traversal detected/,
    );
  });

  it('rejects deeply-traversing paths that escape via ..', () => {
    expect(() => resolveCallbackPath('subdir/../../escape.js', '/test/base/path')).toThrow(
      /Path traversal detected/,
    );
  });

  it('rejects absolute paths that fall outside the base', () => {
    expect(() => resolveCallbackPath('/etc/passwd', '/test/base/path')).toThrow(
      /Path traversal detected/,
    );
  });

  it('uses cliState.basePath when no basePath is provided', () => {
    // cliState.basePath is mocked to '/test/base/path'
    const resolved = resolveCallbackPath('callbacks.js');
    expect(resolved).toBe(path.resolve('/test/base/path', 'callbacks.js'));
  });

  it('error message includes both the input and resolved paths', () => {
    expect(() => resolveCallbackPath('../escape.js', '/test/base/path')).toThrow(
      /'\.\.\/escape\.js'.*is not within '.*test.*base.*path'/,
    );
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
      /Path traversal detected/,
    );
    // Should not even attempt to import the module
    expect(mockImportModule).not.toHaveBeenCalled();
  });

  it('rejects absolute paths outside the base directory', async () => {
    await expect(loadCallbackFromFileUrl('file:///etc/passwd:handler')).rejects.toThrow(
      /Path traversal detected/,
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
