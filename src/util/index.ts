// Barrel file re-exporting from specialized modules for backwards compatibility

// Test case comparison
export {
  deduplicateTestCases,
  filterRuntimeVars,
  getTestCaseDeduplicationKey,
  isRuntimeVar,
  resultIsForTestCase,
  varsMatch,
} from './comparison';
// Environment setup
export { setupEnv } from './env';
// File operations
export {
  maybeLoadFromExternalFileWithVars,
  maybeLoadResponseFormatFromExternalFile,
  maybeLoadToolsFromExternalFile,
  parsePathOrGlob,
  readFilters,
  readOutput,
} from './file';
// Output operations
export { createOutputMetadata, writeMultipleOutputs, writeOutput } from './output';
// Provider utilities
export { providerToIdentifier } from './provider';
// Template rendering
export { renderEnvOnlyInObject, renderVarsInObject } from './render';
// Runtime utilities
export { isRunningUnderNpx, printBorder } from './runtime';
