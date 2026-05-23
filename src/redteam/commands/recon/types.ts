/**
 * Types for the recon command
 *
 * Command-local types for configuring and running reconnaissance.
 */

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
