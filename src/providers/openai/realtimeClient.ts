import WebSocket from 'ws';

type CreateOpenAiRealtimeSocketOptions = {
  socketUrl: string;
  websocketOptions: WebSocket.ClientOptions;
};

/**
 * Keep Realtime on the raw WebSocket transport for now.
 * The current OpenAI SDK helper still injects the retired beta header, while
 * Promptfoo's runtime targets the GA Realtime WebSocket contract.
 */
export function createOpenAiRealtimeSocket({
  socketUrl,
  websocketOptions,
}: CreateOpenAiRealtimeSocketOptions): WebSocket {
  return new WebSocket(socketUrl, websocketOptions);
}
