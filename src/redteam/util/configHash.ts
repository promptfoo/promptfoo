import { createHash } from 'crypto';
import * as fs from 'fs';

import { VERSION } from '../../constants';

import type { RedteamCliGenerateOptions } from '../types';

/**
 * Computes a hash from a config file's contents.
 * Used to detect when the config file has changed.
 *
 * Provider/target filters are folded into the hash so that changing them
 * invalidates a previously generated output.
 *
 * @param configPath - Path to the config file
 * @param options - Provider/target filters that influence the generated tests
 * @returns MD5 hash of the config file contents prefixed with version
 */
export function getConfigHash(
  configPath: string,
  options: Pick<RedteamCliGenerateOptions, 'filterProviders' | 'filterTargets'> = {},
): string {
  const content = fs.readFileSync(configPath, 'utf8');
  const filters = {
    ...(options.filterProviders ? { filterProviders: options.filterProviders } : {}),
    ...(options.filterTargets ? { filterTargets: options.filterTargets } : {}),
  };
  const hashInput =
    Object.keys(filters).length > 0
      ? JSON.stringify({ version: VERSION, content, filters })
      : `${VERSION}:${content}`;
  return createHash('md5').update(hashInput).digest('hex');
}

/**
 * Computes a hash to identify a cloud configuration (scan template + target).
 * Used to determine if test cases can be reused when nothing about the config has changed.
 *
 * The hash includes:
 * - Cloud config ID (scan template identifier)
 * - Cloud target ID
 * - Redteam generation settings
 * - Target/provider configuration and prompt inputs that influence generated tests
 *
 * @param cloudConfigId - The UUID of the cloud config (scan template)
 * @param targetId - The UUID of the cloud target (optional)
 * @param cloudConfig - The full cloud configuration, or a redteam config for legacy callers
 * @returns A hash string representing the full configuration
 */
export function computeTargetHash(
  cloudConfigId: string,
  targetId: string | undefined,
  cloudConfig: Record<string, unknown> | undefined,
): string {
  const redteamConfig =
    cloudConfig?.redteam && typeof cloudConfig.redteam === 'object'
      ? (cloudConfig.redteam as Record<string, unknown>)
      : cloudConfig;

  const normalizedRedteamConfig = redteamConfig
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

  const normalizedConfig = {
    redteam: normalizedRedteamConfig,
    prompts: cloudConfig?.prompts || [],
    providers: cloudConfig?.providers || [],
    targets: cloudConfig?.targets || [],
  };

  const hashInput = JSON.stringify({
    version: VERSION,
    cloudConfigId,
    targetId: targetId || '',
    config: normalizedConfig,
  });
  return createHash('md5').update(hashInput).digest('hex');
}
