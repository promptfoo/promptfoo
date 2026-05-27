import fs from 'fs';
import os from 'os';
import path from 'path';

import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from './util/utils';

const ORIGINAL_ENV = { ...process.env };

describe('database driver', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.resetModules();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-db-driver-'));
    mockProcessEnv(
      {
        ...ORIGINAL_ENV,
        IS_TESTING: undefined,
        PROMPTFOO_CONFIG_DIR: tempDir,
        PROMPTFOO_DISABLE_WAL_MODE: 'true',
      },
      { clear: true },
    );
  });

  afterEach(async () => {
    try {
      const database = await import('../src/database/index');
      database.closeDbIfOpen();
    } catch {
      // The red-phase test intentionally breaks better-sqlite3 imports before
      // the replacement driver is implemented.
    }

    mockProcessEnv(ORIGINAL_ENV, { clear: true });
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('opens and writes without loading better-sqlite3', async () => {
    vi.doMock('better-sqlite3', () => {
      throw new Error('better-sqlite3 should not be loaded by the database driver');
    });

    const database = await import('../src/database/index');
    const db = database.getDb();

    db.run(sql`CREATE TABLE driver_smoke_test (id integer primary key, value text not null)`);
    db.run(sql`INSERT INTO driver_smoke_test (value) VALUES ('ok')`);

    const row = db.get<{ value: string }>(sql`SELECT value FROM driver_smoke_test WHERE id = 1`);
    expect(row?.value).toBe('ok');
  });
});
