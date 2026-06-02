type TestDatabaseClient = Pick<import('@libsql/client/node').Client, 'close' | 'execute'>;

const TEST_DATABASE_CLIENTS_KEY = '__promptfooTestDatabaseClients';
const TEST_DATABASE_OPERATION_QUEUE_KEY = '__promptfooTestDatabaseOperationQueue';
type TestDatabaseGlobal = typeof globalThis & {
  [TEST_DATABASE_CLIENTS_KEY]?: Set<TestDatabaseClient>;
  [TEST_DATABASE_OPERATION_QUEUE_KEY]?: Promise<void>;
};

function getTestDatabaseClients(): Set<TestDatabaseClient> {
  const testGlobal = globalThis as TestDatabaseGlobal;
  return (testGlobal[TEST_DATABASE_CLIENTS_KEY] ??= new Set<TestDatabaseClient>());
}

function enqueueTestDatabaseOperation<T>(operation: () => Promise<T> | T): Promise<T> {
  const testGlobal = globalThis as TestDatabaseGlobal;
  const result = (testGlobal[TEST_DATABASE_OPERATION_QUEUE_KEY] ?? Promise.resolve()).then(
    operation,
  );
  testGlobal[TEST_DATABASE_OPERATION_QUEUE_KEY] = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function registerTestDatabaseClient(client: TestDatabaseClient): Promise<void> {
  await enqueueTestDatabaseOperation(() => {
    getTestDatabaseClients().add(client);
  });
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

export async function closeTestDatabaseClient(client: TestDatabaseClient): Promise<void> {
  await enqueueTestDatabaseOperation(async () => {
    const clients = (globalThis as TestDatabaseGlobal)[TEST_DATABASE_CLIENTS_KEY];
    if (!clients?.delete(client)) {
      client.close();
      return;
    }

    try {
      // libsql requires a process-wide shared in-memory cache for its internal
      // connections. Reset it only after the final module graph has stopped using it.
      if (clients.size === 0) {
        await resetTestDatabaseClient(client);
      }
    } finally {
      client.close();
    }
  });
}

export async function closeTestDatabaseClients(): Promise<void> {
  await enqueueTestDatabaseOperation(async () => {
    const clients = (globalThis as TestDatabaseGlobal)[TEST_DATABASE_CLIENTS_KEY];
    if (!clients?.size) {
      return;
    }

    const clientsToClose = [...clients];
    const resetClient = clientsToClose.pop()!;
    clients.clear();

    try {
      for (const client of clientsToClose) {
        client.close();
      }
      await resetTestDatabaseClient(resetClient);
    } finally {
      resetClient.close();
    }
  });
}
