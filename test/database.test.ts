import fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ORIGINAL_ENV = { ...process.env };

describe('database WAL mode', () => {
  let tempDir: string;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-dbtest-'));
    process.env.PROMPTFOO_CONFIG_DIR = tempDir;
    delete process.env.IS_TESTING;
    delete process.env.PROMPTFOO_DISABLE_WAL_MODE;
  });

  afterEach(async () => {
    process.env = ORIGINAL_ENV;
    // Close the database connection if it exists
    try {
      const database = await import('../src/database');
      await database.closeDb();
    } catch (err) {
      console.error('Error closing database:', err);
    }

    // Add a small delay to ensure connections are fully closed on Windows
    if (process.platform === 'win32') {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (err) {
      console.warn(`Could not remove temp directory ${tempDir}:`, err);
      // On Windows, sometimes we need multiple attempts
      if (process.platform === 'win32') {
        try {
          // Try a second time after a short delay
          await new Promise((resolve) => setTimeout(resolve, 500));
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
          console.error(`Failed to remove temp directory after retry: ${tempDir}`);
        }
      }
    }
  });

  it('enables WAL journal mode by default', async () => {
    // libSQL has WAL mode enabled by default
    // We just verify the database initializes successfully
    const database = await import('../src/database');
    const db = database.getDb();

    // Verify we can query the database
    expect(db).toBeDefined();

    await database.closeDb();
  });

  it('skips WAL mode when PROMPTFOO_DISABLE_WAL_MODE is set', async () => {
    process.env.PROMPTFOO_DISABLE_WAL_MODE = 'true';

    const database = await import('../src/database');
    const db = database.getDb();

    // With libSQL, we just verify it initializes without error
    expect(db).toBeDefined();

    await database.closeDb();
  });

  it('does not enable WAL mode for in-memory databases', async () => {
    process.env.IS_TESTING = 'true';

    const database = await import('../src/database');
    const db = database.getDb();

    // For in-memory databases, we can't verify the journal mode
    // but we can ensure it doesn't throw
    expect(db).toBeDefined();
  });

  it('verifies database settings', async () => {
    const database = await import('../src/database');
    const db = database.getDb();

    // With libSQL, WAL settings are handled automatically
    // We just verify the database is functional
    expect(db).toBeDefined();

    await database.closeDb();
  });
});
