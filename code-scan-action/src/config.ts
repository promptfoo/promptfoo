import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { type ScanConfig, ScanConfigSchema, validateSeverity } from '../../src/types/codeScan';

/** Write validated action inputs to a temporary config and return its path. */
export function generateConfigFile(minimumSeverity: string, guidance?: string): string {
  const validatedSeverity = validateSeverity(minimumSeverity);

  const config: ScanConfig = {
    minimumSeverity: validatedSeverity,
    diffsOnly: false, // Action scans include full-repository context.
    guidance: guidance === '' ? undefined : guidance,
  };

  const validatedConfig = ScanConfigSchema.parse(config);

  const tempDir = os.tmpdir();
  const configPath = path.join(tempDir, `code-scan-config-${randomUUID()}.yaml`);

  // JSON is valid YAML and preserves guidance whitespace without block-scalar rules.
  fs.writeFileSync(configPath, JSON.stringify(validatedConfig), 'utf8');

  return configPath;
}
