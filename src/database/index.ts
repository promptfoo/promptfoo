import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as path from 'path';
import { getConfigDirectoryPath } from '../util/config/manage';

let dbInstance: ReturnType<typeof drizzle> | null = null;

export function getDbPath() {
  return path.resolve(getConfigDirectoryPath(true /* createIfNotExists */), 'promptfoo.db');
}

export function getDbSignalPath() {
  return path.resolve(getConfigDirectoryPath(true /* createIfNotExists */), 'evalLastWritten');
}

export function getDb() {
  if (!dbInstance) {
    const sqlite = new Database(getDbPath());
    dbInstance = drizzle(sqlite);
  }
  return dbInstance;
}
