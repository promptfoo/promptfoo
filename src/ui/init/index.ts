/**
 * Init UI module exports.
 *
 * Note: InitWizard is intentionally NOT exported here to avoid loading Ink
 * at import time. It is dynamically imported inside the runner functions.
 */
export { runInkInit, shouldUseInkInit } from './initRunner';

// Re-export types only (no runtime loading)
export type {
  FileToCreate,
  InitResult,
  InitRunnerOptions,
  InitWizardProps,
  Language,
  ProviderChoice,
  ProviderStatus,
  SelectItem,
  UseCase,
  WizardState,
} from './types';
