/**
 * Zod schemas and TypeScript types for the recon command and API.
 *
 * These schemas define the structure of:
 * - Recon analysis results from CLI
 * - Pending recon config for CLI-to-browser handoff
 * - API request/response DTOs
 *
 * @module validators/recon
 */

import { z } from 'zod';

// =============================================================================
// CORE DOMAIN SCHEMAS
// =============================================================================

/**
 * Schema for a tool/function discovered during codebase reconnaissance.
 * Tools represent capabilities the application has access to.
 */
export const DiscoveredToolSchema = z.object({
  /** Name of the tool/function */
  name: z.string().min(1).describe('Name of the discovered tool or function'),
  /** Description of what the tool does */
  description: z.string().describe('Description of the tool functionality'),
  /** Source file where the tool was found (optional) */
  file: z.string().optional().describe('File path where the tool was discovered'),
  /** Parameter signature or schema (optional) */
  parameters: z.string().optional().describe('Parameter signature or JSON schema'),
});

/**
 * Schema for application definition fields extracted during reconnaissance.
 * These fields provide context about the application for red team test generation.
 */
export const ApplicationDefinitionSchema = z.object({
  /** Primary purpose and objective of the application */
  purpose: z.string().optional().describe('Primary purpose and objective of the application'),
  /** Key features and capabilities */
  features: z.string().optional().describe('Key features and capabilities'),
  /** Industry or domain the application operates in */
  industry: z.string().optional().describe('Industry or domain'),
  /** System prompt or base instructions */
  systemPrompt: z.string().optional().describe('Discovered system prompt or instructions'),
  /** Systems and data the application can access */
  hasAccessTo: z.string().optional().describe('Systems and data the application can access'),
  /** Systems and data the application should NOT access */
  doesNotHaveAccessTo: z.string().optional().describe('Restricted systems and data'),
  /** Types of users who interact with the application */
  userTypes: z.string().optional().describe('Types of users who interact with the application'),
  /** Security and compliance requirements */
  securityRequirements: z.string().optional().describe('Security and compliance requirements'),
  /** Types of sensitive data handled */
  sensitiveDataTypes: z.string().optional().describe('Types of sensitive data handled'),
  /** Example identifiers and data formats */
  exampleIdentifiers: z.string().optional().describe('Example identifiers and data formats'),
  /** High-risk or critical actions */
  criticalActions: z.string().optional().describe('High-risk or critical actions'),
  /** Topics the application should never discuss */
  forbiddenTopics: z.string().optional().describe('Topics the application should never discuss'),
  /** Constraints or rules for attack generation */
  attackConstraints: z.string().optional().describe('Constraints for attack generation'),
  /** Competitors that should not be endorsed */
  competitors: z.string().optional().describe('Competitors that should not be endorsed'),
  /** External systems the application connects to */
  connectedSystems: z.string().optional().describe('Connected external systems'),
  /** Typical user persona for red team simulation */
  redteamUser: z.string().optional().describe('Red team user persona'),
  // UI-specific fields (aliases for better UX in the setup wizard)
  /** Data the application can access (UI alias for hasAccessTo) */
  accessToData: z.string().optional().describe('Data the application can access'),
  /** Data the application cannot access (UI alias for doesNotHaveAccessTo) */
  forbiddenData: z.string().optional().describe('Data the application cannot access'),
  /** Actions the application can perform */
  accessToActions: z.string().optional().describe('Actions the application can perform'),
  /** Actions the application cannot perform */
  forbiddenActions: z.string().optional().describe('Actions the application cannot perform'),
});

/**
 * Schema for the complete result of a reconnaissance analysis.
 * Extends ApplicationDefinition with additional recon-specific fields.
 */
export const ReconResultSchema = ApplicationDefinitionSchema.extend({
  /** Named entities discovered (company names, products, etc.) */
  entities: z.array(z.string()).optional().describe('Named entities discovered'),
  /** Tools and functions discovered in the codebase */
  discoveredTools: z.array(DiscoveredToolSchema).optional().describe('Discovered tools/functions'),
  /** Plugins suggested based on the analysis */
  suggestedPlugins: z.array(z.string()).optional().describe('Suggested red team plugins'),
  /** Security notes and observations */
  securityNotes: z.array(z.string()).optional().describe('Security notes and observations'),
  /** Key files analyzed during reconnaissance */
  keyFiles: z.array(z.string()).optional().describe('Key files that were analyzed'),
  /** Whether the application maintains state across conversation turns */
  stateful: z.boolean().optional().describe('Whether the application is stateful'),
});

/**
 * Schema for the recon context - metadata about the reconnaissance source.
 * Used in the UI to track where the configuration came from.
 */
export const ReconContextSchema = z.object({
  /** Source of the recon data */
  source: z.enum(['recon-cli', 'in-app-recon']).describe('Source of the reconnaissance data'),
  /** Timestamp when the recon was performed (Unix ms) */
  timestamp: z.number().int().positive().describe('Unix timestamp in milliseconds'),
  /** Directory that was scanned */
  codebaseDirectory: z.string().optional().describe('Path to the scanned codebase'),
  /** Number of key files that were analyzed (not total files scanned) */
  keyFilesAnalyzed: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Number of key files analyzed'),
  /** Number of application definition fields that were populated */
  fieldsPopulated: z.number().int().nonnegative().optional().describe('Fields populated count'),
});

// =============================================================================
// PENDING RECON CONFIG SCHEMAS (CLI-to-Browser Handoff)
// =============================================================================

