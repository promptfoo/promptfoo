import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeTestDatabaseClients, resetTestDatabaseClient } from '../../src/database/testing';

describe('database test isolation', () => {
  afterEach(async () => {
    await closeTestDatabaseClients();
    vi.resetModules();
  });

  it('does not share the testing database between live isolated module instances', async () => {
    const firstDatabaseModule = await import('../../src/database/index');
    const firstDb = await firstDatabaseModule.getDb();
    await firstDb.run('CREATE TABLE isolated_module_marker (id TEXT PRIMARY KEY)');
    await firstDb.run("INSERT INTO isolated_module_marker VALUES ('first')");

    vi.resetModules();
    const secondDatabaseModule = await import('../../src/database/index');
    const secondDb = await secondDatabaseModule.getDb();

    await expect(secondDb.all('SELECT id FROM isolated_module_marker')).rejects.toThrow();
    await expect(firstDb.all('SELECT id FROM isolated_module_marker')).resolves.toEqual([
      { id: 'first' },
    ]);
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
});
