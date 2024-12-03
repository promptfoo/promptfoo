import { pathToFileURL } from 'node:url';
import * as path from 'path';

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
  if (modulePath.endsWith('.ts') || modulePath.endsWith('.mjs')) {
    // @ts-ignore: It actually works
    await import('tsx/cjs');
  }
  const resolvedPath = pathToFileURL(path.resolve(modulePath));
  const importedModule = await import(resolvedPath.toString());
  const mod = importedModule?.default?.default || importedModule?.default || importedModule;
  if (functionName) {
    return mod[functionName];
  }
  return mod;
}
