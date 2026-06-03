import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/providers';

export const PROVIDER_PLUGIN_API_VERSION = 1 as const;

/**
 * Host-owned context passed to provider factories. Keeping this contract here
 * lets a provider plugin implement factories without importing the CLI,
 * server, root facade, or the broad legacy types barrel.
 */
export interface ProviderLoadContext {
  basePath?: string;
  env?: EnvOverrides;
}

/**
 * A single entry in the provider registry. `test` is the authoritative
 * dispatcher: loadApiProvider iterates factories in order and invokes `create`
 * on the first one whose `test` returns true. `create` may only assume its
 * own `test` matched and should not be called otherwise.
 */
export interface ProviderFactory {
  test: (providerPath: string) => boolean;
  create: (
    providerPath: string,
    providerOptions: ProviderOptions,
    context: ProviderLoadContext,
  ) => Promise<ApiProvider>;
}

/**
 * Versioned contract exported by an independently loadable provider family.
 *
 * `canHandle` is the family's cheap first-stage dispatcher. When multiple
 * manifests match, the first registered manifest wins. `load` is only called
 * for that winning manifest, and the returned factories retain their own
 * first-match dispatch order ahead of the legacy fallback registry.
 */
export interface ProviderPluginManifestV1 {
  apiVersion: typeof PROVIDER_PLUGIN_API_VERSION;
  name: string;
  /**
   * Candidate npm package name. The host uses it to turn a matching missing
   * module error into a typed, actionable MissingProviderPackageError.
   */
  packageName?: string;
  canHandle: (providerPath: string) => boolean;
  load: () => Promise<readonly ProviderFactory[]>;
}

export type ProviderPluginManifest = ProviderPluginManifestV1;
