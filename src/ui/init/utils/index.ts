/**
 * Utility functions for the init wizard.
 */

export { generateConfig, generateFiles } from './configGenerator';
export { downloadExample, fetchExampleList, getExampleDescription } from './exampleDownloader';
export {
  checkExistingFiles,
  isWritable,
  normalizeDirectory,
  resolvePath,
  writeFiles,
} from './fileWriter';

export type { DownloadProgress, DownloadResult } from './exampleDownloader';
export type { WriteOptions, WriteResult } from './fileWriter';
