import { type Option as sqlParserOption } from 'node-sql-parser';
import { coerceString } from './utils';

import type { AssertionParams, GradingResult } from '../types/index';

const SELECT_MODIFIER_PATTERN =
  '(?:all|distinct(?:row)?|high_priority|straight_join|sql_(?:big_result|buffer_result|cache|calc_found_rows|no_cache|small_result))';
const IDENTIFIER_PATTERN = '[A-Za-z_][A-Za-z0-9_]*';
const LIKELY_MISSING_COMMA_PATTERN = new RegExp(
  String.raw`\bselect\s+(?:${SELECT_MODIFIER_PATTERN}\s+)*(?!${SELECT_MODIFIER_PATTERN}\b)${IDENTIFIER_PATTERN}\s+${IDENTIFIER_PATTERN}\s+from\b`,
  'i',
);
const SQL_IGNORED_TEXT_PATTERN =
  /(?<dollarQuote>\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$)[\s\S]*?\k<dollarQuote>|'(?:''|\\[\s\S]|[^'\\])*'|"(?:""|\\[\s\S]|[^"\\])*"|`(?:``|\\[\s\S]|[^`\\])*`|\[(?:\]\]|[^\]])*\]|--[^\r\n]*|#[^\r\n]*|\/\*[\s\S]*?\*\//g;
type SqlParserConstructor = typeof import('node-sql-parser').Parser;
type SqlParserModule = {
  Parser?: SqlParserConstructor;
  default?: { Parser?: SqlParserConstructor };
};

async function createSqlParser() {
  let sqlParserModule: SqlParserModule;
  try {
    sqlParserModule = await import('node-sql-parser');
  } catch {
    throw new Error('node-sql-parser is not installed. Please install it first');
  }

  const SqlParser = sqlParserModule.Parser ?? sqlParserModule.default?.Parser;
  if (!SqlParser) {
    throw new Error('node-sql-parser is not installed. Please install it first');
  }
  return new SqlParser();
}

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

  const sqlParser = await createSqlParser();

  const opt: sqlParserOption = { database: databaseType };

  const failureReasons: string[] = [];

  // Additional validations for cases not correctly detected by node-sql-parser
  const normalizedSql = outputString.trim();
  if (normalizedSql.length === 0) {
    failureReasons.push(
      `SQL statement does not conform to the provided ${databaseType} database syntax.`,
    );
  }
  if (/`/.test(normalizedSql) && (normalizedSql.match(/`/g)?.length ?? 0) % 2 !== 0) {
    failureReasons.push(
      `SQL statement does not conform to the provided ${databaseType} database syntax.`,
    );
  }
  // node-sql-parser accepts a missing comma as implicit aliasing. Ignore leading
  // SELECT modifiers and SQL-looking text inside literals or comments, then check
  // the first two column tokens.
  const sqlForHeuristics = normalizedSql.replace(SQL_IGNORED_TEXT_PATTERN, ' ');
  if (LIKELY_MISSING_COMMA_PATTERN.test(sqlForHeuristics)) {
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
