import logger from '../../logger';
import { fetchWithProxy } from '../../util/fetch/index';
import { ElevenLabsAPIError, ElevenLabsRateLimitError, ElevenLabsAuthError } from './errors';

export interface ElevenLabsClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  retries?: number;
}

/**
 * HTTP client for ElevenLabs API with automatic retries, rate limiting, and error handling
 */
export class ElevenLabsClient {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;
  private retries: number;

  constructor(config: ElevenLabsClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.elevenlabs.io/v1';
    this.timeout = config.timeout || 120000; // 2 minutes default
    this.retries = config.retries || 3;
  }

  /**
   * Make a POST request to the ElevenLabs API
   */
  async post<T>(endpoint: string, body: any, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    logger.debug('[ElevenLabs Client] POST request', {
      url,
      endpoint,
      // body is sanitized automatically by logger
    });

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetchWithProxy(url, {
          method: 'POST',
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
            ...options?.headers,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
          ...options,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          await this.handleErrorResponse(response, attempt);
          continue;
        }

        // Check if response is JSON or binary
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          const data = await response.json();
          logger.debug('[ElevenLabs Client] JSON response received', {
            status: response.status,
          });
          return data as T;
        } else {
          // Binary response (audio)
          const data = await response.arrayBuffer();
          logger.debug('[ElevenLabs Client] Binary response received', {
            status: response.status,
            size: data.byteLength,
          });
          return data as T;
        }
      } catch (error) {
        lastError = error as Error;

        // Don't retry on authentication errors
        if (error instanceof ElevenLabsAuthError) {
          throw error;
        }

        if (attempt < this.retries - 1) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          logger.debug(
            `[ElevenLabs Client] Retry ${attempt + 1}/${this.retries} after ${backoffMs}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  /**
   * Make a GET request to the ElevenLabs API
   */
  async get<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    logger.debug('[ElevenLabs Client] GET request', { url, endpoint });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetchWithProxy(url, {
        method: 'GET',
        headers: {
          'xi-api-key': this.apiKey,
          ...options?.headers,
        },
        signal: controller.signal,
        ...options,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        await this.handleErrorResponse(response, 0);
      }

      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Make a DELETE request to the ElevenLabs API
   */
  async delete(endpoint: string, options?: RequestInit): Promise<void> {
    const url = `${this.baseUrl}${endpoint}`;

    logger.debug('[ElevenLabs Client] DELETE request', { url, endpoint });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetchWithProxy(url, {
        method: 'DELETE',
        headers: {
          'xi-api-key': this.apiKey,
          ...options?.headers,
        },
        signal: controller.signal,
        ...options,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        await this.handleErrorResponse(response, 0);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Upload a file to the ElevenLabs API (multipart/form-data)
   */
  async upload<T>(
    endpoint: string,
    file: Buffer,
    fileName: string,
    additionalFields: Record<string, any> = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const formData = new FormData();
    formData.append('file', new Blob([new Uint8Array(file)]), fileName);

    for (const [key, value] of Object.entries(additionalFields)) {
      if (value !== undefined && value !== null) {
        formData.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      }
    }

    logger.debug('[ElevenLabs Client] Upload request', {
      url,
      endpoint,
      fileName,
      fileSize: file.length,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetchWithProxy(url, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
        },
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        await this.handleErrorResponse(response, 0);
      }

      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Handle error responses from the API
   */
  private async handleErrorResponse(response: Response, attempt: number): Promise<void> {
    const errorText = await response.text();
    let errorData: any;

    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { message: errorText };
    }

    logger.error('[ElevenLabs Client] Error response', {
      status: response.status,
      attempt,
      // errorData is sanitized automatically
    });

    // Handle specific error cases
    if (response.status === 401 || response.status === 403) {
      throw new ElevenLabsAuthError(
        errorData.message || 'Authentication failed. Please check your API key.',
      );
    }

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      if (retryAfter && attempt < this.retries - 1) {
        const waitMs = parseInt(retryAfter) * 1000;
        logger.debug(`[ElevenLabs Client] Rate limited, waiting ${waitMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        throw new ElevenLabsRateLimitError(
          errorData.message || 'Rate limit exceeded',
          parseInt(retryAfter),
        );
      }
      throw new ElevenLabsRateLimitError(errorData.message || 'Rate limit exceeded');
    }

    throw new ElevenLabsAPIError(
      errorData.message || errorData.detail || 'API request failed',
      response.status,
      errorData,
    );
  }
}
