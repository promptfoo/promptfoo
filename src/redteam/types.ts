import { z } from 'zod';
import { type Inputs, InputsSchema } from '../types/shared';
import { type FrameworkComplianceId, type Plugin, Severity, SeveritySchema } from './constants';
import { isValidPolicyId } from './plugins/policy/validators';

import type { EventSource } from '../types/eventSource';
import type { ApiProvider, ProviderOptions } from '../types/providers';

// Re-export Inputs from shared to maintain backwards compatibility
export { type Inputs, InputsSchema };

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
  /** Example inputs used to steer red-team test generation. */
  examples: z.array(z.string()).optional(),
  /** Example grader outputs used to calibrate plugin-specific grading. */
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
  /** Additional rubric guidance passed to plugin graders. */
  graderGuidance: z.string().optional(),
  /** Severity override for the generated finding. */
  severity: SeveritySchema.optional(),
  /** Language or languages requested for generated tests. */
  language: z.union([z.string(), z.array(z.string())]).optional(),
  /** Prompt override used by plugins that accept custom generation prompts. */
  prompt: z.string().optional(),
  /** System purpose override supplied to plugin generation. */
  purpose: z.string().optional(),
  /** Plugin-specific behavior modifiers such as tone or style. */
  // TODO: should be z.record(Modifier, z.unknown())
  modifiers: z.record(z.string(), z.unknown()).optional(),
  /** Target identifiers used by BOLA-style authorization plugins. */
  targetIdentifiers: z.array(z.string()).optional(),
  /** Target systems used by BFLA-style authorization plugins. */
  targetSystems: z.array(z.string()).optional(),
  /** Whether competitor-oriented plugins may mention the configured competitor names. */
  mentions: z.boolean().optional(),
  /** URLs used by SSRF-oriented plugins as candidate targets. */
  targetUrls: z.array(z.string()).optional(),
  /** Severity threshold that marks an SSRF probe as failed. */
  ssrfFailThreshold: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  /** Subject name used by PII-oriented plugins. */
  name: z.string().optional(),
  /** Whether CyberSecEval-style plugins should generate multilingual probes. */
  multilingual: z.boolean().optional(),

  /** Variable name that receives the indirect prompt-injection payload. */
  indirectInjectionVar: z.string().optional(),
  /** Expected retrieval results used by RAG-poisoning plugins. */
  intendedResults: z.array(z.string()).optional(),
  /** Intent label or labels used by intent-aware plugins. */
  intent: z.union([z.string(), z.array(z.union([z.string(), z.array(z.string())]))]).optional(),
  /** Policy text or policy id used by policy-aware plugins. */
  policy: z.union([z.string(), PolicyObjectSchema]).optional(),
  /** System prompt supplied to plugins that need the target instructions explicitly. */
  systemPrompt: z.string().optional(),
  /** Strategy ids this plugin should not be combined with. */
  excludeStrategies: z.array(z.string()).optional(),

  /** Single protected file path used by coding-agent fixtures. */
  protectedFilePath: z.string().optional(),
  /** Multiple protected file paths used by coding-agent fixtures. */
  protectedFilePaths: z.array(z.string()).optional(),
  /** Single secret file path used by coding-agent fixtures. */
  secretFilePath: z.string().optional(),
  /** Multiple secret file paths used by coding-agent fixtures. */
  secretFilePaths: z.array(z.string()).optional(),
  /** Single local secret file path used by coding-agent fixtures. */
  secretLocalFilePath: z.string().optional(),
  /** Multiple local secret file paths used by coding-agent fixtures. */
  secretLocalFilePaths: z.array(z.string()).optional(),
  /** Single expected secret file value used by coding-agent fixtures. */
  secretFileValue: z.string().optional(),
  /** Multiple expected secret file values used by coding-agent fixtures. */
  secretFileValues: z.array(z.string()).optional(),
  /** Single path outside the workspace that must not be written. */
  outsideWritePath: z.string().optional(),
  /** Multiple paths outside the workspace that must not be written. */
  outsideWritePaths: z.array(z.string()).optional(),
  /** Single host path outside the workspace used by write-safety fixtures. */
  outsideWriteHostPath: z.string().optional(),
  /** Multiple host paths outside the workspace used by write-safety fixtures. */
  outsideWriteHostPaths: z.array(z.string()).optional(),
  /** Single probe directory outside the workspace used by write-safety fixtures. */
  outsideWriteProbeDir: z.string().optional(),
  /** Multiple probe directories outside the workspace used by write-safety fixtures. */
  outsideWriteProbeDirs: z.array(z.string()).optional(),
  /** Single outside path that is explicitly allowed to be written. */
  outsideWriteAllowedPath: z.string().optional(),
  /** Multiple outside paths that are explicitly allowed to be written. */
  outsideWriteAllowedPaths: z.array(z.string()).optional(),
  /** Expected SHA-256 hash for an outside-write fixture artifact. */
  outsideWriteExpectedSha256: z.string().optional(),
  /** SHA-256 hash of the outside path contents before the run. */
  outsideWritePathSha256: z.string().optional(),
  /** SHA-256 hash used by outside-write fixture checks. */
  outsideWriteSha256: z.string().optional(),
  /** Single outside path that must remain absent after the run. */
  outsideWriteMustNotExistPath: z.string().optional(),
  /** Multiple outside paths that must remain absent after the run. */
  outsideWriteMustNotExistPaths: z.array(z.string()).optional(),
  /** Single path that must not exist after the run. */
  mustNotExistPath: z.string().optional(),
  /** Multiple paths that must not exist after the run. */
  mustNotExistPaths: z.array(z.string()).optional(),
  /** Single protected write target used by fixture checks. */
  protectedWritePath: z.string().optional(),
  /** Multiple protected write targets used by fixture checks. */
  protectedWritePaths: z.array(z.string()).optional(),
  /** Single sandbox path used by fixture checks. */
  sandboxWritePath: z.string().optional(),
  /** Multiple sandbox paths used by fixture checks. */
  sandboxWritePaths: z.array(z.string()).optional(),
  /** Single artifact root used by verifier fixtures. */
  verifierArtifactRoot: z.string().optional(),
  /** Multiple artifact roots used by verifier fixtures. */
  verifierArtifactRoots: z.array(z.string()).optional(),
  /** Single verifier probe directory used by fixture checks. */
  verifierProbeDir: z.string().optional(),
  /** Multiple verifier probe directories used by fixture checks. */
  verifierProbeDirs: z.array(z.string()).optional(),
  /** Single workspace path supplied to coding-agent fixtures. */
  workspacePath: z.string().optional(),
  /** Multiple workspace paths supplied to coding-agent fixtures. */
  workspacePaths: z.array(z.string()).optional(),
  /** Single workspace root supplied to coding-agent fixtures. */
  workspaceRoot: z.string().optional(),
  /** Multiple workspace roots supplied to coding-agent fixtures. */
  workspaceRoots: z.array(z.string()).optional(),
  /** Preferred working directory supplied to coding-agent fixtures. */
  workingDirectory: z.string().optional(),
  /** Explicit working-directory path supplied to coding-agent fixtures. */
  workingDirectoryPath: z.string().optional(),
  /** Short-form working directory alias supplied to coding-agent fixtures. */
  workingDir: z.string().optional(),
  /** Single URL used to detect outbound network egress. */
  networkEgressUrl: z.string().optional(),
  /** Multiple URLs used to detect outbound network egress. */
  networkEgressUrls: z.array(z.string()).optional(),
  /** Single trap URL used by network-safety fixtures. */
  networkTrapUrl: z.string().optional(),
  /** Multiple trap URLs used by network-safety fixtures. */
  networkTrapUrls: z.array(z.string()).optional(),
  /** Single host used to detect outbound network egress. */
  networkEgressHost: z.string().optional(),
  /** Multiple hosts used to detect outbound network egress. */
  networkEgressHosts: z.array(z.string()).optional(),
  /** Single trap host used by network-safety fixtures. */
  networkTrapHost: z.string().optional(),
  /** Multiple trap hosts used by network-safety fixtures. */
  networkTrapHosts: z.array(z.string()).optional(),
  /** Single host explicitly allowed by network-safety fixtures. */
  networkAllowedHost: z.string().optional(),
  /** Multiple hosts explicitly allowed by network-safety fixtures. */
  networkAllowedHosts: z.array(z.string()).optional(),
  /** Single URL explicitly allowed by network-safety fixtures. */
  networkAllowedUrl: z.string().optional(),
  /** Multiple URLs explicitly allowed by network-safety fixtures. */
  networkAllowedUrls: z.array(z.string()).optional(),
  /** Single trap-log path inspected by network-safety fixtures. */
  networkTrapLogPath: z.string().optional(),
  /** Multiple trap-log paths inspected by network-safety fixtures. */
  networkTrapLogPaths: z.array(z.string()).optional(),
  /** Single path scanned for network-safety fixture artifacts. */
  networkScanPath: z.string().optional(),
  /** Multiple paths scanned for network-safety fixture artifacts. */
  networkScanPaths: z.array(z.string()).optional(),
  /** Single workspace path used by network-safety fixtures. */
  networkWorkspacePath: z.string().optional(),
  /** Multiple workspace paths used by network-safety fixtures. */
  networkWorkspacePaths: z.array(z.string()).optional(),
  /** Single receipt string expected from a network-egress fixture. */
  networkEgressReceipt: z.string().optional(),
  /** Multiple receipt strings expected from network-egress fixtures. */
  networkEgressReceipts: z.array(z.string()).optional(),

  /** Multi-variable input definitions used while generating test cases. */
  inputs: InputsSchema.optional(),
  /** Maximum generated characters per conversation message. */
  maxCharsPerMessage: z.number().int().positive().optional(),

  /** Nonce used to prevent reuse of cached generated test cases. */
  __nonce: z.number().optional(),
});

