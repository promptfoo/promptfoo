import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = { prepare: vi.fn() };
const mockMigrate = vi.fn();
const mockGetDb = vi.fn().mockResolvedValue(mockDb);
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

vi.mock('drizzle-orm/libsql/migrator', () => ({
  migrate: mockMigrate,
}));

function makeBindingError(target = 'darwin-arm64'): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(
    `Cannot find module '@libsql/${target}'\nRequire stack:\n- /app/node_modules/libsql/index.js`,
  );
  error.code = 'MODULE_NOT_FOUND';
  return error;
}

describe('migrate', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    // Reset mock implementations to defaults
    mockGetDb.mockResolvedValue(mockDb);
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

      expect(mockMigrate).toHaveBeenCalledWith(mockDb, {
        migrationsFolder: path.join('/project/', 'dist', 'drizzle'),
      });
    });

    it('should run migrations from bundled server directory (dist/server/src)', async () => {
      const bundledDir = '/project/dist/server/src/some/path';
      mockGetDirectory.mockReturnValue(bundledDir);

      const { runDbMigrations } = await import('../src/migrate');
      await runDbMigrations();

      expect(mockMigrate).toHaveBeenCalledWith(mockDb, {
        migrationsFolder: path.join('/project/', 'dist', 'promptfoo', 'drizzle'),
      });
    });

    it('should reject with error when getDb fails', async () => {
      const dbError = new Error('Database connection failed');
      mockGetDb.mockRejectedValue(dbError);
      mockGetDirectory.mockReturnValue('/project/src');

      const { runDbMigrations } = await import('../src/migrate');
      await expect(runDbMigrations()).rejects.toThrow('Database connection failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Database migration failed:'),
      );
      expect(mockMigrate).not.toHaveBeenCalled();
    });

    it('should log libsql binding miss with structured context instead of "migration failed"', async () => {
      const bindingError = makeBindingError('linux-x64-gnu');
      mockGetDb.mockRejectedValue(bindingError);
      mockGetDirectory.mockReturnValue('/project/src');

      const { runDbMigrations } = await import('../src/migrate');
      await expect(runDbMigrations()).rejects.toBe(bindingError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'SQLite dependency failed to load because the libsql platform binding is missing.',
        {
          platform: `${process.platform}-${process.arch}`,
          missingPackage: '@libsql/linux-x64-gnu',
        },
      );
      expect(mockMigrate).not.toHaveBeenCalled();
    });

    it('should demote binding-miss log to debug when suppressBindingErrorLogging is set', async () => {
      const bindingError = makeBindingError('darwin-arm64');
      mockGetDb.mockRejectedValue(bindingError);
      mockGetDirectory.mockReturnValue('/project/src');

      const { runDbMigrations } = await import('../src/migrate');
      await expect(runDbMigrations({ suppressBindingErrorLogging: true })).rejects.toBe(
        bindingError,
      );

      expect(mockLogger.error).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'SQLite dependency failed to load because the libsql platform binding is missing.',
        {
          platform: `${process.platform}-${process.arch}`,
          missingPackage: '@libsql/darwin-arm64',
        },
      );
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

    it('should pass the correct database instance to migrate', async () => {
      const specificDb = { id: 'test-db-instance', prepare: vi.fn() };
      mockGetDb.mockResolvedValue(specificDb);
      mockGetDirectory.mockReturnValue('/project/src');

      const { runDbMigrations } = await import('../src/migrate');
      await runDbMigrations();

      expect(mockMigrate).toHaveBeenCalledWith(specificDb, expect.any(Object));
    });
  });
});
