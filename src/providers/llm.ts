import { execFile } from 'child_process';
import { promisify } from 'util';

import { getCache, isCacheEnabled } from '../cache';
import logger from '../logger';
import { getEnvString } from '../envars';
import { sha256 } from '../util/createHash';
import { safeJsonStringify } from '../util/json';

import type {
  ApiProvider,
  CallApiContextParams,
  EnvOverrides,
  ProviderOptions,
  ProviderResponse,
} from '../types';

const execFileAsync = promisify(execFile);

/**
 * Configuration options for the LLM provider
 */
interface LLMProviderConfig {
  temperature?: number;
  max_tokens?: number;
  system_prompt?: string;
  no_stream?: boolean;
  api_key?: string;
  openai_api_key?: string;
  anthropic_api_key?: string;
  gemini_api_key?: string;
  llm_binary?: string; // Path to LLM binary if not in PATH
  options?: Record<string, any>; // Additional model-specific options
}

/**
 * Provider for the LLM Python package (https://llm.datasette.io/)
 *
 * This provider allows using any model supported by the LLM package,
 * including OpenAI, Anthropic, Google Gemini, Ollama, and many others.
 *
 * Usage examples:
 * - llm:gpt-4o-mini
 * - llm:claude-3-haiku
 * - llm:gemini-2.0-flash
 * - llm:llama3.2:latest (for Ollama)
 */
export class LLMProvider implements ApiProvider {
  private modelName: string;
  config: LLMProviderConfig;
  private env?: EnvOverrides;

  constructor(
    modelName: string,
    options: {
      config?: LLMProviderConfig;
      id?: string;
      env?: EnvOverrides;
    } = {},
  ) {
    const { config = {}, id, env } = options;
    this.modelName = modelName;
    this.config = config;
    this.env = env;

    // Set the id function if provided
    if (id) {
      this.id = () => id;
    }
  }

  id(): string {
    return `llm:${this.modelName}`;
  }

  toString(): string {
    return `[LLM Provider ${this.modelName}]`;
  }

  /**
   * Build environment variables for the LLM command
   */
  private buildEnvVars(): NodeJS.ProcessEnv {
    const env = { ...process.env };

    // Set API keys if available
    const openaiKey =
      this.config.openai_api_key ||
      this.config.api_key ||
      this.env?.OPENAI_API_KEY ||
      getEnvString('OPENAI_API_KEY');
    if (openaiKey) {
      env.OPENAI_API_KEY = openaiKey;
    }

    const anthropicKey =
      this.config.anthropic_api_key ||
      this.env?.ANTHROPIC_API_KEY ||
      getEnvString('ANTHROPIC_API_KEY');
    if (anthropicKey) {
      env.ANTHROPIC_API_KEY = anthropicKey;
    }

    const geminiKey =
      this.config.gemini_api_key ||
      this.env?.GEMINI_API_KEY ||
      this.env?.GOOGLE_API_KEY ||
      getEnvString('GEMINI_API_KEY') ||
      getEnvString('GOOGLE_API_KEY');
    if (geminiKey) {
      env.GEMINI_API_KEY = geminiKey;
    }

    // Set model as default for this session
    env.LLM_MODEL = this.modelName;

    return env;
  }

  /**
   * Build command arguments for the LLM CLI
   */
  private buildArgs(prompt: string): string[] {
    const args: string[] = [];

    // Add the prompt
    args.push(prompt);

    // Specify model
    args.push('-m', this.modelName);

    // Disable streaming for easier parsing
    args.push('--no-stream');

    // Add system prompt if provided
    if (this.config.system_prompt) {
      args.push('--system', this.config.system_prompt);
    }

    // Add temperature if provided
    if (this.config.temperature !== undefined) {
      args.push('-o', 'temperature', this.config.temperature.toString());
    }

    // Add max_tokens if provided
    if (this.config.max_tokens !== undefined) {
      args.push('-o', 'max_tokens', this.config.max_tokens.toString());
    }

    // Add any additional options
    if (this.config.options) {
      for (const [key, value] of Object.entries(this.config.options)) {
        args.push('-o', key, String(value));
      }
    }

    return args;
  }

