import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeTestDatabaseClient,
  closeTestDatabaseClients,
  registerTestDatabaseClient,
  resetTestDatabaseClient,
} from '../../src/database/testing';
import { mockProcessEnv } from '../util/utils';

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
});
