import type {
  OpenAiChatConfigInput,
  OpenAiResponsesConfigInput,
} from '../../contracts/providerConfig/openai';
import type { VarValue } from '../../types/shared';
import type { MCPConfig } from '../mcp/types';
import type {
  AssistantFunctionCallback,
  OpenAiCompletionOptions,
  OpenAiSharedOptions,
} from './types';

/** Values rendered by renderVarsInObject at request time, with that test's variables. */
export type OpenAiRuntimeValue<T> =
  | (T extends readonly (infer V)[]
      ? OpenAiRuntimeValue<V>[]
      : T extends object
        ? { [K in keyof T]: OpenAiRuntimeValue<T[K]> }
        : T)
  | ((context: { vars: Record<string, VarValue> }) => T | undefined);

type RuntimeFields<T extends { reasoning?: unknown; reasoning_effort?: unknown }> = {
  reasoning?: OpenAiRuntimeValue<T['reasoning']>;
  reasoning_effort?: OpenAiRuntimeValue<T['reasoning_effort']>;
  /** Compatible APIs and in-process templates may add non-JSON values here. */
  passthrough?: object;
  functionToolCallbacks?: Record<string, AssistantFunctionCallback | string>;
};

/** Chat authoring fields plus the explicitly supported in-process extensions. */
export type OpenAiChatConfig = Omit<
  OpenAiChatConfigInput,
  | keyof RuntimeFields<OpenAiChatConfigInput>
  | 'mcp'
  | 'tools'
  | 'functions'
  | 'tool_choice'
  | 'response_format'
> &
  RuntimeFields<OpenAiChatConfigInput> & {
    mcp?: MCPConfig;
    functions?: OpenAiChatConfigInput['functions'] | OpenAiCompletionOptions['functions'];
    // Older compatible adapters also supply tools using these historical shapes.
    tools?: OpenAiChatConfigInput['tools'] | OpenAiCompletionOptions['tools'];
    tool_choice?: OpenAiChatConfigInput['tool_choice'] | OpenAiCompletionOptions['tool_choice'];
    response_format?:
      | OpenAiChatConfigInput['response_format']
      | OpenAiCompletionOptions['response_format'];
    parallel_tool_calls?: boolean | null;
  };

/** Responses authoring fields, independent of Chat-only settings. */
export type OpenAiResponsesConfig = Omit<
  OpenAiResponsesConfigInput,
  | keyof RuntimeFields<OpenAiResponsesConfigInput>
  | 'tools'
  | 'parallel_tool_calls'
  | 'tool_choice'
  | 'response_format'
> &
  RuntimeFields<OpenAiResponsesConfigInput> & {
    /** @deprecated Ignored by Responses; use max_output_tokens. Retained for older callers. */
    max_completion_tokens?: number;
    /** @deprecated Only compatible adapters map this alias; use max_output_tokens. */
    max_tokens?: number;
    tools?: OpenAiResponsesConfigInput['tools'] | OpenAiCompletionOptions['tools'];
    tool_choice?:
      | OpenAiResponsesConfigInput['tool_choice']
      | OpenAiCompletionOptions['tool_choice'];
    response_format?:
      | OpenAiResponsesConfigInput['response_format']
      | OpenAiCompletionOptions['response_format'];
    parallel_tool_calls?: boolean | null;
  };

/** Billing hooks consume rates and routing, not unresolved endpoint authoring fields. */
export type OpenAiBillingConfig = OpenAiSharedOptions & {
  passthrough?: object;
  service_tier?: string | null;
};

/** Wire requests retain compatible-provider fields; reasoning is prepared separately. */
export type OpenAiRequestBody<T> = Omit<
  T,
  'reasoning' | 'reasoning_effort' | 'max_tokens' | 'max_completion_tokens' | 'max_output_tokens'
> &
  Record<string, unknown> & {
    reasoning?: Record<string, unknown>;
    reasoning_effort?: unknown;
    max_tokens?: unknown;
    max_completion_tokens?: unknown;
    max_output_tokens?: unknown;
  };
