/**
 * Metadata types for recon output that enables UI import
 *
 * This file defines the structured metadata that recon outputs alongside
 * the formatted purpose string. The UI can detect this metadata and
 * populate applicationDefinition fields automatically.
 */

/**
 * Metadata structure for recon output that enables UI import
 * This is persisted in the YAML output under `metadata:`
 */
export interface ReconMetadata {
  /**
   * Version of the metadata schema for forward compatibility
   */
  version: 1;

  /**
   * Source of the recon (for detection/analytics)
   */
  source: 'recon-cli';

  /**
   * Timestamp when recon was performed
   */
  generatedAt: string;

  /**
   * Directory that was scanned
   */
  scannedDirectory: string;

  /**
   * Structured application definition for UI import
   * Maps directly to UI's ApplicationDefinition type
   */
  applicationDefinition: ReconApplicationDefinition;

  /**
   * Additional context from recon that doesn't fit in applicationDefinition
   */
  reconContext: ReconContext;
}

/**
 * Application definition fields extracted by recon
 * This matches the UI's ApplicationDefinition interface
 */
export interface ReconApplicationDefinition {
  purpose?: string;
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
}

/**
 * Additional recon context beyond ApplicationDefinition
 */
export interface ReconContext {
  /**
   * Whether the application maintains conversation state
   */
  stateful?: boolean;

  /**
   * Discovered tools/functions
   */
  discoveredTools?: Array<{
    name: string;
    description: string;
    parameters?: string;
  }>;

  /**
   * Security observations from code analysis
   */
  securityNotes?: string[];

  /**
   * Key files that were analyzed
   */
  keyFiles?: string[];

  /**
   * Agent-suggested plugins
   */
  suggestedPlugins?: string[];

  /**
   * Discovered entities (names, places, etc.)
   */
  entities?: string[];
}
