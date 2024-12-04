import { pathToFileURL } from 'node:url';
import * as path from 'path';
import logger from './logger';

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
  logger.debug('Attempting to import module:', {
    modulePath,
    resolvedPath: path.resolve(modulePath),
    fileUrl: pathToFileURL(path.resolve(modulePath)).toString(),
    functionName,
  });

  try {
    if (modulePath.endsWith('.ts') || modulePath.endsWith('.mjs')) {
      logger.debug('TypeScript/ESM module detected, importing tsx/cjs');
      // @ts-ignore: It actually works
      await import('tsx/cjs');
    }
    const resolvedPath = pathToFileURL(path.resolve(modulePath));
    logger.debug('Attempting ESM import from:', resolvedPath.toString());
    const importedModule = await import(resolvedPath.toString());
    const mod = importedModule?.default?.default || importedModule?.default || importedModule;
    logger.debug('Successfully imported module:', {
      hasDefaultDefault: !!importedModule?.default?.default,
      hasDefault: !!importedModule?.default,
      moduleType: typeof mod,
    });
    if (functionName) {
      logger.debug(`Returning named export: ${functionName}`);
      return mod[functionName];
    }
    return mod;
  } catch (err) {
    // If ESM import fails, try CommonJS require as fallback
    logger.debug('ESM import failed:', err);
    logger.debug('Attempting CommonJS require fallback...');
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(path.resolve(modulePath));
      logger.debug('Successfully required module:', {
        moduleType: typeof mod,
        exports: Object.keys(mod),
      });
      if (functionName) {
        logger.debug(`Returning named export: ${functionName}`);
        return mod[functionName];
      }
      return mod;
    } catch (requireErr) {
      logger.debug('CommonJS require also failed:', requireErr);
      throw requireErr;
    }
  }
}
