import { type Option as sqlParserOption } from 'node-sql-parser';
import { coerceString } from './utils';

import type { AssertionParams, GradingResult } from '../types/index';

const STANDARD_SELECT_MODIFIER_PATTERN = '(?:all|distinct)';
const MYSQL_SELECT_MODIFIER_PATTERN =
  '(?:all|distinct(?:row)?|high_priority|straight_join|sql_(?:big_result|buffer_result|cache|calc_found_rows|no_cache|small_result))';
const IDENTIFIER_PATTERN = '[A-Za-z_][A-Za-z0-9_]*';

function createLikelyMissingCommaPattern(selectModifierPattern: string): RegExp {
  return new RegExp(
    String.raw`\bselect\s+(?:${selectModifierPattern}\s+)*(?!${selectModifierPattern}\b)${IDENTIFIER_PATTERN}\s+${IDENTIFIER_PATTERN}\s+from\b`,
    'i',
  );
}

const STANDARD_LIKELY_MISSING_COMMA_PATTERN = createLikelyMissingCommaPattern(
  STANDARD_SELECT_MODIFIER_PATTERN,
);
const MYSQL_LIKELY_MISSING_COMMA_PATTERN = createLikelyMissingCommaPattern(
  MYSQL_SELECT_MODIFIER_PATTERN,
);
const MYSQL_FAMILY_DATABASES = new Set(['MySQL', 'MariaDB']);
const BRACKET_IDENTIFIER_DATABASES = new Set(['TransactSQL', 'Sqlite']);
const SQL_EXPRESSION_PLACEHOLDER = ' ? ';

function getLikelyMissingCommaPattern(databaseType: string): RegExp {
  return MYSQL_FAMILY_DATABASES.has(databaseType)
    ? MYSQL_LIKELY_MISSING_COMMA_PATTERN
    : STANDARD_LIKELY_MISSING_COMMA_PATTERN;
}
const DOLLAR_QUOTE_DELIMITER_PATTERN = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/;

function readDollarQuoteDelimiter(sql: string, start: number): string | undefined {
  return DOLLAR_QUOTE_DELIMITER_PATTERN.exec(sql.slice(start))?.[0];
}

function findQuotedTextEnd(sql: string, start: number, quote: string): number {
  const closingQuote = quote === '[' ? ']' : quote;
  let cursor = start + 1;
  while (cursor < sql.length) {
    if (closingQuote !== ']' && sql[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (sql[cursor] === closingQuote) {
      if (sql[cursor + 1] === closingQuote) {
        cursor += 2;
        continue;
      }
      return cursor + 1;
    }
    cursor++;
  }
  return sql.length;
}

function stripIgnoredSqlText(sql: string, databaseType: string): string {
  const chunks: string[] = [];
  const supportsBracketIdentifiers = BRACKET_IDENTIFIER_DATABASES.has(databaseType);
  let plainTextStart = 0;
  let cursor = 0;

  while (cursor < sql.length) {
    const character = sql[cursor];
    let ignoredTextEnd: number | undefined;
    let replacement = ' ';

    if (
      character === "'" ||
      character === '"' ||
      character === '`' ||
      (character === '[' && supportsBracketIdentifiers)
    ) {
      ignoredTextEnd = findQuotedTextEnd(sql, cursor, character);
      replacement = SQL_EXPRESSION_PLACEHOLDER;
    } else if ((character === '-' && sql[cursor + 1] === '-') || character === '#') {
      ignoredTextEnd = cursor + 1;
      while (
        ignoredTextEnd < sql.length &&
        sql[ignoredTextEnd] !== '\r' &&
        sql[ignoredTextEnd] !== '\n'
      ) {
        ignoredTextEnd++;
      }
    } else if (character === '/' && sql[cursor + 1] === '*') {
      const commentEnd = sql.indexOf('*/', cursor + 2);
      ignoredTextEnd = commentEnd === -1 ? sql.length : commentEnd + 2;
    } else if (character === '$') {
      const delimiter = readDollarQuoteDelimiter(sql, cursor);
      if (delimiter) {
        const quoteEnd = sql.indexOf(delimiter, cursor + delimiter.length);
        ignoredTextEnd = quoteEnd === -1 ? sql.length : quoteEnd + delimiter.length;
        replacement = SQL_EXPRESSION_PLACEHOLDER;
      }
    }

    if (ignoredTextEnd === undefined) {
      cursor++;
      continue;
    }

    chunks.push(sql.slice(plainTextStart, cursor), replacement);
    cursor = ignoredTextEnd;
    plainTextStart = cursor;
  }

  chunks.push(sql.slice(plainTextStart));
  return chunks.join('');
}

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
  const sqlForHeuristics = stripIgnoredSqlText(normalizedSql, databaseType);
  const likelyMissingCommaPattern = getLikelyMissingCommaPattern(databaseType);
  if (likelyMissingCommaPattern.test(sqlForHeuristics)) {
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
