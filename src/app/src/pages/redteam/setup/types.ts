import type { PluginConfig, RedteamPlugin, RedteamStrategy } from '@promptfoo/redteam/types';
import type { TestCase } from '@promptfoo/types';

export interface ApplicationDefinition {
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
}

export interface Config {
  description: string;
  prompts: string[];
  target: ProviderOptions;
  plugins: (RedteamPlugin | { id: string; config?: any })[];
  testGenerationInstructions?: string;
  strategies: RedteamStrategy[];
  purpose?: string;
  numTests?: number;
  maxConcurrency?: number;
  applicationDefinition: ApplicationDefinition;
  entities: string[];
  defaultTest?: TestCase;
  extensions?: string[];
  language?: string | string[]; // Global language configuration
}

export interface ProviderOptions {
  id: string;
  label?: string;
  delay?: number;
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
    stateful?: boolean;
    sessionSource?: 'client' | 'server';
    streamResponse?: string;
  };
}

interface BrowserStep {
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

export interface LocalPluginConfig {
  [key: string]: PluginConfig;
}

export interface RedteamUITarget {
  value: string;
  label: string;
}

/**
 * Context about how the red team configuration was generated.
 * Used to track whether the config came from codebase analysis (recon)
 * and to show appropriate UI feedback.
 */
export interface ReconContext {
  /** Source of the configuration */
  source: 'recon-cli' | 'in-app-recon';
  /** Unix timestamp when the analysis was performed */
  timestamp: number;
  /** Directory path that was analyzed */
  codebaseDirectory?: string;
  /** Number of files analyzed during recon */
  filesAnalyzed?: number;
  /** Number of application definition fields that were populated */
  fieldsPopulated?: number;
}
