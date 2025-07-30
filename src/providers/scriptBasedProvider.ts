import { getResolvedRelativePath } from '../util/file';

import type { LoadApiProviderContext } from '../types';
import type { ApiProvider, ProviderOptions } from '../types/providers';

/**
 * Creates a factory for script-based providers (exec, golang, python)
 * @param prefix The provider prefix to match (e.g. 'exec:')
 * @param fileExtension Optional file extension to match when using file:// format
 * @param providerConstructor The provider class constructor
 * @returns A ProviderFactory for the specified script-based provider
 */
export function createScriptBasedProviderFactory(
  prefix: string,
  fileExtension: string | null,
  providerConstructor: new (scriptPath: string, options: ProviderOptions) => ApiProvider,
) {
  return {
    test: (providerPath: string) => {
      // Test if path matches the prefix or file extension pattern
      if (providerPath.startsWith(`${prefix}:`)) {
        return true;
      }

      // Check file extension only if fileExtension is provided
      if (fileExtension && providerPath.startsWith('file://')) {
        return (
          providerPath.endsWith(`.${fileExtension}`) || providerPath.includes(`.${fileExtension}:`)
        );
      }

      return false;
    },
    create: async (
      providerPath: string,
      providerOptions: ProviderOptions,
      context: LoadApiProviderContext,
    ) => {
      // Extract the script path from the provider path
      let scriptPath: string;
      if (providerPath.startsWith('file://')) {
        scriptPath = providerPath.slice('file://'.length);
      } else {
        // For prefixed paths like 'exec:', 'python:', 'golang:'
        scriptPath = providerPath.split(':').slice(1).join(':');
      }

      // If using a cloud config, always use process.cwd() instead of context.basePath
      const isCloudConfig = providerOptions.config?.isCloudConfig === true;
      const resolvedPath = getResolvedRelativePath(scriptPath, isCloudConfig);

      return new providerConstructor(resolvedPath, providerOptions);
    },
  };
}
