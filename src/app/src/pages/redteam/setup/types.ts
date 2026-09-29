import type { Inputs } from '@promptfoo/contracts';
import type { HttpProviderConfig } from '@promptfoo/providers/http';
import type { PluginConfig, RedteamPlugin, RedteamStrategy } from '@promptfoo/redteam/types';
import type { ProviderOptions as CoreProviderOptions, TestCase } from '@promptfoo/types';

// Input choices used by the TLS setup form.
interface TlsConfigUI {
  certInputType?: 'upload' | 'path' | 'inline';
  keyInputType?: 'upload' | 'path' | 'inline';
  jksInputType?: 'upload' | 'path';
  pfxInputType?: 'upload' | 'path' | 'base64';
  caInputType?: 'upload' | 'path' | 'inline';
  jksFileName?: string;
  jksExtractConfigured?: boolean;
  certificateType?: 'pem' | 'pfx' | 'pkcs12' | 'jks';
}

interface HttpProviderConfigUI extends Omit<HttpProviderConfig, 'signatureAuth' | 'tls'> {
  signatureAuth?: HttpProviderConfig['signatureAuth'];
  tls?: Partial<NonNullable<HttpProviderConfig['tls']>> & TlsConfigUI;
}

// HTTP configuration plus the setup form's input state.
export interface HttpProviderOptions extends Omit<CoreProviderOptions, 'config'> {
  config?: HttpProviderConfigUI;
}

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
  plugins: (RedteamPlugin | { id: string; config?: PluginConfig })[];
  testGenerationInstructions?: string;
  strategies: RedteamStrategy[];
  purpose?: string;
  numTests?: number;
  maxCharsPerMessage?: number;
  maxConcurrency?: number;
  applicationDefinition: ApplicationDefinition;
  entities: string[];
  defaultTest?: TestCase;
  extensions?: string[];
  language?: string | string[]; // Global language configuration
  // Provider used for generating adversarial inputs (redteam provider)
  provider?: string | CoreProviderOptions;
}

export interface ProviderOptions {
  id: string;
  label?: string;
  delay?: number;
  transform?: CoreProviderOptions['transform'];
  env?: CoreProviderOptions['env'];
  // Multi-variable inputs for test case generation
  inputs?: Inputs;
  config: {
    // biome-ignore lint/suspicious/noExplicitAny: Custom provider config can have anything
    [key: string]: any;

    type?: 'http' | 'websocket' | 'browser';
    // HTTP/WebSocket specific options
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string | object;
    messageTemplate?: string;
    protocols?: string | string[];
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
    sessionSource?: 'client' | 'server' | 'endpoint';
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
