import { type DatabaseSync, type StatementResultingChanges, type StatementSync } from 'node:sqlite';

import { NoopCache } from 'drizzle-orm/cache/core';
import { Column } from 'drizzle-orm/column';
import { entityKind, is } from 'drizzle-orm/entity';
import { DefaultLogger, type Logger, NoopLogger } from 'drizzle-orm/logger';
import { type MigrationConfig, readMigrationFiles } from 'drizzle-orm/migrator';
import {
  createTableRelationsHelpers,
  extractTablesRelationalConfig,
  type TablesRelationalConfig,
} from 'drizzle-orm/relations';
import { fillPlaceholders, type Query, SQL, sql } from 'drizzle-orm/sql/sql';
import { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core/db';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core/dialect';
import {
  SQLitePreparedQuery as PreparedQueryBase,
  type PreparedQueryConfig,
  type SQLiteExecuteMethod,
  SQLiteSession,
  SQLiteTransaction,
  type SQLiteTransactionConfig,
} from 'drizzle-orm/sqlite-core/session';
import { Subquery } from 'drizzle-orm/subquery';
import { getTableName } from 'drizzle-orm/table';
import type { SelectedFieldsOrdered } from 'drizzle-orm/sqlite-core/query-builders/select.types';
import type { DrizzleConfig } from 'drizzle-orm/utils';

type NodeSqliteRunResult = StatementResultingChanges;
type DriverValueDecoderLike = { mapFromDriverValue(value: unknown): unknown };
type SelectedField = SelectedFieldsOrdered[number]['field'];

export type NodeSqliteDatabase<TSchema extends Record<string, unknown> = Record<string, never>> =
  BaseSQLiteDatabase<'sync', NodeSqliteRunResult, TSchema> & {
    $client: DatabaseSync;
  };

class NodeSqliteSession<
  TFullSchema extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
> extends SQLiteSession<'sync', NodeSqliteRunResult, TFullSchema, TSchema> {
  static readonly [entityKind] = 'NodeSqliteSession';

  private logger: Logger;
  private cache: NoopCache;

  constructor(
    private client: DatabaseSync,
    private sqliteDialect: SQLiteSyncDialect,
    private schema:
      | {
          fullSchema: TFullSchema;
          schema: TSchema;
          tableNamesMap: Record<string, string>;
        }
      | undefined,
    options: { logger?: Logger } = {},
  ) {
    super(sqliteDialect);
    this.logger = options.logger ?? new NoopLogger();
    this.cache = new NoopCache();
  }

  prepareQuery(
    query: Query,
    fields: SelectedFieldsOrdered | undefined,
    executeMethod: SQLiteExecuteMethod,
    isResponseInArrayMode: boolean,
    customResultMapper?: (
      rows: unknown[][],
      mapColumnValue?: (value: unknown) => unknown,
    ) => unknown,
    queryMetadata?: { type: 'select' | 'update' | 'delete' | 'insert'; tables: string[] },
  ) {
    const stmt = this.client.prepare(query.sql);
    return new NodeSqlitePreparedQuery(
      stmt,
      query,
      this.logger,
      this.cache,
      queryMetadata,
      fields,
      executeMethod,
      isResponseInArrayMode,
      customResultMapper,
    );
  }

  transaction<T>(
    transaction: (tx: SQLiteTransaction<'sync', NodeSqliteRunResult, TFullSchema, TSchema>) => T,
    config: SQLiteTransactionConfig = {},
  ): T {
    const tx = new NodeSqliteTransaction('sync', this.sqliteDialect, this, this.schema);
    this.run(sql.raw(`begin${config.behavior ? ` ${config.behavior}` : ''}`));
    try {
      const result = transaction(tx);
      this.run(sql`commit`);
      return result;
    } catch (err) {
      this.run(sql`rollback`);
      throw err;
    }
  }
}

class NodeSqliteTransaction<
  TFullSchema extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
> extends SQLiteTransaction<'sync', NodeSqliteRunResult, TFullSchema, TSchema> {
  static readonly [entityKind] = 'NodeSqliteTransaction';

  constructor(
    resultType: 'sync',
    private sqliteDialect: SQLiteSyncDialect,
    private sqliteSession: SQLiteSession<'sync', NodeSqliteRunResult, TFullSchema, TSchema>,
    private sqliteSchema:
      | {
          fullSchema: TFullSchema;
          schema: TSchema;
          tableNamesMap: Record<string, string>;
        }
      | undefined,
    nestedIndex = 0,
  ) {
    super(resultType, sqliteDialect, sqliteSession, sqliteSchema, nestedIndex);
  }

  transaction<T>(transaction: (tx: NodeSqliteTransaction<TFullSchema, TSchema>) => T): T {
    const savepointName = `sp${this.nestedIndex}`;
    const tx = new NodeSqliteTransaction(
      'sync',
      this.sqliteDialect,
      this.sqliteSession,
      this.sqliteSchema,
      this.nestedIndex + 1,
    );
    this.sqliteSession.run(sql.raw(`savepoint ${savepointName}`));
    try {
      const result = transaction(tx);
      this.sqliteSession.run(sql.raw(`release savepoint ${savepointName}`));
      return result;
    } catch (err) {
      this.sqliteSession.run(sql.raw(`rollback to savepoint ${savepointName}`));
      throw err;
    }
  }
}

class NodeSqlitePreparedQuery extends PreparedQueryBase<
  PreparedQueryConfig & { type: 'sync'; run: NodeSqliteRunResult }
> {
  static readonly [entityKind] = 'NodeSqlitePreparedQuery';

  constructor(
    private stmt: StatementSync,
    query: Query,
    private logger: Logger,
    cache: NoopCache,
    queryMetadata:
      | { type: 'select' | 'update' | 'delete' | 'insert'; tables: string[] }
      | undefined,
    private fields: SelectedFieldsOrdered | undefined,
    executeMethod: SQLiteExecuteMethod,
    private isResponseInArrayModeValue: boolean,
    private customResultMapper?: (
      rows: unknown[][],
      mapColumnValue?: (value: unknown) => unknown,
    ) => unknown,
  ) {
    super('sync', executeMethod, query, cache, queryMetadata);
  }

  run(placeholderValues?: Record<string, unknown>): NodeSqliteRunResult {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);
    return this.stmt.run(...toSqliteParams(params));
  }

  all(placeholderValues?: Record<string, unknown>) {
    const { fields, customResultMapper } = this;
    if (!fields && !customResultMapper) {
      const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
      this.logger.logQuery(this.query.sql, params);
      return this.stmt.all(...toSqliteParams(params)).map(normalizeRowObject);
    }

    const rows = this.values(placeholderValues);
    if (customResultMapper) {
      return customResultMapper(rows, normalizeFieldValue);
    }
    return rows.map((row) => mapResultRow(fields!, row, getJoinsNotNullableMap(this)));
  }

  get(placeholderValues?: Record<string, unknown>) {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);

    const { fields, customResultMapper } = this;
    if (!fields && !customResultMapper) {
      const row = this.stmt.get(...toSqliteParams(params));
      return row ? normalizeRowObject(row) : undefined;
    }

    const row = getArrayRow(this.stmt, params);
    if (!row) {
      return undefined;
    }
    if (customResultMapper) {
      return customResultMapper([row], normalizeFieldValue);
    }
    return mapResultRow(fields!, row, getJoinsNotNullableMap(this));
  }

  values(placeholderValues?: Record<string, unknown>): unknown[][] {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);
    return getArrayRows(this.stmt, params);
  }

  isResponseInArrayMode() {
    return this.isResponseInArrayModeValue;
  }
}

