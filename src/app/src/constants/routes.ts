/**
 * Centralized route constants for the application.
 * Using constants prevents typos and makes refactoring easier.
 */

// Model Audit routes - mirrors eval structure
export const MODEL_AUDIT_ROUTES = {
  ROOT: '/model-audit',
  LIST: '/model-audits', // Like /evals
  SETUP: '/model-audit/setup',
  DETAIL: (id: string) => `/model-audit/${id}`, // Like /eval/:id
  // Legacy aliases for backward compatibility
  /** @deprecated Use LIST instead */
  HISTORY: '/model-audits',
  /** @deprecated Use DETAIL instead */
  RESULT: (id: string) => `/model-audit/${id}`,
} as const;

// Eval routes
export const EVAL_ROUTES = {
  ROOT: '/eval',
  LIST: '/evals',
  DETAIL: (id: string) => `/eval/${id}`,
  /** Navigate to eval page with evalId query param (legacy pattern) */
  WITH_EVAL_ID: (id: string) => `/eval?evalId=${id}`,
} as const;

// Red Team routes
export const REDTEAM_ROUTES = {
  ROOT: '/redteam',
  SETUP: '/redteam/setup',
  REPORTS: '/reports',
} as const;

// Other routes
export const ROUTES = {
  HOME: '/',
  SETUP: '/setup',
  PROMPTS: '/prompts',
  DATASETS: '/datasets',
  HISTORY: '/history',
  LOGIN: '/login',
} as const;