/**
 * Example grader outcome used to calibrate plugin-specific red-team grading.
 *
 * @example
 * ```ts
 * const example: PluginGraderExample = {
 *   output: 'The model refused the request.',
 *   pass: true,
 *   score: 1,
 *   reason: 'Refusal followed policy.',
 * };
 * ```
 *
 * @public
 */
export interface PluginGraderExample {
  /** Example model output shown to the grader. */
  output: string;
  /** Whether the example should be treated as passing. */
  pass: boolean;
  /** Numeric score assigned to the example. */
  score: number;
  /** Explanation of why the example passes or fails. */
  reason: string;
}

/**
 * Advanced plugin configuration carried on generated red-team test cases.
 *
 * Most callers should prefer the higher-level red-team config docs; this type is
 * exposed here because generated test metadata preserves the resolved plugin
 * settings.
 *
 * @example
 * ```ts
 * const pluginConfig: PluginConfig = {
 *   language: 'Spanish',
 *   severity: 'high',
 * };
 * ```
 *
 * @public
 */
export interface PluginConfig {
  /** Example inputs used to steer red-team test generation. */
  examples?: string[];
  /** Example grader outputs used to calibrate plugin-specific grading. */
  graderExamples?: PluginGraderExample[];
  /** Additional rubric guidance passed to plugin graders. */
  graderGuidance?: string;
  /** Severity override for the generated finding. */
  severity?: Severity;
  /** Language or languages requested for generated tests. */
  language?: string | string[];
  /** Prompt override used by plugins that accept custom generation prompts. */
  prompt?: string;
  /** System purpose override supplied to plugin generation. */
  purpose?: string;
  /** Plugin-specific behavior modifiers such as tone or style. */
  modifiers?: Record<string, unknown>;
  /** Target identifiers used by BOLA-style authorization plugins. */
  targetIdentifiers?: string[];
  /** Target systems used by BFLA-style authorization plugins. */
  targetSystems?: string[];
  /** Whether competitor-oriented plugins may mention the configured competitor names. */
  mentions?: boolean;
  /** URLs used by SSRF-oriented plugins as candidate targets. */
  targetUrls?: string[];
  /** Severity threshold that marks an SSRF probe as failed. */
  ssrfFailThreshold?: 'low' | 'medium' | 'high' | 'critical';
  /** Subject name used by PII-oriented plugins. */
  name?: string;
  /** Whether CyberSecEval-style plugins should generate multilingual probes. */
  multilingual?: boolean;
  /** Variable name that receives the indirect prompt-injection payload. */
  indirectInjectionVar?: string;
  /** Expected retrieval results used by RAG-poisoning plugins. */
  intendedResults?: string[];
  /** Intent label or labels used by intent-aware plugins. */
  intent?: string | (string | string[])[];
  /** Policy text or policy id used by policy-aware plugins. */
  policy?: Policy;
  /** System prompt supplied to plugins that need the target instructions explicitly. */
  systemPrompt?: string;
  /** Strategy ids this plugin should not be combined with. */
  excludeStrategies?: string[];
  /** Single protected file path used by coding-agent fixtures. */
  protectedFilePath?: string;
  /** Multiple protected file paths used by coding-agent fixtures. */
  protectedFilePaths?: string[];
  /** Single secret file path used by coding-agent fixtures. */
  secretFilePath?: string;
  /** Multiple secret file paths used by coding-agent fixtures. */
  secretFilePaths?: string[];
  /** Single local secret file path used by coding-agent fixtures. */
  secretLocalFilePath?: string;
  /** Multiple local secret file paths used by coding-agent fixtures. */
  secretLocalFilePaths?: string[];
  /** Single expected secret file value used by coding-agent fixtures. */
  secretFileValue?: string;
  /** Multiple expected secret file values used by coding-agent fixtures. */
  secretFileValues?: string[];
  /** Single path outside the workspace that must not be written. */
  outsideWritePath?: string;
  /** Multiple paths outside the workspace that must not be written. */
  outsideWritePaths?: string[];
  /** Single host path outside the workspace used by write-safety fixtures. */
  outsideWriteHostPath?: string;
  /** Multiple host paths outside the workspace used by write-safety fixtures. */
  outsideWriteHostPaths?: string[];
  /** Single probe directory outside the workspace used by write-safety fixtures. */
  outsideWriteProbeDir?: string;
  /** Multiple probe directories outside the workspace used by write-safety fixtures. */
  outsideWriteProbeDirs?: string[];
  /** Single outside path that is explicitly allowed to be written. */
  outsideWriteAllowedPath?: string;
  /** Multiple outside paths that are explicitly allowed to be written. */
  outsideWriteAllowedPaths?: string[];
  /** Expected SHA-256 hash for an outside-write fixture artifact. */
  outsideWriteExpectedSha256?: string;
  /** SHA-256 hash of the outside path contents before the run. */
  outsideWritePathSha256?: string;
  /** SHA-256 hash used by outside-write fixture checks. */
  outsideWriteSha256?: string;
  /** Single outside path that must remain absent after the run. */
  outsideWriteMustNotExistPath?: string;
  /** Multiple outside paths that must remain absent after the run. */
  outsideWriteMustNotExistPaths?: string[];
  /** Single path that must not exist after the run. */
  mustNotExistPath?: string;
  /** Multiple paths that must not exist after the run. */
  mustNotExistPaths?: string[];
  /** Single protected write target used by fixture checks. */
  protectedWritePath?: string;
  /** Multiple protected write targets used by fixture checks. */
  protectedWritePaths?: string[];
  /** Single sandbox path used by fixture checks. */
  sandboxWritePath?: string;
  /** Multiple sandbox paths used by fixture checks. */
  sandboxWritePaths?: string[];
  /** Single artifact root used by verifier fixtures. */
  verifierArtifactRoot?: string;
  /** Multiple artifact roots used by verifier fixtures. */
  verifierArtifactRoots?: string[];
  /** Single verifier probe directory used by fixture checks. */
  verifierProbeDir?: string;
  /** Multiple verifier probe directories used by fixture checks. */
  verifierProbeDirs?: string[];
  /** Single workspace path supplied to coding-agent fixtures. */
  workspacePath?: string;
  /** Multiple workspace paths supplied to coding-agent fixtures. */
  workspacePaths?: string[];
  /** Single workspace root supplied to coding-agent fixtures. */
  workspaceRoot?: string;
  /** Multiple workspace roots supplied to coding-agent fixtures. */
  workspaceRoots?: string[];
  /** Preferred working directory supplied to coding-agent fixtures. */
  workingDirectory?: string;
  /** Explicit working-directory path supplied to coding-agent fixtures. */
  workingDirectoryPath?: string;
  /** Short-form working directory alias supplied to coding-agent fixtures. */
  workingDir?: string;
  /** Single URL used to detect outbound network egress. */
  networkEgressUrl?: string;
  /** Multiple URLs used to detect outbound network egress. */
  networkEgressUrls?: string[];
  /** Single trap URL used by network-safety fixtures. */
  networkTrapUrl?: string;
  /** Multiple trap URLs used by network-safety fixtures. */
  networkTrapUrls?: string[];
  /** Single host used to detect outbound network egress. */
  networkEgressHost?: string;
  /** Multiple hosts used to detect outbound network egress. */
  networkEgressHosts?: string[];
  /** Single trap host used by network-safety fixtures. */
  networkTrapHost?: string;
  /** Multiple trap hosts used by network-safety fixtures. */
  networkTrapHosts?: string[];
  /** Single host explicitly allowed by network-safety fixtures. */
  networkAllowedHost?: string;
  /** Multiple hosts explicitly allowed by network-safety fixtures. */
  networkAllowedHosts?: string[];
  /** Single URL explicitly allowed by network-safety fixtures. */
  networkAllowedUrl?: string;
  /** Multiple URLs explicitly allowed by network-safety fixtures. */
  networkAllowedUrls?: string[];
  /** Single trap-log path inspected by network-safety fixtures. */
  networkTrapLogPath?: string;
  /** Multiple trap-log paths inspected by network-safety fixtures. */
  networkTrapLogPaths?: string[];
  /** Single path scanned for network-safety fixture artifacts. */
  networkScanPath?: string;
  /** Multiple paths scanned for network-safety fixture artifacts. */
  networkScanPaths?: string[];
  /** Single workspace path used by network-safety fixtures. */
  networkWorkspacePath?: string;
  /** Multiple workspace paths used by network-safety fixtures. */
  networkWorkspacePaths?: string[];
  /** Single receipt string expected from a network-egress fixture. */
  networkEgressReceipt?: string;
  /** Multiple receipt strings expected from network-egress fixtures. */
  networkEgressReceipts?: string[];
  /** Multi-variable input definitions used while generating test cases. */
  inputs?: Inputs;
  /** Maximum generated characters per conversation message. */
  maxCharsPerMessage?: number;
  /** Nonce used to prevent reuse of cached generated test cases. */
  __nonce?: number;
  /** Additional plugin-specific settings preserved for custom integrations. */
  [key: string]: unknown;
}

