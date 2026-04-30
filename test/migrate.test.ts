import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNativeAddonVersionMismatchError } from './factories/nativeAddonErrors';

const mockDb = { prepare: vi.fn() };
const mockMigrate = vi.fn();
const mockGetDb = vi.fn().mockReturnValue(mockDb);
const mockGetDirectory = vi.fn();
const mockLogger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
};

vi.mock('../src/database/index', () => ({
  getDb: mockGetDb,
}));

vi.mock('../src/esm', () => ({
  getDirectory: mockGetDirectory,
}));

vi.mock('../src/logger', () => ({
  default: mockLogger,
}));

vi.mock('drizzle-orm/better-sqlite3/migrator', () => ({
  migrate: mockMigrate,
}));

describe('migrate', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    // Reset mock implementations to defaults
    mockGetDb.mockReturnValue(mockDb);
    mockMigrate.mockReset();
    mockGetDirectory.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('runDbMigrations', () => {
    it('should run migrations successfully from source directory', async () => {
      const sourceDir = '/project/src';
      mockGetDirectory.mockReturnValue(sourceDir);

      const { runDbMigrations } = await import('../src/migrate');
      await runDbMigrations();

      expect(mockGetDb).toHaveBeenCalledTimes(1);
      expect(mockMigrate).toHaveBeenCalledTimes(1);
      expect(mockMigrate).toHaveBeenCalledWith(mockDb, {
        migrationsFolder: path.join(sourceDir, '..', 'drizzle'),
      });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Running database migrations from:'),
      );
      expect(mockLogger.debug).toHaveBeenCalledWith('Database migrations completed');
    });

    it('should run migrations from bundled dist/src directory', async () => {
      const bundledDir = '/project/dist/src/server';
      mockGetDirectory.mockReturnValue(bundledDir);

      const { runDbMigrations } = await import('../src/migrate');
      await runDbMigrations();

      expect(mockMigrate).toHaveBeenCalledTimes(1);
      expect(mockMigrate).toHaveBeenCalledWith(mockDb, {
        migrationsFolder: path.join('/project/', 'dist', 'drizzle'),
      });
    });

    it('should run migrations from bundled server directory (dist/server/src)', async () => {
      const bundledDir = '/project/dist/server/src/some/path';
      mockGetDirectory.mockReturnValue(bundledDir);

      const { runDbMigrations } = await import('../src/migrate');
      await runDbMigrations();

      expect(mockMigrate).toHaveBeenCalledTimes(1);
      expect(mockMigrate).toHaveBeenCalledWith(mockDb, {
        migrationsFolder: path.join('/project/', 'dist', 'promptfoo', 'drizzle'),
      });
    });

    it('should handle nested dist/server/src path correctly', async () => {
      const bundledDir = '/app/dist/server/src/deep/nested/module';
      mockGetDirectory.mockReturnValue(bundledDir);

      const { runDbMigrations } = await import('../src/migrate');
      await runDbMigrations();

      expect(mockMigrate).toHaveBeenCalledWith(mockDb, {
        migrationsFolder: path.join('/app/', 'dist', 'promptfoo', 'drizzle'),
      });
    });

    it('should reject with error when getDb fails', async () => {
      const dbError = new Error('Database connection failed');
      mockGetDb.mockImplementation(() => {
        throw dbError;
      });
      mockGetDirectory.mockReturnValue('/project/src');

      const { runDbMigrations } = await import('../src/migrate');
      await expect(runDbMigrations()).rejects.toThrow('Database connection failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Database migration failed:'),
      );
      expect(mockMigrate).not.toHaveBeenCalled();
    });

    it('should log native addon ABI mismatches without labeling them as migration failures', async () => {
      const nativeAddonError = createNativeAddonVersionMismatchError();
      mockGetDb.mockImplementation(() => {
        throw nativeAddonError;
      });

      const { runDbMigrations } = await import('../src/migrate');
      await expect(runDbMigrations()).rejects.toBe(nativeAddonError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'SQLite dependency failed to load because better-sqlite3 was built for a different Node.js ABI.',
        {
          currentNodeVersion: process.version,
          currentNodeAbi: '137',
          installedBetterSqlite3Abi: '115',
        },
      );
      expect(mockMigrate).not.toHaveBeenCalled();
    });

    it('should demote ABI mismatch log to debug when suppressNativeAddonLogging is set', async () => {
      const nativeAddonError = createNativeAddonVersionMismatchError();
      mockGetDb.mockImplementation(() => {
        throw nativeAddonError;
      });

      const { runDbMigrations } = await import('../src/migrate');
      await expect(runDbMigrations({ suppressNativeAddonLogging: true })).rejects.toBe(
        nativeAddonError,
      );

      expect(mockLogger.error).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'SQLite dependency failed to load because better-sqlite3 was built for a different Node.js ABI.',
        {
          currentNodeVersion: process.version,
          currentNodeAbi: '137',
          installedBetterSqlite3Abi: '115',
        },
      );
      expect(mockMigrate).not.toHaveBeenCalled();
    });

    it('should reject with error when migrate fails', async () => {
      const migrationError = new Error('Migration failed: syntax error');
      mockMigrate.mockImplementation(() => {
        throw migrationError;
      });
      mockGetDirectory.mockReturnValue('/project/src');

      const { runDbMigrations } = await import('../src/migrate');
      await expect(runDbMigrations()).rejects.toThrow('Migration failed: syntax error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Database migration failed:'),
      );
    });

    it('should log the migrations folder path', async () => {
      const sourceDir = '/my/custom/path/src';
      mockGetDirectory.mockReturnValue(sourceDir);

      const { runDbMigrations } = await import('../src/migrate');
      await runDbMigrations();

      const expectedPath = path.join(sourceDir, '..', 'drizzle');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `Running database migrations from: ${expectedPath}`,
      );
    });

    it('should handle multiple sequential calls', async () => {
      mockGetDirectory.mockReturnValue('/project/src');

      const { runDbMigrations } = await import('../src/migrate');

      await runDbMigrations();
      await runDbMigrations();
      await runDbMigrations();

      expect(mockMigrate).toHaveBeenCalledTimes(3);
    });

    it('should use setImmediate to avoid blocking the event loop', async () => {
      mockGetDirectory.mockReturnValue('/project/src');

      const setImmediateSpy = vi.spyOn(globalThis, 'setImmediate');

      const { runDbMigrations } = await import('../src/migrate');
      await runDbMigrations();

      expect(setImmediateSpy).toHaveBeenCalledTimes(1);
      setImmediateSpy.mockRestore();
    });

    it('should pass the correct database instance to migrate', async () => {
      const specificDb = { id: 'test-db-instance', prepare: vi.fn() };
      mockGetDb.mockReturnValue(specificDb);
      mockGetDirectory.mockReturnValue('/project/src');

      const { runDbMigrations } = await import('../src/migrate');
      await runDbMigrations();

      expect(mockMigrate).toHaveBeenCalledWith(specificDb, expect.any(Object));
    });
  });
});
