import logger from '../logger';
import { MCPProvider } from '../providers/mcp';
import { materializeMcpValue } from './mcpMaterialization';
import { redteamProviderManager } from './providers/shared';
import { isDeferredMinimumAgenticSeed } from './shared/agenticSeed';
import {
  getTargetPromptCharLimits,
  isTargetPromptCharLimitError,
  throwIfTargetPromptViolatesCharLimits,
} from './shared/promptLength';

import type { MCPTool } from '../providers/mcp/types';
import type {
  ApiProvider,
  AtomicTestCase,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../types';

const WRAPPED_MCP_PROVIDER = Symbol('wrappedMcpProvider');
const WRAPPED_CHAR_LIMIT_PROVIDER = Symbol('wrappedCharLimitProvider');

type McpProviderWithTools = ApiProvider & {
  getAvailableTools: () => Promise<MCPTool[]>;
  [WRAPPED_MCP_PROVIDER]?: true;
};

type CharLimitedProvider = ApiProvider & {
  [WRAPPED_CHAR_LIMIT_PROVIDER]?: true;
};

function isRedteamTest(test: AtomicTestCase | undefined): boolean {
  return Boolean(
    test?.metadata?.pluginId ||
      test?.metadata?.strategyId ||
      test?.metadata?.pluginConfig ||
      test?.metadata?.strategyConfig,
  );
}

function hasTargetPromptCharLimits(test: AtomicTestCase | undefined): boolean {
  const limits = getTargetPromptCharLimits(test ? { test } : undefined);
  return limits.maxCharsPerMessage !== undefined || limits.minCharsPerMessage !== undefined;
}

export function isMcpProviderWithTools(provider: ApiProvider): provider is McpProviderWithTools {
  return provider instanceof MCPProvider && typeof provider.getAvailableTools === 'function';
}

class CharLimitedTargetProvider implements ApiProvider {
  [WRAPPED_CHAR_LIMIT_PROVIDER] = true as const;
  label?: string;
  config?: ApiProvider['config'];
  delay?: ApiProvider['delay'];
  transform?: ApiProvider['transform'];
  inputs?: ApiProvider['inputs'];

  constructor(private readonly target: ApiProvider) {
    this.label = target.label;
    this.config = target.config;
    this.delay = target.delay;
    this.transform = target.transform;
    this.inputs = target.inputs;
  }

  id(): string {
    return this.target.id();
  }

  toString(): string {
    return this.target.toString?.() ?? this.id();
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    throwIfTargetPromptViolatesCharLimits(prompt, getTargetPromptCharLimits(context));
    return this.target.callApi(prompt, context, options);
  }

  async cleanup(): Promise<void> {
    await this.target.cleanup?.();
  }

  async getAvailableTools(): Promise<MCPTool[]> {
    return (this.target as McpProviderWithTools).getAvailableTools();
  }
}

function maybeWrapTargetProviderForCharLimits(
  provider: ApiProvider,
  test: AtomicTestCase | undefined,
): ApiProvider {
  // Use only the active provider here. Agentic metadata also accompanies the
  // underlying target provider, which still needs this wrapper for the final
  // generated target call.
  const isAgenticSeedProvider = isDeferredMinimumAgenticSeed({ providerId: provider.id() });
  if (!isRedteamTest(test) || !hasTargetPromptCharLimits(test) || isAgenticSeedProvider) {
    return provider;
  }
  return (provider as CharLimitedProvider)[WRAPPED_CHAR_LIMIT_PROVIDER]
    ? provider
    : new CharLimitedTargetProvider(provider);
}

class RedteamMcpTargetProvider implements ApiProvider {
  [WRAPPED_MCP_PROVIDER] = true as const;
  label?: string;
  config?: ApiProvider['config'];
  delay?: ApiProvider['delay'];
  transform?: ApiProvider['transform'];
  inputs?: ApiProvider['inputs'];

  private toolsPromise?: Promise<MCPTool[]>;

  constructor(private readonly target: McpProviderWithTools) {
    this.label = target.label;
    this.config = target.config;
    this.delay = target.delay;
    this.transform = target.transform;
    this.inputs = target.inputs;
  }

  id(): string {
    return this.target.id();
  }

  toString(): string {
    return this.target.toString?.() ?? this.id();
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const tools = await this.getTools();

    if (tools.length === 0) {
      return this.target.callApi(prompt, context, options);
    }

    try {
      const intentValue =
        context?.test?.metadata?.goal ?? context?.test?.metadata?.originalPrompt ?? prompt;
      const purpose = String(context?.test?.metadata?.purpose ?? '');
      let materializedPrompt: string;

      try {
        materializedPrompt = await materializeMcpValue({
          intentValue,
          purpose,
          tools,
          value: prompt,
        });
      } catch (error) {
        logger.debug(
          `MCP target prompt requires inference materialization: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );

        const materializerProvider = await redteamProviderManager.getProvider({ jsonOnly: true });
        materializedPrompt = await materializeMcpValue({
          intentValue,
          provider: materializerProvider,
          purpose,
          tools,
          value: prompt,
        });
      }

      const materializedContext: CallApiContextParams | undefined = context
        ? {
            ...context,
            vars: {
              ...context.vars,
              prompt: materializedPrompt,
            },
          }
        : undefined;

      return await this.target.callApi(materializedPrompt, materializedContext, options);
    } catch (error) {
      if (isTargetPromptCharLimitError(error)) {
        throw error;
      }
      return {
        error: `Failed to materialize MCP target prompt: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  async cleanup(): Promise<void> {
    await this.target.cleanup?.();
  }

  private getTools(): Promise<MCPTool[]> {
    this.toolsPromise ??= this.target.getAvailableTools();
    return this.toolsPromise;
  }
}

export function maybeWrapMcpProviderForRedteam(
  provider: ApiProvider,
  test: AtomicTestCase | undefined,
): ApiProvider {
  // A previously wrapped MCP provider already materializes the raw intent before
  // its inner char-limit wrapper sees the final target prompt. Do not add an
  // outer char-limit wrapper on a later normalization pass, because that would
  // reject short raw intents before MCP materialization can expand them.
  if ((provider as McpProviderWithTools)[WRAPPED_MCP_PROVIDER]) {
    return provider;
  }

  const limitedProvider = maybeWrapTargetProviderForCharLimits(provider, test);
  if (!isRedteamTest(test)) {
    return limitedProvider;
  }

  return isMcpProviderWithTools(provider)
    ? new RedteamMcpTargetProvider(limitedProvider as McpProviderWithTools)
    : limitedProvider;
}
