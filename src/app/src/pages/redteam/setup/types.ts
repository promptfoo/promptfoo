import type { RedteamPlugin, RedteamStrategy } from '@promptfoo/redteam/types';
import type { RedteamFileConfig } from '@promptfoo/redteam/types';

export interface Config {
  description: string;
  prompts: string[];
  target: ProviderOptions;
  plugins: (RedteamPlugin | { id: string; config?: any })[];
  strategies: RedteamStrategy[];
  purpose?: string;
  entities: string[];
}

export interface ProviderOptions {
  id: string;
  label?: string;
  config: {
    type?: 'http' | 'websocket';
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    responseParser?: string;
    messageTemplate?: string;
    timeoutMs?: number;
  };
}

export interface UpdateConfigFunction {
  (section: keyof Config, value: any): void;
}

export interface RedTeamConfigHook {
  config: Config;
  updateConfig: UpdateConfigFunction;
  resetConfig: () => void;
}

export interface ComponentProps {
  config: Config;
  updateConfig: UpdateConfigFunction;
}

export interface YamlPreviewProps {
  config: Config;
}

export interface YamlConfig {
  description: string;
  targets: ProviderOptions[];
  prompts: string[];
  redteam: RedteamFileConfig;
}

export interface LocalPluginConfig {
  [key: string]: {
    policy?: string;
    systemPrompt?: string;
    targetIdentifiers?: string[];
    targetSystems?: string[];
    indirectInjectionVar?: string;
    targetUrls?: string[];
    [key: string]: string | string[] | undefined;
  };
}
