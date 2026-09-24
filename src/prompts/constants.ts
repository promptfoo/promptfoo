import { getEnvString } from '../envars';

// Read at call time: --env-file and the config's `env:` block are applied after this module is imported.
export function getPromptDelimiter(): string {
  return getEnvString('PROMPTFOO_PROMPT_SEPARATOR') || '---';
}

export const VALID_FILE_EXTENSIONS = [
  '.cjs',
  '.cts',
  '.j2',
  '.js',
  '.json',
  '.jsonl',
  '.md',
  '.mjs',
  '.mts',
  '.py',
  '.ts',
  '.txt',
  '.yml',
  '.yaml',
];
