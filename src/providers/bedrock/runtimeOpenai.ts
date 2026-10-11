import { getEnvInt } from '../../envars';
import { calculateOpenAIUsageCost } from '../openai/billing';
import { isGpt6Model } from '../openai/gpt6';
import { getOpenAICacheWriteInputTokens, getTokenUsage } from '../openai/util';
import { getResponsesTokenUsage } from '../responses/processor';
import { BedrockChatStreamError, collectBedrockChatStream } from './chatStream';
import { resolveBedrockMantleRegion } from './mantle';
import { BedrockMantleChatProvider } from './mantleChat';
import { BedrockOpenAiResponsesProvider } from './openaiResponses';
import { calculateBedrockCost, calculateBedrockInvokeModelCost } from './pricing';
import { getBedrockRuntimeModelError } from './routing';

import type { ProviderResponse } from '../../types/providers';
import type { OpenAiChatCompletionCostData } from '../openai/chat';
import type { OpenAiCompletionOptions } from '../openai/types';

type RuntimeOptions = NonNullable<ConstructorParameters<typeof BedrockMantleChatProvider>[1]>;

function runtimeOptions(options: RuntimeOptions): RuntimeOptions {
  const region = resolveBedrockMantleRegion(options.config ?? {}, options.env, 'us-east-1');
  if (!/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(region)) {
    throw new Error(`Invalid AWS region "${region}" for Bedrock Runtime`);
  }
  const suffix = region.startsWith('cn-') ? 'amazonaws.com.cn' : 'amazonaws.com';
  return {
    ...options,
    config: {
      omitDefaults: true,
      ...options.config,
      region,
      apiBaseUrl:
        options.config?.apiBaseUrl || `https://bedrock-runtime.${region}.${suffix}/openai/v1`,
    },
  };
}

