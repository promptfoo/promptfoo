/**
 * Utility for parsing and validating ModelAudit CLI arguments
 * Ensures compatibility between promptfoo and modelaudit CLI interfaces
 */

export interface ModelAuditCliOptions {
  // Core output control
  blacklist?: string[];
  format?: 'text' | 'json' | 'sarif';
  output?: string;
  verbose?: boolean;
  quiet?: boolean;

  // Security behavior
  strict?: boolean;

  // Progress & reporting
  progress?: boolean;
  sbom?: string;

  // Override smart detection
  timeout?: number;
  maxSize?: string;

  // Preview/debugging
  dryRun?: boolean;
  cache?: boolean; // when false, adds --no-cache
}

export interface ValidatedModelAuditArgs {
  args: string[];
  unsupportedOptions: string[];
}

/**
 * Valid ModelAudit CLI options as of version 0.2.5
 */
export const VALID_MODELAUDIT_OPTIONS = new Set([
  '--format', '-f',
  '--output', '-o', 
  '--verbose', '-v',
  '--quiet', '-q',
  '--blacklist', '-b',
  '--strict',
  '--progress',
  '--sbom',
  '--timeout', '-t',
  '--max-size',
  '--dry-run',
  '--no-cache',
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
  '--stream': null, // No equivalent
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
 * Parses promptfoo CLI options into valid modelaudit arguments
 */
export function parseModelAuditArgs(
  paths: string[],
  options: ModelAuditCliOptions
): ValidatedModelAuditArgs {
  const args: string[] = ['scan', ...paths];
  const unsupportedOptions: string[] = [];

  // Core output control
  if (options.blacklist && options.blacklist.length > 0) {
    for (const pattern of options.blacklist) {
      args.push('--blacklist', pattern);
    }
  }

  if (options.format) {
    args.push('--format', options.format);
  }

  if (options.output) {
    args.push('--output', options.output);
  }

  if (options.verbose) {
    args.push('--verbose');
  }

  if (options.quiet) {
    args.push('--quiet');
  }

  // Security behavior
  if (options.strict) {
    args.push('--strict');
  }

  // Progress & reporting
  if (options.progress) {
    args.push('--progress');
  }

  if (options.sbom) {
    args.push('--sbom', options.sbom);
  }

  // Override smart detection
  if (options.timeout) {
    args.push('--timeout', options.timeout.toString());
  }

  if (options.maxSize) {
    args.push('--max-size', options.maxSize);
  }

  // Preview/debugging
  if (options.dryRun) {
    args.push('--dry-run');
  }

  if (options.cache === false) {
    args.push('--no-cache');
  }

  return {
    args,
    unsupportedOptions,
  };
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
    message += '\nThese options may be handled automatically by modelaudit or use environment variables.';
  }
  
  return message;
}

/**
 * Type guard to check if format is valid
 */
export function isValidFormat(format: string): format is 'text' | 'json' | 'sarif' {
  return ['text', 'json', 'sarif'].includes(format);
}