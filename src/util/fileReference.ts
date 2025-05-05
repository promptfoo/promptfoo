import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { importModule } from '../esm';
import logger from '../logger';
import { runPython } from '../python/pythonUtils';
import { isJavascriptFile } from './fileExtensions';

/**
 * Loads the content from a file reference
 * @param fileRef The file reference string (e.g. 'file://path/to/file.json')
 * @param basePath Base path for resolving relative paths
 * @returns The loaded content from the file
 */
export async function loadFileReference(fileRef: string, basePath: string = ''): Promise<any> {
  // Remove the file:// prefix
  const pathWithProtocolRemoved = fileRef.slice('file://'.length);

  // Split to check for function name
  const parts = pathWithProtocolRemoved.split(':');
  const filePath = parts[0];
  const functionName = parts.length > 1 ? parts[1] : undefined;

  // Resolve the absolute path
  const resolvedPath = path.resolve(basePath, filePath);
  const extension = path.extname(resolvedPath).toLowerCase();

  logger.debug(
    `Loading file reference: ${fileRef}, resolvedPath: ${resolvedPath}, extension: ${extension}`,
  );

  try {
    if (extension === '.json') {
      logger.debug(`Loading JSON file: ${resolvedPath}`);
      const content = await fs.promises.readFile(resolvedPath, 'utf8');
      return JSON.parse(content);
    } else if (extension === '.yaml' || extension === '.yml') {
      logger.debug(`Loading YAML file: ${resolvedPath}`);
      const content = await fs.promises.readFile(resolvedPath, 'utf8');
      return yaml.load(content);
    } else if (isJavascriptFile(resolvedPath)) {
      logger.debug(`Loading JavaScript file: ${resolvedPath}`);
      const mod = await importModule(resolvedPath, functionName);
      return typeof mod === 'function' ? await mod() : mod;
    } else if (extension === '.py') {
      logger.debug(
        `Loading Python file: ${resolvedPath}, function: ${functionName || 'get_config'}`,
      );
      const fnName = functionName || 'get_config';
      const result = await runPython(resolvedPath, fnName, []);
      return result;
    } else if (extension === '.txt' || extension === '.md' || extension === '') {
      // For text files, just return the content as a string
      logger.debug(`Loading text file: ${resolvedPath}`);
      return await fs.promises.readFile(resolvedPath, 'utf8');
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
): Promise<any> {
  if (!config) {
    return config;
  }

  // Handle string values with file:// protocol
  if (typeof config === 'string' && config.startsWith('file://')) {
    return await loadFileReference(config, basePath);
  }

  // Handle arrays
  if (Array.isArray(config)) {
    const result = [];
    for (const item of config) {
      result.push(await processConfigFileReferences(item, basePath));
    }
    return result;
  }

  // Handle objects
  if (typeof config === 'object' && config !== null) {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(config)) {
      result[key] = await processConfigFileReferences(value, basePath);
    }
    return result;
  }

  // Return primitive values as is
  return config;
}
