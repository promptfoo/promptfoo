// Declared to avoid circular dependency with providers.ts
declare interface ApiProvider {
  id: () => string;
  callApi: (prompt: string, context?: any, options?: any) => Promise<any>;
  label?: string;
}

export type PromptContent = string | any;

export interface PromptConfig {
  prefix?: string;
  suffix?: string;
}

export interface PromptFunctionContext {
  vars: Record<string, string | object>;
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
  config?: Record<string, any>;
}

export interface PromptFunction {
  (context: {
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
  config?: any;
}
