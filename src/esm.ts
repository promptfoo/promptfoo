import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { readFileSync } from 'node:fs';

import logger from './logger';
import { safeResolve } from './util/pathUtils';

// Import package.json once and export for reuse
// Use readFileSync to avoid import attribute syntax issues in Jest
function loadPackageJson() {
  try {
    // Try ESM approach using import.meta.url
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    return JSON.parse(readFileSync(path.join(currentDir, '../package.json'), 'utf-8'));
  } catch {
    // Fall back to CJS __dirname
    // @ts-ignore - __dirname exists in CJS but not in ESM types
    return JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));
  }
}
export const packageJson = loadPackageJson();

/**
 * ESM replacement for __dirname - guarded for dual CJS/ESM builds
 * This is the canonical way to get the current directory in dual ESM/CJS code.
 * Use this instead of implementing the try-catch pattern in each file.
 */
export function getDirectory(): string {
  try {
    // Try ESM approach - import.meta.url is only available in ESM
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    // Fall back to CJS __dirname
    // @ts-ignore - __dirname exists in CJS but not in ESM types
    return __dirname;
  }
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