function construct<TSchema extends Record<string, unknown> = Record<string, never>>(
  client: DatabaseSync,
  config: DrizzleConfig<TSchema> = {},
): NodeSqliteDatabase<TSchema> {
  const dialect = new SQLiteSyncDialect({ casing: config.casing });
  let logger: Logger | undefined;
  if (config.logger === true) {
    logger = new DefaultLogger();
  } else if (config.logger !== false) {
    logger = config.logger;
  }

  let schema:
    | {
        fullSchema: TSchema;
        schema: TablesRelationalConfig;
        tableNamesMap: Record<string, string>;
      }
    | undefined;
  if (config.schema) {
    const tablesConfig = extractTablesRelationalConfig(config.schema, createTableRelationsHelpers);
    schema = {
      fullSchema: config.schema,
      schema: tablesConfig.tables,
      tableNamesMap: tablesConfig.tableNamesMap,
    };
  }

  const session = new NodeSqliteSession(client, dialect, schema, { logger });
  const db = new BaseSQLiteDatabase(
    'sync',
    dialect,
    session,
    schema,
  ) as NodeSqliteDatabase<TSchema>;
  db.$client = client;
  return db;
}

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
  client: DatabaseSync,
  config?: DrizzleConfig<TSchema>,
): NodeSqliteDatabase<TSchema> {
  return construct(client, config);
}

