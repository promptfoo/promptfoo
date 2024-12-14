import type { RedteamPlugin, RedteamStrategy } from '@promptfoo/redteam/types';
import type { RedteamFileConfig } from '@promptfoo/redteam/types';

export interface Config {
  description: string;
  prompts: string[];
  target: ProviderOptions;
  plugins: (RedteamPlugin | { id: string; config?: any })[];
  strategies: RedteamStrategy[];
  purpose?: string;
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
}

export interface ProviderOptions {
  id: string;
  label?: string;
  config: {
    // Custom provider config can have anything
    [key: string]: any;

    type?: 'http' | 'websocket' | 'browser';
    // HTTP/WebSocket specific options
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string | object;
    messageTemplate?: string;
    // Browser specific options
    steps?: BrowserStep[];
    headless?: boolean;
    timeoutMs?: number;
    transformResponse?: string;
    sessionParser?: string;
    cookies?:
      | Array<{
          name: string;
          value: string;
          domain?: string;
          path?: string;
        }>
      | string;
  };
}

export interface BrowserStep {
  action: 'navigate' | 'click' | 'type' | 'extract' | 'screenshot' | 'wait' | 'waitForNewChildren';
  args?: {
    url?: string;
    selector?: string;
    text?: string;
    path?: string;
    ms?: number;
    fullPage?: boolean;
    parentSelector?: string;
    delay?: number;
    timeout?: number;
    optional?: boolean;
  };
  name?: string;
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
    indirectInjectionVar?: string;
    intent?: string[];
    policy?: string;
    systemPrompt?: string;
    targetIdentifiers?: string[];
    targetSystems?: string[];
    targetUrls?: string[];
    [key: string]: string | string[] | undefined;
  };
}
