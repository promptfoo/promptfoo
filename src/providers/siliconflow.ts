import type { ApiProvider, ProviderOptions } from '../types';
import type { EnvOverrides } from '../types/env';
import { OpenAiChatCompletionProvider } from './openai/chat';

/**
 * Creates a SiliconFlow provider using OpenAI-compatible endpoints
 *
 * Documentation: https://docs.siliconflow.cn/
 *
 * SiliconFlow API supports the OpenAI API format and can be used as a drop-in replacement.
 * All parameters are automatically passed through to the SiliconFlow API.
 * 
 * Available models: Qwen/Qwen3-32B, Qwen/Qwen3-14B, THUDM/GLM-4-32B-0414, 
 * deepseek-ai/DeepSeek-V2.5, Qwen/Qwen2.5-72B-Instruct, and more.
 */
export function createSiliconFlowProvider(
  providerPath: string,
  options: {
    config?: ProviderOptions;
    id?: string;
    env?: EnvOverrides;
  } = {},
): ApiProvider {
  const splits = providerPath.split(':');

  const config = options.config?.config || {};
  const siliconFlowConfig = {
    ...options,
    config: {
      apiBaseUrl: 'https://api.siliconflow.cn/v1',
      apiKeyEnvar: 'SILICONFLOW_API_KEY',
      passthrough: {
        ...config,
      },
    },
  };

  // If the path includes 'chat', extract the model name from after 'chat:'
  if (splits[1] === 'chat') {
    const modelName = splits.slice(2).join(':');
    return new OpenAiChatCompletionProvider(modelName, siliconFlowConfig);
  } 
  
  // If no specific type is provided, use the remaining part as the model name
  const modelName = splits.slice(1).join(':');
  return new OpenAiChatCompletionProvider(modelName, siliconFlowConfig);
} 