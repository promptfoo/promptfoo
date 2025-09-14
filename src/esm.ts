import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import logger from './logger.js';
import { safeResolve } from './util/fileNode.js';

// Global variable defined by build system
declare const BUILD_FORMAT: string | undefined;

/**
 * ESM replacement for __dirname - guarded for dual CJS/ESM builds
 */
export function getDirectory(): string {
  // Guard import.meta usage for CJS builds
  if (typeof BUILD_FORMAT !== 'undefined' && BUILD_FORMAT === 'cjs') {
    // In CJS builds, use __dirname which is shimmed by tsup
    return __dirname;
  }
  // In ESM builds, use import.meta.url
  return path.dirname(fileURLToPath(import.meta.url));
}

/**
 * ESM-only module loader - simplified without eval() or CommonJS fallback
 * Uses Node.js native ESM import with proper URL resolution
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
    const resolvedPathStr = resolvedPath.toString();
    logger.debug(`Attempting ESM import from: ${resolvedPathStr}`);

    // Native dynamic import - no eval() needed in ESM-only environment
    const importedModule = await import(resolvedPathStr);

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
    logger.error(`ESM import failed: ${err}`);

    // If error has a callstack, log it:
    if ((err as any).stack) {
      logger.debug((err as any).stack);
    }

    throw err;
  }
}
