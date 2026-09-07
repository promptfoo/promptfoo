/**
 * Utility for translating Promptfoo ModelAudit options to CLI arguments.
 */

import { z } from 'zod';

const ModelAuditCliOptionsSchema = z.object({
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
  scanners: z.array(z.string()).optional(),
  excludeScanner: z.array(z.string()).optional(),
  listScanners: z.boolean().optional(),

  // Sharing options (promptfoo-only, not passed to modelaudit)
  share: z.boolean().optional(),
  noShare: z.boolean().optional(),
});

type ModelAuditCliOptions = z.infer<typeof ModelAuditCliOptionsSchema>;

interface ParsedModelAuditArgs {
  args: string[];
  unsupportedOptions: [];
}

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
  scanners: { flag: '--scanners', type: 'array' },
  excludeScanner: { flag: '--exclude-scanner', type: 'array' },
  listScanners: { flag: '--list-scanners', type: 'boolean' },
};

/**
 * Elegant, configuration-driven CLI argument parser
 */
export function parseModelAuditArgs(paths: string[], options: unknown): ParsedModelAuditArgs {
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
