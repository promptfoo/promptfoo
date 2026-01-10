/**
 * Configuration Schema
 *
 * Zod schema for validating YAML configuration files.
 */

import { z } from 'zod';
import { CodeScanSeverity, CodeScanSeveritySchema } from '../../types/codeScan';

export const ConfigSchema = z
  .object({
    minSeverity: CodeScanSeveritySchema.optional().describe(
      'Minimum severity level for reporting vulnerabilities',
    ),
    minimumSeverity: CodeScanSeveritySchema.optional().describe('Alias for minSeverity'),
    diffsOnly: z
      .boolean()
      .prefault(false)
      .describe('Only scan PR diffs, skip filesystem exploration (default: explore full repo)'),
    apiHost: z.string().optional().describe('Scan server URL (default: https://api.promptfoo.app)'),
    guidance: z.string().optional().describe('Custom guidance for the security scan'),
    guidanceFile: z.string().optional().describe('Path to file containing custom guidance'),
  })
  .refine((data) => !(data.guidance && data.guidanceFile), {
    message: 'Cannot specify both guidance and guidanceFile',
  })
  .transform((data) => {
    // Resolve severity with precedence: minSeverity > minimumSeverity > default
    const minimumSeverity = data.minSeverity ?? data.minimumSeverity ?? CodeScanSeverity.MEDIUM;

    // Remove minimumSeverity from output (it's just an alias)
    const { minimumSeverity: _, ...rest } = data;

    return {
      ...rest,
      minimumSeverity,
    };
  });

export type Config = z.infer<typeof ConfigSchema>;

export const DEFAULT_CONFIG: Config = {
  minimumSeverity: CodeScanSeverity.MEDIUM,
  diffsOnly: false,
};