function capabilityName(model: string): string {
  return model
    .replace(/^arn:[^:]+:bedrock:[^:]+:[^:]*:(?:foundation-model|inference-profile)\//, '')
    .replace(/^(?:us-gov|us|eu|apac|global|jp|au|in|ca)\./, '')
    .replace(/^(?:openai|xai)\./, '');
}

function flexibleReasoningModel(model: string): boolean {
  const name = capabilityName(model);
  return name === 'zai.glm-5.3' || /^(?:grok-|gpt-oss-)/.test(name);
}

function runtimeCost(
  modelName: string,
  usage: any,
  config: OpenAiCompletionOptions,
  serviceTier: string | null | undefined,
  region: string,
  cached: boolean,
): number | undefined {
  // Complete manual rates remain authoritative. Do not fall back to first-party vendor prices.
  if (
    config.cost !== undefined ||
    config.inputCost !== undefined ||
    config.outputCost !== undefined
  ) {
    const manualCost = calculateOpenAIUsageCost('bedrock-runtime-custom', config, usage, {
      cachedResponse: cached,
    });
    if (manualCost !== undefined) {
      return manualCost;
    }
  }
  const input = usage?.input_tokens ?? usage?.prompt_tokens;
  const output = usage?.output_tokens ?? usage?.completion_tokens;
  const cacheRead =
    usage?.input_tokens_details?.cached_tokens ?? usage?.prompt_tokens_details?.cached_tokens ?? 0;
  const cacheWrite = getOpenAICacheWriteInputTokens(usage) ?? 0;
  const uncachedInput =
    typeof input === 'number' ? Math.max(0, input - cacheRead - cacheWrite) : undefined;
  const model = capabilityName(modelName);
  const gpt61Ultrafast = model === 'gpt-6.1-sol' && serviceTier === 'ultrafast';
  if (
    !gpt61Ultrafast &&
    !['default', 'priority', 'flex', 'reserved'].includes(serviceTier ?? 'default')
  ) {
    return undefined;
  }
  const gpt56 = /^gpt-5\.6-(?:sol|terra|luna)$/.test(model);
  if (gpt56 || /^(?:gpt-6-(?:sol|luna)|gpt-6\.1-sol)$/.test(model)) {
    if (serviceTier && serviceTier !== 'default' && !gpt61Ultrafast) {
      return undefined;
    }
    return calculateOpenAIUsageCost(gpt56 ? `bedrock:${model}` : model, config, usage, {
      cachedResponse: cached,
      provider: 'bedrock',
      region,
      regionalProcessing: !/(^|\/)global\.openai\./.test(modelName),
      serviceTier: serviceTier ?? 'default',
    });
  }
  // GPT OSS has no verified cache rates in the Bedrock catalog.
  if (
    model.startsWith('gpt-oss-') &&
    config.inputCost === undefined &&
    (cacheRead > 0 || cacheWrite > 0)
  ) {
    return undefined;
  }
  // An explicit input rate covers all input tokens, including cache reads/writes.
  // Keep their total in the catalog lookup so output long-context tiers still apply.
  const catalogInput = config.inputCost === undefined ? uncachedInput : input;
  const catalogRead = config.inputCost === undefined ? cacheRead : 0;
  const catalogWrite = config.inputCost === undefined ? cacheWrite : 0;
  // These profiles have verified cache rates that the native Invoke path cannot normalize yet.
  // Other models must pass its verified-rate gate instead of using stale legacy catalog matches.
  if (
    model !== 'zai.glm-5.3' &&
    model !== 'moonshotai.kimi-k3' &&
    calculateBedrockInvokeModelCost(
      modelName,
      catalogInput,
      output,
      catalogRead,
      catalogWrite,
      region,
    ) === undefined
  ) {
    return undefined;
  }
  // Kimi's published US/global tier multipliers apply only to the HTTP APIs.
  // India non-default tiers retain unknown pricing until their rates are established.
  const kimiHttpTier =
    /(?:^|:inference-profile\/)(?:us|global)\.moonshotai\.kimi-k3$/i.test(modelName) &&
    (serviceTier === 'priority' || serviceTier === 'flex');
  const tierMultiplier = kimiHttpTier ? (serviceTier === 'priority' ? 1.75 : 0.5) : 1;
  const catalogCost = (completionTokens?: number) => {
    const cost = calculateBedrockCost(
      modelName,
      catalogInput,
      completionTokens,
      catalogRead,
      catalogWrite,
      region,
      {
        type: (kimiHttpTier ? 'default' : (serviceTier ?? 'default')) as
          | 'default'
          | 'priority'
          | 'flex'
          | 'reserved',
      },
    );
    return cost === undefined ? undefined : cost * tierMultiplier;
  };
  let cost = catalogCost(output);
  if (cost !== undefined && (config.inputCost !== undefined || config.outputCost !== undefined)) {
    const catalogInputCost = catalogCost(0);
    if (catalogInputCost === undefined) {
      return undefined;
    }
    cost =
      (config.inputCost === undefined ? catalogInputCost : input * config.inputCost) +
      (config.outputCost === undefined ? cost - catalogInputCost : output * config.outputCost);
  }
  return cost === undefined ? undefined : cached ? 0 : cost;
}

/** OpenAI-compatible Chat Completions on Bedrock Runtime, with Runtime model IDs. */
export class BedrockRuntimeChatProvider extends BedrockMantleChatProvider {
  constructor(modelName: string, options: RuntimeOptions = {}) {
    super(modelName, runtimeOptions(options));
  }

  protected normalizeCapabilityModelName(model: string): string {
    return capabilityName(model);
  }

  protected isReasoningModel(): boolean {
    return flexibleReasoningModel(this.modelName) || super.isReasoningModel();
  }

  protected isReasoningCapabilityModel(model: string): boolean {
    return flexibleReasoningModel(model) || super.isReasoningCapabilityModel(model);
  }

  protected supportsTemperature(): boolean {
    return flexibleReasoningModel(this.modelName) || super.supportsTemperature();
  }

  protected supportsTemperatureForCapabilityModel(model: string): boolean {
    return flexibleReasoningModel(model) || super.supportsTemperatureForCapabilityModel(model);
  }

  async getOpenAiBody(...args: Parameters<BedrockMantleChatProvider['getOpenAiBody']>) {
    const config = { ...this.config, ...args[1]?.prompt?.config };
    if (config.serviceTier !== undefined || config.passthrough?.serviceTier !== undefined) {
      throw new Error(
        'Amazon Bedrock Runtime Chat uses service_tier. Replace serviceTier with service_tier ' +
          'to select an inference tier.',
      );
    }
    const result = await super.getOpenAiBody(...args);
    const modelError = getBedrockRuntimeModelError('runtime-chat', result.body.model);
    if (modelError) {
      throw new Error(modelError);
    }
    if (capabilityName(result.body.model).startsWith('grok-')) {
      delete result.body.presence_penalty;
      delete result.body.frequency_penalty;
      delete result.body.stop;
    }
    if (capabilityName(result.body.model) === 'zai.glm-5.3') {
      // Reasoning-model normalization removes max_tokens. Retain explicit legacy caps
      // using the Runtime completion field, with passthrough overrides first.
      const passthrough = result.config.passthrough as
        | { max_tokens?: number | null; max_completion_tokens?: number | null }
        | undefined;
      const cap = [
        passthrough?.max_completion_tokens,
        passthrough?.max_tokens,
        result.config.max_completion_tokens,
        result.config.max_tokens,
        result.body.max_completion_tokens,
        getEnvInt('OPENAI_MAX_TOKENS'),
      ].find((value) => value !== undefined);
      if (cap !== undefined) {
        result.body.max_completion_tokens = cap;
      }
    }
    // Runtime accepts the OpenAI completion cap even when a new model is not in the
    // shared reasoning catalog. Preserve an explicit cap rather than silently omit it.
    if (
      !isGpt6Model(result.body.model) &&
      result.config.max_completion_tokens !== undefined &&
      result.body.max_completion_tokens === undefined &&
      (result.config.passthrough as { max_tokens?: unknown } | undefined)?.max_tokens === undefined
    ) {
      result.body.max_completion_tokens = result.config.max_completion_tokens;
      delete result.body.max_tokens;
    }
    if (result.body.stream === undefined ? result.config.stream : result.body.stream) {
      result.body.stream = true;
      result.body.stream_options = { include_usage: true, ...result.body.stream_options };
    }
    return result;
  }

  protected getChatResponseFormat(body: Record<string, any>): 'json' | 'text' {
    return body.stream ? 'text' : 'json';
  }

  protected parseChatResponse(data: any, body: Record<string, any>): any {
    return body.stream && typeof data === 'string' ? collectBedrockChatStream(data) : data;
  }

  protected getChatResponseErrorAccounting(error: unknown, config: OpenAiCompletionOptions) {
    if (!(error instanceof BedrockChatStreamError) || !error.response.usage) {
      return undefined;
    }
    const cost = this.calculateResponseCost(error.response, config, false);
    return {
      tokenUsage: getTokenUsage(error.response, false),
      cached: false,
      ...(cost === undefined ? {} : { cost }),
    };
  }

  protected calculateResponseCost(
    data: OpenAiChatCompletionCostData,
    config: OpenAiCompletionOptions,
    cached: boolean,
  ): number | undefined {
    const override = (config.passthrough as { model?: unknown } | undefined)?.model;
    const model = typeof override === 'string' ? override : this.modelName;
    return runtimeCost(
      model,
      data.usage,
      config,
      data.service_tier ?? config.service_tier,
      this.getBillingRegion(),
      cached,
    );
  }
}

/** OpenAI-compatible Responses on Runtime; Mantle routing and tier restrictions do not apply. */
export class BedrockRuntimeResponsesProvider extends BedrockOpenAiResponsesProvider {
  constructor(modelName: string, options: RuntimeOptions = {}) {
    super(modelName, runtimeOptions(options));
  }

  protected usesRuntimeApi(): boolean {
    return true;
  }

  protected requiresResponsesStreamTerminalEvent(): boolean {
    return true;
  }

  protected normalizeCapabilityModelName(model: string): string {
    return capabilityName(model);
  }

  protected isReasoningModel(): boolean {
    return flexibleReasoningModel(this.modelName) || super.isReasoningModel();
  }

  protected isReasoningCapabilityModel(model: string): boolean {
    return flexibleReasoningModel(model) || super.isReasoningCapabilityModel(model);
  }

  protected supportsTemperature(): boolean {
    return flexibleReasoningModel(this.modelName) || super.supportsTemperature();
  }

  protected supportsTemperatureForCapabilityModel(model: string): boolean {
    return flexibleReasoningModel(model) || super.supportsTemperatureForCapabilityModel(model);
  }

  async getOpenAiBody(...args: Parameters<BedrockOpenAiResponsesProvider['getOpenAiBody']>) {
    const result = await super.getOpenAiBody(...args);
    const body = result.body as Record<string, any>;
    if (body.background === true) {
      throw new Error(
        'Bedrock Runtime Responses does not support background=true. Use a Mantle Responses provider for background inference.',
      );
    }
    const modelError = getBedrockRuntimeModelError('runtime-responses', body.model);
    if (modelError) {
      throw new Error(modelError);
    }
    const serverTools = new Set([
      'web_search',
      'web_search_preview',
      'file_search',
      'code_interpreter',
      'image_generation',
      'mcp',
    ]);
    if (
      Array.isArray(body.tools) &&
      body.tools.some(
        (tool: { type?: string }) =>
          serverTools.has(tool.type ?? '') || tool.type?.startsWith('web_search_'),
      )
    ) {
      throw new Error(
        'Bedrock Runtime Responses does not support server-side tools. Use client-side functions or a Mantle Responses provider.',
      );
    }
    const topP = this.getConfiguredTopP(result.config);
    if (flexibleReasoningModel(body.model) && topP !== undefined && body.top_p === undefined) {
      body.top_p = topP;
    }
    return result;
  }

  protected applyBilling(
    result: ProviderResponse,
    data: any,
    config: OpenAiCompletionOptions,
    cached: boolean,
  ): ProviderResponse {
    const override = (config.passthrough as { model?: unknown } | undefined)?.model;
    const model = typeof override === 'string' ? override : this.modelName;
    const cost = runtimeCost(
      model,
      data.usage,
      config,
      data.service_tier ?? config.service_tier,
      this.getBillingRegion(),
      cached,
    );
    const { cost: _previousCost, ...unbilled } = result;
    return {
      ...unbilled,
      ...(result.error && !result.tokenUsage && data.usage
        ? { tokenUsage: getResponsesTokenUsage(data, cached), cached }
        : {}),
      ...(cost === undefined ? {} : { cost }),
    };
  }
}
