import { z } from 'zod';

import type { ApiProvider, ProviderOptions } from '../types/providers';
import type { Plugin, Severity } from './constants';

// Modifiers are used to modify the behavior of the plugin.
// They let the user specify additional instructions for the plugin,
// and can be anything the user wants.
export type Modifier = string | 'tone' | 'style' | 'context' | 'testGenerationInstructions';
export type Intent = string | string[];

// Policy Types
export const PolicyObjectSchema = z.object({
  id: z.string().uuid(),
  text: z.string().optional(),
});
export type PolicyObject = z.infer<typeof PolicyObjectSchema>;
export type Policy = string | PolicyObject; // Policy Text or Policy ID
export type PolicyTexts = Record<PolicyObject['id'], Required<PolicyObject>['text']>;

// Base types
export type RedteamObjectConfig = Record<string, unknown>;
export type PluginConfig = {
  examples?: string[];
  graderExamples?: {
    output: string;
    pass: boolean;
    score: number;
    reason: string;
  }[];
  severity?: Severity;
  language?: string;
  prompt?: string;
  purpose?: string;
  modifiers?: Partial<Record<Modifier, unknown>>;
  // BOLA
  targetIdentifiers?: string[];
  // BFLA
  targetSystems?: string[];
  // Competitor
  mentions?: boolean;
  // SSRF
  targetUrls?: string[];
  // PII
  name?: string;
  // CyberSecEval
  multilingual?: boolean;

  indirectInjectionVar?: string;
  intent?: Intent | Intent[];
  policy?: Policy;
  systemPrompt?: string;
  // Strategy exclusions - allows plugins to exclude incompatible strategies
  excludeStrategies?: string[];
};
export type StrategyConfig = RedteamObjectConfig;

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

export type RedteamStrategyObject = ConfigurableObject & {
  id: string;
  config?: {
    enabled?: boolean;
    plugins?: string[];
    [key: string]: unknown;
  };
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

// Shared redteam options
type CommonOptions = {
  injectVar?: string;
  language?: string;
  numTests?: number;
  plugins?: RedteamPluginObject[];
  provider?: string | ProviderOptions | ApiProvider;
  purpose?: string;
  strategies?: RedteamStrategy[];
  delay?: number;
  remote?: boolean;
  sharing?: boolean;
  excludeTargetOutputFromAgenticAttackGeneration?: boolean;
  testGenerationInstructions?: string;
  maxConcurrency?: number;
};

// NOTE: Remember to edit validators/redteam.ts:RedteamGenerateOptionsSchema if you edit this schema
export interface RedteamCliGenerateOptions extends CommonOptions {
  cache: boolean;
  config?: string;
  target?: string;
  defaultConfig: Record<string, unknown>;
  defaultConfigPath?: string;
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
}

export interface RedteamFileConfig extends CommonOptions {
  entities?: string[];
  severity?: Record<Plugin, Severity>;
  excludeTargetOutputFromAgenticAttackGeneration?: boolean;
}

export interface SynthesizeOptions extends CommonOptions {
  abortSignal?: AbortSignal;
  entities?: string[];
  language: string;
  maxConcurrency?: number;
  numTests: number;
  plugins: (RedteamPluginObject & { id: string; numTests: number })[];
  prompts: [string, ...string[]];
  strategies: RedteamStrategyObject[];
  targetLabels: string[];
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
  extensions?: string[];
  numTests?: number;
  maxConcurrency?: number;
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
 * Base metadata interface shared by all redteam providers
 */
export interface BaseRedteamMetadata {
  redteamFinalPrompt?: string;
  messages: Record<string, any>[];
  stopReason: string;
  redteamHistory?: { prompt: string; output: string }[];
}

/**
 * Options for generating red team tests via the public API
 * This is a cleaner subset of RedteamCliGenerateOptions for external use
 */
export type RedteamGenerateOptions = Partial<RedteamCliGenerateOptions>;
