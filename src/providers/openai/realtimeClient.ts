import { OpenAIRealtimeWS } from 'openai/realtime/ws';
import WebSocket from 'ws';
import { createOpenAiClient } from './client';

import type { OpenAiRealtimeOptions } from './realtime';

type CreateOpenAiRealtimeSocketOptions = {
  apiKey?: string;
  organization?: string;
  baseURL: string;
  model: string;
  socketUrl: string;
  websocketOptions: WebSocket.ClientOptions;
  config: Pick<OpenAiRealtimeOptions, 'maxRetries'>;
};

/**
 * Use the OpenAI SDK Realtime transport where it matches Promptfoo's API surface.
 * The SDK always upgrades to `wss:`, so Promptfoo's explicit `http://` override
 * keeps the legacy socket constructor to preserve supported local/dev behavior.
 */
export function createOpenAiRealtimeSocket({
  apiKey,
  organization,
  baseURL,
  model,
  socketUrl,
  websocketOptions,
  config,
}: CreateOpenAiRealtimeSocketOptions): WebSocket {
  if (new URL(baseURL).protocol === 'http:') {
    return new WebSocket(socketUrl, websocketOptions);
  }

  const client = createOpenAiClient({
    apiKey,
    organization,
    baseURL,
    maxRetries: config.maxRetries,
  });
  const realtime = new OpenAIRealtimeWS({ model, options: websocketOptions }, client);

  // The provider continues to own raw socket lifecycle/error handling below.
  // Bind the SDK emitter's error channel so it does not surface a duplicate
  // unhandled rejection for the same underlying WebSocket failure.
  realtime.on('error', () => {});

  return realtime.socket;
}
