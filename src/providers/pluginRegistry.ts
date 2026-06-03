import { PROVIDER_PLUGIN_API_VERSION } from './registryTypes';

import type { ProviderFactory, ProviderPluginManifest } from './registryTypes';

const MODULE_NOT_FOUND_CODES = new Set(['MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND']);

/**
 * Provider-local package check. Keeping plugin dispatch independent of
 * `src/util` prevents the package-ready registry from acquiring a Node-layer
 * dependency just to classify a dynamic-import error.
 */
function isMissingPluginPackage(error: unknown, packageName: string): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  if (
    !(
      (code != null && MODULE_NOT_FOUND_CODES.has(code)) ||
      error.message.includes('Cannot find module') ||
      error.message.includes('Cannot find package')
    )
  ) {
    return false;
  }

  const missingSpecifier = error.message.match(
    /Cannot find (?:module|package)\s+['"]([^'"]+)['"]/,
  )?.[1];
  return missingSpecifier == null
    ? error.message.includes(packageName)
    : missingSpecifier === packageName || missingSpecifier.startsWith(`${packageName}/`);
}

interface RegisteredProviderPlugin {
  manifest: ProviderPluginManifest;
  loadPromise?: Promise<readonly ProviderFactory[]>;
}

export interface ProviderPluginRegistrationOptions {
  position?: 'first' | 'last';
  replaceExisting?: boolean;
}

class ProviderPluginLoadErrorImpl extends Error {
  readonly code: string = 'PROMPTFOO_PROVIDER_PLUGIN_LOAD_ERROR';
  readonly pluginName: string;
  readonly providerPath: string;

  constructor(pluginName: string, providerPath: string, cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause);
    super(`Failed to load provider family for '${providerPath}': ${message}`);
    this.name = 'ProviderPluginLoadError';
    this.pluginName = pluginName;
    this.providerPath = providerPath;
    if (cause instanceof Error) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

class MissingProviderPackageErrorImpl extends ProviderPluginLoadErrorImpl {
  override readonly code: string = 'PROMPTFOO_MISSING_PROVIDER_PACKAGE';
  readonly packageName: string;

