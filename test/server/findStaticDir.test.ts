import path from 'node:path';
import type { PathLike } from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fs before importing the module - spread original to keep other functions working
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(),
    },
  };
});

vi.mock('../../src/esm', () => ({
  getDirectory: vi.fn(),
}));

vi.mock('../../src/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock other server dependencies to prevent initialization errors
vi.mock('../../src/migrate', () => ({
  runDbMigrations: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/database/signal', () => ({
  setupSignalWatcher: vi.fn().mockReturnValue({ close: vi.fn(), on: vi.fn() }),
  readSignalEvalId: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/util/server', () => ({
  BrowserBehavior: { OPEN: 0, SKIP: 1, ASK: 2 },
  BrowserBehaviorNames: { 0: 'OPEN', 1: 'SKIP', 2: 'ASK' },
  openBrowser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/models/eval', () => ({
  default: { latest: vi.fn().mockResolvedValue(null) },
  getEvalSummaries: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/globalConfig/cloud', () => ({
  cloudConfig: { isEnabled: vi.fn().mockReturnValue(false) },
}));

import fs from 'node:fs';

import { getDirectory } from '../../src/esm';
import logger from '../../src/logger';
import { findStaticDir } from '../../src/server/server';

describe('findStaticDir', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns standard path when index.html exists there (development)', () => {
    // Simulate development: getDirectory returns 'src/', app is at 'src/app/'
    vi.mocked(getDirectory).mockReturnValue('/project/src');
    vi.mocked(fs.existsSync).mockImplementation((filePath: PathLike) => {
      // Standard path check: /project/src/app/index.html
      return String(filePath) === path.join('/project/src', 'app', 'index.html');
    });

    const result = findStaticDir();

    expect(result).toBe(path.join('/project/src', 'app'));
    expect(logger.debug).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('returns parent path when bundled (standard path missing, parent exists)', () => {
    // Simulate bundled: getDirectory returns 'dist/src/server/', app is at 'dist/src/app/'
    vi.mocked(getDirectory).mockReturnValue('/project/dist/src/server');
    vi.mocked(fs.existsSync).mockImplementation((filePath: PathLike) => {
      const pathStr = String(filePath);
      // Standard path doesn't exist
      if (pathStr === path.join('/project/dist/src/server', 'app', 'index.html')) {
        return false;
      }
      // Parent path exists: /project/dist/src/app/index.html
      if (pathStr === path.resolve('/project/dist/src/server', '..', 'app', 'index.html')) {
        return true;
      }
      return false;
    });

    const result = findStaticDir();

    expect(result).toBe(path.resolve('/project/dist/src/server', '..', 'app'));
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Static directory resolved to parent'),
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('falls back to standard path with warning when neither path exists', () => {
    vi.mocked(getDirectory).mockReturnValue('/project/dist/src/server');
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = findStaticDir();

    // Should return standard path as fallback
    expect(result).toBe(path.join('/project/dist/src/server', 'app'));
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Static directory not found'));
  });

  it('checks index.html in both paths before falling back', () => {
    vi.mocked(getDirectory).mockReturnValue('/test/dir');
    vi.mocked(fs.existsSync).mockReturnValue(false);

    findStaticDir();

    // Should have checked both paths
    expect(fs.existsSync).toHaveBeenCalledWith(path.join('/test/dir', 'app', 'index.html'));
    expect(fs.existsSync).toHaveBeenCalledWith(
      path.resolve('/test/dir', '..', 'app', 'index.html'),
    );
  });

  it('prefers standard path over parent path when both exist', () => {
    vi.mocked(getDirectory).mockReturnValue('/project/src');
    // Both paths have index.html
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const result = findStaticDir();

    // Should return standard path (first check wins)
    expect(result).toBe(path.join('/project/src', 'app'));
    expect(logger.debug).not.toHaveBeenCalled();
  });
});
