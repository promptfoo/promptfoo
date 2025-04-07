import { fetchWithCache } from '../../cache';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import type {
  ApiProvider,
  ProviderEmbeddingResponse,
  ProviderOptions,
  ProviderResponse,
} from '../../types';
import { REQUEST_TIMEOUT_MS } from '../shared';

/**
 * Configuration options for Ollama completion provider
 */
interface OllamaCompletionOptions {
  // From https://github.com/ollama/ollama/blob/main/api/types.go Options struct
  // Runner options
  num_ctx?: number;
  num_batch?: number;
  num_gpu?: number;
  main_gpu?: number;
  low_vram?: boolean;
  f16_kv?: boolean; // Deprecated: This option is ignored
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

const OllamaCompletionOptionKeys = new Set<keyof OllamaCompletionOptions>([
  'num_ctx',
  'num_batch',
  'num_gpu',
  'main_gpu',
  'low_vram',
  'f16_kv',
  'logits_all',
  'vocab_only',
  'use_mmap',
  'use_mlock',
  'num_thread',
  'num_keep',
  'seed',
  'num_predict',
  'top_k',
  'top_p',
  'min_p',
  'typical_p',
  'repeat_last_n',
  'temperature',
  'repeat_penalty',
  'presence_penalty',
  'frequency_penalty',
  'mirostat',
  'mirostat_tau',
  'mirostat_eta',
  'stop',
  'keep_alive',
  'system',
  'template',
  'raw',
  'format',
  'images',
]);

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
 * Implementation of Ollama Completion Provider (OpenAI compatibility layer)
 */
export class OllamaCompletionProvider implements ApiProvider {
  modelName: string;
  config: OllamaCompletionOptions;

  constructor(modelName: string, options: { id?: string; config?: OllamaCompletionOptions } = {}) {
    const { id, config } = options;
    this.modelName = modelName;
    this.id = id ? () => id : this.id;
    this.config = config || {};
  }

  id(): string {
    return `ollama:completion:${this.modelName}`;
  }

  toString(): string {
    return `[Ollama Completion Provider ${this.modelName}]`;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    const params = {
      model: this.modelName,
      prompt,
      stream: false,
      options: Object.keys(this.config).reduce(
        (options, key) => {
          const optionName = key as keyof OllamaCompletionOptions;
          if (OllamaCompletionOptionKeys.has(optionName)) {
            options[optionName] = this.config[optionName];
          }
          return options;
        },
        {} as Partial<
          Record<keyof OllamaCompletionOptions, number | boolean | string[] | undefined | any>
        >,
      ),
    };

    logger.debug(`Calling Ollama API: ${JSON.stringify(params)}`);
    let response;
    try {
      response = await fetchWithCache(
        `${getEnvString('OLLAMA_BASE_URL') || 'http://localhost:11434'}/api/generate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(getEnvString('OLLAMA_API_KEY')
              ? { Authorization: `Bearer ${getEnvString('OLLAMA_API_KEY')}` }
              : {}),
          },
          body: JSON.stringify(params),
        },
        REQUEST_TIMEOUT_MS,
        'text',
      );
    } catch (err) {
      return {
        error: `API call error: ${String(err)}. Output:\n${response?.data}`,
      };
    }
    logger.debug(`\tOllama generate API response: ${response.data}`);
    if (response.data.error) {
      return {
        error: `Ollama error: ${response.data.error}`,
      };
    }

    try {
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
      };
    } catch (err) {
      return {
        error: `Ollama API response error: ${String(err)}: ${JSON.stringify(response.data)}`,
      };
    }
  }
}

/**
 * Ollama Embedding Provider (OpenAI compatibility layer)
 */
export class OllamaEmbeddingProvider extends OllamaCompletionProvider {
  async callEmbeddingApi(text: string): Promise<ProviderEmbeddingResponse> {
    const params = {
      model: this.modelName,
      prompt: text,
      options: Object.keys(this.config).reduce(
        (options, key) => {
          const optionName = key as keyof OllamaCompletionOptions;
          if (OllamaCompletionOptionKeys.has(optionName)) {
            options[optionName] = this.config[optionName];
          }
          return options;
        },
        {} as Partial<
          Record<keyof OllamaCompletionOptions, number | boolean | string[] | undefined | any>
        >,
      ),
    };

    logger.debug(`Calling Ollama API: ${JSON.stringify(params)}`);
    let response;
    try {
      response = await fetchWithCache(
        `${getEnvString('OLLAMA_BASE_URL') || 'http://localhost:11434'}/api/embeddings`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(getEnvString('OLLAMA_API_KEY')
              ? { Authorization: `Bearer ${getEnvString('OLLAMA_API_KEY')}` }
              : {}),
          },
          body: JSON.stringify(params),
        },
        REQUEST_TIMEOUT_MS,
        'json',
      );
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
    logger.debug(`\tOllama embeddings API response: ${JSON.stringify(response.data)}`);

    try {
      const embedding = response.data.embedding as number[];
      if (!embedding) {
        return {
          error: `No embedding found in response: ${JSON.stringify(response.data)}`,
        };
      }
      return {
        embedding,
      };
    } catch (err) {
      return {
        error: `Ollama API response error: ${String(err)}: ${JSON.stringify(response.data)}`,
      };
    }
  }
}
