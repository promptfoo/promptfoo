import { createHash } from 'crypto';
import * as fs from 'fs';

import { VERSION } from '../../constants';

/**
 * Computes a hash from a config file's contents.
 * Used to detect when the config file has changed.
 *
 * @param configPath - Path to the config file
 * @returns MD5 hash of the config file contents prefixed with version
 */
export function getConfigHash(configPath: string): string {
  const content = fs.readFileSync(configPath, 'utf8');
  return createHash('md5').update(`${VERSION}:${content}`).digest('hex');
}

/**
 * Computes a hash to identify a cloud configuration (scan template + target).
 * Used to determine if test cases can be reused when nothing about the config has changed.
 *
 * The hash includes:
 * - Cloud config ID (scan template identifier)
 * - Cloud target ID
 * - Purpose/application description
 * - Plugins configuration
 * - Strategies configuration
 * - Number of tests
 * - Language settings
 * - Entities
 * - InjectVar
 *
 * @param cloudConfigId - The UUID of the cloud config (scan template)
 * @param targetId - The UUID of the cloud target (optional)
 * @param redteamConfig - The redteam configuration from the cloud config
 * @returns A hash string representing the full configuration
 */
export function computeTargetHash(
  cloudConfigId: string,
  targetId: string | undefined,
  redteamConfig: Record<string, unknown> | undefined,
): string {
  // Extract and normalize the relevant fields from redteam config
  const normalizedConfig = redteamConfig
    ? {
        purpose: redteamConfig.purpose || '',
        plugins: redteamConfig.plugins || [],
        strategies: redteamConfig.strategies || [],
        numTests: redteamConfig.numTests,
        language: redteamConfig.language,
        entities: redteamConfig.entities || [],
        injectVar: redteamConfig.injectVar,
      }
    : {};

  const hashInput = JSON.stringify({
    version: VERSION,
    cloudConfigId,
    targetId: targetId || '',
    config: normalizedConfig,
  });
  return createHash('md5').update(hashInput).digest('hex');
}
