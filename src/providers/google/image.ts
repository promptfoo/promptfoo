import { fetchWithCache } from '../../cache';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../shared';
import type { ApiProvider, CallApiContextParams, ProviderResponse } from '../../types';
import type { EnvOverrides } from '../../types/env';
import type { CompletionOptions } from './types';

const DEFAULT_API_HOST = 'generativelanguage.googleapis.com';

interface GoogleImageOptions {
  config?: CompletionOptions;
  id?: string;
  env?: EnvOverrides;
}

// Vertex AI request format
interface VertexImageGenerationRequest {
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

// Google AI Studio request format
interface GeminiImageGenerationRequest {
  prompt: string;
  numberOfImages?: number;
  aspectRatio?: string;
  personGeneration?: string;
  safetyFilterLevel?: string;
  addWatermark?: boolean;
  seed?: number;
}

export class GoogleImageProvider implements ApiProvider {
  modelName: string;
  config: CompletionOptions;
  env?: EnvOverrides;
  useVertexApi: boolean;

  constructor(modelName: string, options: GoogleImageOptions = {}) {
    this.modelName = modelName;
    this.config = options.config || {};
    this.env = options.env;

    // Determine whether to use Vertex AI or Google AI Studio
    this.useVertexApi = !!(
      this.config.projectId ||
      process.env.GOOGLE_PROJECT_ID ||
      (this.env as any)?.GOOGLE_PROJECT_ID
    );
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

    const apiKey = this.getApiKey();

    if (this.useVertexApi) {
      return this.callVertexApi(prompt, apiKey || '');
    } else {
      if (!apiKey) {
        return {
          error: 'Google API key is required. Set GOOGLE_API_KEY environment variable.',
        };
      }
      return this.callGeminiApi(prompt, apiKey);
    }
  }

  private async callVertexApi(prompt: string, apiKey: string): Promise<ProviderResponse> {
    const projectId =
      this.config.projectId ||
      process.env.GOOGLE_PROJECT_ID ||
      (this.env as any)?.GOOGLE_PROJECT_ID;
    const location =
      this.config.region ||
      process.env.GOOGLE_LOCATION ||
      (this.env as any)?.GOOGLE_LOCATION ||
      'us-central1';

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

    const body: VertexImageGenerationRequest = {
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

    // Vertex AI ALWAYS uses OAuth token from gcloud auth, never API keys
    let authHeader: string;
    try {
      const { execSync } = require('child_process');
      const token = execSync('gcloud auth application-default print-access-token', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'], // Capture stderr too
      }).trim();

      if (!token) {
        throw new Error('Empty token returned from gcloud');
      }

      authHeader = `Bearer ${token}`;
      logger.debug(`Using OAuth token: Bearer ${token.substring(0, 20)}...`);
    } catch (err) {
      logger.error(
        `Failed to get OAuth token: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        error: `Failed to get OAuth token. Run "gcloud auth application-default login" to authenticate with Google Cloud. Error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    logger.debug(`Making request to ${endpoint} with auth header`);

    try {
      const response = await fetchWithCache(
        endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
            ...(this.config.headers || {}),
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
        'json',
      );

      const data = response.data;
      logger.debug(
        `Response status: ${response.status}, data: ${JSON.stringify(data).substring(0, 200)}...`,
      );

      if (!data || typeof data !== 'object') {
        return {
          error: 'Invalid response from Vertex AI',
        };
      }

      if (data.error) {
        return {
          error: `Vertex AI error: ${data.error.message || JSON.stringify(data.error)}`,
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
        // Handle the actual Vertex AI response structure
        const imageData = prediction.image || prediction;
        const base64Image = imageData.bytesBase64Encoded || imageData.bytesBase64Encoded;
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
        cached: response.cached,
        cost: totalCost,
      };
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
  }

  private async callGeminiApi(prompt: string, apiKey: string): Promise<ProviderResponse> {
    const apiHost = this.getApiHost();
    const modelPath = this.getModelPath();

    // Use the Gemini API format
    const endpoint = `https://${apiHost}/v1beta/models/${modelPath}:predict`;
    const url = new URL(endpoint);
    url.searchParams.append('key', apiKey);
    const fullUrl = url.toString();

    logger.debug(`Google AI Studio Image API endpoint: ${endpoint}`);
    logger.debug(`Full URL (with key): ${fullUrl.replace(apiKey, 'REDACTED')}`);

    const body: GeminiImageGenerationRequest = {
      prompt: prompt.trim(),
      numberOfImages: this.config.n || 1,
      aspectRatio: this.config.aspectRatio || '1:1',
      personGeneration: this.config.personGeneration || 'allow_adult',
      safetyFilterLevel: this.config.safetyFilterLevel || 'block_medium_and_above',
      addWatermark: this.config.addWatermark !== false,
      ...(this.config.seed !== undefined && { seed: this.config.seed }),
    };

    logger.debug(`Calling Google AI Studio Image API: ${JSON.stringify(body)}`);

    try {
      const response = await fetchWithCache(
        fullUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.config.headers || {}),
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
        'json',
      );

      const data = response.data;

      if (!data || typeof data !== 'object') {
        return {
          error: 'Invalid response from Google AI Studio',
        };
      }

      if (data.error) {
        return {
          error: `Google AI Studio error: ${data.error.message || JSON.stringify(data.error)}`,
        };
      }

      if (!data.candidates || data.candidates.length === 0) {
        return {
          error: 'No images generated',
        };
      }

      // Collect all generated images
      const outputs: string[] = [];
      for (const generatedImage of data.candidates) {
        if (generatedImage.raiFilteredReason) {
          outputs.push(`[Image blocked: ${generatedImage.raiFilteredReason}]`);
        } else if (generatedImage.image && generatedImage.image.imageBytes) {
          const imageData = `data:image/png;base64,${generatedImage.image.imageBytes}`;
          outputs.push(`![Generated image](${imageData})`);
        }
      }

      if (outputs.length === 0) {
        return {
          error: 'No valid images generated',
        };
      }

      return {
        output: outputs.join('\n\n'),
        cached: response.cached,
        cost: this.getCost() * outputs.length,
      };
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
  }

  private getApiKey(): string | undefined {
    return (
      this.config.apiKey ||
      getEnvString('GOOGLE_API_KEY') ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      (this.env as any)?.GOOGLE_GENERATIVE_AI_API_KEY ||
      getEnvString('GEMINI_API_KEY')
    );
  }

  private getApiHost(): string {
    return (
      this.config.apiHost ||
      process.env.GOOGLE_API_HOST ||
      (this.env as any)?.GOOGLE_API_HOST ||
      DEFAULT_API_HOST
    );
  }

  private getModelPath(): string {
    // If model already includes imagen prefix, use it as is
    if (this.modelName.includes('imagen')) {
      return this.modelName;
    }
    // Otherwise prepend imagen- prefix
    return `imagen-${this.modelName}`;
  }

  private mapSafetyLevel(level?: string): string {
    // Map from Google AI Studio format to Vertex AI format
    const mapping: Record<string, string> = {
      block_most: 'block_low_and_above',
      block_some: 'block_medium_and_above',
      block_few: 'block_only_high',
      block_fewest: 'block_only_high',
    };
    return mapping[level || ''] || 'block_medium_and_above';
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

    return costMap[this.modelName] || 0.04; // Default to standard cost
  }
}
