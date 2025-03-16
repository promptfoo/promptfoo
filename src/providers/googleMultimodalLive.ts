import WebSocket from 'ws';
import { getEnvString } from '../envars';
import logger from '../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  ProviderOptions,
  ProviderResponse,
} from '../types';
import '../util';
import { maybeLoadFromExternalFile, renderVarsInObject } from '../util';
import { parseChatPrompt } from './shared';
import type { GeminiFormat } from './vertexUtil';
import { maybeCoerceToGeminiFormat } from './vertexUtil';

interface Blob {
  mimeType: string;
  data: string; // base64-encoded string
}

interface FunctionCall {
  name: string;
  args?: { [key: string]: any };
}

interface FunctionResponse {
  name: string;
  response: { [key: string]: any };
}

interface FileData {
  mimeType?: string;
  fileUri: string;
}

interface Part {
  text?: string;
  inlineData?: Blob;
  functionCall?: FunctionCall;
  functionResponse?: FunctionResponse;
  fileData?: FileData;
}

interface Content {
  parts: Part[];
  role?: string;
}

interface Schema {
  type: 'TYPE_UNSPECIFIED' | 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT';
  format?: string;
  description?: string;
  nullable?: boolean;
  enum?: string[];
  maxItems?: string;
  minItems?: string;
  properties?: { [key: string]: Schema };
  required?: string[];
  propertyOrdering?: string[];
  items?: Schema;
}

interface FunctionDeclaration {
  name: string;
  description: string;
  parameters?: Schema;
  response?: Schema;
}

interface GoogleSearchRetrieval {
  dynamicRetrievalConfig: {
    mode?: 'MODE_UNSPECIFIED' | 'MODE_DYNAMIC';
    dynamicThreshold?: number;
  };
}

interface Tool {
  functionDeclarations?: FunctionDeclaration[];
  googleSearchRetrieval?: GoogleSearchRetrieval;
  codeExecution?: object;
  googleSearch?: object;
}

interface CompletionOptions {
  apiKey: string;
  timeoutMs?: number;
  transformResponse?: string | Function;

  // https://ai.google.dev/api/rest/v1beta/models/streamGenerateContent#request-body
  context?: string;
  examples?: { input: string; output: string }[];
  stopSequence?: string[];
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;

  generationConfig?: {
    response_modalities?: string[];
    context?: string;
    examples?: { input: string; output: string }[];
    stopSequence?: string[];
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    topK?: number;
  };

  toolConfig?: {
    functionCallingConfig?: {
      mode?: 'MODE_UNSPECIFIED' | 'AUTO' | 'ANY' | 'NONE';
      allowedFunctionNames?: string[];
    };
  };

  tools?: Tool[];

  systemInstruction?: Content;
}

const formatContentMessage = (contents: GeminiFormat, contentIndex: number) => {
  if (contents[contentIndex].role != 'user') {
    throw new Error('Can only take user role inputs.');
  }
  if (contents[contentIndex].parts.length != 1) {
    throw new Error('Unexpected number of parts in user input.');
  }
  const userMessage = contents[contentIndex].parts[0].text;

  const contentMessage = {
    client_content: {
      turns: [
        {
          role: 'user',
          parts: [{ text: userMessage }],
        },
      ],
      turn_complete: true,
    },
  };
  return contentMessage;
};

export class GoogleMMLiveProvider implements ApiProvider {
  config: CompletionOptions;
  modelName: string;

  constructor(modelName: string, options: ProviderOptions) {
    this.config = options.config as CompletionOptions;
    this.modelName = modelName;
  }

  id(): string {
    return `google:live:${this.modelName}`;
  }

  toString(): string {
    return `[Google Multimodal Live Provider ${this.modelName}]`;
  }

