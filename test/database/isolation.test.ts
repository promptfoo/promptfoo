import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as DatabaseModule from '../../src/database/index';

describe('database test isolation', () => {
  const openedModules: Array<typeof DatabaseModule> = [];

  afterEach(async () => {
    await Promise.all(openedModules.map((databaseModule) => databaseModule.closeDb()));
    openedModules.length = 0;
    vi.resetModules();
  });

  it('does not share the testing database between isolated module instances', async () => {
    const firstDatabaseModule = await import('../../src/database/index');
    openedModules.push(firstDatabaseModule);
    const firstDb = await firstDatabaseModule.getDb();
    await firstDb.run('CREATE TABLE isolated_module_marker (id TEXT PRIMARY KEY)');

    vi.resetModules();
    const secondDatabaseModule = await import('../../src/database/index');
    openedModules.push(secondDatabaseModule);
    const secondDb = await secondDatabaseModule.getDb();

    await expect(secondDb.all('SELECT id FROM isolated_module_marker')).rejects.toThrow();
  });
});
