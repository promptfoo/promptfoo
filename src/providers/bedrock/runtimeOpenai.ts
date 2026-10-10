import { calculateOpenAIUsageCost } from '../openai/billing';
import { collectBedrockChatStream } from './chatStream';
import { resolveBedrockMantleRegion } from './mantle';
import { BedrockMantleChatProvider } from './mantleChat';
import { BedrockOpenAiResponsesProvider } from './openaiResponses';
import { calculateBedrockCost } from './pricing';
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
  return /^(?:grok-|gpt-oss-)/.test(capabilityName(model));
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
  if (!['default', 'priority', 'flex', 'reserved'].includes(serviceTier ?? 'default')) {
    return undefined;
  }
  if (/^gpt-5\.6-(?:sol|terra|luna)$/.test(capabilityName(modelName))) {
    if (serviceTier && serviceTier !== 'default') {
      return undefined;
    }
    return calculateOpenAIUsageCost(`bedrock:${capabilityName(modelName)}`, config, usage, {
      cachedResponse: cached,
      provider: 'bedrock',
      region,
      regionalProcessing: !/(^|\/)global\.openai\./.test(modelName),
      serviceTier: serviceTier ?? 'default',
    });
  }
  let cost = calculateBedrockCost(
    modelName,
    typeof input === 'number' ? Math.max(0, input - cacheRead) : undefined,
    output,
    cacheRead,
    0,
    region,
    { type: (serviceTier ?? 'default') as 'default' | 'priority' | 'flex' | 'reserved' },
  );
  if (cost !== undefined && (config.inputCost !== undefined || config.outputCost !== undefined)) {
    const catalogInputCost = calculateBedrockCost(
      modelName,
      Math.max(0, input - cacheRead),
      0,
      cacheRead,
      0,
      region,
      { type: (serviceTier ?? 'default') as 'default' | 'priority' | 'flex' | 'reserved' },
    );
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
    const result = await super.getOpenAiBody(...args);
    const modelError = getBedrockRuntimeModelError('runtime-chat', result.body.model);
    if (modelError) {
      throw new Error(modelError);
    }
    // Runtime accepts the OpenAI completion cap even when a new model is not in the
    // shared reasoning catalog. Preserve an explicit cap rather than silently omit it.
    if (
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
    return { ...unbilled, ...(cost === undefined ? {} : { cost }) };
  }
}
