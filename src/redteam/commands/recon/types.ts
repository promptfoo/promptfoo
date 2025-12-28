/**
 * Types for the recon command
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
 * Discovered tool/function from the codebase
 */
export interface DiscoveredTool {
  name: string;
  description: string;
  file?: string;
  parameters?: string;
}

/**
 * Result of the reconnaissance analysis
 */
export interface ReconResult {
  // Core ApplicationDefinition fields
  purpose: string;
  features?: string;
  industry?: string;
  systemPrompt?: string;
  hasAccessTo?: string;
  doesNotHaveAccessTo?: string;
  userTypes?: string;
  securityRequirements?: string;
  sensitiveDataTypes?: string;
  exampleIdentifiers?: string;
  criticalActions?: string;
  forbiddenTopics?: string;
  attackConstraints?: string;
  competitors?: string;
  connectedSystems?: string;
  redteamUser?: string;

  // Additional recon-specific fields
  entities?: string[];
  discoveredTools?: DiscoveredTool[];
  suggestedPlugins?: string[];
  securityNotes?: string[];
  keyFiles?: string[];

  // Conversation capability detection
  /** Whether the application maintains state across conversation turns */
  stateful?: boolean;
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
