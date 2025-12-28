/**
 * Types for the recon command
 *
 * Core domain types (DiscoveredTool, ReconResult, etc.) are imported from
 * the shared validators module to ensure consistency across CLI and server.
 */

// Re-export core domain types from shared validators
export type {
  DiscoveredTool,
  ReconResult,
  ApplicationDefinition,
  ReconContext,
  PendingReconConfig,
} from '../../../validators/recon';

/**
 * Options passed to the recon command
 */
export interface ReconOptions {
  dir?: string;
  output?: string;
  provider?: 'openai' | 'anthropic';
  model?: string;
  verbose?: boolean;
  yes?: boolean;
  exclude?: string[];
  envPath?: string;
  /** Open browser with web UI after analysis (default: true) */
  open?: boolean;
}

/**
 * Scratchpad file management
 */
export interface Scratchpad {
  dir: string;
  path: string;
  cleanup: () => void;
}

/**
 * Provider selection result
 */
export interface ProviderChoice {
  type: 'openai' | 'anthropic';
  model: string;
}
