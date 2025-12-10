/**
 * Non-interactive UI utilities.
 *
 * This module exports utilities for displaying progress and output
 * in non-TTY environments like CI pipelines.
 *
 * IMPORTANT: This module has ZERO Ink/React dependencies to ensure
 * it can be loaded without pulling in the React runtime.
 */

export { TextOutput, getTextOutput } from './textOutput';
export { NonInteractiveProgress, NonInteractiveSpinner } from './progress';
export type { ProgressUpdate } from './progress';
