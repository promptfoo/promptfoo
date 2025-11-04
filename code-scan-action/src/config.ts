/**
 * Configuration Generator
 *
 * Generates YAML config file from action inputs
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ScanConfig, SeverityLevel } from '../../src/types/codeScan';

/**
 * Generate a temporary YAML config file from action inputs
 * @param minimumSeverity Minimum severity level
 * @param guidance Optional custom guidance text
 * @returns Path to temporary config file
 */
export function generateConfigFile(minimumSeverity: string, guidance?: string): string {
  const config: ScanConfig = {
    minimumSeverity: minimumSeverity as SeverityLevel,
    diffsOnly: false, // Always enable full repo exploration for GitHub Actions (never diffs-only)
    guidance,
  };

  // Create temp file
  const tempDir = os.tmpdir();
  const configPath = path.join(tempDir, `code-scan-config-${Date.now()}.yaml`);

  // Write YAML
  let yamlContent = `minimumSeverity: ${config.minimumSeverity}\ndiffsOnly: ${config.diffsOnly}\n`;
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
