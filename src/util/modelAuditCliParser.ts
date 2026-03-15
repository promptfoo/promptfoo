/**
 * Utility for parsing and validating ModelAudit CLI arguments
 * Ensures compatibility between promptfoo and modelaudit CLI interfaces
 */

import { z } from 'zod';

/**
 * Zod schema for ModelAudit CLI options
 */
export const ModelAuditCliOptionsSchema = z.object({
  // Core output control
  blacklist: z.array(z.string()).optional(),
  format: z.enum(['text', 'json', 'sarif']).optional(),
  output: z.string().optional(),
  verbose: z.boolean().optional(),
  quiet: z.boolean().optional(),

  // Security behavior
  strict: z.boolean().optional(),

  // Progress & reporting
  progress: z.boolean().optional(),
  sbom: z.string().optional(),

  // Override smart detection
  timeout: z.number().positive().optional(),
  maxSize: z
    .string()
    .regex(/^\s*\d+(\.\d+)?\s*(TB|GB|MB|KB|B)\s*$/i, 'Invalid size format (e.g., 1GB, 500MB, 1 GB)')
    .optional(),

  // Preview/debugging
  dryRun: z.boolean().optional(),
  cache: z.boolean().optional(), // when false, adds --no-cache
  stream: z.boolean().optional(), // scan and delete files immediately

  // Scanner selection
  includeScanner: z.array(z.string()).optional(),
  excludeScanner: z.array(z.string()).optional(),
  profile: z.string().optional(),

  // Sharing options (promptfoo-only, not passed to modelaudit)
  share: z.boolean().optional(),
  noShare: z.boolean().optional(),
});

export type ModelAuditCliOptions = z.infer<typeof ModelAuditCliOptionsSchema>;

export const ValidatedModelAuditArgsSchema = z.object({
  args: z.array(z.string()),
  unsupportedOptions: z.array(z.string()),
});

export type ValidatedModelAuditArgs = z.infer<typeof ValidatedModelAuditArgsSchema>;

/**
 * Valid ModelAudit CLI options as of version 0.2.5
 */
export const VALID_MODELAUDIT_OPTIONS = new Set([
  '--format',
  '-f',
  '--output',
  '-o',
  '--verbose',
  '-v',
  '--quiet',
  '-q',
  '--blacklist',
  '-b',
  '--strict',
  '--progress',
  '--sbom',
  '--timeout',
  '-t',
  '--max-size',
  '--dry-run',
  '--no-cache',
  '--stream',
  '--include-scanner',
  '--exclude-scanner',
  '--profile',
]);

/**
 * Options that were removed/changed from previous versions
 */
export const DEPRECATED_OPTIONS_MAP: Record<string, string | null> = {
  '--max-file-size': '--max-size',
  '--max-total-size': null, // No equivalent
  '--registry-uri': null, // Use environment variables
  '--jfrog-api-token': null, // Use environment variables
  '--jfrog-access-token': null, // Use environment variables
  '--max-download-size': null, // No equivalent
  '--cache-dir': null, // No equivalent
  '--preview': '--dry-run',
  '--all-files': null, // No equivalent
  '--selective': null, // No equivalent
  '--skip-files': null, // No equivalent
  '--no-skip-files': null, // No equivalent
  '--strict-license': '--strict',
  '--no-large-model-support': null, // No equivalent
  '--no-progress': null, // No equivalent (progress is auto-detected)
  '--progress-log': null, // No equivalent
  '--progress-format': null, // No equivalent
  '--progress-interval': null, // No equivalent
};

/**
 * Configuration mapping from option keys to CLI arguments
 * Note: 'share' and 'noShare' are omitted as they are promptfoo-only options
 */
const CLI_ARG_MAP: Partial<
  Record<
    keyof ModelAuditCliOptions,
    {
      flag: string;
      type: 'boolean' | 'string' | 'number' | 'array' | 'inverted-boolean';
      transform?: (value: any) => string;
    }
  >
> = {
  blacklist: { flag: '--blacklist', type: 'array' },
  format: { flag: '--format', type: 'string' },
  output: { flag: '--output', type: 'string' },
  verbose: { flag: '--verbose', type: 'boolean' },
  quiet: { flag: '--quiet', type: 'boolean' },
  strict: { flag: '--strict', type: 'boolean' },
  progress: { flag: '--progress', type: 'boolean' },
  sbom: { flag: '--sbom', type: 'string' },
  timeout: { flag: '--timeout', type: 'number', transform: (v) => v.toString() },
  maxSize: { flag: '--max-size', type: 'string' },
  dryRun: { flag: '--dry-run', type: 'boolean' },
  cache: { flag: '--no-cache', type: 'inverted-boolean' },
  stream: { flag: '--stream', type: 'boolean' },
  includeScanner: { flag: '--include-scanner', type: 'array' },
  excludeScanner: { flag: '--exclude-scanner', type: 'array' },
  profile: { flag: '--profile', type: 'string' },
};

