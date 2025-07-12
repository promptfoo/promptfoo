import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

export function getDirname(importMetaUrl: string): string {
  return dirname(fileURLToPath(importMetaUrl));
}

export function getFilename(importMetaUrl: string): string {
  return fileURLToPath(importMetaUrl);
}

export function resolvePath(importMetaUrl: string, ...paths: string[]): string {
  const dir = getDirname(importMetaUrl);
  return join(dir, ...paths);
}

// For CommonJS compatibility - these will be replaced during build
export function getDirnameCompat(fileUrl?: string): string {
  if (fileUrl) {
    return getDirname(fileUrl);
  }
  // In CommonJS, __dirname is available globally
  return typeof __dirname === 'undefined' ? process.cwd() : __dirname;
}

export function getFilenameCompat(fileUrl?: string): string {
  if (fileUrl) {
    return getFilename(fileUrl);
  }
  // In CommonJS, __filename is available globally
  return typeof __filename === 'undefined' ? '' : __filename;
}