  /**
   * Parse conversation format if the prompt is JSON
   */
  private parsePrompt(prompt: string): { finalPrompt: string; systemPrompt?: string } {
    try {
      const messages = JSON.parse(prompt);
      if (Array.isArray(messages)) {
        let systemPrompt: string | undefined;
        const userMessages: string[] = [];

        for (const msg of messages) {
          if (msg.role === 'system') {
            systemPrompt = msg.content;
          } else if (msg.role === 'user') {
            userMessages.push(msg.content);
          } else if (msg.role === 'assistant') {
            userMessages.push(`Assistant: ${msg.content}`);
          }
        }

        return {
          finalPrompt: userMessages.join('\n'),
          systemPrompt: systemPrompt || this.config.system_prompt,
        };
      }
    } catch {
      // Not JSON, treat as plain text
    }

    return {
      finalPrompt: prompt,
      systemPrompt: this.config.system_prompt,
    };
  }

  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // More accurate estimation based on common tokenization patterns
    // Average is about 1 token per 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Call the LLM model via CLI
   */
  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const { finalPrompt, systemPrompt } = this.parsePrompt(prompt);

    // Create cache key
    const cacheKey = `llm:${this.modelName}:${sha256(finalPrompt)}:${safeJsonStringify(this.config)}:${safeJsonStringify(context?.vars)}`;

    // Check cache
    if (isCacheEnabled()) {
      const cache = await getCache();
      const cachedResult = await cache.get(cacheKey);
      if (cachedResult) {
        logger.debug(`Returning cached result for LLM model ${this.modelName}`);
        const parsed = JSON.parse(cachedResult as string);
        parsed.cached = true;
        return parsed;
      }
    }

    try {
      // Build command arguments
      const args = this.buildArgs(finalPrompt);

      // Override system prompt if needed
      if (systemPrompt && systemPrompt !== this.config.system_prompt) {
        const sysIndex = args.indexOf('--system');
        if (sysIndex !== -1) {
          args[sysIndex + 1] = systemPrompt;
        } else {
          args.push('--system', systemPrompt);
        }
      }

      // Build environment
      const env = this.buildEnvVars();

      // Get LLM binary path
      const llmBinary = this.config.llm_binary || 'llm';

      logger.debug(`Running LLM command: ${llmBinary} ${args.join(' ')}`);

      // Execute LLM command
      const { stdout, stderr } = await execFileAsync(llmBinary, args, {
        env,
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      });

      if (stderr) {
        logger.debug(`LLM stderr: ${stderr}`);
      }

      // Parse output
      const output = stdout.trim();

      // Estimate token usage
      const promptTokens = this.estimateTokens(finalPrompt);
      const completionTokens = this.estimateTokens(output);

      const result: ProviderResponse = {
        output,
        tokenUsage: {
          prompt: promptTokens,
          completion: completionTokens,
          total: promptTokens + completionTokens,
        },
        cached: false,
        metadata: {
          provider: 'llm',
          model: this.modelName,
        },
      };

      // Cache result
      if (isCacheEnabled()) {
        const cache = await getCache();
        await cache.set(cacheKey, JSON.stringify(result));
      }

      return result;
    } catch (error: any) {
      logger.error(`LLM provider error for model ${this.modelName}: ${error.message}`);

      // Check for common errors
      if (error.message.includes('command not found') || error.code === 'ENOENT') {
        return {
          error: `LLM CLI not found. Please install it with: pip install llm`,
        };
      }

      if (error.message.includes('No model with ID')) {
        return {
          error: `Model '${this.modelName}' not found. You may need to install a plugin. Run 'llm models' to see available models.`,
        };
      }

      if (error.message.includes('API key')) {
        return {
          error: `API key not configured for model '${this.modelName}'. Set it with: llm keys set <provider>`,
        };
      }

      return {
        error: `LLM provider error: ${error.message}`,
      };
    }
  }
}

/**
 * Factory function to create LLM provider instances
 * This is used by the provider registry
 */
export function createLLMProvider(
  modelPath: string,
  options?: ProviderOptions,
  env?: EnvOverrides,
): ApiProvider {
  // Extract model name from the path (e.g., "llm:gpt-4o-mini" -> "gpt-4o-mini")
  const modelName = modelPath.replace(/^llm:/, '');

  return new LLMProvider(modelName, {
    config: options?.config,
    id: options?.id,
    env,
  });
}
