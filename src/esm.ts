import { pathToFileURL } from 'node:url';
import { getDirname } from './util/paths.js';
import logger from './logger.js';

/**
 * Get the directory of the current module
 * @returns The directory path
 */
export function getDirectory(): string {
  return getDirname(import.meta.url);
}

/**
 * Dynamically import a module
 * @param modulePath - Path to the module
 * @param functionName - Optional function name to extract
 * @returns The imported module or function
 */
export async function importModule(modulePath: string, functionName?: string): Promise<any> {
  logger.debug(`Importing module: ${modulePath}`);

  try {
    // Convert to file URL if it's a file path
    const moduleUrl = modulePath.startsWith('file://')
      ? modulePath
      : pathToFileURL(modulePath).toString();

    const importedModule = await import(moduleUrl);
    const mod = importedModule?.default || importedModule;

    if (functionName) {
      logger.debug(`Returning named export: ${functionName}`);
      return mod[functionName];
    }
    return mod;
  } catch (err) {
    logger.error(`Failed to import module ${modulePath}: ${err}`);
    throw err;
  }
}