  getApiKey(): string | undefined {
    return this.config.apiKey || getEnvString('GOOGLE_API_KEY');
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    // https://cloud.google.com/vertex-ai/docs/generative-ai/model-reference/gemini#gemini-pro

    if (!this.getApiKey()) {
      throw new Error(
        'Google API key is not set. Set the GOOGLE_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    let contents: GeminiFormat = parseChatPrompt(prompt, [
      {
        role: 'user',
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ]);
    const { contents: updatedContents, coerced } = maybeCoerceToGeminiFormat(contents);
    if (coerced) {
      logger.debug(`Coerced JSON prompt to Gemini format: ${JSON.stringify(contents)}`);
      logger.debug(`Coerced JSON prompt to Gemini format: ${JSON.stringify(updatedContents)}`);
      contents = updatedContents;
    }
    let contentIndex = 0;

    return new Promise<ProviderResponse>((resolve) => {
      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.getApiKey()}`;
      const ws = new WebSocket(url);
      const timeout = setTimeout(() => {
        ws.close();
        resolve({ error: 'WebSocket request timed out' });
      }, this.config.timeoutMs || 10000);

      let response_text_total = '';
      const function_calls_total: FunctionCall[] = [];

      ws.onmessage = async (event) => {
        logger.debug(`Received WebSocket response: ${event.data}`);
        try {
          let responseData: string;
          if (typeof event.data === 'string') {
            responseData = event.data;
          } else if (Buffer.isBuffer(event.data)) {
            responseData = event.data.toString('utf-8');
          } else {
            // Handle cases where event.data is of an unexpected type
            logger.debug(`Unexpected event.data type: ${typeof event.data} ${event.data}`);
            ws.close();
            resolve({ error: 'Unexpected response data format' });
            return;
          }

          const responseText = await new Response(responseData).text();
          const response = JSON.parse(responseText);

          // Handle setup complete response
          if (response.setupComplete) {
            const contentMessage = formatContentMessage(contents, contentIndex);
            contentIndex += 1;
            logger.debug(`WebSocket sent: ${JSON.stringify(contentMessage)}`);
            ws.send(JSON.stringify(contentMessage));
          }
          // Handle model response
          else if (response.serverContent?.modelTurn?.parts?.[0]?.text) {
            response_text_total =
              response_text_total + response.serverContent.modelTurn.parts[0].text;
          } else if (response.toolCall?.functionCalls) {
            const functionResponses: any[] = [];
            for (const functionCall of response.toolCall.functionCalls) {
              function_calls_total.push(functionCall);
              if (functionCall && functionCall.id && functionCall.name) {
                functionResponses.push({
                  id: functionCall.id,
                  name: functionCall.name,
                  // TODO: add mocking of function response here
                  response: {},
                });
              }
            }
            const toolMessage = {
              tool_response: {
                function_responses: functionResponses,
              },
            };
            ws.send(JSON.stringify(toolMessage));
          } else if (response.serverContent?.turnComplete) {
            if (contentIndex < contents.length) {
              const contentMessage = formatContentMessage(contents, contentIndex);
              contentIndex += 1;
              logger.debug(`WebSocket sent: ${JSON.stringify(contentMessage)}`);
              ws.send(JSON.stringify(contentMessage));
            } else {
              resolve({
                output: JSON.stringify({
                  text: response_text_total,
                  toolCall: { functionCalls: function_calls_total },
                }),
              });
              ws.close();
            }
          }
        } catch (err) {
          logger.debug(`Failed to process response: ${JSON.stringify(err)}`);
          ws.close();
          resolve({ error: `Failed to process response: ${JSON.stringify(err)}` });
        }
      };

      ws.onerror = (err) => {
        clearTimeout(timeout);
        logger.debug(`WebSocket Error: ${err}`);
        ws.close();
        resolve({ error: `WebSocket error: ${JSON.stringify(err)}` });
      };

      ws.onclose = (event) => {
        clearTimeout(timeout);
      };

      ws.onopen = () => {
        logger.debug('WebSocket connection is opening...');

        const setupMessage = {
          setup: {
            model: `models/${this.modelName}`,
            generation_config: {
              context: this.config.context,
              examples: this.config.examples,
              stopSequence: this.config.stopSequence,
              temperature: this.config.temperature,
              maxOutputTokens: this.config.maxOutputTokens,
              topP: this.config.topP,
              topK: this.config.topK,
              ...this.config.generationConfig,
            },
            ...(this.config.toolConfig ? { toolConfig: this.config.toolConfig } : {}),
            ...(this.config.tools
              ? {
                  tools: maybeLoadFromExternalFile(
                    renderVarsInObject(this.config.tools, context?.vars),
                  ),
                }
              : {}),
            ...(this.config.systemInstruction
              ? { systemInstruction: maybeLoadFromExternalFile(this.config.systemInstruction) }
              : {}),
          },
        };
        logger.debug(`WebSocket sent: ${JSON.stringify(setupMessage)}`);
        ws.send(JSON.stringify(setupMessage));
      };
    });
  }
}
