import { ProviderPluginRegistry } from './pluginRegistry';

import type { ProviderPluginManifest } from './registryTypes';

const PROVIDER_PLUGIN_REGISTRY_KEY = '__PROMPTFOO_PROVIDER_PLUGIN_REGISTRY_V1__' as const;

type ProviderPluginGlobal = typeof globalThis & {
  [PROVIDER_PLUGIN_REGISTRY_KEY]?: ProviderPluginRegistry;
};

const globalRegistry = globalThis as ProviderPluginGlobal;

/**
 * The public plugin hook is process-wide so registrations made through an ESM
 * or CommonJS entrypoint are visible to every Promptfoo host bundle.
 */
export const providerPluginRegistry = (globalRegistry[PROVIDER_PLUGIN_REGISTRY_KEY] ??=
  new ProviderPluginRegistry());

export function registerProviderPlugin(manifest: ProviderPluginManifest): () => void {
  return providerPluginRegistry.register(manifest);
}