  constructor(pluginName: string, providerPath: string, packageName: string, cause: unknown) {
    super(pluginName, providerPath, cause);
    this.name = 'MissingProviderPackageError';
    this.message = `Provider plugin '${pluginName}' for '${providerPath}' requires package '${packageName}'. Install it with: npm install ${packageName}`;
    this.packageName = packageName;
    if (cause instanceof Error) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

const PROVIDER_PLUGIN_ERROR_CONSTRUCTORS_KEY =
  '__PROMPTFOO_PROVIDER_PLUGIN_ERROR_CONSTRUCTORS_V1__' as const;

type ProviderPluginErrorConstructors = {
  ProviderPluginLoadError: typeof ProviderPluginLoadErrorImpl;
  MissingProviderPackageError: typeof MissingProviderPackageErrorImpl;
};

type ProviderPluginErrorGlobal = typeof globalThis & {
  [PROVIDER_PLUGIN_ERROR_CONSTRUCTORS_KEY]?: ProviderPluginErrorConstructors;
};

const errorGlobal = globalThis as ProviderPluginErrorGlobal;
const errorConstructors = (errorGlobal[PROVIDER_PLUGIN_ERROR_CONSTRUCTORS_KEY] ??= {
  ProviderPluginLoadError: ProviderPluginLoadErrorImpl,
  MissingProviderPackageError: MissingProviderPackageErrorImpl,
});

/**
 * Process-shared constructors keep typed plugin errors recognizable when a
 * consumer loads both the ESM and CommonJS package entrypoints.
 */
export const ProviderPluginLoadError = errorConstructors.ProviderPluginLoadError;
export type ProviderPluginLoadError = InstanceType<typeof ProviderPluginLoadError>;

export const MissingProviderPackageError = errorConstructors.MissingProviderPackageError;
export type MissingProviderPackageError = InstanceType<typeof MissingProviderPackageError>;

/**
 * Ordered registry for lazy provider-family plugins.
 *
 * Registration order is dispatch order. Only the first matching plugin is
 * loaded, which keeps overlapping external families deterministic and avoids
 * loading unrelated packages for a single provider ID.
 */
export class ProviderPluginRegistry {
  private plugins: RegisteredProviderPlugin[] = [];

  constructor(manifests: readonly ProviderPluginManifest[] = []) {
    for (const manifest of manifests) {
      this.register(manifest);
    }
  }

  register(
    manifest: ProviderPluginManifest,
    { position = 'last', replaceExisting = false }: ProviderPluginRegistrationOptions = {},
  ): () => void {
    if (manifest.apiVersion !== PROVIDER_PLUGIN_API_VERSION) {
      throw new Error(
        `Unsupported provider plugin API version for '${manifest.name}': ${manifest.apiVersion}`,
      );
    }
    const existingIndex = this.plugins.findIndex(
      (plugin) => plugin.manifest.name === manifest.name,
    );
    if (existingIndex !== -1 && !replaceExisting) {
      throw new Error(`Provider plugin '${manifest.name}' is already registered`);
    }
    if (typeof manifest.canHandle !== 'function' || typeof manifest.load !== 'function') {
      throw new Error(`Provider plugin '${manifest.name}' must define canHandle() and load()`);
    }

    const registered: RegisteredProviderPlugin = { manifest };
    if (existingIndex !== -1) {
      this.plugins.splice(existingIndex, 1);
    }
    if (position === 'first') {
      this.plugins.unshift(registered);
    } else {
      this.plugins.push(registered);
    }

    return () => {
      const index = this.plugins.indexOf(registered);
      if (index !== -1) {
        this.plugins.splice(index, 1);
      }
    };
  }

  get manifests(): readonly ProviderPluginManifest[] {
    return this.plugins.map((plugin) => plugin.manifest);
  }

  async getFactories(
    providerPath: string,
    fallbackFactories: readonly ProviderFactory[],
  ): Promise<readonly ProviderFactory[]> {
    let matchingPlugin: RegisteredProviderPlugin | undefined;
    for (const plugin of this.plugins) {
      try {
        if (plugin.manifest.canHandle(providerPath)) {
          matchingPlugin = plugin;
          break;
        }
      } catch (error) {
        throw new ProviderPluginLoadError(plugin.manifest.name, providerPath, error);
      }
    }
    if (!matchingPlugin) {
      return fallbackFactories;
    }

    const pluginFactories = await this.loadPlugin(matchingPlugin, providerPath);
    try {
      if (!pluginFactories.some((factory) => factory.test(providerPath))) {
        throw new TypeError(
          `Provider plugin '${matchingPlugin.manifest.name}' claimed '${providerPath}' but returned no matching factory`,
        );
      }
    } catch (error) {
      throw new ProviderPluginLoadError(matchingPlugin.manifest.name, providerPath, error);
    }
    return [...pluginFactories, ...fallbackFactories];
  }

  private async loadPlugin(
    plugin: RegisteredProviderPlugin,
    providerPath: string,
  ): Promise<readonly ProviderFactory[]> {
    plugin.loadPromise ??= Promise.resolve().then(() => plugin.manifest.load());

    try {
      const factories = await plugin.loadPromise;
      if (
        !Array.isArray(factories) ||
        !Array.from({ length: factories.length }, (_, index) =>
          isProviderFactory(factories[index]),
        ).every(Boolean)
      ) {
        throw new TypeError(`Provider plugin '${plugin.manifest.name}' returned invalid factories`);
      }
      return factories;
    } catch (error) {
      // A package may be installed after an initial failure in a long-lived
      // process, so permit a later lookup to retry the plugin load.
      plugin.loadPromise = undefined;

      if (
        plugin.manifest.packageName &&
        isMissingPluginPackage(error, plugin.manifest.packageName)
      ) {
        throw new MissingProviderPackageError(
          plugin.manifest.name,
          providerPath,
          plugin.manifest.packageName,
          error,
        );
      }

      throw new ProviderPluginLoadError(plugin.manifest.name, providerPath, error);
    }
  }
}

function isProviderFactory(factory: unknown): factory is ProviderFactory {
  return (
    factory != null &&
    typeof factory === 'object' &&
    'test' in factory &&
    typeof factory.test === 'function' &&
    'create' in factory &&
    typeof factory.create === 'function'
  );
}
