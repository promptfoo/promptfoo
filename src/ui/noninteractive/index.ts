/**
 * Non-interactive UI utilities.
 *
 * This module exports utilities for displaying progress and output
 * in non-TTY environments like CI pipelines.
 *
 * IMPORTANT: This module has ZERO Ink/React dependencies to ensure
 * it can be loaded without pulling in the React runtime.
 */

export { NonInteractiveProgress, NonInteractiveSpinner } from './progress';
export { getTextOutput, TextOutput } from './textOutput';

export type { ProgressUpdate } from './progress';
