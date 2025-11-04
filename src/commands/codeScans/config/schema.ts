/**
 * Configuration Schema
 *
 * Zod schema for validating YAML configuration files.
 */

import { z } from 'zod';
import { SeverityLevel } from '../../../types/codeScan';

// Re-export for convenience
export { SeverityLevel };

export const ConfigSchema = z
  .object({
    minSeverity: z
      .nativeEnum(SeverityLevel)
      .optional()
      .describe('Minimum severity level for reporting vulnerabilities'),
    minimumSeverity: z
      .nativeEnum(SeverityLevel)
      .optional()
      .describe('Alias for minSeverity'),
    useFilesystem: z
      .boolean()
      .default(true)
      .describe('Enable filesystem MCP server for broader codebase exploration'),
    apiKey: z
      .string()
      .optional()
      .describe('Promptfoo API key for authentication (alternative to promptfoo auth login)'),
    serverUrl: z
      .string()
      .optional()
      .describe('Scan server URL (default: https://api.promptfoo.dev)'),
  })
  .transform((data) => {
    // Resolve severity with precedence: minSeverity > minimumSeverity > default
    const minimumSeverity = data.minSeverity ?? data.minimumSeverity ?? SeverityLevel.HIGH;

    // Remove minimumSeverity from output (it's just an alias)
    const { minimumSeverity: _, ...rest } = data;

    return {
      ...rest,
      minimumSeverity,
    };
  });

export type Config = z.infer<typeof ConfigSchema>;

export const DEFAULT_CONFIG: Config = {
  minimumSeverity: SeverityLevel.HIGH,
  useFilesystem: true,
};
