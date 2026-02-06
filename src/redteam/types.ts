import { z } from 'zod';
import { type Inputs, InputsSchema } from '../types/shared';
import { type FrameworkComplianceId, type Plugin, Severity, SeveritySchema } from './constants';
import { isValidPolicyId } from './plugins/policy/validators';

import type { ApiProvider, ProviderOptions } from '../types/providers';

// Re-export Inputs from shared to maintain backwards compatibility
export { InputsSchema, type Inputs };

// Modifiers are used to modify the behavior of the plugin.
// They let the user specify additional instructions for the plugin,
// and can be anything the user wants.
export type Modifier = string | 'tone' | 'style' | 'context' | 'testGenerationInstructions';
export type Intent = string | string[];

// Policy Types
export const PolicyObjectSchema = z.object({
  id: z.string().refine(isValidPolicyId, {
    message: 'ID must be either a UUID or a 12-character hex string',
  }),
  text: z.string().optional(),
  name: z.string().optional(),
  severity: SeveritySchema.optional(),
});
export type PolicyObject = z.infer<typeof PolicyObjectSchema>;
export type Policy = string | PolicyObject; // Policy Text or Policy ID

export type PoliciesById = Map<
  PolicyObject['id'],
  {
    text: Required<PolicyObject>['text'];
    name: Required<PolicyObject>['name'];
    severity: Severity;
  }
>;

// Base types
export type RedteamObjectConfig = Record<string, unknown>;

export interface TracingConfig {
  enabled?: boolean;
  includeInAttack?: boolean;
  includeInGrading?: boolean;
  includeInternalSpans?: boolean;
  maxSpans?: number;
  maxDepth?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  spanFilter?: string[];
  sanitizeAttributes?: boolean;
  strategies?: Record<string, TracingConfig>;
}

export const PluginConfigSchema = z.object({
  examples: z.array(z.string()).optional(),
  graderExamples: z
    .array(
      z.object({
        output: z.string(),
        pass: z.boolean(),
        score: z.number(),
        reason: z.string(),
      }),
    )
    .optional(),
  graderGuidance: z.string().optional(),
  severity: SeveritySchema.optional(),
  language: z.union([z.string(), z.array(z.string())]).optional(),
  prompt: z.string().optional(),
  purpose: z.string().optional(),
  // TODO: should be z.record(Modifier, z.unknown())
  modifiers: z.record(z.string(), z.unknown()).optional(),
  // BOLA
  targetIdentifiers: z.array(z.string()).optional(),
  // BFLA
  targetSystems: z.array(z.string()).optional(),
  // Competitor
  mentions: z.boolean().optional(),
  // SSRF
  targetUrls: z.array(z.string()).optional(),
  ssrfFailThreshold: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  // PII
  name: z.string().optional(),
  // CyberSecEval
  multilingual: z.boolean().optional(),

  indirectInjectionVar: z.string().optional(),
  intent: z.union([z.string(), z.array(z.union([z.string(), z.array(z.string())]))]).optional(),
  policy: z.union([z.string(), PolicyObjectSchema]).optional(),
  systemPrompt: z.string().optional(),
  // Strategy exclusions - allows plugins to exclude incompatible strategies
  excludeStrategies: z.array(z.string()).optional(),

  // Multi-variable inputs - allows generating test cases with multiple variables
  // Keys are variable names, values are descriptions of what each variable should contain
  inputs: InputsSchema.optional(),

  // Allow for the inclusion of a nonce to prevent caching of test cases.
  __nonce: z.number().optional(),
});

export type PluginConfig = z.infer<typeof PluginConfigSchema>;

export const StrategyConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    plugins: z.array(z.string()).optional(),
    numTests: z.number().int().min(0).finite().optional(),
    // Allow arbitrary extra fields for strategy configs
    // Use .catchall to accept any additional unknown properties
    // See: https://github.com/colinhacks/zod#catchall
  })
  .catchall(z.unknown());

export type StrategyConfig = z.infer<typeof StrategyConfigSchema>;

export const ConversationMessageSchema = z.object({
  role: z.enum(['assistant', 'user']),
  content: z.string(),
});
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;

type ConfigurableObject = {
  id: string;
  config?: RedteamObjectConfig;
};

