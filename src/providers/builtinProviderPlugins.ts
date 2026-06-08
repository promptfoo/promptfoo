import { isRedteamProviderPath, PROVIDER_PLUGIN_API_VERSION } from './registryTypes';

import type { ProviderPluginManifest } from './registryTypes';

export const awsProviderPlugin: ProviderPluginManifest = {
  apiVersion: PROVIDER_PLUGIN_API_VERSION,
  name: '@promptfoo/provider-aws',
  packageName: '@promptfoo/provider-aws',
  canHandle: (providerPath) =>
    providerPath.startsWith('bedrock:') ||
    providerPath.startsWith('bedrock-agent:') ||
    providerPath.startsWith('sagemaker:'),
  load: async () => {
    const { awsProviderFactories } = await import('./families/aws');
    return awsProviderFactories;
  },
};

export const googleProviderPlugin: ProviderPluginManifest = {
  apiVersion: PROVIDER_PLUGIN_API_VERSION,
  name: '@promptfoo/provider-google',
  packageName: '@promptfoo/provider-google',
  canHandle: (providerPath) =>
    providerPath.startsWith('vertex:') ||
    providerPath.startsWith('google:') ||
    providerPath.startsWith('palm:'),
  load: async () => {
    const { googleProviderFactories } = await import('./families/google');
    return googleProviderFactories;
  },
};

export const redteamProviderPlugin: ProviderPluginManifest = {
  apiVersion: PROVIDER_PLUGIN_API_VERSION,
  name: '@promptfoo/provider-redteam',
  packageName: '@promptfoo/provider-redteam',
  canHandle: isRedteamProviderPath,
  load: async () => {
    const { redteamProviderFactories } = await import('../redteam/providers/registry');
    return redteamProviderFactories;
  },
};

export const builtinProviderPlugins = [
  awsProviderPlugin,
  googleProviderPlugin,
  redteamProviderPlugin,
] as const satisfies readonly ProviderPluginManifest[];
