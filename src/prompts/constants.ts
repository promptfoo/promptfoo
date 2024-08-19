import { getEnvString } from '../envars';

export const PROMPT_DELIMITER = getEnvString('PROMPTFOO_PROMPT_SEPARATOR') || '---';
export const VALID_FILE_EXTENSIONS = [
  '.cjs',
  '.cts',
  '.js',
  '.json',
  '.jsonl',
  '.mjs',
  '.mts',
  '.py',
  '.ts',
  '.txt',
  '.yml',
  '.yaml',
];
