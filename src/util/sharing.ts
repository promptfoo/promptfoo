import { getEnvBool } from '../envars';
import { cloudConfig } from '../globalConfig/cloud';

/**
 * Options for determining whether results should be shared to cloud.
 */
export interface ShouldShareOptions {
  /** CLI --share flag value (true = --share, false = --no-share, undefined = not specified) */
  cliShare?: boolean;
  /** CLI --no-share flag value (explicit disable) */
  cliNoShare?: boolean;
  /** Config file commandLineOptions.share */
  configShare?: unknown;
  /** Config file sharing setting */
  configSharing?: unknown;
}

/**
 * Determines whether results should be shared to cloud.
 *
 * This is the single source of truth for sharing logic, used by both
 * the eval and retry commands to ensure consistent behavior.
 *
 * Precedence (highest to lowest):
 * 1. Explicit disable (CLI --no-share or PROMPTFOO_DISABLE_SHARING env var)
 * 2. Explicit enable (CLI --share)
 * 3. Config file commandLineOptions.share
 * 4. Config file sharing setting
 * 5. Default: auto-share when cloud is enabled
 *
 * @param opts - Options containing CLI flags and config values
 * @returns true if results should be shared, false otherwise
 */
export function shouldShareResults(opts: ShouldShareOptions): boolean {
  // Check for explicit disable via CLI --no-share, cliShare === false, or env var
  const hasExplicitDisable =
    opts.cliNoShare === true || opts.cliShare === false || getEnvBool('PROMPTFOO_DISABLE_SHARING');

  if (hasExplicitDisable) {
    return false;
  }

  // Explicit enable via CLI --share
  if (opts.cliShare === true) {
    return true;
  }

  // Config file commandLineOptions.share
  if (opts.configShare !== undefined) {
    return Boolean(opts.configShare);
  }

  // Config file sharing setting
  if (opts.configSharing !== undefined) {
    return Boolean(opts.configSharing);
  }

  // Default: auto-share when cloud is enabled
  return cloudConfig.isEnabled();
}
