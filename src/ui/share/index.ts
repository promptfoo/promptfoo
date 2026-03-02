/**
 * Share UI module exports.
 *
 * Note: ShareApp and createShareController are intentionally NOT exported here
 * to avoid loading ink at import time. They are dynamically imported inside
 * the runner functions when needed.
 */
export {
  initInkShare,
  type ShareRunnerOptions,
  type ShareUIResult,
  shouldUseInkShare,
} from './shareRunner';

// Re-export types only (no runtime loading)
export type {
  ShareAppProps,
  ShareController,
  SharePhase,
  ShareProgress,
} from './ShareApp';
