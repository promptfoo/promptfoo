import type { ApiProvider, ProviderOptions } from '../types/providers';

export type RedteamPluginObject = {
  id: string;
  numTests?: number;
  config?: Record<string, unknown>;
};

export type RedteamPlugin = string | RedteamPluginObject;

export type RedteamStrategyObject = {
  id: string;
};

export type RedteamStrategy = string | RedteamStrategyObject;

export type RedteamGenerateOptions = {
  cache: boolean;
  config?: string;
  defaultConfig: Record<string, unknown>;
  defaultConfigPath?: string;
  envFile?: string;
  injectVar?: string;
  language?: string;
  numTests?: number;
  output?: string;
  plugins?: RedteamPluginObject[];
  provider?: string;
  purpose?: string;
  strategies?: RedteamStrategy[];
  write: boolean;
};

export type RedteamConfig = {
  entities?: string[];
  injectVar?: string;
  numTests?: number;
  language?: string;
  plugins: RedteamPluginObject[];
  provider?: string | ProviderOptions | ApiProvider;
  purpose?: string;
  strategies: RedteamStrategyObject[];
};

export type RedteamAssertionTypes = `promptfoo:redteam:${string}`;

export interface SynthesizeOptions {
  entities?: string[];
  injectVar?: string;
  numTests: number;
  language: string;
  plugins: { id: string; numTests: number; config?: Record<string, any> }[];
  prompts: [string, ...string[]];
  provider?: ApiProvider | ProviderOptions | string;
  purpose?: string;
  strategies: { id: string }[];
}