type WithNumTests = {
  numTests?: number;
};

type TestCase = {
  description?: string;
  vars?: Record<string, unknown>;
  provider?: string | ProviderOptions | ApiProvider;
  providerOutput?: string | Record<string, unknown>;
  assert?: any;
  options?: any;
};

// Derived types
export type RedteamPluginObject = ConfigurableObject &
  WithNumTests & {
    severity?: Severity;
    config?: PluginConfig;
  };
export type RedteamPlugin = string | RedteamPluginObject;

export type RedteamStrategyObject = {
  id: string;
  config?: StrategyConfig;
};
export type RedteamStrategy = string | RedteamStrategyObject;

export interface PluginActionParams {
  provider: ApiProvider;
  purpose: string;
  injectVar: string;
  n: number;
  delayMs: number;
  config?: PluginConfig;
}

// Context for testing multiple security contexts/states
export interface RedteamContext {
  id: string;
  purpose: string;
  vars?: Record<string, string>;
}

// Shared redteam options
type CommonOptions = {
  injectVar?: string;
  // Multi-variable inputs - when specified, generates test cases with multiple variables
  // The first key becomes the primary injectVar for strategies
  inputs?: Inputs;
  language?: string | string[];
  numTests?: number;
  plugins?: RedteamPluginObject[];
  provider?: string | ProviderOptions | ApiProvider;
  purpose?: string;
  contexts?: RedteamContext[];
  strategies?: RedteamStrategy[];
  frameworks?: FrameworkComplianceId[];
  delay?: number;
  remote?: boolean;
  sharing?: boolean;
  excludeTargetOutputFromAgenticAttackGeneration?: boolean;
  testGenerationInstructions?: string;
  maxConcurrency?: number;
  tracing?: TracingConfig;
};

// NOTE: Remember to edit validators/redteam.ts:RedteamGenerateOptionsSchema if you edit this schema
export interface RedteamCliGenerateOptions extends CommonOptions {
  cache: boolean;
  config?: string;
  target?: string;
  defaultConfig: Record<string, unknown>;
  defaultConfigPath?: string;
  description?: string;
  envFile?: string;
  maxConcurrency?: number;
  output?: string;
  force?: boolean;
  write: boolean;
  inRedteamRun?: boolean;
  verbose?: boolean;
  abortSignal?: AbortSignal;
  burpEscapeJson?: boolean;
  progressBar?: boolean;
  liveRedteamConfig?: RedteamObjectConfig;
  configFromCloud?: any;
  strict?: boolean;
}

export interface RedteamFileConfig extends CommonOptions {
  entities?: string[];
  severity?: Record<Plugin, Severity>;
  excludeTargetOutputFromAgenticAttackGeneration?: boolean;
}

export interface SynthesizeOptions extends CommonOptions {
  abortSignal?: AbortSignal;
  entities?: string[];
  // Multi-variable inputs for test case generation (from target)
  inputs?: Inputs;
  language?: string | string[];
  maxConcurrency?: number;
  numTests: number;
  plugins: (RedteamPluginObject & { id: string; numTests: number })[];
  prompts: [string, ...string[]];
  strategies: RedteamStrategyObject[];
  targetIds: string[];
  showProgressBar?: boolean;
}

export type RedteamAssertionTypes = `promptfoo:redteam:${string}`;

export interface RedteamRunOptions {
  id?: string;
  config?: string;
  target?: string;
  output?: string;
  cache?: boolean;
  envPath?: string;
  maxConcurrency?: number;
  delay?: number;
  remote?: boolean;
  force?: boolean;
  filterProviders?: string;
  filterTargets?: string;
  verbose?: boolean;
  progressBar?: boolean;
  description?: string;
  strict?: boolean;

  // Used by webui
  liveRedteamConfig?: any;
  logCallback?: (message: string) => void;
  progressCallback?: (
    completed: number,
    total: number,
    index: number | string,
    evalStep: any, // RunEvalOptions, but introduces circular dependency
    metrics: any, // PromptMetrics, but introduces circular dependency
  ) => void;
  abortSignal?: AbortSignal;

  loadedFromCloud?: boolean;
}

