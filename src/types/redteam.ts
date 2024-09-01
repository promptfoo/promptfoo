import type { ApiProvider, ProviderOptions } from '../types/providers';

// Base types
type ConfigurableObject = {
  id: string;
  config?: Record<string, unknown>;
};

type WithNumTests = {
  numTests?: number;
};

// Derived types
export type RedteamPluginObject = ConfigurableObject & WithNumTests;
export type RedteamPlugin = string | RedteamPluginObject;

export type RedteamStrategyObject = ConfigurableObject;
export type RedteamStrategy = string | RedteamStrategyObject;

// Shared redteam options
type CommonOptions = {
  injectVar?: string;
  language?: string;
  numTests?: number;
  plugins?: RedteamPluginObject[];
  provider?: string | ProviderOptions | ApiProvider;
  purpose?: string;
  strategies?: RedteamStrategy[];
};

export interface RedteamGenerateOptions extends CommonOptions {
  cache: boolean;
  config?: string;
  defaultConfig: Record<string, unknown>;
  defaultConfigPath?: string;
  envFile?: string;
  maxConcurrency?: number;
  output?: string;
  write: boolean;
}

export interface RedteamConfig extends CommonOptions {
  entities?: string[];
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
