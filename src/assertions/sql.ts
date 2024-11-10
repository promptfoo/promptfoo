import { type Option as sqlParserOption } from 'node-sql-parser';
import type { Assertion, GradingResult } from '../types';
import type { AssertionValue } from '../types';
import { coerceString } from './utils';

export const handleIsSql = async (
  assertion: Assertion,
  renderedValue: AssertionValue | undefined,
  output: string | object,
  inverse: boolean,
): Promise<GradingResult> => {
  let pass = false;
  let databaseType: string = 'MySQL';
  let whiteTableList: string[] | undefined;
  let whiteColumnList: string[] | undefined;
  const outputString = coerceString(output);
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

  try {
    sqlParser.astify(outputString, opt);
    pass = !inverse;
  } catch {
    pass = inverse;
    failureReasons.push(
      `SQL statement does not conform to the provided ${databaseType} database syntax.`,
    );
  }

  if (whiteTableList) {
    opt.type = 'table';
    try {
      sqlParser.whiteListCheck(outputString, whiteTableList, opt);
    } catch (err) {
      pass = inverse;
      const error = err as Error;
      failureReasons.push(`SQL validation failed: ${error.message}.`);
    }
  }

  if (whiteColumnList) {
    opt.type = 'column';
    try {
      sqlParser.whiteListCheck(outputString, whiteColumnList, opt);
    } catch (err) {
      pass = inverse;
      const error = err as Error;
      failureReasons.push(`SQL validation failed: ${error.message}.`);
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
  assertion: Assertion,
  renderedValue: AssertionValue | undefined,
  output: string | object,
  inverse: boolean,
): Promise<GradingResult> => {
  const outputString = coerceString(output);
  const match = outputString.match(/```(?:sql)?([^`]+)```/);
  if (match) {
    const sqlCode = match[1].trim();
    return handleIsSql(assertion, renderedValue, sqlCode, inverse);
  }
  return handleIsSql(assertion, renderedValue, outputString, inverse);
};
