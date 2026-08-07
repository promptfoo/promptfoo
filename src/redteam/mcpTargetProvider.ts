import logger from '../logger';
import { MCPProvider } from '../providers/mcp';
import { materializeMcpToolCallRemote } from './extraction/util';
import { materializeMcpValue } from './mcpMaterialization';
import { redteamProviderManager } from './providers/shared';
import { getCloudTargetIdFromProviders } from './remoteGenerationContextFromProviders';

import type { MCPTool } from '../providers/mcp/types';
import type {
  ApiProvider,
  AtomicTestCase,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../types';

const WRAPPED_MCP_PROVIDER = Symbol('wrappedMcpProvider');
type ProviderTokenUsage = NonNullable<ProviderResponse['tokenUsage']>;
type CompletionDetails = NonNullable<ProviderTokenUsage['completionDetails']>;

type McpProviderWithTools = ApiProvider & {
  getAvailableTools: () => Promise<MCPTool[]>;
  [WRAPPED_MCP_PROVIDER]?: true;
};

function addTokenCount(left: number | undefined, right: number | undefined): number {
  return (left ?? 0) + (right ?? 0);
}

function mergeCompletionDetails(
  target: CompletionDetails | undefined,
  update: CompletionDetails | undefined,
): CompletionDetails | undefined {
  if (!update) {
    return target;
  }

  return {
    reasoning: addTokenCount(target?.reasoning, update.reasoning),
    acceptedPrediction: addTokenCount(target?.acceptedPrediction, update.acceptedPrediction),
    rejectedPrediction: addTokenCount(target?.rejectedPrediction, update.rejectedPrediction),
    cacheReadInputTokens: addTokenCount(target?.cacheReadInputTokens, update.cacheReadInputTokens),
    cacheCreationInputTokens: addTokenCount(
      target?.cacheCreationInputTokens,
      update.cacheCreationInputTokens,
    ),
  };
}

function mergeMaterializationTokenTotals(
  responseTokenUsage: ProviderResponse['tokenUsage'],
  materializationTokenUsage: Partial<ProviderTokenUsage>,
): Partial<ProviderTokenUsage> {
  const tokenUsage: Partial<ProviderTokenUsage> = { ...(responseTokenUsage ?? {}) };

  tokenUsage.prompt = addTokenCount(tokenUsage.prompt, materializationTokenUsage.prompt);
  tokenUsage.completion = addTokenCount(
    tokenUsage.completion,
    materializationTokenUsage.completion,
  );
  tokenUsage.cached = addTokenCount(tokenUsage.cached, materializationTokenUsage.cached);
  tokenUsage.total = addTokenCount(tokenUsage.total, materializationTokenUsage.total);
  tokenUsage.completionDetails = mergeCompletionDetails(
    tokenUsage.completionDetails,
    materializationTokenUsage.completionDetails,
  );

  return tokenUsage;
}

function mergeMaterializationTokenUsage(
  response: ProviderResponse,
  materializationTokenUsage: Partial<ProviderTokenUsage> | undefined,
): ProviderResponse {
  if (!materializationTokenUsage) {
    return response;
  }

  const { numRequests: _numRequests, ...tokenUsageWithoutRequests } = materializationTokenUsage;

  return {
    ...response,
    tokenUsage: mergeMaterializationTokenTotals(response.tokenUsage, tokenUsageWithoutRequests),
  };
}

function isRedteamTest(test: AtomicTestCase | undefined): boolean {
  return Boolean(test?.metadata?.pluginId || test?.metadata?.strategyId);
}

function isMcpProviderWithTools(provider: ApiProvider): provider is McpProviderWithTools {
  return provider instanceof MCPProvider && typeof provider.getAvailableTools === 'function';
}

class RedteamMcpTargetProvider implements ApiProvider {
  [WRAPPED_MCP_PROVIDER] = true as const;
  label?: string;
  config?: ApiProvider['config'];
  delay?: ApiProvider['delay'];
  transform?: ApiProvider['transform'];
  inputs?: ApiProvider['inputs'];

  private toolsPromise?: Promise<MCPTool[]>;
  private readonly cloudTargetId?: string;

  constructor(private readonly target: McpProviderWithTools) {
    this.label = target.label;
    this.config = target.config;
    this.delay = target.delay;
    this.transform = target.transform;
    this.inputs = target.inputs;
    this.cloudTargetId = getCloudTargetIdFromProviders({
      id: target.id(),
      config: target.config,
    });
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
      let materializationTokenUsage: Partial<ProviderTokenUsage> | undefined;

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

        const remoteMaterializedPrompt = await materializeMcpToolCallRemote(
          {
            intentValue,
            purpose,
            ...(this.cloudTargetId ? { targetId: this.cloudTargetId } : {}),
            tools,
            value: prompt,
          },
          options,
        );

        if (remoteMaterializedPrompt) {
          materializedPrompt = remoteMaterializedPrompt.prompt;
          materializationTokenUsage = remoteMaterializedPrompt.tokenUsage;
        } else {
          const materializerProvider = await redteamProviderManager.getProvider({
            jsonOnly: true,
          });
          materializedPrompt = await materializeMcpValue({
            intentValue,
            provider: materializerProvider,
            purpose,
            tools,
            value: prompt,
          });
        }
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

      const response = await this.target.callApi(materializedPrompt, materializedContext, options);
      return mergeMaterializationTokenUsage(response, materializationTokenUsage);
    } catch (error) {
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
  if (!isRedteamTest(test) || (provider as McpProviderWithTools)[WRAPPED_MCP_PROVIDER]) {
    return provider;
  }

  return isMcpProviderWithTools(provider) ? new RedteamMcpTargetProvider(provider) : provider;
}