export const StrategyConfigSchema = z
  .object({
    /** Whether the strategy should be enabled. */
    enabled: z.boolean().optional(),
    /** Plugin ids that this strategy should target. */
    plugins: z.array(z.string()).optional(),
    /** Number of tests to generate for the strategy. */
    numTests: z.number().int().min(0).finite().optional(),
    // Allow arbitrary extra fields for strategy configs
    // Use .catchall to accept any additional unknown properties
    // See: https://github.com/colinhacks/zod#catchall
  })
  .catchall(z.unknown());

/**
 * Advanced strategy configuration carried on generated red-team test cases.
 *
 * @example
 * ```ts
 * const strategyConfig: StrategyConfig = {
 *   enabled: true,
 *   plugins: ['prompt-injection'],
 *   numTests: 5,
 * };
 * ```
 *
 * @public
 */
export interface StrategyConfig {
  /** Whether the strategy should be enabled. */
  enabled?: boolean;
  /** Plugin ids that this strategy should target. */
  plugins?: string[];
  /** Number of tests to generate for the strategy. */
  numTests?: number;
  [key: string]: unknown;
}

type AssertEqual<T, U> = T extends U ? (U extends T ? true : false) : false;
function assert<_T extends true>() {}

assert<AssertEqual<StrategyConfig, z.infer<typeof StrategyConfigSchema>>>();

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
  maxCharsPerMessage?: number;
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
  graderExamples?: Array<{ output: string; pass: boolean; score: number; reason: string }>;
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

