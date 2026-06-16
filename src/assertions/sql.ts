import { type Option as sqlParserOption } from 'node-sql-parser';
import { coerceString } from './utils';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleIsSql = async ({
  assertion,
  renderedValue,
  outputString,
  inverse,
}: AssertionParams): Promise<GradingResult> => {
  let pass = false;
  let databaseType: string = 'MySQL';
  let whiteTableList: string[] | undefined;
  let whiteColumnList: string[] | undefined;
  if (renderedValue && typeof renderedValue === 'object') {
    const value = renderedValue as {
      databaseType?: string;
      allowedTables?: string[];
      allowedColumns?: string[];
    };

    databaseType = value.databaseType || 'MySQL';
    whiteTableList = value.allowedTables;
    whiteColumnList = value.allowedColumns;
  }

  if (renderedValue && typeof renderedValue !== 'object') {
    throw new Error('is-sql assertion must have a object value.');
  }

  const { Parser: SqlParser } = await import('node-sql-parser').catch(() => {
    throw new Error('node-sql-parser is not installed. Please install it first');
  });

  const sqlParser = new SqlParser();

  const opt: sqlParserOption = { database: databaseType };

  const failureReasons: string[] = [];

  // Additional validations for cases not correctly detected by node-sql-parser
  const normalizedSql = outputString.trim();
  if (/`/.test(normalizedSql) && (normalizedSql.match(/`/g)?.length ?? 0) % 2 !== 0) {
    failureReasons.push(
      `SQL statement does not conform to the provided ${databaseType} database syntax.`,
    );
  }
  // Heuristic for a missing comma between columns (e.g. `SELECT a b FROM t`),
  // which node-sql-parser silently accepts as implicit aliasing. Exclude leading
  // SELECT modifiers (DISTINCT, ALL, etc.) from the first identifier slot so that
  // valid statements like `SELECT DISTINCT name FROM users` are not flagged.
  if (
    /select\s+(?!(?:distinct|distinctrow|all|high_priority|straight_join|sql_no_cache|sql_cache|sql_calc_found_rows|sql_small_result|sql_big_result|sql_buffer_result)\b)[A-Za-z_][A-Za-z0-9_]*\s+[A-Za-z_][A-Za-z0-9_]*\s+from/i.test(
      normalizedSql,
    )
  ) {
    failureReasons.push(
      `SQL statement does not conform to the provided ${databaseType} database syntax.`,
    );
  }
  if (databaseType === 'MySQL' && /\bgenerate_series\s*\(/i.test(normalizedSql)) {
    failureReasons.push(
      `SQL statement does not conform to the provided ${databaseType} database syntax.`,
    );
  }

  try {
    sqlParser.astify(outputString, opt);
    pass = !inverse;
  } catch {
    pass = inverse;
    failureReasons.push(
      `SQL statement does not conform to the provided ${databaseType} database syntax.`,
    );
  }

  if (failureReasons.length > 0) {
    pass = inverse;
  }

  if (whiteTableList) {
    opt.type = 'table';
    try {
      sqlParser.whiteListCheck(outputString, whiteTableList, opt);
    } catch (err) {
      pass = inverse;
      const error = err as Error;
      // Extract actual tables from SQL for better error message
      let actualTables: string[] = [];
      try {
        const { tableList } = sqlParser.parse(outputString, opt);
        actualTables = tableList || [];
      } catch {
        // If parsing fails, just use the original error
      }
      if (actualTables.length > 0) {
        failureReasons.push(
          `SQL references unauthorized table(s). ` +
            `Found: [${actualTables.join(', ')}]. ` +
            `Allowed: [${whiteTableList.join(', ')}].`,
        );
      } else {
        failureReasons.push(`SQL validation failed: ${error.message}.`);
      }
    }
  }

  if (whiteColumnList) {
    opt.type = 'column';
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
    try {
      sqlParser.whiteListCheck(outputString, normalizedWhiteList, opt);
    } catch (err) {
      pass = inverse;
      const error = err as Error;
      // Extract actual columns from SQL for better error message
      let actualColumns: string[] = [];
      try {
        const { columnList } = sqlParser.parse(outputString, opt);
        actualColumns = columnList || [];
      } catch {
        // If parsing fails, just use the original error
      }
      if (actualColumns.length > 0) {
        failureReasons.push(
          `SQL references unauthorized column(s). ` +
            `Found: [${actualColumns.join(', ')}]. ` +
            `Allowed: [${whiteColumnList.join(', ')}].`,
        );
      } else {
        failureReasons.push(`SQL validation failed: ${error.message}.`);
      }
    }
  }

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
