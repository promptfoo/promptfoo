/**
 * Menu UI module exports.
 *
 * Note: MenuApp is intentionally NOT exported here to avoid loading ink
 * at import time. It is dynamically imported inside the runner functions.
 */
export {
  type MenuResult,
  type MenuRunnerOptions,
  runInkMenu,
  shouldUseInkMenu,
} from './menuRunner';

// Re-export types only (no runtime loading)
export type { AuthStatus, MenuAppProps, MenuItem } from './MenuApp';
