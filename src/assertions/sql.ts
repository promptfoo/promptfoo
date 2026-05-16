import { type Option as sqlParserOption } from 'node-sql-parser';
import { coerceString } from './utils';

import type { AssertionParams, GradingResult } from '../types/index';

interface SqlParserLike {
  astify(sql: string, opt: sqlParserOption): unknown;
  whiteListCheck(sql: string, whiteList: string[], opt: sqlParserOption): void;
  parse(sql: string, opt: sqlParserOption): { tableList?: string[]; columnList?: string[] };
}

export const handleIsSql = async ({
  assertion,
  renderedValue,
  outputString,
  inverse,
}: AssertionParams): Promise<GradingResult> => {
  const { databaseType, whiteTableList, whiteColumnList } = parseSqlAssertionValue(renderedValue);
  const { Parser: SqlParser } = await import('node-sql-parser').catch(() => {
    throw new Error('node-sql-parser is not installed. Please install it first');
  });
  const sqlParser = new SqlParser();
  const opt: sqlParserOption = { database: databaseType };
  const failureReasons: string[] = [];
  let pass = validateSqlSyntax(sqlParser, outputString, databaseType, opt, inverse, failureReasons);
  if (failureReasons.length > 0) {
    pass = inverse;
  }
  pass = validateAllowedTables(
    sqlParser,
    outputString,
    whiteTableList,
    opt,
    inverse,
    failureReasons,
    pass,
  );
  pass = validateAllowedColumns(
    sqlParser,
    outputString,
    whiteColumnList,
    opt,
    inverse,
    failureReasons,
    pass,
  );
  if (inverse && pass === false && failureReasons.length === 0) {
    failureReasons.push('The output SQL statement is valid');
  }

  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass ? 'Assertion passed' : failureReasons.join(' '),
    assertion,
  };
};

function parseSqlAssertionValue(renderedValue: unknown): {
  databaseType: string;
  whiteTableList?: string[];
  whiteColumnList?: string[];
} {
  if (renderedValue && typeof renderedValue !== 'object') {
    throw new Error('is-sql assertion must have a object value.');
  }
  if (!renderedValue) {
    return { databaseType: 'MySQL' };
  }
  const value = renderedValue as {
    databaseType?: string;
    allowedTables?: string[];
    allowedColumns?: string[];
  };
  return {
    databaseType: value.databaseType || 'MySQL',
    whiteTableList: value.allowedTables,
    whiteColumnList: value.allowedColumns,
  };
}

function validateSqlSyntax(
  sqlParser: SqlParserLike,
  outputString: string,
  databaseType: string,
  opt: sqlParserOption,
  inverse: boolean,
  failureReasons: string[],
): boolean {
  addParserGapFailures(outputString, databaseType, failureReasons);
  try {
    sqlParser.astify(outputString, opt);
    return !inverse;
  } catch {
    failureReasons.push(
      `SQL statement does not conform to the provided ${databaseType} database syntax.`,
    );
    return inverse;
  }
}

function addParserGapFailures(
  outputString: string,
  databaseType: string,
  failureReasons: string[],
): void {
  const normalizedSql = outputString.trim();
  const syntaxFailure = `SQL statement does not conform to the provided ${databaseType} database syntax.`;
  if (/`/.test(normalizedSql) && (normalizedSql.match(/`/g)?.length ?? 0) % 2 !== 0) {
    failureReasons.push(syntaxFailure);
  }
  if (/select\s+[A-Za-z_][A-Za-z0-9_]*\s+[A-Za-z_][A-Za-z0-9_]*\s+from/i.test(normalizedSql)) {
    failureReasons.push(syntaxFailure);
  }
  if (databaseType === 'MySQL' && /\bgenerate_series\s*\(/i.test(normalizedSql)) {
    failureReasons.push(syntaxFailure);
  }
}

function validateAllowedTables(
  sqlParser: SqlParserLike,
  outputString: string,
  whiteTableList: string[] | undefined,
  opt: sqlParserOption,
  inverse: boolean,
  failureReasons: string[],
  pass: boolean,
): boolean {
  if (!whiteTableList) {
    return pass;
  }
  opt.type = 'table';
  try {
    sqlParser.whiteListCheck(outputString, whiteTableList, opt);
    return pass;
  } catch (err) {
    failureReasons.push(
      buildUnauthorizedListReason(sqlParser, outputString, opt, whiteTableList, err, 'table'),
    );
    return inverse;
  }
}

function validateAllowedColumns(
  sqlParser: SqlParserLike,
  outputString: string,
  whiteColumnList: string[] | undefined,
  opt: sqlParserOption,
  inverse: boolean,
  failureReasons: string[],
  pass: boolean,
): boolean {
  if (!whiteColumnList) {
    return pass;
  }
  opt.type = 'column';
  try {
    sqlParser.whiteListCheck(outputString, normalizeColumnWhiteList(whiteColumnList), opt);
    return pass;
  } catch (err) {
    failureReasons.push(
      buildUnauthorizedListReason(sqlParser, outputString, opt, whiteColumnList, err, 'column'),
    );
    return inverse;
  }
}

function normalizeColumnWhiteList(whiteColumnList: string[]): string[] {
  const normalizedWhiteList = [...whiteColumnList];
  for (const item of whiteColumnList) {
    const parts = item.split('::');
    if (parts.length === 3 && parts[1] !== 'null') {
      const alt = `${parts[0]}::null::${parts[2]}`;
      if (!normalizedWhiteList.includes(alt)) {
        normalizedWhiteList.push(alt);
      }
    }
  }
  return normalizedWhiteList;
}

function buildUnauthorizedListReason(
  sqlParser: SqlParserLike,
  outputString: string,
  opt: sqlParserOption,
  whiteList: string[],
  err: unknown,
  kind: 'table' | 'column',
): string {
  const actualItems = extractActualSqlItems(sqlParser, outputString, opt, kind);
  if (actualItems.length > 0) {
    return (
      `SQL references unauthorized ${kind}(s). ` +
      `Found: [${actualItems.join(', ')}]. ` +
      `Allowed: [${whiteList.join(', ')}].`
    );
  }
  return `SQL validation failed: ${(err as Error).message}.`;
}

function extractActualSqlItems(
  sqlParser: SqlParserLike,
  outputString: string,
  opt: sqlParserOption,
  kind: 'table' | 'column',
): string[] {
  try {
    const parsed = sqlParser.parse(outputString, opt);
    return kind === 'table' ? parsed.tableList || [] : parsed.columnList || [];
  } catch {
    return [];
  }
}

export const handleContainsSql = async (
  assertionParams: AssertionParams,
): Promise<GradingResult> => {
  const match = coerceString(assertionParams.outputString).match(/```(?:sql)?([^`]+)```/);
  if (match) {
    const sqlCode = match[1].trim();
    return handleIsSql({ ...assertionParams, outputString: sqlCode });
  }
  return handleIsSql(assertionParams);
};
