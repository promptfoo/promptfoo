import { type Parser as SqlParserType, type Option as sqlParserOption } from 'node-sql-parser';
import { coerceString } from './utils';

import type { AssertionParams, GradingResult } from '../types/index';

function extractSqlConfig(renderedValue: AssertionParams['renderedValue']): {
  databaseType: string;
  whiteTableList: string[] | undefined;
  whiteColumnList: string[] | undefined;
} {
  let databaseType = 'MySQL';
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
  } else if (renderedValue && typeof renderedValue !== 'object') {
    throw new Error('is-sql assertion must have a object value.');
  }

  return { databaseType, whiteTableList, whiteColumnList };
}

function checkSyntaxViolations(normalizedSql: string, databaseType: string): string[] {
  const reasons: string[] = [];
  const syntaxMsg = `SQL statement does not conform to the provided ${databaseType} database syntax.`;

  if (/`/.test(normalizedSql) && (normalizedSql.match(/`/g)?.length ?? 0) % 2 !== 0) {
    reasons.push(syntaxMsg);
  }
  if (/select\s+[A-Za-z_][A-Za-z0-9_]*\s+[A-Za-z_][A-Za-z0-9_]*\s+from/i.test(normalizedSql)) {
    reasons.push(syntaxMsg);
  }
  if (databaseType === 'MySQL' && /\bgenerate_series\s*\(/i.test(normalizedSql)) {
    reasons.push(syntaxMsg);
  }
  return reasons;
}

function checkTableWhitelist(
  sqlParser: SqlParserType,
  outputString: string,
  whiteTableList: string[],
  opt: sqlParserOption,
): string[] {
  try {
    sqlParser.whiteListCheck(outputString, whiteTableList, { ...opt, type: 'table' });
    return [];
  } catch (err) {
    let actualTables: string[] = [];
    try {
      const { tableList } = sqlParser.parse(outputString, { ...opt, type: 'table' });
      actualTables = tableList || [];
    } catch {
      // If parsing fails, fall back to the original error message
    }
    if (actualTables.length > 0) {
      return [
        `SQL references unauthorized table(s). ` +
          `Found: [${actualTables.join(', ')}]. ` +
          `Allowed: [${whiteTableList.join(', ')}].`,
      ];
    }
    return [`SQL validation failed: ${(err as Error).message}.`];
  }
}

function buildNormalizedColumnWhitelist(whiteColumnList: string[]): string[] {
  const normalized = [...whiteColumnList];
  for (const item of whiteColumnList) {
    const parts = item.split('::');
    if (parts.length === 3 && parts[1] !== 'null') {
      const alt = `${parts[0]}::null::${parts[2]}`;
      if (!normalized.includes(alt)) {
        normalized.push(alt);
      }
    }
  }
  return normalized;
}

function checkColumnWhitelist(
  sqlParser: SqlParserType,
  outputString: string,
  whiteColumnList: string[],
  opt: sqlParserOption,
): string[] {
  const normalizedWhiteList = buildNormalizedColumnWhitelist(whiteColumnList);
  try {
    sqlParser.whiteListCheck(outputString, normalizedWhiteList, { ...opt, type: 'column' });
    return [];
  } catch (err) {
    let actualColumns: string[] = [];
    try {
      const { columnList } = sqlParser.parse(outputString, { ...opt, type: 'column' });
      actualColumns = columnList || [];
    } catch {
      // If parsing fails, fall back to the original error message
    }
    if (actualColumns.length > 0) {
      return [
        `SQL references unauthorized column(s). ` +
          `Found: [${actualColumns.join(', ')}]. ` +
          `Allowed: [${whiteColumnList.join(', ')}].`,
      ];
    }
    return [`SQL validation failed: ${(err as Error).message}.`];
  }
}

export const handleIsSql = async ({
  assertion,
  renderedValue,
  outputString,
  inverse,
}: AssertionParams): Promise<GradingResult> => {
  const { databaseType, whiteTableList, whiteColumnList } = extractSqlConfig(renderedValue);

  const { Parser: SqlParser } = await import('node-sql-parser').catch(() => {
    throw new Error('node-sql-parser is not installed. Please install it first');
  });

  const sqlParser = new SqlParser();
  const opt: sqlParserOption = { database: databaseType };

  const failureReasons: string[] = [];

  const normalizedSql = outputString.trim();
  failureReasons.push(...checkSyntaxViolations(normalizedSql, databaseType));

  let pass: boolean;
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
    const tableErrors = checkTableWhitelist(sqlParser, outputString, whiteTableList, opt);
    if (tableErrors.length > 0) {
      pass = inverse;
      failureReasons.push(...tableErrors);
    }
  }

  if (whiteColumnList) {
    const columnErrors = checkColumnWhitelist(sqlParser, outputString, whiteColumnList, opt);
    if (columnErrors.length > 0) {
      pass = inverse;
      failureReasons.push(...columnErrors);
    }
  }

  if (inverse && !pass && failureReasons.length === 0) {
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
