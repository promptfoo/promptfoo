import { pathToFileURL } from 'node:url';

import logger from './logger';
import { safeResolve } from './util/file.node';

// esm-specific crap that needs to get mocked out in tests

//import path from 'path';
//import { fileURLToPath } from 'url';

export function getDirectory(): string {
  /*
  // @ts-ignore: Jest chokes on this
  const __filename = fileURLToPath(import.meta.url);
  return path.dirname(__filename);
 */
  return __dirname;
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
    const resolvedPathStr = resolvedPath.toString();
    logger.debug(`Attempting ESM import from: ${resolvedPathStr}`);

    // IMPORTANT: Use eval() to bypass dynamic import interception in both dev and production
    //
    // Problem: Dynamic imports get converted to require() calls by:
    // 1. ts-node during development (@cspotcode/source-map-support)
    // 2. TypeScript compiler during production build (when module: "commonjs")
    //
    // This breaks ES module loading because:
    // 1. require() can't load ES modules (throws ERR_REQUIRE_ESM)
    // 2. require() doesn't understand file:// URLs (throws MODULE_NOT_FOUND)
    //
    // Solution: eval() executes the import at runtime, after static analysis is complete,
    // so neither ts-node nor the TypeScript compiler can intercept and transform it.
    // This ensures the import goes through Node.js's native ES module loader.
    const importedModule = await eval(`import('${resolvedPathStr}')`);

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

    // If error has a callstack, log it:
    if ((err as any).stack) {
      logger.debug((err as any).stack);
    }

    logger.debug('Attempting CommonJS require fallback...');
    try {
      const importedModule = require(safeResolve(modulePath));
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
