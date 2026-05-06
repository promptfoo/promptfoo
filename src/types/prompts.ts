import type { VarValue } from './shared';

// Declared to avoid circular dependency with providers.ts
declare interface ApiProvider {
  id: () => string;
  callApi: (prompt: string, context?: any, options?: any) => Promise<any>;
  label?: string;
}

/**
 * Prompt payload accepted from function-valued prompts.
 *
 * Strings are used directly. Objects and arrays are JSON-stringified before the
 * provider receives them.
 *
 * @example
 * ```ts
 * const textPrompt: PromptContent = 'Summarize this.';
 * const chatPrompt: PromptContent = [{ role: 'user', content: 'Summarize this.' }];
 * ```
 *
 * @public
 */
export type PromptContent = string | object;

export interface PromptConfig {
  prefix?: string;
  suffix?: string;
}

/**
 * Runtime context passed to function-valued prompts.
 *
 * @example
 * ```ts
 * const context: PromptFunctionContext = {
 *   vars: { topic: 'gradient descent' },
 *   config: { temperature: 0.2 },
 *   provider: { id: 'openai:chat:gpt-5.5' },
 * };
 * ```
 *
 * @public
 */
export interface PromptFunctionContext {
  /** Rendered variables for the current test case. */
  vars: Record<string, VarValue>;
  /** Prompt-local configuration accumulated before the function runs. */
  config: Record<string, any>;
  /** Provider selected for the current prompt invocation. */
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
 *
 * @example
 * ```ts
 * const result: PromptFunctionResult = {
 *   prompt: 'Summarize this article.',
 *   config: { temperature: 0.2 },
 * };
 * ```
 *
 * @public
 */
export interface PromptFunctionResult {
  /** Prompt content to send to the provider. */
  prompt: PromptContent;
  /** Provider config overrides to merge for this rendered prompt. */
  config?: Record<string, any>;
}

/**
 * Function form accepted anywhere the Node.js API accepts a prompt.
 *
 * Use prompt functions when the prompt must be assembled from runtime vars or
 * when each prompt needs provider-specific config.
 *
 * @example
 * ```ts
 * const prompt: PromptFunction = async ({ vars }) => ({
 *   prompt: `Summarize ${vars.topic}`,
 *   config: { temperature: 0.2 },
 * });
 * ```
 *
 * @public
 * @param context - Rendered vars and the selected provider when one is available.
 */
export type PromptFunction = (context: {
  vars: Record<string, VarValue>;
  provider?: ApiProvider;
}) => Promise<PromptContent | PromptFunctionResult>;

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
