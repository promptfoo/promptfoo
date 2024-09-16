import { defineConfig } from 'drizzle-kit';
import { getDbPath } from './src/database';

export default defineConfig({
  dialect: 'sqlite',
  driver: 'turso',
  schema: './src/database/tables.ts',
  out: './drizzle',
  dbCredentials: {
    url: `file:${getDbPath()}`,
  },
});
