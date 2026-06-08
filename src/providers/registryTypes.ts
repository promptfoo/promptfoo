import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/providers';

export const PROVIDER_PLUGIN_API_VERSION = 1 as const;

export const REDTEAM_PROVIDER_PATHS = {
  authoritativeMarkupInjection: 'promptfoo:redteam:authoritative-markup-injection',
  bestOfN: 'promptfoo:redteam:best-of-n',
  crescendo: 'promptfoo:redteam:crescendo',
  custom: 'promptfoo:redteam:custom',
  goat: 'promptfoo:redteam:goat',
  hydra: 'promptfoo:redteam:hydra',
  indirectWebPwn: 'promptfoo:redteam:indirect-web-pwn',
  iterative: 'promptfoo:redteam:iterative',
  iterativeImage: 'promptfoo:redteam:iterative:image',
  iterativeMeta: 'promptfoo:redteam:iterative:meta',
  iterativeTree: 'promptfoo:redteam:iterative:tree',
  memoryPoisoning: 'agentic:memory-poisoning',
  mischievousUser: 'promptfoo:redteam:mischievous-user',
} as const;

const EXACT_REDTEAM_PROVIDER_PATHS = new Set<string>(Object.values(REDTEAM_PROVIDER_PATHS));

export function isRedteamProviderPath(providerPath: string): boolean {
  return (
    EXACT_REDTEAM_PROVIDER_PATHS.has(providerPath) ||
    providerPath.startsWith(`${REDTEAM_PROVIDER_PATHS.custom}:`)
  );
}

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
