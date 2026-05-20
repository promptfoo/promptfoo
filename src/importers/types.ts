import type { OpenAIEvalsImportResult } from './openaiEvals';

export const IMPORT_SOURCE_OPENAI_EVALS = 'openai-evals-jsonl';
export const IMPORT_SOURCE_PROMPTFOO = 'promptfoo-json';

export type ImportSource =
  | typeof IMPORT_SOURCE_OPENAI_EVALS
  | typeof IMPORT_SOURCE_PROMPTFOO;

export type ParsedImportFile =
  | { source: typeof IMPORT_SOURCE_OPENAI_EVALS; evalData: OpenAIEvalsImportResult }
  | { source: typeof IMPORT_SOURCE_PROMPTFOO; evalData: unknown };
