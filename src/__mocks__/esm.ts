export function getDirectory() {
  return '/test/dir';
}

export function importModule(filePath: string, functionName?: string) {
  const mod = require(filePath);
  if (functionName) {
    return mod[functionName];
  }
  return mod;    
}