/**
 * Supported config file extensions, sorted by frequency of use.
 * Order matters: loaders try each in sequence and stop at the first match.
 */
export const DEFAULT_CONFIG_EXTENSIONS = [
  'yaml',
  'yml',
  'json',
  'cjs',
  'cts',
  'js',
  'mjs',
  'mts',
  'ts',
] as const;
