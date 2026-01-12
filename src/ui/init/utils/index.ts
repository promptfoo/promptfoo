/**
 * Utility functions for the init wizard.
 */

export { generateConfig, generateFiles } from './configGenerator';
export { downloadExample, fetchExampleList, getExampleDescription } from './exampleDownloader';
export {
  checkExistingFiles,
  ensureDirectory,
  getRelativePath,
  isWritable,
  normalizeDirectory,
  resolvePath,
  safeFilename,
  writeFiles,
} from './fileWriter';

export type { DownloadProgress, DownloadResult } from './exampleDownloader';
export type { WriteOptions, WriteResult } from './fileWriter';