export interface SavedRedteamConfig {
  description: string;
  prompts: string[];
  target: ProviderOptions;
  plugins: (RedteamPlugin | { id: string; config?: any })[];
  strategies: RedteamStrategy[];
  purpose?: string;
  frameworks?: FrameworkComplianceId[];
  extensions?: string[];
  numTests?: number;
  maxConcurrency?: number;
  language?: string | string[];
  provider?: string | ProviderOptions;
  applicationDefinition: {
    purpose?: string;
    features?: string;
    hasAccessTo?: string;
    doesNotHaveAccessTo?: string;
    userTypes?: string;
    securityRequirements?: string;
    exampleIdentifiers?: string;
    industry?: string;
    sensitiveDataTypes?: string;
    criticalActions?: string;
    forbiddenTopics?: string;
    competitors?: string;
    systemPrompt?: string;
    redteamUser?: string;
    accessToData?: string;
    forbiddenData?: string;
    accessToActions?: string;
    forbiddenActions?: string;
    connectedSystems?: string;
    attackConstraints?: string;
  };
  testGenerationInstructions?: string;
  entities: string[];
  defaultTest?: TestCase;
}

/**
 * Media data (audio or image) for redteam history entries
 */
export interface RedteamMediaData {
  /**
   * Media payload for rendering/transport.
   *
   * - Base64 string (legacy/inline)
   * - `storageRef:<key>` string (external media storage)
   *
   * Optional because some code paths only know the format and store the payload elsewhere.
   */
  data?: string;
  format: string;
}

/**
 * Single entry in redteam conversation history
 */
export interface RedteamHistoryEntry {
  prompt: string;
  output: string;
  /** Audio data for the prompt (when using audio transforms) */
  promptAudio?: RedteamMediaData;
  /** Image data for the prompt (when using image transforms) */
  promptImage?: RedteamMediaData;
  /** Audio data from the target response */
  outputAudio?: RedteamMediaData;
  /** Image data from the target response */
  outputImage?: RedteamMediaData;
  /** Extracted input variables for multi-input mode */
  inputVars?: Record<string, string>;
}

/**
 * Base metadata interface shared by all redteam providers
 */
export interface BaseRedteamMetadata {
  redteamFinalPrompt?: string;
  messages: Record<string, any>[];
  stopReason: string;
  redteamHistory?: RedteamHistoryEntry[];
  sessionIds?: string[];
  sessionId?: string;
}

/**
 * Configuration for audio grading in voice-based red team evaluations
 */
export interface AudioGradingConfig {
  /** Whether to enable audio-based grading */
  enabled?: boolean;
  /** Model to use for audio grading */
  model?: string;
  /** Custom grading prompt */
  prompt?: string;
}

/**
 * Options for generating red team tests via the public API
 * This is a cleaner subset of RedteamCliGenerateOptions for external use
 */
export type RedteamGenerateOptions = Partial<RedteamCliGenerateOptions>;

/**
 * Information about a plugin that failed to generate test cases.
 */
export interface FailedPluginInfo {
  pluginId: string;
  requested: number;
}

/**
 * Custom error class for partial test generation failures.
 * Thrown when some plugins completely fail to generate any test cases,
 * which would significantly impact scan quality and completeness.
 */
export class PartialGenerationError extends Error {
  public readonly failedPlugins: FailedPluginInfo[];

  constructor(failedPlugins: FailedPluginInfo[]) {
    const pluginList = failedPlugins.map((p) => `  - ${p.pluginId} (0/${p.requested} tests)`);
    const message =
      `Test case generation failed for ${failedPlugins.length} plugin(s):\n` +
      `${pluginList.join('\n')}\n\n` +
      `The scan has been stopped because missing test cases would significantly ` +
      `decrease scan quality and completeness.\n\n` +
      `Possible causes:\n` +
      `  - API rate limiting or connectivity issues\n` +
      `  - Invalid plugin configuration\n` +
      `  - Provider errors during generation\n\n` +
      `To troubleshoot:\n` +
      `  - Run with --verbose flag to see detailed error messages\n` +
      `  - Check API keys and provider configuration\n` +
      `  - Retry the scan after resolving any reported errors`;

    super(message);
    this.name = 'PartialGenerationError';
    this.failedPlugins = failedPlugins;
  }
}
