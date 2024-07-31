import { ApiProvider, ProviderOptions } from '../types';

export type RedteamPluginObject = {
  id: string;
  numTests?: number;
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
  numTests: number;
  output?: string;
  plugins?: RedteamPluginObject[];
  addPlugins?: string[];
  addStrategies?: string[];
  provider?: string;
  purpose?: string;
  strategies?: RedteamStrategy[];
  write: boolean;
};

export type RedteamConfig = {
  injectVar?: string;
  purpose?: string;
  provider?: string | ProviderOptions | ApiProvider;
  numTests: number;
  plugins: RedteamPluginObject[];
  strategies: RedteamStrategy[];
};

export type RedteamAssertionTypes = `promptfoo:redteam:${string}`;

export interface SynthesizeOptions {
  injectVar?: string;
  numTests: number;
  plugins: { id: string; numTests: number }[];
  prompts: string[];
  provider?: ApiProvider | ProviderOptions | string;
  purpose?: string;
  strategies: { id: string }[];
}
