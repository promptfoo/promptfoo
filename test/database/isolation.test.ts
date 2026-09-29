import { createClient } from '@libsql/client/node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeTestDatabaseClient,
  closeTestDatabaseClients,
  registerTestDatabaseClient,
  resetTestDatabaseClient,
} from '../../src/database/testing';
import { sleep } from '../../src/util/time';
import { mockProcessEnv } from '../util/utils';

// Mirror of the testing database URL in src/database/index.ts. The test database is a
// process-wide shared-cache in-memory libsql DB so its internal connections see one schema.
const SHARED_CACHE_MEMORY_URL = 'file::memory:?cache=shared';

describe('database test isolation', () => {
  afterEach(async () => {
    await closeTestDatabaseClients();
    vi.resetModules();
  });

  it('keeps the testing database intact until the last isolated module instance closes', async () => {
    const firstDatabaseModule = await import('../../src/database/index');
    const firstDb = await firstDatabaseModule.getDb();
    await firstDb.run('CREATE TABLE isolated_module_marker (id TEXT PRIMARY KEY)');
    await firstDb.run("INSERT INTO isolated_module_marker VALUES ('first')");

    vi.resetModules();
    const secondDatabaseModule = await import('../../src/database/index');
    const secondDb = await secondDatabaseModule.getDb();

    await expect(secondDb.all('SELECT id FROM isolated_module_marker')).resolves.toEqual([
      { id: 'first' },
    ]);

    await firstDatabaseModule.closeDb();
    await expect(secondDb.all('SELECT id FROM isolated_module_marker')).resolves.toEqual([
      { id: 'first' },
    ]);

    await secondDatabaseModule.closeDb();
    vi.resetModules();

    const thirdDatabaseModule = await import('../../src/database/index');
    const thirdDb = await thirdDatabaseModule.getDb();
    await expect(thirdDb.all('SELECT id FROM isolated_module_marker')).rejects.toThrow();
  });

  it('drops supported schema objects while escaping their identifiers', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          { type: 'table', name: 'table"name' },
          { type: 'view', name: 'isolated_view' },
          { type: 'trigger', name: 'isolated_trigger' },
          { type: 'index', name: 'ignored_index' },
        ],
      })
      .mockResolvedValue({ rows: [] });
    const client = {
      close: vi.fn(),
      execute,
    } as unknown as Parameters<typeof resetTestDatabaseClient>[0];

    await resetTestDatabaseClient(client);

    expect(execute).toHaveBeenCalledWith('DROP TABLE IF EXISTS "table""name"');
    expect(execute).toHaveBeenCalledWith('DROP VIEW IF EXISTS "isolated_view"');
    expect(execute).toHaveBeenCalledWith('DROP TRIGGER IF EXISTS "isolated_trigger"');
    expect(execute).not.toHaveBeenCalledWith('DROP INDEX IF EXISTS "ignored_index"');
    expect(execute).toHaveBeenLastCalledWith('PRAGMA foreign_keys = ON');
  });

  it('waits for schema cleanup before registering another client', async () => {
    let resolveSchemaQuery!: (value: { rows: never[] }) => void;
    const firstClient = {
      close: vi.fn(),
      execute: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveSchemaQuery = resolve;
            }),
        )
        .mockResolvedValue({ rows: [] }),
    } as unknown as Parameters<typeof registerTestDatabaseClient>[0];
    const secondClient = {
      close: vi.fn(),
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    } as unknown as Parameters<typeof registerTestDatabaseClient>[0];

    await registerTestDatabaseClient(firstClient);
    const closePromise = closeTestDatabaseClient(firstClient);
    await vi.waitFor(() => expect(firstClient.execute).toHaveBeenCalledTimes(1));

    let registrationFinished = false;
    const registerPromise = registerTestDatabaseClient(secondClient).then(() => {
      registrationFinished = true;
    });
    await Promise.resolve();
    expect(registrationFinished).toBe(false);

    resolveSchemaQuery({ rows: [] });
    await closePromise;
    await registerPromise;
    expect(registrationFinished).toBe(true);

    await closeTestDatabaseClient(secondClient);
    expect(firstClient.close).toHaveBeenCalledOnce();
    expect(secondClient.close).toHaveBeenCalledOnce();
  });

  it('uses the initialization mode when the environment changes before close', async () => {
    const firstDatabaseModule = await import('../../src/database/index');
    const firstDb = await firstDatabaseModule.getDb();
    await firstDb.run('CREATE TABLE env_change_marker (id TEXT PRIMARY KEY)');

    const restoreEnv = mockProcessEnv({ IS_TESTING: undefined });
    try {
      await firstDatabaseModule.closeDb();
    } finally {
      restoreEnv();
    }

    vi.resetModules();
    const secondDatabaseModule = await import('../../src/database/index');
    const secondDb = await secondDatabaseModule.getDb();

    await expect(secondDb.all('SELECT id FROM env_change_marker')).rejects.toThrow();
  });

  // Regression: shared-cache uses table-level locks, so a read that overlaps another
  // connection's open write transaction fails immediately with SQLITE_LOCKED_SHAREDCACHE
  // (busy_timeout only covers SQLITE_BUSY). libsql runs interactive transactions on their
  // own connections, so a prior writer's lock can briefly outlive the JS promise that
  // settled it — which is what made `import`'s collision check (Eval.findById's
  // `SELECT ... FROM evals`) flake. Top-level statements now retry the transient lock
  // instead of throwing, riding through the window without weakening isolation.
  it('retries a read locked by another connection until the lock releases, without dirty reads', async () => {
    const databaseModule = await import('../../src/database/index');
    const db = await databaseModule.getDb();
    await db.run('CREATE TABLE lock_probe (id TEXT PRIMARY KEY)');
    await db.run("INSERT INTO lock_probe VALUES ('committed')");

    // Independent connection to the same shared cache, holding an open write lock on the
    // probe table — standing in for libsql's lingering interactive-transaction connection.
    const lockHolder = createClient({ url: SHARED_CACHE_MEMORY_URL });
    const writeTx = await lockHolder.transaction('write');
    await writeTx.execute("INSERT INTO lock_probe VALUES ('uncommitted')");

    // Top-level read through the serialized main connection (exactly like Eval.findById).
    // It contends with the held lock; without the retry it rejects immediately with
    // SQLITE_LOCKED. Capture the outcome so the still-pending read never rejects unhandled.
    const readOutcome = db
      .all('SELECT id FROM lock_probe ORDER BY id')
      .then((rows) => ({ rows }))
      .catch((error) => ({ error }));

    // Release the lock — discarding the uncommitted row — while the read is still retrying.
    await sleep(30);
    await writeTx.rollback();
    lockHolder.close();

    // The read rode through the lock and observed only the committed row: the retry never
    // exposed the rolled-back 'uncommitted' write, so isolation stays production-like.
    expect(await readOutcome).toEqual({ rows: [{ id: 'committed' }] });

    await databaseModule.closeDb();
  });
});
