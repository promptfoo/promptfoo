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

/**
 * Prompt-local text decoration applied before provider execution.
 *
 * @example
 * ```ts
 * const config: PromptConfig = {
 *   prefix: 'System: ',
 *   suffix: '\nAnswer briefly.',
 * };
 * ```
 *
 * @public
 */
export interface PromptConfig {
  /** Text prepended to the rendered prompt before it is sent to the provider. */
  prefix?: string;
  /** Text appended to the rendered prompt before it is sent to the provider. */
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

/**
 * Normalized prompt record stored on eval results and passed to providers.
 *
 * @example
 * ```ts
 * const prompt: Prompt = {
 *   id: 'summary',
 *   raw: 'Summarize {{article}}',
 *   label: 'Summary',
 * };
 * ```
 *
 * @public
 */
export interface Prompt {
  /** Stable prompt identifier used in results and prompt selection. */
  id?: string;
  /** Raw prompt template before display-only decoration. */
  raw: string;
  // Internal-only copy of the undecorated prompt template used when prefix/suffix
  // wraps the runtime prompt.
  /** Internal undecorated prompt copy used when prefix or suffix wrapping is applied. */
  template?: string;
  /** @deprecated in > 0.59.0. Use `label` instead. */
  display?: string;
  /** Human-readable label shown in reports and prompt selectors. */
  label: string;
  /** Function-valued prompt renderer when the prompt is assembled at runtime. */
  function?: PromptFunction;

  /** Prompt-local provider config overrides merged into the selected provider config. */
  config?: any;
}
