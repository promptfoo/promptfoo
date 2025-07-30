import { fetchWithCache } from '../../cache';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../shared';
import { getGoogleClient } from './util';
import { sleep } from '../../util/time';
import type { ApiProvider, CallApiContextParams, ProviderResponse } from '../../types';
import type { EnvOverrides } from '../../types/env';
import type { CompletionOptions } from './types';

interface GoogleImageOptions {
  config?: CompletionOptions;
  id?: string;
  env?: EnvOverrides;
}

// Both Google AI Studio and Vertex AI use the same request format
interface ImageGenerationRequest {
  instances: Array<{
    prompt: string;
  }>;
  parameters?: {
    sampleCount?: number;
    aspectRatio?: string;
    personGeneration?: string;
    safetySetting?: string;
    addWatermark?: boolean;
    seed?: number;
  };
}

interface ImagePrediction {
  image?: {
    bytesBase64Encoded: string;
    mimeType?: string;
  };
  bytesBase64Encoded?: string;
  mimeType?: string;
}

export class GoogleImageProvider implements ApiProvider {
  modelName: string;
  config: CompletionOptions;
  env?: EnvOverrides;
  maxRetries: number = 3;
  baseRetryDelay: number = 1000; // 1 second

  constructor(modelName: string, options: GoogleImageOptions = {}) {
    this.modelName = modelName;
    this.config = options.config || {};
    this.env = options.env;
  }

  id(): string {
    return `google:image:${this.modelName}`;
  }

  toString(): string {
    return `[Google Image Generation Provider ${this.modelName}]`;
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    if (!prompt) {
      return {
        error: 'Prompt is required for image generation',
      };
    }

    // Check if we should use Vertex AI (when projectId is provided)
    const projectId =
      this.config.projectId || getEnvString('GOOGLE_PROJECT_ID') || this.env?.GOOGLE_PROJECT_ID;

    if (projectId) {
      // Use Vertex AI if project ID is available
      return this.callVertexApi(prompt);
    }

    // Otherwise, try Google AI Studio with API key
    const apiKey = this.getApiKey();
    if (apiKey) {
      return this.callGeminiApi(prompt);
    }

    // If neither is available, provide helpful error
    return {
      error:
        'Imagen models require either:\n' +
        '1. Google AI Studio: Set GOOGLE_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or GEMINI_API_KEY environment variable\n' +
        '2. Vertex AI: Set GOOGLE_PROJECT_ID environment variable or provide projectId in config, and run "gcloud auth application-default login"',
    };
  }

  private async callVertexApi(prompt: string): Promise<ProviderResponse> {
    const location =
      this.config.region ||
      getEnvString('GOOGLE_LOCATION') ||
      this.env?.GOOGLE_LOCATION ||
      'us-central1';

    try {
      const { client, projectId } = await getGoogleClient();
      if (!projectId) {
        return {
          error:
            'Google project ID is required for Vertex AI. Set GOOGLE_PROJECT_ID or add projectId to provider config.',
        };
      }

      const modelPath = this.getModelPath();
      const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelPath}:predict`;

      logger.debug(`Vertex AI Image API endpoint: ${endpoint}`);
      logger.debug(`Project ID: ${projectId}, Location: ${location}, Model: ${modelPath}`);

      const body: ImageGenerationRequest = {
        instances: [
          {
            prompt: prompt.trim(),
          },
        ],
        parameters: {
          sampleCount: this.config.n || 1,
          aspectRatio: this.config.aspectRatio || '1:1',
          personGeneration: this.config.personGeneration || 'allow_all',
          safetySetting: this.config.safetyFilterLevel || 'block_some',
          addWatermark: this.config.addWatermark !== false,
          // Only include seed if watermark is disabled, as they're incompatible
          ...(this.config.seed !== undefined &&
            this.config.addWatermark === false && { seed: this.config.seed }),
        },
      };

      const response = await this.withRetry(
        () =>
          client.request({
            url: endpoint,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(this.config.headers || {}),
            },
            data: body,
            timeout: REQUEST_TIMEOUT_MS,
          }),
        'Vertex AI API call',
      );

      return this.processResponse(response.data, false);
    } catch (err: any) {
      if (err.response?.data?.error) {
        return {
          error: `Vertex AI error: ${err.response.data.error.message || 'Unknown error'}`,
        };
      }
      return {
        error: `Failed to call Vertex AI: ${err.message || 'Unknown error'}`,
      };
    }
  }

  private async callGeminiApi(prompt: string): Promise<ProviderResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        error:
          'API key not found. Set GOOGLE_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or GEMINI_API_KEY environment variable.',
      };
    }

    const modelPath = this.getModelPath();
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelPath}:predict`;

    logger.debug(`Google AI Studio Image API endpoint: ${endpoint}`);

    // Map the safety filter level for Google AI Studio
    const safetySetting = this.mapSafetyLevelForGemini(this.config.safetyFilterLevel);

    const body: ImageGenerationRequest = {
      instances: [
        {
          prompt: prompt.trim(),
        },
      ],
      parameters: {
        sampleCount: this.config.n || 1,
        aspectRatio: this.config.aspectRatio || '1:1',
        personGeneration: this.config.personGeneration || 'allow_all',
        safetySetting,
        // Google AI Studio doesn't support addWatermark or seed parameters
      },
    };

    logger.debug(`Making request to ${endpoint} with API key`);

    try {
      const response = await this.withRetry(
        () =>
          fetchWithCache(
            endpoint,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
                ...(this.config.headers || {}),
              },
              body: JSON.stringify(body),
            },
            REQUEST_TIMEOUT_MS,
            'json',
          ),
        'Google AI Studio API call',
      );

