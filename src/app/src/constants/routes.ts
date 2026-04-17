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
} as const;

// Red Team routes
export const REDTEAM_ROUTES = {
  ROOT: '/redteam',
  SETUP: '/redteam/setup',
  REPORTS: '/reports',
  REPORT_DETAIL: (evalId: string) => `/reports?evalId=${evalId}`,
} as const;

// Other routes
export const ROUTES = {
  HOME: '/',
  SETUP: '/setup',
  PROMPTS: '/prompts',
  PROMPT_DETAIL: (id: string) => `/prompts?id=${id}`,
  DATASETS: '/datasets',
  DATASET_DETAIL: (id: string) => `/datasets?id=${id}`,
  HISTORY: '/history',
  LOGIN: '/login',
} as const;
