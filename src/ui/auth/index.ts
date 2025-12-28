/**
 * Auth UI module exports.
 *
 * Note: AuthApp and createAuthController are intentionally NOT exported here
 * to avoid loading ink at import time. They are dynamically imported inside
 * the runner functions when needed.
 */
export {
  type AuthRunnerOptions,
  type AuthUIResult,
  initInkAuth,
  shouldUseInkAuth,
} from './authRunner';

// Re-export types only (no runtime loading)
export type {
  AuthAppProps,
  AuthController,
  AuthPhase,
  AuthProgress,
  TeamInfo,
  UserInfo,
} from './AuthApp';
