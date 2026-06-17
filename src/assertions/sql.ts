import { type Option as sqlParserOption } from 'node-sql-parser';
import { coerceString } from './utils';

import type { AssertionParams, GradingResult } from '../types/index';

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
  if (/`/.test(normalizedSql) && (normalizedSql.match(/`/g)?.length ?? 0) % 2 !== 0) {
    failureReasons.push(
      `SQL statement does not conform to the provided ${databaseType} database syntax.`,
    );
  }
  if (/select\s+[A-Za-z_][A-Za-z0-9_]*\s+[A-Za-z_][A-Za-z0-9_]*\s+from/i.test(normalizedSql)) {
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

const FENCE_START_PATTERN = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*([^\r\n]*)$/;
const FENCE_END_PATTERN = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/;

function extractSqlCodeBlocks(output: string): string[] {
  const sqlBlocks: string[] = [];
  let activeBlock:
    | { body: string[]; fenceCharacter: string; fenceLength: number; isSql: boolean }
    | undefined;

  for (const line of output.split(/\r\n?|\n/)) {
    if (!activeBlock) {
      const openingFence = FENCE_START_PATTERN.exec(line);
      if (openingFence) {
        const fence = openingFence[1];
        const language = openingFence[2].trim().toLowerCase();
        activeBlock = {
          body: [],
          fenceCharacter: fence[0],
          fenceLength: fence.length,
          isSql: language === '' || language === 'sql',
        };
      }
      continue;
    }

    const closingFence = FENCE_END_PATTERN.exec(line)?.[1];
    if (
      closingFence?.[0] === activeBlock.fenceCharacter &&
      closingFence.length >= activeBlock.fenceLength
    ) {
      if (activeBlock.isSql) {
        sqlBlocks.push(activeBlock.body.join('\n').trim());
      }
      activeBlock = undefined;
    } else {
      activeBlock.body.push(line);
    }
  }

  return sqlBlocks;
}

export const handleContainsSql = async (
  assertionParams: AssertionParams,
): Promise<GradingResult> => {
  const outputString = coerceString(assertionParams.outputString);
  const sqlBlocks = extractSqlCodeBlocks(outputString);
  const candidates = sqlBlocks.length > 0 ? sqlBlocks : [outputString];
  let failureReason = 'Output does not contain valid SQL';
  let containsValidSql = false;

  for (const candidate of candidates) {
    if (candidate.trim().length === 0) {
      continue;
    }
    const result = await handleIsSql({
      ...assertionParams,
      outputString: candidate,
      inverse: false,
    });
    if (result.pass) {
      containsValidSql = true;
      break;
    }
    failureReason = result.reason;
  }

  const pass = assertionParams.inverse ? !containsValidSql : containsValidSql;
  return {
    assertion: assertionParams.assertion,
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : containsValidSql
        ? 'The output SQL statement is valid'
        : failureReason,
  };
};
