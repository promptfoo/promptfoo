import fs from 'fs';
import path from 'path';

import { importModule } from '../esm';
import logger from '../logger';
import { runPython } from '../python/pythonUtils';
import { isJavascriptFile } from './fileExtensions';
import { parseFileUrl } from './functions/loadFunction';
import { loadYaml } from './yamlLoad';

/**
 * Loads the content from a file reference
 * @param fileRef The file reference string (e.g. 'file://path/to/file.json')
 * @param basePath Base path for resolving relative paths
 * @returns The loaded content from the file
 */
export async function loadFileReference(
  fileRef: string,
  basePath: string = '',
  signal?: AbortSignal,
): Promise<any> {
  signal?.throwIfAborted();
  // Parse file:// URL with Windows-aware path handling
  const { filePath, functionName } = parseFileUrl(fileRef);

  // Resolve the absolute path
  const resolvedPath = path.resolve(basePath, filePath);
  const extension = path.extname(resolvedPath).toLowerCase();

  logger.debug(
    `Loading file reference: ${fileRef}, resolvedPath: ${resolvedPath}, extension: ${extension}`,
  );

  try {
    if (extension === '.json') {
      logger.debug(`Loading JSON file: ${resolvedPath}`);
      const content = await fs.promises.readFile(resolvedPath, { encoding: 'utf8', signal });
      signal?.throwIfAborted();
      return JSON.parse(content);
    } else if (extension === '.yaml' || extension === '.yml') {
      logger.debug(`Loading YAML file: ${resolvedPath}`);
      const content = await fs.promises.readFile(resolvedPath, { encoding: 'utf8', signal });
      signal?.throwIfAborted();
      return loadYaml(content);
    } else if (isJavascriptFile(resolvedPath)) {
      logger.debug(`Loading JavaScript file: ${resolvedPath}`);
      const loading = (async () => {
        const mod = await importModule(resolvedPath, functionName);
        signal?.throwIfAborted();
        return typeof mod === 'function' ? await mod() : mod;
      })();
      if (!signal) {
        return await loading;
      }
      // Arbitrary in-process JavaScript cannot be terminated. Stop awaiting it;
      // late completion must not continue resolving config or start a worker.
      const onAbort = () => rejectLoading(signal.reason);
      let rejectLoading: (reason: unknown) => void;
      try {
        return await new Promise((resolve, reject) => {
          rejectLoading = reject;
          signal.addEventListener('abort', onAbort, { once: true });
          loading.then(resolve, reject);
        });
      } finally {
        signal.removeEventListener('abort', onAbort);
      }
    } else if (extension === '.py') {
      logger.debug(
        `Loading Python file: ${resolvedPath}, function: ${functionName || 'get_config'}`,
      );
      const fnName = functionName || 'get_config';
      const result = await runPython(resolvedPath, fnName, [], { signal });
      return result;
    } else if (extension === '.txt' || extension === '.md' || extension === '') {
      // For text files, just return the content as a string
      logger.debug(`Loading text file: ${resolvedPath}`);
      const content = await fs.promises.readFile(resolvedPath, { encoding: 'utf8', signal });
      signal?.throwIfAborted();
      return content;
    } else {
      logger.debug(`Unsupported file extension: ${extension}`);
      throw new Error(`Unsupported file extension: ${extension}`);
    }
  } catch (error) {
    logger.error(`Error loading file reference ${fileRef}: ${error}`);
    throw error;
  }
}

/**
 * Recursively processes a configuration object, replacing any file:// references
 * with the content of the referenced files
 * @param config The configuration object to process
 * @param basePath Base path for resolving relative paths
 * @returns A new configuration object with file references resolved
 */
export async function processConfigFileReferences(
  config: any,
  basePath: string = '',
  signal?: AbortSignal,
): Promise<any> {
  signal?.throwIfAborted();
  if (config === null || config === undefined) {
    return config;
  }

  // Handle string values with file:// protocol
  if (typeof config === 'string' && config.startsWith('file://')) {
    return await loadFileReference(config, basePath, signal);
  }

  // Handle arrays
  if (Array.isArray(config)) {
    const result = [];
    for (const item of config) {
      result.push(await processConfigFileReferences(item, basePath, signal));
    }
    return result;
  }

  // Handle objects
  if (typeof config === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(config)) {
      result[key] = await processConfigFileReferences(value, basePath, signal);
    }
    return result;
  }

  // Return primitive values as is
  return config;
}