/**
 * Schema for the metadata block in a pending recon config.
 * Written by CLI, read by web UI.
 */
export const PendingReconMetadataSchema = z.object({
  /** Must be 'recon-cli' for CLI-generated configs */
  source: z.literal('recon-cli').describe('Source identifier - must be recon-cli'),
  /** Unix timestamp when the recon was performed */
  timestamp: z.number().int().positive().describe('Unix timestamp in milliseconds'),
  /** Path to the directory that was scanned */
  codebaseDirectory: z.string().optional().describe('Path to the scanned codebase'),
  /** Number of key files that were analyzed (not total files scanned) */
  keyFilesAnalyzed: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Number of key files analyzed'),
  /** Structured application definition extracted from recon */
  applicationDefinition: ApplicationDefinitionSchema.optional().describe(
    'Structured application definition',
  ),
  /**
   * Additional reconnaissance details (tools, security notes, etc.)
   * Named "reconDetails" to distinguish from the UI's "ReconContext" type
   * which tracks display metadata (timestamp, keyFilesAnalyzed, fieldsPopulated).
   */
  reconDetails: z
    .object({
      stateful: z.boolean().optional().describe('Whether the application is stateful'),
      entities: z.array(z.string()).optional().describe('Discovered entities'),
      discoveredTools: z.array(DiscoveredToolSchema).optional().describe('Discovered tools'),
      securityNotes: z.array(z.string()).optional().describe('Security observations'),
      keyFiles: z.array(z.string()).optional().describe('Key files analyzed'),
      suggestedPlugins: z.array(z.string()).optional().describe('Suggested plugins'),
    })
    .optional()
    .describe('Additional reconnaissance details'),
});

/**
 * Schema for the red team config section in pending recon.
 * This is a subset of the full red team config.
 */
export const PendingReconRedteamConfigSchema = z.object({
  /** Purpose/context for red team testing */
  purpose: z.string().optional().describe('Red team purpose string'),
  /** Plugins to use for testing */
  plugins: z
    .array(z.union([z.string(), z.object({}).passthrough()]))
    .optional()
    .describe('Red team plugins'),
  /** Strategies to apply */
  strategies: z
    .array(z.union([z.string(), z.object({}).passthrough()]))
    .optional()
    .describe('Attack strategies'),
  /** Named entities for personalized attacks */
  entities: z.array(z.string()).optional().describe('Named entities'),
  /** Number of tests to generate */
  numTests: z.number().int().positive().optional().describe('Number of tests per plugin'),
});

/**
 * Schema for the config block in pending recon.
 */
export const PendingReconConfigBlockSchema = z
  .object({
    /** Description of the configuration */
    description: z.string().optional().describe('Configuration description'),
    /** Red team specific configuration */
    redteam: PendingReconRedteamConfigSchema.optional().describe('Red team configuration'),
    /** Additional fields passed through */
  })
  .passthrough();

/**
 * Schema for the complete pending recon configuration.
 * This is the top-level structure written to pending-recon.json.
 */
export const PendingReconConfigSchema = z.object({
  /** The red team configuration */
  config: PendingReconConfigBlockSchema.describe('Red team configuration block'),
  /** Metadata about the recon run */
  metadata: PendingReconMetadataSchema.describe('Metadata about the recon run'),
  /** Full recon result (optional, for reference) */
  reconResult: ReconResultSchema.optional().describe('Full reconnaissance result'),
});

// =============================================================================
// API RESPONSE SCHEMAS
// =============================================================================

/**
 * Schema for successful GET /api/redteam/recon/pending response.
 */
export const GetPendingReconResponseSchema = PendingReconConfigSchema;

/**
 * Schema for successful DELETE /api/redteam/recon/pending response.
 */
export const DeletePendingReconResponseSchema = z.object({
  /** Indicates the operation succeeded */
  success: z.literal(true).describe('Operation success indicator'),
});

/**
 * Schema for error responses from recon endpoints.
 */
export const ReconErrorResponseSchema = z.object({
  /** Error message */
  error: z.string().describe('Error message describing what went wrong'),
  /** Optional additional details */
  details: z.string().optional().describe('Additional error details'),
});

// =============================================================================
// TYPE EXPORTS (inferred from schemas)
// =============================================================================

/** A tool/function discovered during reconnaissance */
export type DiscoveredTool = z.infer<typeof DiscoveredToolSchema>;

/** Application definition fields for red team context */
export type ApplicationDefinition = z.infer<typeof ApplicationDefinitionSchema>;

/** Complete result from reconnaissance analysis */
export type ReconResult = z.infer<typeof ReconResultSchema>;

/** Metadata about the reconnaissance source */
export type ReconContext = z.infer<typeof ReconContextSchema>;

/** Metadata in the pending recon file */
export type PendingReconMetadata = z.infer<typeof PendingReconMetadataSchema>;

/** Complete pending recon configuration */
export type PendingReconConfig = z.infer<typeof PendingReconConfigSchema>;

/** Successful response from GET /api/redteam/recon/pending */
export type GetPendingReconResponse = z.infer<typeof GetPendingReconResponseSchema>;

/** Successful response from DELETE /api/redteam/recon/pending */
export type DeletePendingReconResponse = z.infer<typeof DeletePendingReconResponseSchema>;

/** Error response from recon endpoints */
export type ReconErrorResponse = z.infer<typeof ReconErrorResponseSchema>;
