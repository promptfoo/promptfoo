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
  vars: Record<string, object | string>;
  config: Record<string, any>;
  provider: {
    id: string;
    label?: string;
  };
};

export type PromptFunction = (context: {
  vars: Record<string, any | string>;
  provider?: ApiProvider;
}) => Promise<any | string>;

export type Prompt = {
  id?: string;
  raw: string;
  display?: string;
  label: string;
  function?: PromptFunction;

  // These config options are merged into the provider config.
  config?: any;
};
