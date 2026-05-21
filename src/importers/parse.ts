import logger from '../logger';
import { convertOpenAIEvalsJsonl, isOpenAIEvalsJsonlRow } from './openaiEvals';
import {
  IMPORT_SOURCE_OPENAI_EVALS,
  IMPORT_SOURCE_PROMPTFOO,
  type ParsedImportFile,
} from './types';

function tryConvertOpenAIEvals(parsedJson: unknown): ParsedImportFile | undefined {
  if (isOpenAIEvalsJsonlRow(parsedJson)) {
    return {
      source: IMPORT_SOURCE_OPENAI_EVALS,
      evalData: convertOpenAIEvalsJsonl([parsedJson]),
    };
  }
  if (
    Array.isArray(parsedJson) &&
    parsedJson.length > 0 &&
    parsedJson.every(isOpenAIEvalsJsonlRow)
  ) {
    return {
      source: IMPORT_SOURCE_OPENAI_EVALS,
      evalData: convertOpenAIEvalsJsonl(parsedJson),
    };
  }
  return undefined;
}

function parseJsonlLines(fileContent: string): unknown[] | undefined {
  const lines = fileContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return undefined;
  }

  try {
    return lines.map((line) => JSON.parse(line));
  } catch (jsonlError) {
    logger.debug(
      `Failed to parse as OpenAI Evals JSONL: ${jsonlError instanceof Error ? jsonlError.message : String(jsonlError)}`,
    );
    return undefined;
  }
}

export function parseImportFile(fileContent: string): ParsedImportFile {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(fileContent);
  } catch (jsonError) {
    const parsedRows = parseJsonlLines(fileContent);
    if (parsedRows) {
      const invalidRowIndex = parsedRows.findIndex((row) => !isOpenAIEvalsJsonlRow(row));
      if (invalidRowIndex === -1) {
        return {
          source: IMPORT_SOURCE_OPENAI_EVALS,
          evalData: convertOpenAIEvalsJsonl(parsedRows),
        };
      }
      // The file parsed cleanly as JSONL but is not a valid OpenAI Evals
      // export. Re-throwing the whole-file JSON error here would point at a
      // bogus position; report the schema mismatch and the offending row.
      throw new Error(
        `File parsed as JSONL but line ${invalidRowIndex + 1} is not a valid OpenAI Evals row. ` +
          `Expected a promptfoo eval JSON export or an OpenAI Evals JSONL export.`,
      );
    }
    throw jsonError;
  }

  const openaiResult = tryConvertOpenAIEvals(parsedJson);
  if (openaiResult !== undefined) {
    return openaiResult;
  }
  return {
    source: IMPORT_SOURCE_PROMPTFOO,
    evalData: parsedJson,
  };
}
