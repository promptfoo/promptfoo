import type { RedteamPluginObject, RedteamStrategyObject } from './types';

const SHARP_REQUIRED_STRATEGIES = ['image'];
const SHARP_REQUIRED_PLUGINS = ['unsafebench'];

async function isSharpAvailable(): Promise<boolean> {
  try {
    await import('sharp');
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates that the sharp library is installed when required by strategies or plugins.
 * Throws an error early (before scan starts) if sharp is needed but not available.
 */
export async function validateSharpDependency(
  strategies: RedteamStrategyObject[],
  plugins: RedteamPluginObject[],
): Promise<void> {
  const sharpStrategies = strategies.filter((s) => SHARP_REQUIRED_STRATEGIES.includes(s.id));
  const sharpPlugins = plugins.filter((p) => SHARP_REQUIRED_PLUGINS.includes(p.id));

  const requiresSharp = sharpStrategies.length > 0 || sharpPlugins.length > 0;

  if (requiresSharp && !(await isSharpAvailable())) {
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
