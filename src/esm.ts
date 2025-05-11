import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import logger from './logger';
import { safeResolve } from './util/file.node';

/**
 * ESM/CommonJS compatibility utilities
 */

// TS hack to detect module system
// @ts-ignore
const isCommonJS = typeof __dirname !== 'undefined';

/**
 * Gets the directory name in both ESM and CommonJS environments
 */
export function getDirectory(): string {
  // In CommonJS context
  if (isCommonJS) {
    return __dirname;
  }

  // Only in ESM context - this code will be removed during transpilation to CJS
  // but will remain in the ESM build
  try {
    const esm = new Function('return import.meta.url')();
    const filename = fileURLToPath(esm);
    return dirname(filename);
  } catch (
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _err
  ) {
    // Fallback
    return process.cwd();
  }
}

/**
 * Dynamically imports a module and handles both ESM and CommonJS modules
 */
export async function importModule(modulePath: string, functionName?: string) {
  logger.debug(
    `Attempting to import module: ${JSON.stringify({ resolvedPath: safeResolve(modulePath), moduleId: modulePath })}`,
  );

  try {
    if (modulePath.endsWith('.ts') || modulePath.endsWith('.mjs')) {
      logger.debug('TypeScript/ESM module detected, importing tsx/cjs');
      // @ts-ignore: It actually works
      await import('tsx/cjs');
    }

    const resolvedPath = pathToFileURL(safeResolve(modulePath));
    logger.debug(`Attempting ESM import from: ${resolvedPath.toString()}`);

    // @ts-ignore
    const importedModule = await import(resolvedPath.toString());
    const mod = importedModule?.default?.default || importedModule?.default || importedModule;
    logger.debug(
      `Successfully imported module: ${JSON.stringify({ resolvedPath, moduleId: modulePath })}`,
    );
    if (functionName) {
      logger.debug(`Returning named export: ${functionName}`);
      return mod[functionName];
    }
    return mod;
  } catch (err) {
    // If ESM import fails, try CommonJS require as fallback
    logger.debug(`ESM import failed: ${err}`);
    logger.debug('Attempting CommonJS require fallback...');
    try {
      let nodeRequire;

      // In CommonJS context
      if (isCommonJS) {
        nodeRequire = require;
      } else {
        // In ESM context, create a require function
        // This only runs in ESM build
        try {
          const esm = new Function('return import.meta.url')();
          nodeRequire = createRequire(esm);
        } catch (
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          _e
        ) {
          nodeRequire = createRequire(pathToFileURL(__filename).toString());
        }
      }

      const importedModule = nodeRequire(safeResolve(modulePath));
      const mod = importedModule?.default?.default || importedModule?.default || importedModule;
      logger.debug(
        `Successfully required module: ${JSON.stringify({ resolvedPath: safeResolve(modulePath), moduleId: modulePath })}`,
      );
      if (functionName) {
        logger.debug(`Returning named export: ${functionName}`);
        return mod[functionName];
      }
      return mod;
    } catch (requireErr) {
      logger.debug(`CommonJS require also failed: ${requireErr}`);
      throw requireErr;
    }
  }
}

/**
 * Creates a require function that works in both ESM and CommonJS
 */
export function createCompatRequire() {
  // In CommonJS context
  if (isCommonJS) {
    return require;
  }

  // In ESM context - this only runs in ESM build
  try {
    const esm = new Function('return import.meta.url')();
    return createRequire(esm);
  } catch (
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _err
  ) {
    // Fallback
    return createRequire(pathToFileURL(__filename).toString());
  }
}
