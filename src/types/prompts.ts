import type { VarValue } from './shared';

// Declared to avoid circular dependency with providers.ts
declare interface ApiProvider {
  id: () => string;
  // biome-ignore lint/suspicious/noExplicitAny: Generic provider interface accepts dynamic context and options
  callApi: (prompt: string, context?: any, options?: any) => Promise<any>;
  label?: string;
}

// biome-ignore lint/suspicious/noExplicitAny: Prompt content can be any serializable type (string, object, array)
export type PromptContent = string | any;

export interface PromptConfig {
  prefix?: string;
  suffix?: string;
}

export interface PromptFunctionContext {
  vars: Record<string, VarValue>;
  // biome-ignore lint/suspicious/noExplicitAny: Config accepts arbitrary provider-specific options
  config: Record<string, any>;
  provider: {
    id: string;
    label?: string;
  };
}

/**
 * Result type for prompt functions.
 *
 * Prompt functions can return:
 * - A string (used directly as the prompt)
 * - An object/array (JSON stringified and used as the prompt)
 * - A PromptFunctionResult object with prompt and optional config
 */
export interface PromptFunctionResult {
  prompt: PromptContent;
  // biome-ignore lint/suspicious/noExplicitAny: Config accepts arbitrary provider-specific options
  config?: Record<string, any>;
}

export interface PromptFunction {
  (context: {
    // biome-ignore lint/suspicious/noExplicitAny: Vars accept any serializable value type
    vars: Record<string, string | any>;
    provider?: ApiProvider;
  }): Promise<PromptContent | PromptFunctionResult>;
}

export interface Prompt {
  id?: string;
  raw: string;
  display?: string;
  label: string;
  function?: PromptFunction;

  // These config options are merged into the provider config.
  // biome-ignore lint/suspicious/noExplicitAny: Config accepts arbitrary provider-specific options
  config?: any;
}
