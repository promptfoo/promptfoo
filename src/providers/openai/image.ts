import dedent from 'dedent';
import { OpenAiGenericProvider } from '.';
import { fetchWithCache } from '../../cache';
import logger from '../../logger';
import type { CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../../types';
import type { EnvOverrides } from '../../types/env';
import { ellipsize } from '../../util/text';
import { REQUEST_TIMEOUT_MS } from '../shared';
import type { OpenAiSharedOptions } from './types';
import { formatOpenAiError } from './util';

// OpenAI image models
export type OpenAiImageModel = 'dall-e-2' | 'dall-e-3';

// Operation types
export type OpenAiImageOperation = 'generation' | 'variation' | 'edit';

// Model-specific size options
export type DallE2Size = '256x256' | '512x512' | '1024x1024';
export type DallE3Size = '1024x1024' | '1792x1024' | '1024x1792';

// Common image options for both models
type CommonImageOptions = {
  n?: number;
  response_format?: 'url' | 'b64_json';
};

// DALL-E 3 specific options
type DallE3Options = CommonImageOptions & {
  size?: DallE3Size;
  quality?: 'standard' | 'hd';
  style?: 'natural' | 'vivid';
};

// DALL-E 2 specific options
type DallE2Options = CommonImageOptions & {
  size?: DallE2Size;
  // For image edits
  image?: string; // Base64-encoded image or image URL
  mask?: string; // Base64-encoded mask image
  // Operation type
  operation?: OpenAiImageOperation;
};

// Combined options type
type OpenAiImageOptions = OpenAiSharedOptions & {
  model?: OpenAiImageModel;
} & (DallE2Options | DallE3Options);

export class OpenAiImageProvider extends OpenAiGenericProvider {
  config: OpenAiImageOptions;

  constructor(
    modelName: string,
    options: { config?: OpenAiImageOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, options);
    this.config = options.config || {};
  }

  /**
   * Validate the size parameter for the given model
   */
  private validateSizeForModel(size: string, model: string): { valid: boolean; message?: string } {
    if (model === 'dall-e-3') {
      const validSizes: DallE3Size[] = ['1024x1024', '1792x1024', '1024x1792'];
      if (!validSizes.includes(size as DallE3Size)) {
        return {
          valid: false,
          message: `Invalid size "${size}" for DALL-E 3. Valid sizes are: ${validSizes.join(', ')}`,
        };
      }
    } else if (model === 'dall-e-2') {
      const validSizes: DallE2Size[] = ['256x256', '512x512', '1024x1024'];
      if (!validSizes.includes(size as DallE2Size)) {
        return {
          valid: false,
          message: `Invalid size "${size}" for DALL-E 2. Valid sizes are: ${validSizes.join(', ')}`,
        };
      }
    }
    return { valid: true };
  }

  /**
   * Format the output based on the response format and data
   */
  private formatOutput(
    data: any,
    prompt: string,
    responseFormat?: string,
  ): string | { error: string } {
    if (responseFormat === 'b64_json') {
      const b64Json = data.data[0].b64_json;
      if (!b64Json) {
        return { error: `No base64 image data found in response: ${JSON.stringify(data)}` };
      }

      // Return the original JSON response with base64 data
      // This allows the UI to handle the data directly
      return JSON.stringify(data);
    } else {
      // Default URL format
      const url = data.data[0].url;
      if (!url) {
        return { error: `No image URL found in response: ${JSON.stringify(data)}` };
      }

      const sanitizedPrompt = prompt
        .replace(/\r?\n|\r/g, ' ')
        .replace(/\[/g, '(')
        .replace(/\]/g, ')');
      const ellipsizedPrompt = ellipsize(sanitizedPrompt, 50);

      return `![${ellipsizedPrompt}](${url})`;
    }
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (!this.getApiKey()) {
      throw new Error(
        'OpenAI API key is not set. Set the OPENAI_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    // Merge configs from the provider and the prompt
    const config = {
      ...this.config,
      ...context?.prompt?.config,
    };

    // Check model and set default if not provided
    const model = config.model || this.modelName;
    const operation = ('operation' in config && config.operation) || 'generation';

    // Set default response format
    const responseFormat = config.response_format || 'url';

    // Set the API endpoint based on the operation
    let endpoint = '/images/generations';
    if (model === 'dall-e-2') {
      if (operation === 'variation') {
        endpoint = '/images/variations';
      } else if (operation === 'edit') {
        endpoint = '/images/edits';
      }
    } else if (operation !== 'generation') {
      return {
        error: `Operation ${operation} is only supported for dall-e-2 model.`,
      };
    }

    // For generation operation, use JSON body
    if (operation === 'generation') {
      // Set default size based on model
      let size = config.size;
      if (!size) {
        size = model === 'dall-e-3' ? '1024x1024' : '1024x1024';
      }

      // Validate size for the selected model
      const sizeValidation = this.validateSizeForModel(size as string, model);
      if (!sizeValidation.valid) {
        return { error: sizeValidation.message };
      }

      // Prepare the request body
      const body: Record<string, any> = {
        model,
        prompt,
        n: config.n || 1,
        size,
        response_format: responseFormat,
      };

      // DALL-E 3 specific options
      if (model === 'dall-e-3') {
        if ('quality' in config && config.quality) {
          body.quality = config.quality;
        }

        if ('style' in config && config.style) {
          body.style = config.style;
        }
      }

      logger.debug(`Calling OpenAI Image API: ${JSON.stringify(body)}`);

      let data, status, statusText;
      let cached = false;
      try {
        ({ data, cached, status, statusText } = await fetchWithCache(
          `${this.getApiUrl()}${endpoint}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.getApiKey()}`,
              ...(this.getOrganization() ? { 'OpenAI-Organization': this.getOrganization() } : {}),
              ...config.headers,
            },
            body: JSON.stringify(body),
          },
          REQUEST_TIMEOUT_MS,
        ));

        if (status < 200 || status >= 300) {
          return {
            error: `API error: ${status} ${statusText}\n${typeof data === 'string' ? data : JSON.stringify(data)}`,
          };
        }
      } catch (err) {
        logger.error(`API call error: ${String(err)}`);
        await data?.deleteFromCache?.();
        return {
          error: `API call error: ${String(err)}`,
        };
      }

      logger.debug(`\tOpenAI image API response: ${JSON.stringify(data)}`);
      if (data.error) {
        await data?.deleteFromCache?.();
        return {
          error: formatOpenAiError(data),
        };
      }

      try {
        // Format output based on response format
        const formattedOutput = this.formatOutput(data, prompt, responseFormat);
        if (typeof formattedOutput === 'object') {
          return formattedOutput;
        }

        return {
          output: formattedOutput,
          cached,
          ...(responseFormat === 'b64_json' ? { isBase64: true, format: 'json' } : {}),
        };
      } catch (err) {
        await data?.deleteFromCache?.();
        return {
          error: `API error: ${String(err)}: ${JSON.stringify(data)}`,
        };
      }
    } else {
      // For variation and edit operations, we need to use FormData and include image data
      if (!('image' in config) || !config.image) {
        return {
          error: 'Image data is required for variation and edit operations',
        };
      }

      // Inform about unimplemented feature with more details
      return {
        error: dedent`
          Image ${operation} operations require FormData with binary image data. 
          This is not fully implemented yet. For these operations, you need to:
          1. Provide a base64-encoded image in the 'image' parameter
          2. For edits, also provide a 'mask' and 'prompt'
          3. Implement FormData handling on the client side`,
      };
    }
  }
}
