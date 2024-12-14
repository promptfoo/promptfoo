import type { ApiProvider, ProviderOptions } from '../types/providers';
import type { Severity, Plugin } from './constants';

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

// Derived types
export type RedteamPluginObject = ConfigurableObject &
  WithNumTests & {
    severity?: Severity;
  };
export type RedteamPlugin = string | RedteamPluginObject;

export type RedteamStrategyObject = ConfigurableObject & {
  config?: StrategyConfig & {
    plugins?: RedteamPluginObject['id'][];
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
};

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
}

export type RedteamAssertionTypes = `promptfoo:redteam:${string}`;
