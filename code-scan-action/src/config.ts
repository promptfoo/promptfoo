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
 * @returns Path to temporary config file
 */
export function generateConfigFile(minimumSeverity: string): string {
  const config: ScanConfig = {
    minimumSeverity: minimumSeverity as SeverityLevel,
    diffsOnly: false, // Always enable full repo exploration for GitHub Actions (never diffs-only)
  };

  // Create temp file
  const tempDir = os.tmpdir();
  const configPath = path.join(tempDir, `code-scan-config-${Date.now()}.yaml`);

  // Write YAML
  const yamlContent = `minimumSeverity: ${config.minimumSeverity}\ndiffsOnly: ${config.diffsOnly}\n`;
  fs.writeFileSync(configPath, yamlContent, 'utf8');

  return configPath;
}
