import { fetchWithCache } from '../../cache';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../shared';
import type { ApiProvider, CallApiContextParams, ProviderResponse } from '../../types';
import type { EnvOverrides } from '../../types/env';
import type { CompletionOptions } from './types';

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

export class GoogleImageProvider implements ApiProvider {
  modelName: string;
  config: CompletionOptions;
  env?: EnvOverrides;

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

    // Imagen models are only available through Vertex AI
    const projectId =
      this.config.projectId || getEnvString('GOOGLE_PROJECT_ID') || this.env?.GOOGLE_PROJECT_ID;

    if (!projectId) {
      return {
        error:
          'Imagen models require Google Cloud Project ID. Set GOOGLE_PROJECT_ID environment variable or provide projectId in config.',
      };
    }

    return this.callVertexApi(prompt);
  }

  private async callVertexApi(prompt: string): Promise<ProviderResponse> {
    const projectId =
      this.config.projectId || getEnvString('GOOGLE_PROJECT_ID') || this.env?.GOOGLE_PROJECT_ID;
    const location =
      this.config.region ||
      getEnvString('GOOGLE_LOCATION') ||
      this.env?.GOOGLE_LOCATION ||
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
        cached: response.cached,
        cost: totalCost,
      };
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
  }

  private getModelPath(): string {
    // If model already includes imagen prefix, use it as is
    if (this.modelName.includes('imagen')) {
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
    return costMap[this.modelName] || 0.04; // Default cost
  }
}
