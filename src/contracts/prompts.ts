import type { VarValue } from './shared';

/** Minimum provider surface a prompt function may receive. */
export interface MinimalApiProvider {
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
  vars: Record<string, VarValue>;
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
    provider?: MinimalApiProvider;
  }): Promise<PromptContent | PromptFunctionResult>;
}

export interface Prompt {
  id?: string;
  raw: string;
  // Internal-only copy of the undecorated prompt template used when prefix/suffix
  // wraps the runtime prompt.
  template?: string;
  display?: string;
  label: string;
  function?: PromptFunction;

  // These config options are merged into the provider config.
  config?: any;
}