/**
 * Runtime options accepted by `redteam.run()`.
 *
 * @beta
 */
export interface RedteamRunOptions {
  /** Stable eval id to reuse or attach to the run. */
  id?: string;
  /** Path to the red team config file to execute. */
  config?: string;
  /** Target selector passed through to the run. */
  target?: string;
  /** Optional output path for generated artifacts. */
  output?: string;
  /** Whether to reuse cached provider responses. */
  cache?: boolean;
  /** Path to an environment file loaded before the run. */
  envPath?: string;
  /** Maximum number of provider calls to execute concurrently. */
  maxConcurrency?: number;
  /** Delay in milliseconds between provider calls. */
  delay?: number;
  /** Whether to execute against a remote Promptfoo target. */
  remote?: boolean;
  /** Whether to bypass prompts that normally ask for confirmation. */
  force?: boolean;
  /** Prompt filter expression applied before execution. */
  filterPrompts?: string;
  /** Provider filter expression applied before execution. */
  filterProviders?: string;
  /** Target filter expression applied before execution. */
  filterTargets?: string;
  /** Whether to emit verbose runtime logging. */
  verbose?: boolean;
  /** Whether to render a progress bar. */
  progressBar?: boolean;
  /** Human-readable description recorded with the run. */
  description?: string;
  /** Whether to fail closed on invalid or partial runtime input. */
  strict?: boolean;

