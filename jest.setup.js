/* eslint-disable jest/require-top-level-describe */
import betterSqlite3 from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'fs';
import nock from 'nock';
import { getDb, getDbPath } from './src/database';

// process.env.PROMPTFOO_CONFIG_DIR = './.jest';
// const dbPath = getDbPath();
// if (fs.existsSync(dbPath)) {
//   fs.unlinkSync(dbPath);
//   console.log(`Deleted existing database file: ${dbPath}`);
// }
// beforeAll(async () => {
//   // Ensure migrations run before all tests
//   const db = getDb();
//   await migrate(db, { migrationsFolder: './drizzle' });
//   console.log('Database migrated');
// });

// Disable all real network requests
nock.disableNetConnect();

nock.emitter.on('no match', (req) => {
  console.error(`Unexpected HTTP request: ${req.method} ${req.href}`);
});
