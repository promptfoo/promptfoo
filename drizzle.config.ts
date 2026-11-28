import { defineConfig } from 'drizzle-kit';
import { getDbPath } from './src/database';
import { getEnvString } from './src/envars';

// A hosted libSQL/Turso database is configured when TURSO_CONNECTION_URL is set.
// Otherwise drizzle-kit keeps using the local database it has always used.
const tursoUrl = getEnvString('TURSO_CONNECTION_URL');
const tursoAuthToken = getEnvString('TURSO_AUTH_TOKEN');

export default defineConfig({
  dialect: 'turso',
  schema: './src/database/tables.ts',
  out: './drizzle',
  dbCredentials: {
    url: tursoUrl ?? `file:${getDbPath()}`,
    ...(tursoUrl && tursoAuthToken ? { authToken: tursoAuthToken } : {}),
  },
});
