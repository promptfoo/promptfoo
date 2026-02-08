import type { RedteamPluginObject, RedteamStrategyObject } from './types';

const SHARP_REQUIRED_STRATEGIES = ['image'];
const SHARP_REQUIRED_PLUGINS = ['unsafebench'];

let sharpAvailableCache: boolean | null = null;

/**
 * Checks if the sharp library is available.
 * Result is cached after first call for efficiency.
 */
export async function isSharpAvailable(): Promise<boolean> {
  if (sharpAvailableCache !== null) {
    return sharpAvailableCache;
  }
  try {
    await import('sharp');
    sharpAvailableCache = true;
  } catch {
    sharpAvailableCache = false;
  }
  return sharpAvailableCache;
}

/**
 * Validates that the sharp library is installed when required by strategies or plugins.
 * Throws an error early (before scan starts) if sharp is needed but not available.
 *
 * @param strategies - Red team strategies to check
 * @param plugins - Red team plugins to check
 * @param checkSharp - Optional function to check sharp availability (for testing)
 */
export async function validateSharpDependency(
  strategies: RedteamStrategyObject[],
  plugins: RedteamPluginObject[],
  checkSharp: () => Promise<boolean> = isSharpAvailable,
): Promise<void> {
  const sharpStrategies = strategies.filter((s) => SHARP_REQUIRED_STRATEGIES.includes(s.id));
  const sharpPlugins = plugins.filter((p) => SHARP_REQUIRED_PLUGINS.includes(p.id));

  const requiresSharp = sharpStrategies.length > 0 || sharpPlugins.length > 0;

  if (requiresSharp && !(await checkSharp())) {
    const features = [
      ...sharpStrategies.map((s) => `strategy '${s.id}'`),
      ...sharpPlugins.map((p) => `plugin '${p.id}'`),
    ];

    throw new Error(
      `The sharp library is required for ${features.join(', ')} and must be manually installed separately.\n` +
        `Install it with: npm install sharp`,
    );
  }
}
