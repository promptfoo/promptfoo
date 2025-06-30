import { createRequire } from 'module';
import { pathToFileURL } from 'node:url';
import logger from './logger';
import { safeResolve } from './util/file.node';

const require = createRequire(import.meta.url);

// esm-specific crap that needs to get mocked out in tests

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
    // If ESM import fails, try CommonJS require as fallback
    logger.debug(`ESM import failed: ${err}`);
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
      // Check if this is a circular dependency error
      if (
        requireErr instanceof Error &&
        requireErr.message &&
        requireErr.message.includes('cycle')
      ) {
        logger.debug('Circular dependency detected, attempting to use original ESM error');
        throw err;
      }
      throw requireErr;
    }
  }
}
