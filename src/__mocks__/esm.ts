export function getDirectory() {
  return '/test/dir';
}

export async function importModule(filePath: string, functionName?: string) {
  // Use require for test environment
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(filePath);

  // Handle ES module default exports
  const resolvedMod = mod?.default || mod;

  if (functionName) {
    return resolvedMod[functionName];
  }
  return resolvedMod;
}
