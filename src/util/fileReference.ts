import fs from 'fs';
import path from 'path';

import { importModule } from '../esm';
import logger from '../logger';
import { runPython } from '../python/pythonUtils';
import { waitForPromiseWithAbort } from './fetch/requestSignal';
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
  // Parse file:// URL with Windows-aware path handling
  const { filePath, functionName } = parseFileUrl(fileRef);

  // Resolve the absolute path
  const resolvedPath = path.resolve(basePath, filePath);
  const extension = path.extname(resolvedPath).toLowerCase();

  logger.debug(
    `Loading file reference: ${fileRef}, resolvedPath: ${resolvedPath}, extension: ${extension}`,
  );

  try {
    if (signal) {
      signal.throwIfAborted();
      const stats = await waitForPromiseWithAbort(fs.promises.stat(resolvedPath), signal);
      if (!stats.isFile()) {
        throw new Error('Config reference must be a regular file');
      }
      signal.throwIfAborted();
    }
    if (isJavascriptFile(resolvedPath)) {
      const mod = await waitForPromiseWithAbort(importModule(resolvedPath, functionName), signal);
      signal?.throwIfAborted();
      // In-process JavaScript can finish later, but must not start another worker.
      return typeof mod === 'function'
        ? await waitForPromiseWithAbort(Promise.resolve(mod()), signal)
        : mod;
    }
    if (extension === '.py') {
      const fn = functionName || 'get_config';
      // runPython stops its child and waits for it to close before rejecting.
      return signal
        ? await runPython(resolvedPath, fn, [], { abortSignal: signal })
        : await runPython(resolvedPath, fn, []);
    }
    if (!['.json', '.yaml', '.yml', '.txt', '.md', ''].includes(extension)) {
      throw new Error(`Unsupported file extension: ${extension}`);
    }
    const content = await waitForPromiseWithAbort(
      fs.promises.readFile(resolvedPath, signal ? { encoding: 'utf8', signal } : 'utf8'),
      signal,
    );
    signal?.throwIfAborted();
    if (extension === '.json') {
      return JSON.parse(content);
    }
    return extension === '.yaml' || extension === '.yml' ? loadYaml(content) : content;
  } catch (error) {
    signal?.throwIfAborted();
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
