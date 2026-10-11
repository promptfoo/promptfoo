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

/**
 * Translate validated options in schema order into CLI arguments.
 * 'share' and 'noShare' are omitted as they are promptfoo-only options.
 */
export function parseModelAuditArgs(paths: string[], options: unknown): string[] {
  const validatedOptions = ModelAuditCliOptionsSchema.parse(options);
  const args: string[] = ['scan', ...paths];

  for (const [key, value] of Object.entries(validatedOptions)) {
    if (value === undefined || key === 'share' || key === 'noShare') {
      continue;
    }
    if (key === 'cache') {
      if (value === false) {
        args.push('--no-cache');
      }
      continue;
    }

    const flag = '--' + key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
    if (typeof value === 'boolean') {
      if (value) {
        args.push(flag);
      }
    } else if (Array.isArray(value)) {
      value.forEach((item) => args.push(flag, String(item)));
    } else {
      args.push(flag, String(value));
    }
  }

  return args;
}