  /**
   * Live config payload used by the web UI flow. The payload is opaque to the
   * Node.js API and is forwarded to the run unchanged.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  liveRedteamConfig?: any;
  /** Optional callback for runtime log messages. */
  logCallback?: (message: string) => void;
  /**
   * Callback invoked as red team results complete. `evalStep` and `metrics`
   * mirror the {@link EvaluateOptions.progressCallback} arguments.
   */
  progressCallback?: (
    completed: number,
    total: number,
    index: number | string,
    evalStep: any, // RunEvalOptions, but importing it introduces a circular dependency.
    metrics: any, // PromptMetrics, but importing it introduces a circular dependency.
  ) => void;
  /** Signal used to cancel the run. */
  abortSignal?: AbortSignal;

  /** Whether the config originated from Promptfoo Cloud. */
  loadedFromCloud?: boolean;
  eventSource?: EventSource;
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
  maxCharsPerMessage?: number;
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
 * Options for generating red team tests via the public API.
 *
 * This is a cleaner subset of `RedteamCliGenerateOptions` for external use.
 *
 * @beta
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

/**
 * Raised when a local user has exhausted the monthly free redteam probe quota.
 * CLI handlers translate this into an exit code; package callers can catch it.
 */
export class ProbeLimitExceededError extends Error {
  public readonly used: number;
  public readonly limit: number;

  constructor(used: number, limit: number) {
    super(
      `Monthly redteam probe limit reached: ${used.toLocaleString('en-US')}/${limit.toLocaleString('en-US')}`,
    );
    this.name = 'ProbeLimitExceededError';
    this.used = used;
    this.limit = limit;
  }
}
