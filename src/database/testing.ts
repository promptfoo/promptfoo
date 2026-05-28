type TestDatabaseClient = Pick<import('@libsql/client/node').Client, 'close' | 'execute'>;

const TEST_DATABASE_CLIENTS_KEY = '__promptfooTestDatabaseClients';
type TestDatabaseGlobal = typeof globalThis & {
  [TEST_DATABASE_CLIENTS_KEY]?: Set<TestDatabaseClient>;
};

function getTestDatabaseClients(): Set<TestDatabaseClient> {
  const testGlobal = globalThis as TestDatabaseGlobal;
  return (testGlobal[TEST_DATABASE_CLIENTS_KEY] ??= new Set<TestDatabaseClient>());
}

export function registerTestDatabaseClient(client: TestDatabaseClient): void {
  getTestDatabaseClients().add(client);
}

export function unregisterTestDatabaseClient(client: TestDatabaseClient): void {
  (globalThis as TestDatabaseGlobal)[TEST_DATABASE_CLIENTS_KEY]?.delete(client);
}

export async function resetTestDatabaseClient(client: TestDatabaseClient): Promise<void> {
  const schemaObjects = await client.execute(`
    SELECT type, name
    FROM sqlite_master
    WHERE name NOT LIKE 'sqlite_%'
      AND type IN ('table', 'view', 'trigger')
    ORDER BY CASE type WHEN 'trigger' THEN 0 WHEN 'view' THEN 1 ELSE 2 END
  `);

  await client.execute('PRAGMA foreign_keys = OFF');
  try {
    for (const row of schemaObjects.rows) {
      const type = String(row.type).toUpperCase();
      if (type !== 'TABLE' && type !== 'VIEW' && type !== 'TRIGGER') {
        continue;
      }
      const name = String(row.name).replace(/"/g, '""');
      await client.execute(`DROP ${type} IF EXISTS "${name}"`);
    }
  } finally {
    await client.execute('PRAGMA foreign_keys = ON');
  }
}

export async function closeTestDatabaseClients(): Promise<void> {
  const clients = (globalThis as TestDatabaseGlobal)[TEST_DATABASE_CLIENTS_KEY];
  if (!clients) {
    return;
  }

  for (const client of clients) {
    await resetTestDatabaseClient(client);
    client.close();
  }
  clients.clear();
}
