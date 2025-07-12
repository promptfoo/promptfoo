import { pathToFileURL } from 'node:url';
import logger from './logger';
import { safeResolve } from './util/file.node';
import { getDirnameCompat } from './util/paths';

// esm-specific crap that needs to get mocked out in tests

export function getDirectory(): string {
  // @ts-ignore: import.meta.url is not available in CommonJS
  return getDirnameCompat(typeof import.meta === 'undefined' ? undefined : import.meta.url);
}

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
    // In ESM build, we only support ESM imports
    // The CommonJS fallback is handled by a separate build
    logger.debug(`ESM import failed: ${err}`);
    
    // Check if this is a CommonJS module being imported in ESM
    if (err instanceof Error && err.message.includes('require')) {
      throw new Error(`Cannot import CommonJS module '${modulePath}' in ESM mode. Please use an ESM-compatible module.`);
    }
    
    throw err;
  }
}
