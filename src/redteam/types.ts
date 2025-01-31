import type { ApiProvider, ProviderOptions } from '../types/providers';
import type { Plugin, Severity } from './constants';

// Base types
export type RedteamObjectConfig = Record<string, unknown>;
export type PluginConfig = RedteamObjectConfig & {
  examples?: string[];
  graderExamples?: {
    output: string;
    pass: boolean;
    score: number;
    reason: string;
  }[];
  severity?: Severity;
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
};

// Derived types
export type RedteamPluginObject = ConfigurableObject &
  WithNumTests & {
    severity?: Severity;
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
};

// NOTE: Remember to edit validators/redteam.ts:RedteamGenerateOptionsSchema if you edit this schema
export interface RedteamCliGenerateOptions extends CommonOptions {
  cache: boolean;
  config?: string;
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
}

export interface RedteamFileConfig extends CommonOptions {
  entities?: string[];
  severity?: Record<Plugin, Severity>;
}

export interface SynthesizeOptions extends CommonOptions {
  entities?: string[];
  language: string;
  maxConcurrency?: number;
  numTests: number;
  plugins: (RedteamPluginObject & { id: string; numTests: number })[];
  prompts: [string, ...string[]];
  strategies: RedteamStrategyObject[];
  abortSignal?: AbortSignal;
}

export type RedteamAssertionTypes = `promptfoo:redteam:${string}`;

export interface RedteamRunOptions {
  id?: string;
  config?: string;
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

  // Used by webui
  liveRedteamConfig?: any;
  logCallback?: (message: string) => void;
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
  numTests?: number;
  applicationDefinition: {
    purpose?: string;
    systemPrompt?: string;
    redteamUser?: string;
    accessToData?: string;
    forbiddenData?: string;
    accessToActions?: string;
    forbiddenActions?: string;
    connectedSystems?: string;
  };
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
