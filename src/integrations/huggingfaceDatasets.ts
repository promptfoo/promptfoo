import Database from 'better-sqlite3';
import crypto from 'crypto';
import dedent from 'dedent';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getEnvString } from '../envars';
import { fetchWithProxy } from '../fetch';
import logger from '../logger';
import type { TestCase } from '../types';

interface HuggingFaceResponse {
  num_rows_total: number;
  num_rows_per_page: number;
  features: Array<{
    name: string;
    type: {
      dtype: string;
      _type: string;
    };
  }>;
  rows: Array<{
    row: Record<string, string>;
  }>;
}

function getTempDatabasePath(owner: string, repo: string, split: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(`${owner}/${repo}/${split}`)
    .digest('hex')
    .slice(0, 8);

  return path.join(os.tmpdir(), `promptfoo-dataset-${hash}.sqlite`);
}

function parseDatasetPath(path: string): {
  owner: string;
  repo: string;
  queryParams: URLSearchParams;
} {
  // Remove the huggingface://datasets/ prefix and split into path and query
  const [pathPart, queryPart] = path.replace('huggingface://datasets/', '').split('?');
  const [owner, repo] = pathPart.split('/');

  // Start with default parameters
  const defaultParams = new URLSearchParams({
    split: 'test',
    config: 'default',
  });

  // Parse user query parameters
  const userParams = new URLSearchParams(queryPart || '');

  // Merge user params into defaults (user params override defaults)
  const queryParams = new URLSearchParams();
  for (const [key, value] of defaultParams) {
    queryParams.set(key, value);
  }
  for (const [key, value] of userParams) {
    queryParams.set(key, value);
  }

  return { owner, repo, queryParams };
}

function createDatabase(
  dbPath: string,
  features: HuggingFaceResponse['features'],
): Database.Database {
  const db = new Database(dbPath);

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');

  // Create table with dynamic columns based on dataset features
  const columnDefs = features
    .map((feature) => {
      // Map HuggingFace types to SQLite types
      let sqlType = 'TEXT'; // Default to TEXT
      if (feature.type.dtype === 'int64' || feature.type.dtype === 'int32') {
        sqlType = 'INTEGER';
      } else if (feature.type.dtype === 'float64' || feature.type.dtype === 'float32') {
        sqlType = 'REAL';
      } else if (feature.type.dtype === 'bool') {
        sqlType = 'INTEGER'; // SQLite doesn't have boolean, use INTEGER
      }

      return `"${feature.name}" ${sqlType}`;
    })
    .join(', ');

  // Drop existing table to ensure clean state
  db.exec('DROP TABLE IF EXISTS dataset');

  const createTableSql = `CREATE TABLE dataset (${columnDefs})`;
  logger.debug(`[Huggingface Dataset] Creating table with SQL: ${createTableSql}`);
  db.exec(createTableSql);

  // Create an index on commonly queried columns
  features.forEach((feature) => {
    if (feature.name === 'type' || feature.name === 'image') {
      const createIndexSql = `CREATE INDEX IF NOT EXISTS idx_${feature.name} ON dataset ("${feature.name}")`;
      db.exec(createIndexSql);
    }
  });

  return db;
}

function insertRows(db: Database.Database, rows: Array<Record<string, any>>) {
  if (rows.length === 0) {
    return;
  }

  // Get all possible column names from all rows to handle sparse data
  const columnSet = new Set<string>();
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => columnSet.add(key));
  });
  const columns = Array.from(columnSet);

  logger.debug(`[Huggingface Dataset] Columns found in data: ${columns.join(', ')}`);
  logger.debug(`[Huggingface Dataset] Sample row data: ${JSON.stringify(rows[0], null, 2)}`);

  // Create the insert statement with all possible columns
  const placeholders = columns.map(() => '?').join(', ');
  const insertSql = `INSERT INTO dataset (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`;
  logger.debug(`[Huggingface Dataset] Insert SQL: ${insertSql}`);

  // Prepare statement outside transaction for better performance
  const stmt = db.prepare(insertSql);

  // Begin transaction
  const insertMany = db.transaction(() => {
    for (const row of rows) {
      // Ensure all columns have values, use NULL for missing ones
      const values = columns.map((col) => {
        const val = row[col];
        if (val === undefined || val === '') {
          return null;
        }
        // Convert objects and arrays to JSON strings
        if (val !== null && typeof val === 'object') {
          return JSON.stringify(val);
        }
        // Handle other primitive types
        if (
          typeof val === 'number' ||
          typeof val === 'string' ||
          typeof val === 'boolean' ||
          typeof val === 'bigint'
        ) {
          return val;
        }
        // Convert anything else to string or null
        return val?.toString() ?? null;
      });
      stmt.run(values);
    }
  });

  // Execute transaction
  insertMany();

  // Verify the insert
  const count = db.prepare('SELECT COUNT(*) as count FROM dataset').get() as { count: number };
  logger.debug(`[Huggingface Dataset] Total rows in database after insert: ${count.count}`);
}

function queryDatabase(db: Database.Database, sqlQuery: string | null, limit?: number): TestCase[] {
  try {
    let query = sqlQuery || 'SELECT * FROM dataset';

    // If there's a limit in the SQL, don't add another one
    if (limit && !query.toLowerCase().includes('limit')) {
      query = `${query} LIMIT ${limit}`;
    }

    logger.debug(`[Huggingface Dataset] Executing query: ${query}`);
    const rows = db.prepare(query).all() as Record<
      string,
      string | number | boolean | any[] | Record<string, any>
    >[];
    logger.debug(`[Huggingface Dataset] Query returned ${rows.length} rows`);
    if (rows.length > 0) {
      logger.debug(`[Huggingface Dataset] Sample result row: ${JSON.stringify(rows[0], null, 2)}`);
    }

    return rows.map((row) => ({
      vars: row,
    }));
  } catch (error) {
    logger.error(`[Huggingface Dataset] SQL query error: ${error}`);
    throw error;
  }
}

