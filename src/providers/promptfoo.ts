import dedent from 'dedent';
import cliState from '../cliState';
import { VERSION } from '../constants';
import { getUserEmail } from '../globalConfig/accounts';
import logger from '../logger';
import {
  getRemoteGenerationUrl,
  getRemoteGenerationUrlForUnaligned,
  neverGenerateRemote,
  neverGenerateRemoteForRegularEvals,
} from '../redteam/remoteGeneration';
import { fetchWithRetries } from '../util/fetch/index';
import { REQUEST_TIMEOUT_MS } from './shared';

import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  PluginConfig,
  ProviderResponse,
  TokenUsage,
} from '../types/index';

interface PromptfooHarmfulCompletionOptions {
  harmCategory: string;
  n: number;
  purpose: string;
  config?: PluginConfig;
}

/**
 * Provider for generating harmful/adversarial content using Promptfoo's unaligned models.
 * Used by red team plugins to generate test cases for harmful content categories.
 */
export class PromptfooHarmfulCompletionProvider implements ApiProvider {
  harmCategory: string;
  n: number;
  purpose: string;
  config?: PluginConfig;

  constructor(options: PromptfooHarmfulCompletionOptions) {
    this.harmCategory = options.harmCategory;
    this.n = options.n;
    this.purpose = options.purpose;
    this.config = options.config;
  }

  id(): string {
    return `promptfoo:redteam:${this.harmCategory}`;
  }

  toString(): string {
    return `[Promptfoo Harmful Completion Provider ${this.purpose} - ${this.harmCategory}]`;
  }

