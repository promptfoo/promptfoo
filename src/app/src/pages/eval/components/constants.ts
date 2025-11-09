/**
 * Constants for eval filter URL persistence
 */

/** Maximum number of filters allowed from URL to prevent DoS attacks */
export const MAX_FILTERS_FROM_URL = 50;

/** Warn when URL exceeds this length (approaching browser limits) */
export const URL_LENGTH_WARNING_THRESHOLD = 1500;

/** Maximum safe URL length across browsers */
export const URL_LENGTH_MAX = 2000;

/** Debounce delay for filter URL updates (ms) */
export const FILTER_URL_DEBOUNCE_MS = 300;
