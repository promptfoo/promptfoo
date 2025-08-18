import { defineConfig } from 'drizzle-kit';
import { getDbPath } from './src/database';

// Determine database URL based on environment variables
const getDatabaseUrl = () => {
  const tursoUrl = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
  const useTurso = process.env.PROMPTFOO_USE_TURSO === 'true';
  
  if (useTurso && tursoUrl) {
    return tursoUrl;
  }
  
  return `file:${getDbPath()}`;
};

const getDatabaseCredentials = () => {
  const tursoUrl = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
  const useTurso = process.env.PROMPTFOO_USE_TURSO === 'true';
  
  if (useTurso && tursoUrl) {
    return {
      url: tursoUrl,
      authToken: process.env.TURSO_AUTH_TOKEN,
    };
  }
  
  return {
    url: `file:${getDbPath()}`,
  };
};

export default defineConfig({
  dialect: 'turso',
  schema: './src/database/tables.ts',
  out: './drizzle',
  dbCredentials: getDatabaseCredentials(),
});
