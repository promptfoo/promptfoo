// Declared to avoid circular dependency with providers.ts
declare class ApiProvider {
  id: () => string;
  callApi: (prompt: string, context?: any, options?: any) => Promise<any>;
  label?: string;
}

export type PromptConfig = {
  prefix?: string;
  suffix?: string;
};

export type PromptFunctionContext = {
  vars: Record<string, string | object>;
  config: Record<string, any>;
  provider: {
    id: string;
    label?: string;
  };
};

/**
 * Result type for prompt functions.
 *
 * Prompt functions can return:
 * - A string (used directly as the prompt)
 * - An object/array (JSON stringified and used as the prompt)
 * - A PromptFunctionResult object with prompt and optional config
 */
export type PromptFunctionResult = {
  prompt: string | any;
  config?: Record<string, any>;
};

export type PromptFunction = (context: {
  vars: Record<string, string | any>;
  provider?: ApiProvider;
}) => Promise<string | any | PromptFunctionResult>;

export type Prompt = {
  id?: string;
  raw: string;
  display?: string;
  label: string;
  function?: PromptFunction;

  // These config options are merged into the provider config.
  config?: any;
};