export async function fetchHuggingFaceDataset(
  datasetPath: string,
  limit?: number,
): Promise<TestCase[]> {
  const { owner, repo, queryParams } = parseDatasetPath(datasetPath);
  const split = queryParams.get('split') || 'test';
  const sqlQuery = queryParams.get('sql');

  let db: Database.Database | null = null;
  const dbPath = getTempDatabasePath(owner, repo, split);

  try {
    // Check temp database first
    if (fs.existsSync(dbPath)) {
      try {
        logger.debug(`[Huggingface Dataset] Using cached database from ${dbPath}`);
        db = new Database(dbPath);
        const count = db.prepare('SELECT COUNT(*) as count FROM dataset').get() as {
          count: number;
        };
        logger.debug(`[Huggingface Dataset] Found ${count.count} rows in cached database`);
        if (count.count > 0) {
          const results = queryDatabase(db, sqlQuery, limit);
          if (results.length > 0) {
            logger.debug(`[Huggingface Dataset] First row: ${JSON.stringify(results[0], null, 2)}`);
          }
          return results;
        }
        logger.warn(`[Huggingface Dataset] Cached database is empty, fetching fresh data`);
      } catch (error) {
        logger.warn(`[Huggingface Dataset] Error reading database: ${error}. Fetching fresh data.`);
        if (db) {
          db.close();
          db = null;
        }
        try {
          fs.unlinkSync(dbPath);
        } catch {
          // Ignore deletion errors
        }
      }
    }

    const baseUrl = 'https://datasets-server.huggingface.co/rows';
    logger.info(`[Huggingface Dataset] Fetching dataset: ${owner}/${repo} ...`);

    // Get HuggingFace token from environment
    const hfToken = getEnvString('HUGGING_FACE_HUB_TOKEN');
    const headers: Record<string, string> = {};
    if (hfToken) {
      logger.debug('[Huggingface Dataset] Using token for authentication');
      headers.Authorization = `Bearer ${hfToken}`;
    }

    let offset = 0;
    const pageSize = 100; // Number of rows per request
    const queryParamLimit = queryParams.get('limit');
    const userLimit = limit ?? (queryParamLimit ? Number.parseInt(queryParamLimit, 10) : undefined);

    while (true) {
      // Create a new URLSearchParams for this request
      const requestParams = new URLSearchParams(queryParams);
      requestParams.set('offset', offset.toString());
      requestParams.set(
        'length',
        Math.min(pageSize, userLimit ? userLimit - offset : pageSize).toString(),
      );

      const url = `${baseUrl}?dataset=${encodeURIComponent(`${owner}/${repo}`)}&${requestParams.toString()}`;
      logger.debug(`[Huggingface Dataset] Fetching page from ${url}`);

      const response = await fetchWithProxy(url, { headers });
      if (!response.ok) {
        const responseText = await response.text();
        const error = dedent`
          [Huggingface Dataset] Failed to fetch dataset:
          Status: ${response.status} ${response.statusText}
          URL: ${url}
          Response headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2)}
          Response body: ${responseText}`;
        logger.error(error);
        throw new Error(error);
      }

      const data = (await response.json()) as HuggingFaceResponse;
      if (!data.rows) {
        logger.error(
          `[Huggingface Dataset] No rows found in dataset: ${owner}/${repo}?${requestParams.toString()}`,
        );
        logger.error(`[Huggingface Dataset] Full response: ${JSON.stringify(data, null, 2)}`);
        throw new Error('[Huggingface Dataset] No rows found in dataset');
      }

      logger.debug(
        `[Huggingface Dataset] Received ${data.rows.length} rows (total: ${data.num_rows_total})`,
      );

      // Initialize database on first batch
      if (offset === 0) {
        logger.debug(`[Huggingface Dataset] Dataset features: ${JSON.stringify(data.features)}`);
        logger.debug(
          dedent`[Huggingface Dataset] Using query parameters:
          ${Object.fromEntries(queryParams)}`,
        );
        db = createDatabase(dbPath, data.features);
      }

      // Insert rows into database
      const rowsToInsert = data.rows.map(({ row }) => row);
      insertRows(db!, rowsToInsert);

      logger.debug(`[Huggingface Dataset] Inserted ${rowsToInsert.length} rows into database`);

      // Check if we've reached user's limit or end of dataset
      if (userLimit && offset + data.rows.length >= userLimit) {
        logger.debug(`[Huggingface Dataset] Reached user-specified limit of ${userLimit}`);
        break;
      }

      // Check if we've fetched all rows
      if (offset + data.rows.length >= data.num_rows_total) {
        logger.debug('[Huggingface Dataset] Finished fetching all rows');
        break;
      }

      offset += data.rows.length;
      logger.debug(`[Huggingface Dataset] Fetching next page starting at offset ${offset}`);
    }

    // Query the database to get results
    const results = queryDatabase(db!, sqlQuery, limit);
    logger.debug(
      `[Huggingface Dataset] Successfully loaded ${results.length} test cases after filtering`,
    );
    return results;
  } finally {
    if (db) {
      db.close();
    }
  }
}