export function migrate<TSchema extends Record<string, unknown>>(
  db: NodeSqliteDatabase<TSchema>,
  config: MigrationConfig,
) {
  const migrations = readMigrationFiles(config);
  const drizzleDb = db as unknown as {
    dialect: SQLiteSyncDialect;
    session: SQLiteSession<
      'sync',
      NodeSqliteRunResult,
      Record<string, unknown>,
      TablesRelationalConfig
    >;
  };
  drizzleDb.dialect.migrate(migrations, drizzleDb.session, config);
}

function toSqliteParams(params: unknown[]) {
  return params.map((param) => {
    if (param instanceof Date) {
      return param.getTime();
    }
    return param as null | number | bigint | string | NodeJS.ArrayBufferView;
  });
}

function getArrayRows(stmt: StatementSync, params: unknown[]): unknown[][] {
  const sqliteParams = toSqliteParams(params);
  if ('setReturnArrays' in stmt && typeof stmt.setReturnArrays === 'function') {
    stmt.setReturnArrays(true);
    return (stmt.all(...sqliteParams) as unknown as unknown[][]).map((row) =>
      row.map(normalizeFieldValue),
    );
  }
  return stmt
    .all(...sqliteParams)
    .map((row) => Object.values(row).map((value) => normalizeFieldValue(value)));
}

function getArrayRow(stmt: StatementSync, params: unknown[]): unknown[] | undefined {
  const sqliteParams = toSqliteParams(params);
  if ('setReturnArrays' in stmt && typeof stmt.setReturnArrays === 'function') {
    stmt.setReturnArrays(true);
    const row = stmt.get(...sqliteParams) as unknown[] | undefined;
    return row?.map(normalizeFieldValue);
  }
  const row = stmt.get(...sqliteParams);
  return row ? Object.values(row).map((value) => normalizeFieldValue(value)) : undefined;
}

function normalizeRowObject(row: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, normalizeFieldValue(value)]),
  );
}

function normalizeFieldValue(value: unknown) {
  if (value instanceof Uint8Array && typeof Buffer !== 'undefined' && !(value instanceof Buffer)) {
    return Buffer.from(value);
  }
  return value;
}

function getJoinsNotNullableMap(query: NodeSqlitePreparedQuery) {
  return (query as unknown as { joinsNotNullableMap?: Record<string, boolean> })
    .joinsNotNullableMap;
}

function mapResultRow(
  columns: SelectedFieldsOrdered,
  row: unknown[],
  joinsNotNullableMap?: Record<string, boolean>,
) {
  const nullifyMap: Record<string, string | false> = {};
  const result = columns.reduce<Record<string, unknown>>((result, { path, field }, columnIndex) => {
    const rawValue = row[columnIndex];
    const value = rawValue === null ? null : getDecoder(field).mapFromDriverValue(rawValue);
    setNestedValue(result, path, value);
    trackNullableJoin(nullifyMap, field, path, value);
    return result;
  }, {});

  if (joinsNotNullableMap && Object.keys(nullifyMap).length > 0) {
    for (const [objectName, tableName] of Object.entries(nullifyMap)) {
      if (typeof tableName === 'string' && !joinsNotNullableMap[tableName]) {
        result[objectName] = null;
      }
    }
  }
  return result;
}

function getDecoder(field: SelectedField): DriverValueDecoderLike {
  if (is(field, Column)) {
    return field;
  }
  if (is(field, SQL)) {
    return (field as unknown as { decoder: DriverValueDecoderLike }).decoder;
  }
  if (is(field, Subquery)) {
    return (field as unknown as { _: { sql: { decoder: DriverValueDecoderLike } } })._.sql.decoder;
  }
  return (field as unknown as { sql: { decoder: DriverValueDecoderLike } }).sql.decoder;
}

function setNestedValue(result: Record<string, unknown>, path: string[], value: unknown) {
  let node = result;
  for (const [pathChunkIndex, pathChunk] of path.entries()) {
    if (pathChunkIndex === path.length - 1) {
      node[pathChunk] = value;
      return;
    }
    if (!isRecord(node[pathChunk])) {
      node[pathChunk] = {};
    }
    node = node[pathChunk] as Record<string, unknown>;
  }
}

function trackNullableJoin(
  nullifyMap: Record<string, string | false>,
  field: SelectedField,
  path: string[],
  value: unknown,
) {
  if (!is(field, Column) || path.length !== 2) {
    return;
  }

  const objectName = path[0];
  const tableName = getTableName(field.table);
  if (!(objectName in nullifyMap)) {
    nullifyMap[objectName] = value === null ? tableName : false;
  } else if (typeof nullifyMap[objectName] === 'string' && nullifyMap[objectName] !== tableName) {
    nullifyMap[objectName] = false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