  async callApi(
    _prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse & { output?: string[] }> {
    // Check if remote generation is disabled
    if (neverGenerateRemote()) {
      return {
        error: dedent`
          Remote generation is disabled. Harmful content generation requires Promptfoo's unaligned models.

          To enable:
          - Remove PROMPTFOO_DISABLE_REMOTE_GENERATION (or PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION)
          - Or configure an alternative unaligned model provider

          Learn more: https://www.promptfoo.dev/docs/red-team/configuration#remote-generation
        `,
      };
    }

    const body = {
      email: getUserEmail(),
      harmCategory: this.harmCategory,
      n: this.n,
      purpose: this.purpose,
      version: VERSION,
      config: this.config,
      ...((context?.evaluationId || cliState.evaluationId) && {
        evaluationId: context?.evaluationId || cliState.evaluationId,
      }),
    };

    try {
      logger.debug(
        `[HarmfulCompletionProvider] Calling generate harmful API (${getRemoteGenerationUrlForUnaligned()}) with body: ${JSON.stringify(body)}`,
      );
      // We're using the promptfoo API to avoid having users provide their own unaligned model.
      const response = await fetchWithRetries(
        getRemoteGenerationUrlForUnaligned(),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          ...(callApiOptions?.abortSignal && { signal: callApiOptions.abortSignal }),
        },
        580000,
        2,
      );

      if (!response.ok) {
        throw new Error(`API call failed with status ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();

      const validOutputs: string[] = (
        Array.isArray(data.output) ? data.output : [data.output]
      ).filter(
        (item: string | null | undefined): item is string =>
          typeof item === 'string' && item.length > 0,
      );

      return {
        output: validOutputs,
      };
    } catch (err) {
      // Re-throw abort errors to properly cancel the operation
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
      logger.info(`[HarmfulCompletionProvider] ${err}`);
      return {
        error: `[HarmfulCompletionProvider] ${err}`,
      };
    }
  }
}

interface PromptfooChatCompletionOptions {
  env?: EnvOverrides;
  id?: string;
  jsonOnly: boolean;
  preferSmallModel: boolean;
  task:
    | 'crescendo'
    | 'goat'
    | 'iterative'
    | 'iterative:image'
    | 'iterative:tree'
    | 'judge'
    | 'blocking-question-analysis'
    | 'meta-agent-decision'
    | 'hydra-decision'
    | 'voice-crescendo'
    | 'voice-crescendo-eval';
  /**
   * Multi-input schema for generating multiple vars at each turn.
   * Keys are variable names, values are descriptions.
   */
  inputs?: Record<string, string>;
}

/**
 * Provider for red team adversarial strategies using Promptfoo's task-specific models.
 * Supports multi-turn attack strategies like crescendo, goat, and iterative attacks.
 */
export class PromptfooChatCompletionProvider implements ApiProvider {
  private options: PromptfooChatCompletionOptions;

  constructor(options: PromptfooChatCompletionOptions) {
    this.options = options;
  }

  id(): string {
    return this.options.id || 'promptfoo:chatcompletion';
  }

  toString(): string {
    return `[Promptfoo Chat Completion Provider]`;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Check if remote generation is disabled
    if (neverGenerateRemote()) {
      return {
        error: dedent`
          Remote generation is disabled. This red team strategy requires Promptfoo's task-specific models.

          To enable:
          - Remove PROMPTFOO_DISABLE_REMOTE_GENERATION (or PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION)
          - Or provide OPENAI_API_KEY for local generation (may have lower quality)

          Learn more: https://www.promptfoo.dev/docs/red-team/configuration#remote-generation
        `,
      };
    }

    const body = {
      jsonOnly: this.options.jsonOnly,
      preferSmallModel: this.options.preferSmallModel,
      prompt,
      step: context?.prompt.label,
      task: this.options.task,
      email: getUserEmail(),
      // Pass inputs schema for multi-input mode
      ...(this.options.inputs && { inputs: this.options.inputs }),
      ...((context?.evaluationId || cliState.evaluationId) && {
        evaluationId: context?.evaluationId || cliState.evaluationId,
      }),
      pluginId: context?.test?.metadata?.pluginId,
      strategyId: context?.test?.metadata?.strategyId,
      ...(context?.evaluationId &&
        context?.testCaseId && {
          testRunId: `${context.evaluationId}-${context.testCaseId}`,
        }),
    };

    try {
      const response = await fetchWithRetries(
        getRemoteGenerationUrl(),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          ...(callApiOptions?.abortSignal && { signal: callApiOptions.abortSignal }),
        },
        REQUEST_TIMEOUT_MS,
      );

      const data = await response.json();

      if (!data.result) {
        logger.debug(
          `Error from promptfoo completion provider. Status: ${response.status} ${response.statusText} ${JSON.stringify(data)} `,
        );
        return {
          error: 'LLM did not return a result, likely refusal',
        };
      }

      return {
        output: data.result,
        tokenUsage: data.tokenUsage,
      };
    } catch (err) {
      // Re-throw abort errors to properly cancel the operation
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
      return {
        error: `API call error: ${String(err)}`,
      };
    }
  }
}

interface PromptfooAgentOptions {
  env?: EnvOverrides;
  id?: string;
  instructions?: string;
}

// Task ID constants for simulated user provider
export const REDTEAM_SIMULATED_USER_TASK_ID = 'mischievous-user-redteam';

/**
 * Provider for simulating realistic user conversations using Promptfoo's conversation models.
 * Supports both regular simulated users and adversarial red team users.
 */
export class PromptfooSimulatedUserProvider implements ApiProvider {
  private options: PromptfooAgentOptions;
  private taskId: string;

  constructor(options: PromptfooAgentOptions = {}, taskId: string) {
    this.options = options;
    this.taskId = taskId;
  }

  id(): string {
    return this.options.id || 'promptfoo:agent';
  }

  toString(): string {
    return '[Promptfoo Agent Provider]';
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Check if this is a redteam task
    const isRedteamTask = this.taskId === REDTEAM_SIMULATED_USER_TASK_ID;

    // For redteam tasks, check the redteam-specific flag
    // For regular tasks, only check the general flag
    const shouldDisable = isRedteamTask
      ? neverGenerateRemote() // Checks both flags
      : neverGenerateRemoteForRegularEvals(); // Only checks general flag

    if (shouldDisable) {
      const relevantFlag = isRedteamTask
        ? 'PROMPTFOO_DISABLE_REMOTE_GENERATION or PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION'
        : 'PROMPTFOO_DISABLE_REMOTE_GENERATION';
      const docsUrl = isRedteamTask
        ? 'https://www.promptfoo.dev/docs/red-team/configuration#remote-generation'
        : 'https://www.promptfoo.dev/docs/providers/simulated-user#remote-generation';

      return {
        error: dedent`
          Remote generation is disabled.

          SimulatedUser requires Promptfoo's conversation simulation models.

          To enable, remove ${relevantFlag}

          Learn more: ${docsUrl}
        `,
      };
    }

    const messages = JSON.parse(prompt);
    const body = {
      task: this.taskId,
      instructions: this.options.instructions,
      history: messages,
      email: getUserEmail(),
      version: VERSION,
      ...((context?.evaluationId || cliState.evaluationId) && {
        evaluationId: context?.evaluationId || cliState.evaluationId,
      }),
      pluginId: context?.test?.metadata?.pluginId,
      strategyId: context?.test?.metadata?.strategyId,
    };

    try {
      const response = await fetchWithRetries(
        getRemoteGenerationUrl(),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          ...(callApiOptions?.abortSignal && { signal: callApiOptions.abortSignal }),
        },
        REQUEST_TIMEOUT_MS,
      );

      if (!response.ok) {
        throw new Error(`API call failed with status ${response.status}: ${await response.text()}`);
      }

      const data = (await response.json()) as {
        result: string;
        task: string;
        tokenUsage: TokenUsage;
      };
      return {
        output: data.result,
        tokenUsage: data.tokenUsage,
      };
    } catch (err) {
      // Re-throw abort errors to properly cancel the operation
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
      return {
        error: `API call error: ${String(err)}`,
      };
    }
  }
}
