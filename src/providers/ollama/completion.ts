import { fetchWithCache } from '../../cache';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import type { ApiProvider, ProviderOptions, ProviderResponse } from '../../types';
import { REQUEST_TIMEOUT_MS } from '../shared';

/**
 * Configuration options for Ollama completion provider
 */
export interface OllamaCompletionConfig {
  // Required options
  model: string;

  // Runner options
  num_ctx?: number;
  num_batch?: number;
  num_gpu?: number;
  main_gpu?: number;
  low_vram?: boolean;
  f16_kv?: boolean;
  logits_all?: boolean;
  vocab_only?: boolean;
  use_mmap?: boolean;
  use_mlock?: boolean;
  num_thread?: number;

  // Predict options
  num_keep?: number;
  seed?: number;
  num_predict?: number;
  top_k?: number;
  top_p?: number;
  min_p?: number;
  typical_p?: number;
  repeat_last_n?: number;
  temperature?: number;
  repeat_penalty?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  mirostat?: number;
  mirostat_tau?: number;
  mirostat_eta?: number;
  stop?: string[];

  // Additional options
  keep_alive?: string | number; // Duration string or number in seconds
  system?: string;
  template?: string;
  raw?: boolean;
  format?: any;
  images?: string[]; // Base64-encoded images
}

/**
 * JSON structure for Ollama completion response
 */
interface OllamaCompletionJsonL {
  model: string;
  created_at: string;
  response?: string;
  done: boolean;
  context?: number[];
  done_reason?: string;

  total_duration?: number;
  load_duration?: number;
  sample_count?: number;
  sample_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Implementation of Ollama Completion Provider
 */
export class OllamaCompletionProvider implements ApiProvider {
  public config: OllamaCompletionConfig;
  private baseUrl: string;
  private apiKey?: string;

  constructor(model: string, options: { id?: string; config?: ProviderOptions } = {}) {
    const { id, config = {} } = options;

    this.config = {
      model,
      ...(config.config || {}),
    };

    this.baseUrl = getEnvString('OLLAMA_BASE_URL') || 'http://localhost:11434';
    this.apiKey = getEnvString('OLLAMA_API_KEY');

    this.id = id ? () => id : this.id;
  }

  id(): string {
    return `ollama:completion:${this.config.model}`;
  }

  toString(): string {
    return `[Ollama Completion Provider ${this.config.model}]`;
  }

  /**
   * Call the Ollama generate API
   */
  async callApi(prompt: string): Promise<ProviderResponse> {
    try {
      // Extract all applicable options from config
      const options: Record<string, any> = {};

      // Add all config options to the request
      for (const [key, value] of Object.entries(this.config)) {
        if (key !== 'model' && value !== undefined) {
          options[key] = value;
        }
      }

      // Prepare request body
      const requestBody: Record<string, any> = {
        model: this.config.model,
        prompt,
        stream: false,
      };

      // Add options if any are specified
      if (Object.keys(options).length > 0) {
        requestBody.options = options;
      }

      logger.debug(
        `Calling Ollama Completion API with body: ${JSON.stringify(requestBody, null, 2)}`,
      );

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add API key if provided
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetchWithCache(
        `${this.baseUrl}/api/generate`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
        },
        REQUEST_TIMEOUT_MS,
        'text',
      );

      if (!response.data) {
        return {
          error: `Empty response from Ollama API: ${JSON.stringify(response)}`,
        };
      }

      if (response.data.error) {
        return {
          error: `Ollama error: ${response.data.error}`,
        };
      }

      try {
        // Parse JSONL response from Ollama
        const output = response.data
          .split('\n')
          .filter((line: string) => line.trim() !== '')
          .map((line: string) => {
            const parsed = JSON.parse(line) as OllamaCompletionJsonL;
            if (parsed.response) {
              return parsed.response;
            }
            return null;
          })
          .filter((s: string | null) => s !== null)
          .join('');

        return {
          output,
          raw: response.data,
        };
      } catch (err) {
        return {
          error: `Ollama API response parsing error: ${String(err)}: ${JSON.stringify(response.data)}`,
        };
      }
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
  }
}
