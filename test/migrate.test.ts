import { jest } from '@jest/globals';
import path from 'path';

// Use jest.mock instead of jest.unstable_mockModule for compatibility with TypeScript and jest
jest.mock('drizzle-orm/better-sqlite3/migrator', () => {
  return {
    migrate: jest.fn(),
  };
});

jest.mock('../src/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../src/database', () => ({
  getDb: jest.fn(() => ({})),
}));

describe('migrate', () => {
  let runDbMigrationsModule: any;
  let loggerModule: any;
  let migrate: any;

  beforeAll(async () => {
    // Import after mocks are set up
    runDbMigrationsModule = await import('../src/migrate');
    loggerModule = (await import('../src/logger')).default;
    migrate = (await import('drizzle-orm/better-sqlite3/migrator')).migrate;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    migrate.mockReset();
    loggerModule.debug.mockReset();
    loggerModule.error.mockReset();
  });

  it('should run migrations successfully', async () => {
    const migrationsFolder = path.join(runDbMigrationsModule.currentDir, '..', 'drizzle');

    migrate.mockResolvedValueOnce(undefined as any);

    await runDbMigrationsModule.runDbMigrations();

    expect(migrate).toHaveBeenCalledTimes(1);
    expect(migrate).toHaveBeenCalledWith(expect.anything(), { migrationsFolder });
    expect(loggerModule.debug).toHaveBeenCalledWith(
      `[DB Migrate] Running migrations from ${migrationsFolder}...`,
    );
    expect(loggerModule.debug).toHaveBeenCalledWith('[DB Migrate] Migrations completed');
  });

  it('should handle migration errors', async () => {
    const error = new Error('Migration failed');

    migrate.mockImplementationOnce(() => Promise.reject(error as any));

    await runDbMigrationsModule.runDbMigrations();

    expect(migrate).toHaveBeenCalledTimes(1);
    expect(loggerModule.error).toHaveBeenCalledWith(
      'Error running database migrations: Error: Migration failed',
    );
  });

  it('should set currentDir correctly', () => {
    expect(runDbMigrationsModule.currentDir).toBeDefined();
    expect(typeof runDbMigrationsModule.currentDir).toBe('string');
    expect(path.isAbsolute(runDbMigrationsModule.currentDir)).toBe(true);
    // currentDir should be the directory of src/migrate.ts, which is .../src
    expect(runDbMigrationsModule.currentDir.endsWith('src')).toBe(true);
  });

  it('should handle invalid migration folder path', async () => {
    const error = new Error('Invalid migrations folder path');

    migrate.mockImplementationOnce(() => Promise.reject(error as any));

    await runDbMigrationsModule.runDbMigrations();

    expect(migrate).toHaveBeenCalledTimes(1);
    expect(loggerModule.error).toHaveBeenCalledWith(
      'Error running database migrations: Error: Invalid migrations folder path',
    );
  });

  it('should handle database connection errors', async () => {
    const error = new Error('Database connection failed');

    migrate.mockImplementationOnce(() => Promise.reject(error as any));

    await runDbMigrationsModule.runDbMigrations();

    expect(migrate).toHaveBeenCalledTimes(1);
    expect(loggerModule.error).toHaveBeenCalledWith(
      'Error running database migrations: Error: Database connection failed',
    );
  });
});
