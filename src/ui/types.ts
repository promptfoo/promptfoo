/**
 * Shared type definitions for the UI module.
 */

/**
 * Share context containing organization and team information.
 * Used when sharing evaluation results to cloud.
 */
export interface ShareContext {
  /** Organization name (from cloud config) */
  organizationName: string;
  /** Team name if applicable */
  teamName?: string;
}
