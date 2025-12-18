/**
 * Configuration Generator
 *
 * Generates YAML config file from action inputs
 */

import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { type ScanConfig, ScanConfigSchema, validateSeverity } from '../../src/types/codeScan';

/**
 * Generate a temporary YAML config file from action inputs
 * @param minimumSeverity Minimum severity level
 * @param guidance Optional custom guidance text
 * @returns Path to temporary config file
 */
export function generateConfigFile(minimumSeverity: string, guidance?: string): string {
  // Validate severity input (throws ZodError if invalid)
  const validatedSeverity = validateSeverity(minimumSeverity);

  const config: ScanConfig = {
    minimumSeverity: validatedSeverity,
    diffsOnly: false, // Always enable full repo exploration for GitHub Actions (never diffs-only)
    guidance,
  };

  // Validate the entire config object for additional safety
  const validatedConfig = ScanConfigSchema.parse(config);

  // Create temp file
  const tempDir = os.tmpdir();
  const configPath = path.join(tempDir, `code-scan-config-${randomUUID()}.yaml`);

  // Write YAML
  let yamlContent = `minimumSeverity: ${validatedConfig.minimumSeverity}\ndiffsOnly: ${validatedConfig.diffsOnly}\n`;
  if (guidance) {
    // Properly escape YAML string using literal block scalar
    const guidanceYaml = guidance.includes('\n')
      ? `guidance: |\n  ${guidance.split('\n').join('\n  ')}\n`
      : `guidance: ${JSON.stringify(guidance)}\n`;
    yamlContent += guidanceYaml;
  }

  fs.writeFileSync(configPath, yamlContent, 'utf8');

  return configPath;
}
