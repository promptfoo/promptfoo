import * as path from 'path';
import { pathToFileURL } from 'node:url';
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
  // This is some hacky shit. It prevents typescript from transpiling `import` to `require`, which breaks mjs imports.
  const resolvedPath = pathToFileURL(path.resolve(modulePath));
  const importedModule = await eval(`import('${resolvedPath}')`);
  const mod = importedModule?.default?.default || importedModule?.default || importedModule;
  if (functionName) {
    return mod[functionName];
  }
  return mod;
}
