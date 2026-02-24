import WebSocket from 'ws';
import logger from '../../logger';
import { OpenAiResponsesProvider } from './responses';
import { hasPendingFunctionCalls, runToolCallLoop } from './responses-tool-loop';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { FunctionCallOutput } from './responses-tool-loop';
import type { OpenAiCompletionOptions } from './types';

const DEFAULT_WEBSOCKET_TIMEOUT_MS = 30_000;
const DEFAULT_WS_MAX_TOOL_CALL_ROUNDS = 10;

export class OpenAiResponsesWebSocketProvider extends OpenAiResponsesProvider {
  constructor(
    modelName: string,
    options: { config?: OpenAiCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, options);
  }

  id(): string {
    return this.config.apiHost || this.config.apiBaseUrl
      ? this.modelName
      : `openai:responses-ws:${this.modelName}`;
  }

  protected getWebSocketUrl(): string {
    const httpUrl = `${this.getApiUrl()}/responses`;
    return httpUrl.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
  }

  protected async sendViaWebSocket(body: any): Promise<{ data: any; cached: boolean }> {
    const wsUrl = this.getWebSocketUrl();
    const timeout = this.config.websocketTimeout ?? DEFAULT_WEBSOCKET_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${this.getApiKey()}`,
          ...(this.getOrganization() ? { 'OpenAI-Organization': this.getOrganization() } : {}),
          ...this.config.headers,
        },
      });

      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`WebSocket timeout after ${timeout}ms`));
      }, timeout);

      ws.on('open', () => {
        logger.debug('WebSocket connection opened, sending response.create');
        ws.send(
          JSON.stringify({
            type: 'response.create',
            response: body,
          }),
        );
      });

      ws.on('message', (rawData: WebSocket.RawData) => {
        try {
          const event = JSON.parse(rawData.toString());
          logger.debug(`WebSocket event: ${event.type}`);

          if (event.type === 'response.completed') {
            clearTimeout(timer);
            ws.close();
            resolve({ data: event.response, cached: false });
          } else if (event.type === 'error') {
            clearTimeout(timer);
            ws.close();
            reject(new Error(event.error?.message ?? `WebSocket error: ${JSON.stringify(event)}`));
          }
        } catch (err) {
          clearTimeout(timer);
          ws.close();
          reject(new Error(`Failed to parse WebSocket message: ${String(err)}`));
        }
      });

      ws.on('error', (err: Error) => {
        clearTimeout(timer);
        reject(new Error(`WebSocket connection error: ${err.message}`));
      });

      ws.on('close', (code: number, reason: Buffer) => {
        clearTimeout(timer);
        // Only reject if we haven't already resolved
        if (code !== 1000 && code !== 1005) {
          reject(new Error(`WebSocket closed unexpectedly: ${code} ${reason.toString()}`));
        }
      });
    });
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

    const { body, config } = await this.getOpenAiBody(prompt, context, callApiOptions);

    let data: any;
    try {
      ({ data } = await this.sendViaWebSocket(body));
    } catch (err) {
      logger.error(`WebSocket API call error: ${String(err)}`);
      return {
        error: `WebSocket API call error: ${String(err)}`,
        metadata: { transport: 'websocket' },
      };
    }

    if (data?.error?.message) {
      return {
        error: `API error: ${data.error.message}`,
        metadata: { transport: 'websocket' },
      };
    }

    // Multi-turn tool call loop
    const maxToolCallRounds = config.maxToolCallRounds ?? DEFAULT_WS_MAX_TOOL_CALL_ROUNDS;
    if (maxToolCallRounds > 0 && hasPendingFunctionCalls(data, config.functionToolCallbacks)) {
      const loopResult = await runToolCallLoop({
        initialData: data,
        callbacks: config.functionToolCallbacks!,
        handler: this.functionCallbackHandler,
        maxRounds: maxToolCallRounds,
        sendRequest: async (followUpBody: any) => this.sendViaWebSocket(followUpBody),
        buildFollowUpBody: (previousResponseId: string, toolOutputs: FunctionCallOutput[]) => ({
          model: body.model,
          previous_response_id: previousResponseId,
          input: toolOutputs,
          ...(body.tools ? { tools: body.tools } : {}),
          ...(body.instructions ? { instructions: body.instructions } : {}),
          ...(body.text ? { text: body.text } : {}),
        }),
      });

      const finalConfig = { ...config, functionToolCallbacks: undefined };
      const result = await this.processor.processResponseOutput(
        loopResult.finalData,
        finalConfig,
        false,
      );

      return {
        ...result,
        tokenUsage: loopResult.aggregatedUsage,
        metadata: {
          ...result.metadata,
          transport: 'websocket',
          toolCallRounds: loopResult.toolCallRounds,
          intermediateToolCalls: loopResult.intermediateToolCalls,
        },
      };
    }

    // Single-turn: process directly
    const result = await this.processor.processResponseOutput(data, config, false);
    return {
      ...result,
      metadata: {
        ...result.metadata,
        transport: 'websocket',
      },
    };
  }
}