/**
 * Elegant, configuration-driven CLI argument parser
 */
export function parseModelAuditArgs(paths: string[], options: unknown): ValidatedModelAuditArgs {
  const validatedOptions = ModelAuditCliOptionsSchema.parse(options);
  const args: string[] = ['scan', ...paths];

  // Build arguments using configuration map
  for (const [key, config] of Object.entries(CLI_ARG_MAP) as Array<
    [keyof ModelAuditCliOptions, (typeof CLI_ARG_MAP)[keyof ModelAuditCliOptions]]
  >) {
    const value = validatedOptions[key];

    if (value === undefined || value === null || !config) {
      continue;
    }

    switch (config.type) {
      case 'boolean':
        if (value) {
          args.push(config.flag);
        }
        break;
      case 'inverted-boolean':
        if (value === false) {
          args.push(config.flag);
        }
        break;
      case 'string':
        args.push(config.flag, String(value));
        break;
      case 'number':
        args.push(config.flag, config.transform?.(value) ?? String(value));
        break;
      case 'array':
        if (Array.isArray(value)) {
          value.forEach((item) => args.push(config.flag, String(item)));
        }
        break;
    }
  }

  return { args, unsupportedOptions: [] };
}

/**
 * Validates that CLI arguments are supported by modelaudit
 */
export function validateModelAuditArgs(args: string[]): {
  valid: boolean;
  unsupportedArgs: string[];
} {
  const unsupportedArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Skip non-option arguments (paths, values)
    if (!arg.startsWith('--') && !arg.startsWith('-')) {
      continue;
    }

    // Skip 'scan' command
    if (arg === 'scan') {
      continue;
    }

    if (!VALID_MODELAUDIT_OPTIONS.has(arg)) {
      unsupportedArgs.push(arg);
    }
  }

  return {
    valid: unsupportedArgs.length === 0,
    unsupportedArgs,
  };
}

/**
 * Suggests replacements for deprecated options
 */
export function suggestReplacements(deprecatedOptions: string[]): Record<string, string | null> {
  const suggestions: Record<string, string | null> = {};

  for (const option of deprecatedOptions) {
    if (option in DEPRECATED_OPTIONS_MAP) {
      suggestions[option] = DEPRECATED_OPTIONS_MAP[option];
    }
  }

  return suggestions;
}

/**
 * Creates a user-friendly error message for unsupported arguments
 */
export function formatUnsupportedArgsError(unsupportedArgs: string[]): string {
  if (unsupportedArgs.length === 0) {
    return '';
  }

  const suggestions = suggestReplacements(unsupportedArgs);
  let message = `Unsupported ModelAudit arguments: ${unsupportedArgs.join(', ')}`;

  const replacements = Object.entries(suggestions)
    .filter(([_, replacement]) => replacement !== null)
    .map(([old, replacement]) => `${old} → ${replacement}`);

  const noReplacements = Object.entries(suggestions)
    .filter(([_, replacement]) => replacement === null)
    .map(([old, _]) => old);

  if (replacements.length > 0) {
    message += `\n\nSuggested replacements:\n${replacements.join('\n')}`;
  }

  if (noReplacements.length > 0) {
    message += `\n\nNo replacement available for: ${noReplacements.join(', ')}`;
    message +=
      '\nThese options may be handled automatically by modelaudit or use environment variables.';
  }

  return message;
}

/**
 * Compact validation utilities using Zod
 */
export const isValidFormat = (format: unknown): format is 'text' | 'json' | 'sarif' =>
  z.enum(['text', 'json', 'sarif']).safeParse(format).success;

export const validateModelAuditOptions = (options: unknown): ModelAuditCliOptions =>
  ModelAuditCliOptionsSchema.parse(options);

export const safeValidateModelAuditOptions = (options: unknown) => {
  const result = ModelAuditCliOptionsSchema.safeParse(options);
  return result.success
    ? { success: true as const, data: result.data }
    : { success: false as const, error: result.error };
};
