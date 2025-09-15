import { fetchWithCache } from '../cache';
import { REQUEST_TIMEOUT_MS } from './shared';

import type { ApiProvider, ProviderResponse } from '../types/index';

export class WebhookProvider implements ApiProvider {
  webhookUrl: string;
  config?: object;

  constructor(webhookUrl: string, options: { id?: string; config?: object } = {}) {
    const { id, config } = options;
    this.webhookUrl = webhookUrl;
    this.id = id ? () => id : this.id;
    this.config = config;
  }

  id(): string {
    return `webhook:${this.webhookUrl}`;
  }

  toString(): string {
    return `[Webhook Provider ${this.webhookUrl}]`;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    const params: { prompt: string; config?: object } = {
      prompt,
    };
    if (this.config) {
      params.config = this.config;
    }

    let response;
    try {
      response = await fetchWithCache(
        this.webhookUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(params),
        },
        REQUEST_TIMEOUT_MS,
        'json',
      );
    } catch (err) {
      return {
        error: `Webhook call error: ${String(err)}`,
      };
    }

    if (response.data && typeof response.data.output === 'string') {
      return {
        output: response.data.output,
      };
    } else {
      return {
        error: `Webhook response error: Unexpected response format: ${JSON.stringify(
          response.data,
        )}`,
      };
    }
  }
}