      return this.processResponse(response.data, response.cached);
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
  }

  private processResponse(data: any, cached?: boolean): ProviderResponse {
    logger.debug(`Response data: ${JSON.stringify(data).substring(0, 200)}...`);

    if (!data || typeof data !== 'object') {
      return {
        error: 'Invalid response from API',
      };
    }

    if (data.error) {
      return {
        error: data.error.message || JSON.stringify(data.error),
      };
    }

    if (!data.predictions || data.predictions.length === 0) {
      return {
        error: 'No images generated',
      };
    }

    const imageOutputs = [];
    let totalCost = 0;

    // Get cost per image from model prices
    const costPerImage = this.getCost();

    for (const prediction of data.predictions) {
      // Handle both response structures (Vertex AI and Google AI Studio)
      const imageData = (prediction as ImagePrediction).image || (prediction as ImagePrediction);
      const base64Image = imageData.bytesBase64Encoded;
      const mimeType = imageData.mimeType || 'image/png';

      if (base64Image) {
        // Return as markdown image with data URL
        imageOutputs.push(`![Generated Image](data:${mimeType};base64,${base64Image})`);
        totalCost += costPerImage;
      }
    }

    if (imageOutputs.length === 0) {
      return {
        error: 'No valid images generated',
      };
    }

    return {
      output: imageOutputs.join('\n\n'),
      cached,
      cost: totalCost,
    };
  }

  private mapSafetyLevelForGemini(level?: string): string {
    // Google AI Studio only supports 'block_low_and_above'
    // Document this limitation in the response if user specified a different level
    if (level && level !== 'block_low_and_above') {
      logger.warn(
        `Google AI Studio only supports 'block_low_and_above' safety setting. Requested setting '${level}' will be overridden.`,
      );
    }
    return 'block_low_and_above';
  }

  private getApiKey(): string | undefined {
    return (
      this.config.apiKey ||
      getEnvString('GOOGLE_API_KEY') ||
      getEnvString('GOOGLE_GENERATIVE_AI_API_KEY') ||
      getEnvString('GEMINI_API_KEY') ||
      this.env?.GOOGLE_API_KEY ||
      this.env?.GOOGLE_GENERATIVE_AI_API_KEY ||
      this.env?.GEMINI_API_KEY
    );
  }

  private getModelPath(): string {
    // If model already starts with 'imagen-' prefix, use it as is
    if (this.modelName.startsWith('imagen-')) {
      return this.modelName;
    }
    // Otherwise prepend imagen- prefix
    return `imagen-${this.modelName}`;
  }

  private getCost(): number {
    // Cost per image based on model
    const costMap: Record<string, number> = {
      'imagen-4.0-ultra-generate-preview-06-06': 0.06,
      'imagen-4.0-generate-preview-06-06': 0.04,
      'imagen-4.0-fast-generate-preview-06-06': 0.02,
      'imagen-3.0-generate-002': 0.04,
      'imagen-3.0-generate-001': 0.04,
      'imagen-3.0-fast-generate-001': 0.02,
    };
    // Use the normalized model path for cost lookup
    const modelPath = this.getModelPath();
    return costMap[modelPath] || 0.04; // Default cost
  }

  private async withRetry<T>(operation: () => Promise<T>, operationName: string): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        // Don't retry on client errors (4xx)
        if (error.response?.status >= 400 && error.response?.status < 500) {
          throw error;
        }

        // Don't retry on the last attempt
        if (attempt === this.maxRetries - 1) {
          throw error;
        }

        const delay = this.baseRetryDelay * Math.pow(2, attempt);
        logger.warn(
          `${operationName} failed (attempt ${attempt + 1}/${this.maxRetries}), retrying in ${delay}ms...`,
        );
        await sleep(delay);
      }
    }

    throw lastError;
  }
}
