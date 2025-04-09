import fs from 'fs';
import path from 'path';
import { fetchWithCache } from '../../cache';
import { getEnvFloat, getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../../types';
import { maybeLoadToolsFromExternalFile } from '../../util';
import { maybeLoadFromExternalFile, renderVarsInObject } from '../../util';
import { generateUUIDv4 } from '../../util/auth';
import { REQUEST_TIMEOUT_MS } from '../shared';

/**
 * Interface for Ollama chat message structure
 */
interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  images?: string[]; // Base64-encoded images for multimodal models
  tool_calls?: OllamaToolCall[]; // Tool calls returned by the model
}

/**
 * Interface for Ollama tool definition
 */
interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

/**
 * Interface for Ollama tool call response
 */
interface OllamaToolCall {
  id?: string;
  type?: string;
  function: {
    name: string;
    arguments: Record<string, any> | string;
  };
}

/**
 * Response from the Ollama chat API
 */
interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: OllamaChatMessage;
  done?: boolean;
  done_reason?: string;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Tool call payload format used by some Ollama models
 */
interface OllamaToolCallPayload {
  tool_calls: Array<{
    type: string;
    function: {
      name: string;
      description?: string;
      parameters: Record<string, any>;
    };
  }>;
}

/**
 * Message interface that matches promptfoo's expected format
 */
interface Message {
  role: string;
  content: string;
  images?: string[];
  tool_calls?: Array<{
    function: {
      name: string;
      arguments: string | Record<string, any>;
    };
  }>;
}

/**
 * Configuration options for Ollama chat provider
 */
export interface OllamaChatConfig {
  // Required options
  model: string;

  // Optional parameters
  temperature?: number;
  top_p?: number;
  top_k?: number;
  num_predict?: number;
  num_ctx?: number;
  repeat_penalty?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  seed?: number;
  stop?: string[];
  stream?: boolean;
  format?: 'json' | Record<string, any>; // JSON schema for structured outputs
  keep_alive?: string | number;
  // Other Ollama-specific options like mirostat parameters can be added here

  // Tools support
  tools?: OllamaTool[];

  // System message
  system?: string;
}

/**
 * Implementation of Ollama Chat Provider
 */
export class OllamaChatProvider implements ApiProvider {
  public config: OllamaChatConfig;
  private baseUrl: string;
  private apiKey?: string;

  constructor(model: string, options: { id?: string; config?: ProviderOptions } = {}) {
    const { id, config = {} } = options;

    this.config = {
      model,
      ...(config.config || {}),
    };

    this.baseUrl = getEnvString('OLLAMA_BASE_URL') || 'http://localhost:11434';
    this.apiKey = getEnvString('OLLAMA_API_KEY');

    this.id = id ? () => id : this.id;
  }

  id(): string {
    return `ollama:chat:${this.config.model}`;
  }

  toString(): string {
    return `[Ollama Chat Provider ${this.config.model}]`;
  }

  /**
   * Main method to call the Ollama API
   */
  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Extract messages from context if available
    const messages: OllamaChatMessage[] = context?.vars?.messages
      ? (context.vars.messages as Message[]).map((msg) => {
          const ollamaMsg: OllamaChatMessage = {
            role: msg.role as 'system' | 'user' | 'assistant' | 'tool',
            content: msg.content,
          };

          // Handle images if present
          if (msg.images && msg.images.length > 0) {
            ollamaMsg.images = msg.images;
          }

          // Handle tool calls if present
          if (msg.tool_calls && msg.tool_calls.length > 0) {
            ollamaMsg.tool_calls = msg.tool_calls.map((toolCall) => ({
              function: {
                name: toolCall.function.name,
                arguments: toolCall.function.arguments,
              },
            }));
          }

          return ollamaMsg;
        })
      : [];

    // If no messages from context, create a simple user message with the prompt
    if (messages.length === 0) {
      messages.push({
        role: 'user',
        content: prompt,
      });
    }

    // Add system message if specified in config
    if (this.config.system && !messages.some((msg) => msg.role === 'system')) {
      messages.unshift({
        role: 'system',
        content: this.config.system,
      });
    }

    // If context includes images, add them to the last user message
    if (context?.vars?.image_base64) {
      // Find the last user message
      const lastUserMsgIndex = [...messages].reverse().findIndex((msg) => msg.role === 'user');

      if (lastUserMsgIndex >= 0) {
        const actualIndex = messages.length - 1 - lastUserMsgIndex;
        messages[actualIndex].images = messages[actualIndex].images || [];
        messages[actualIndex].images.push(context.vars.image_base64 as string);
      } else {
        // If no user message found, create one
        messages.push({
          role: 'user',
          content: '',
          images: [context.vars.image_base64 as string],
        });
      }
    }

    // Prepare request body
    const requestBody: Record<string, any> = {
      model: this.config.model,
      messages,
      stream: options && 'stream' in options ? options.stream : (this.config.stream ?? false),
    };

    // Add any other configuration parameters
    if (this.config.temperature !== undefined) {
      requestBody.options = { ...requestBody.options, temperature: this.config.temperature };
    }
    if (this.config.top_p !== undefined) {
      requestBody.options = { ...requestBody.options, top_p: this.config.top_p };
    }
    if (this.config.top_k !== undefined) {
      requestBody.options = { ...requestBody.options, top_k: this.config.top_k };
    }
    if (this.config.seed !== undefined) {
      requestBody.options = { ...requestBody.options, seed: this.config.seed };
    }
    if (this.config.num_predict !== undefined) {
      requestBody.options = { ...requestBody.options, num_predict: this.config.num_predict };
    }
    if (this.config.num_ctx !== undefined) {
      requestBody.options = { ...requestBody.options, num_ctx: this.config.num_ctx };
    }
    if (this.config.repeat_penalty !== undefined) {
      requestBody.options = { ...requestBody.options, repeat_penalty: this.config.repeat_penalty };
    }
    if (this.config.presence_penalty !== undefined) {
      requestBody.options = {
        ...requestBody.options,
        presence_penalty: this.config.presence_penalty,
      };
    }
    if (this.config.frequency_penalty !== undefined) {
      requestBody.options = {
        ...requestBody.options,
        frequency_penalty: this.config.frequency_penalty,
      };
    }
    if (this.config.stop !== undefined) {
      requestBody.options = { ...requestBody.options, stop: this.config.stop };
    }
    if (this.config.keep_alive !== undefined) {
      requestBody.keep_alive = this.config.keep_alive;
    }

    // Add format for structured outputs or JSON mode
    if (this.config.format !== undefined) {
      requestBody.format = this.config.format;
    }

    // Add tools if specified
    if (this.config.tools && this.config.tools.length > 0) {
      // Add tools to the request
      requestBody.tools = maybeLoadToolsFromExternalFile(this.config.tools);

      const toolNames = this.config.tools.map((tool) => tool.function.name).join(', ');

      // For some models, we may need to add a system message that instructs the model
      // to use the provided tools
      if (this.config.system === undefined) {
        requestBody.messages.unshift({
          role: 'system',
          content: `You have access to the following tools: ${toolNames}. When appropriate, use these tools by generating a tool_calls field in your response. Do not hallucinate or make up tools that weren't provided to you.`,
        });
      }
    }

    logger.debug(`Calling Ollama API with body: ${JSON.stringify(requestBody, null, 2)}`);

    try {
      // Make the API call
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add API key if provided
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      // Handle streaming case
      if (requestBody.stream) {
        return this.handleStreamingResponse(`${this.baseUrl}/api/chat`, headers, requestBody);
      }

      // Handle non-streaming case
      const response = await fetchWithCache(
        `${this.baseUrl}/api/chat`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
        },
        REQUEST_TIMEOUT_MS,
        'json',
      );

      if (!response.data) {
        return {
          error: `Empty response from Ollama API: ${JSON.stringify(response)}`,
        };
      }

      const data = response.data as OllamaChatResponse;

      // Extract the content and look for tool calls
      const content = data.message?.content || '';

      // Parse response and return
      const result: ProviderResponse = {
        output: content,
        raw: data,
      };

      // Handle various ways Ollama models can output tool calls

      // 1. <|tool_call|>{...} format
      const toolCallMatches = content.match(/<\|tool_call\|>({.*})/);
      if (toolCallMatches && toolCallMatches[1]) {
        try {
          // Extract the JSON payload and parse it
          const toolCallJson = toolCallMatches[1];
          const toolCallPayload = JSON.parse(toolCallJson) as OllamaToolCallPayload;

          if (toolCallPayload.tool_calls && toolCallPayload.tool_calls.length > 0) {
            // Convert to the standard format expected by promptfoo
            const formattedToolCalls = toolCallPayload.tool_calls.map((tc) => ({
              name: tc.function.name,
              arguments: tc.function.parameters,
            }));

            result.metadata = {
              ...result.metadata,
              tool_calls: formattedToolCalls,
            };

            // Add tool call information directly in output
            const toolCallDescriptions = formattedToolCalls
              .map((toolCall) => {
                const args =
                  typeof toolCall.arguments === 'string'
                    ? toolCall.arguments
                    : JSON.stringify(toolCall.arguments, null, 2);

                return `Function call: ${toolCall.name}(${args})`;
              })
              .join('\n\n');

            // Clean up the output by removing the raw tool call syntax
            result.output =
              content.replace(/<\|tool_call\|>{.*}/, '') +
              (result.output.trim() ? '\n\n' : '') +
              toolCallDescriptions;
          }
        } catch (err) {
          logger.warn(`Failed to parse tool call JSON: ${String(err)}`);
        }
      }
      // 2. Direct JSON array in content
      else if (content.trim().startsWith('[') && content.includes(']')) {
        try {
          // Extract just the array part (ignoring anything after it)
          const arrayEndIndex = content.indexOf(']') + 1;
          const arrayPart = content.substring(0, arrayEndIndex);

          // Parse just the array portion
          const jsonArray = JSON.parse(arrayPart);

          if (Array.isArray(jsonArray)) {
            const toolCalls = [];

            // Process array items
            for (const item of jsonArray) {
              if (item.type === 'function' && item.function) {
                // Standard function call format
                toolCalls.push({
                  name: item.function.name,
                  arguments: item.function.arguments || item.function.parameters || {},
                });
              }
              // Special format for currency_convert and similar
              else if (
                item.type &&
                (item.type.startsWith('get_') || item.type.startsWith('currency_'))
              ) {
                const params =
                  item.function && item.function.parameters
                    ? item.function.parameters
                    : item.arguments || item.parameters || {};

                toolCalls.push({
                  name: item.type,
                  arguments: params,
                });
              }
            }

            // Process any standalone objects after the array (if present)
            // This handles the attraction format where an object follows the array
            if (arrayEndIndex < content.length) {
              const restContent = content.substring(arrayEndIndex).trim();
              if (restContent.startsWith('{') && restContent.includes('}')) {
                try {
                  const standaloneObj = JSON.parse(restContent);

                  // Handle "type": "call" format
                  if (standaloneObj.type === 'call' && standaloneObj.function) {
                    toolCalls.push({
                      name: standaloneObj.function,
                      arguments: standaloneObj.arguments || {},
                    });
                  }
                } catch (err) {
                  // If we can't parse as a single object, try to extract objects
                  // Find all potential JSON objects using the manual approach
                  let startPos = 0;
                  while (startPos < restContent.length) {
                    const objectStart = restContent.indexOf('{', startPos);
                    if (objectStart === -1) break;

                    let objectEnd = objectStart + 1;
                    let braceCount = 1;

                    while (objectEnd < restContent.length && braceCount > 0) {
                      if (restContent[objectEnd] === '{') braceCount++;
                      if (restContent[objectEnd] === '}') braceCount--;
                      objectEnd++;
                    }

                    if (braceCount === 0) {
                      const jsonStr = restContent.substring(objectStart, objectEnd);

                      try {
                        const obj = JSON.parse(jsonStr);

                        if (obj.type === 'call' && obj.function) {
                          toolCalls.push({
                            name: obj.function,
                            arguments: obj.arguments || {},
                          });
                        }
                      } catch (objErr) {
                        logger.warn(`Failed to parse standalone object: ${String(objErr)}`);
                      }
                    }

                    startPos = objectEnd;
                  }
                }
              }
            }

            if (toolCalls.length > 0) {
              result.metadata = {
                ...result.metadata,
                tool_calls: toolCalls,
              };

              // Add tool call information directly in output
              const toolCallDescriptions = toolCalls
                .map((toolCall) => {
                  const args =
                    typeof toolCall.arguments === 'string'
                      ? toolCall.arguments
                      : JSON.stringify(toolCall.arguments, null, 2);

                  return `Function call: ${toolCall.name}(${args})`;
                })
                .join('\n\n');

              // Append the tool calls
              result.output = `${content}\n\n${toolCallDescriptions}`;
            }
          }
        } catch (err) {
          logger.warn(`Failed to parse JSON content as tool calls: ${String(err)}`);
        }
      }
      // 3. Combined JSON array and objects in content
      else if (
        content.includes('type": "function"') ||
        content.includes('type": "call"') ||
        content.includes('type": "currency_convert"') ||
        content.includes('type": "get_')
      ) {
        try {
          // Extract all potential JSON objects from the content
          const jsonPattern = /\{(?:[^{}]|"[^"]*")*\}/g;
          const matches = content.match(jsonPattern) || [];

          const toolCalls = [];

          // Process each potential JSON match
          for (const match of matches) {
            try {
              const parsedMatch = JSON.parse(match);

              // Standard function call format
              if (parsedMatch.type === 'function' && parsedMatch.function) {
                if (typeof parsedMatch.function.arguments === 'string') {
                  try {
                    parsedMatch.function.arguments = JSON.parse(parsedMatch.function.arguments);
                  } catch {
                    // Leave as string if can't parse
                  }
                }

                toolCalls.push({
                  name: parsedMatch.function.name,
                  arguments:
                    parsedMatch.function.arguments || parsedMatch.function.parameters || {},
                });
              }
              // Type is 'call' format
              else if (parsedMatch.type === 'call' && parsedMatch.function) {
                toolCalls.push({
                  name: parsedMatch.function,
                  arguments: parsedMatch.arguments || {},
                });
              }
              // Type is a function name (like 'currency_convert')
              else if (
                parsedMatch.type &&
                (parsedMatch.type.startsWith('get_') || parsedMatch.type.startsWith('currency_'))
              ) {
                const args =
                  parsedMatch.arguments ||
                  (parsedMatch.function && parsedMatch.function.parameters) ||
                  parsedMatch.parameters ||
                  {};

                toolCalls.push({
                  name: parsedMatch.type,
                  arguments: args,
                });
              }
            } catch (err) {
              logger.warn(`Failed to parse JSON match as tool call: ${String(err)}`);
            }
          }

          if (toolCalls.length > 0) {
            result.metadata = {
              ...result.metadata,
              tool_calls: toolCalls,
            };

            // Add tool call information directly in output
            const toolCallDescriptions = toolCalls
              .map((toolCall) => {
                const args =
                  typeof toolCall.arguments === 'string'
                    ? toolCall.arguments
                    : JSON.stringify(toolCall.arguments, null, 2);

                return `Function call: ${toolCall.name}(${args})`;
              })
              .join('\n\n');

            // Append the tool calls
            result.output = `${content}\n\n${toolCallDescriptions}`;
          }
        } catch (err) {
          logger.warn(`Failed to parse tool calls from content: ${String(err)}`);
        }
      }
      // 4. JSON object embedded in plain text
      else {
        const jsonPattern = /\{[^{}]*"function"[^{}]*\}/g;
        const matches = content.match(jsonPattern);

        if (matches && matches.length > 0) {
          const toolCalls = [];

          for (const match of matches) {
            try {
              const parsedMatch = JSON.parse(match);
              if (parsedMatch.function && parsedMatch.function.name) {
                toolCalls.push({
                  name: parsedMatch.function.name,
                  arguments: parsedMatch.function.arguments || {},
                });
              } else if (parsedMatch.type === 'call' && parsedMatch.function) {
                toolCalls.push({
                  name: parsedMatch.function,
                  arguments: parsedMatch.arguments || {},
                });
              }
            } catch (err) {
              logger.warn(`Failed to parse JSON match as tool call: ${String(err)}`);
            }
          }

          if (toolCalls.length > 0) {
            result.metadata = {
              ...result.metadata,
              tool_calls: toolCalls,
            };

            // Add tool call information directly in output
            const toolCallDescriptions = toolCalls
              .map((toolCall) => {
                const args =
                  typeof toolCall.arguments === 'string'
                    ? toolCall.arguments
                    : JSON.stringify(toolCall.arguments, null, 2);

                return `Function call: ${toolCall.name}(${args})`;
              })
              .join('\n\n');

            // Append the tool calls
            result.output = `${content}\n\n${toolCallDescriptions}`;
          }
        }
      }

      // 4. Standard tool_calls field
      if (data.message?.tool_calls && data.message.tool_calls.length > 0) {
        result.metadata = {
          ...result.metadata,
          tool_calls: this.formatToolCalls(data.message.tool_calls),
        };

        // For better compatibility, add tool call information directly in output
        const toolCallDescriptions = data.message.tool_calls
          .map((toolCall) => {
            const args =
              typeof toolCall.function.arguments === 'string'
                ? toolCall.function.arguments
                : JSON.stringify(toolCall.function.arguments, null, 2);

            return `Function call: ${toolCall.function.name}(${args})`;
          })
          .join('\n\n');

        result.output = `${result.output}\n\n${toolCallDescriptions}`;
      }

      return result;
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
  }

  /**
   * Format tool calls from Ollama format to promptfoo format
   */
  private formatToolCalls(toolCalls: OllamaToolCall[]) {
    return toolCalls.map((toolCall) => {
      // If arguments is a string, try to parse it as JSON
      let args = toolCall.function.arguments;
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args);
        } catch {
          // Keep as string if parsing fails
        }
      }

      return {
        name: toolCall.function.name,
        arguments: args,
      };
    });
  }

  /**
   * Handle streaming response from Ollama API
   */
  private async handleStreamingResponse(
    url: string,
    headers: Record<string, string>,
    requestBody: Record<string, any>,
  ): Promise<ProviderResponse> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      let chunks = '';
      let responseData: OllamaChatResponse | null = null;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        // Decode the chunk and add it to our accumulated chunks
        const chunk = new TextDecoder().decode(value);
        chunks += chunk;

        // Try to parse the accumulated chunks
        try {
          responseData = JSON.parse(chunks) as OllamaChatResponse;

          // If we're able to parse the JSON and done is true, we've got the final response
          if (responseData.done) {
            break;
          }
        } catch {
          // If we can't parse the JSON, we've got an incomplete chunk
          // Continue reading more chunks
        }
      }

      if (!responseData) {
        throw new Error('Failed to parse streaming response');
      }

      // Extract the content and look for tool calls
      const content = responseData.message?.content || '';

      // Parse response and return
      const result: ProviderResponse = {
        output: content,
        raw: responseData,
      };

      // Handle various ways Ollama models can output tool calls

      // 1. <|tool_call|>{...} format
      const toolCallMatches = content.match(/<\|tool_call\|>({.*})/);
      if (toolCallMatches && toolCallMatches[1]) {
        try {
          // Extract the JSON payload and parse it
          const toolCallJson = toolCallMatches[1];
          const toolCallPayload = JSON.parse(toolCallJson) as OllamaToolCallPayload;

          if (toolCallPayload.tool_calls && toolCallPayload.tool_calls.length > 0) {
            // Convert to the standard format expected by promptfoo
            const formattedToolCalls = toolCallPayload.tool_calls.map((tc) => ({
              name: tc.function.name,
              arguments: tc.function.parameters,
            }));

            result.metadata = {
              ...result.metadata,
              tool_calls: formattedToolCalls,
            };

            // Add tool call information directly in output
            const toolCallDescriptions = formattedToolCalls
              .map((toolCall) => {
                const args =
                  typeof toolCall.arguments === 'string'
                    ? toolCall.arguments
                    : JSON.stringify(toolCall.arguments, null, 2);

                return `Function call: ${toolCall.name}(${args})`;
              })
              .join('\n\n');

            // Clean up the output by removing the raw tool call syntax
            result.output =
              content.replace(/<\|tool_call\|>{.*}/, '') +
              (result.output.trim() ? '\n\n' : '') +
              toolCallDescriptions;
          }
        } catch (err) {
          logger.warn(`Failed to parse tool call JSON: ${String(err)}`);
        }
      }
      // 2. Direct JSON array in content
      else if (content.trim().startsWith('[') && content.includes(']')) {
        try {
          // Extract just the array part (ignoring anything after it)
          const arrayEndIndex = content.indexOf(']') + 1;
          const arrayPart = content.substring(0, arrayEndIndex);

          // Parse just the array portion
          const jsonArray = JSON.parse(arrayPart);

          if (Array.isArray(jsonArray)) {
            const toolCalls = [];

            // Process array items
            for (const item of jsonArray) {
              if (item.type === 'function' && item.function) {
                // Standard function call format
                toolCalls.push({
                  name: item.function.name,
                  arguments: item.function.arguments || item.function.parameters || {},
                });
              }
              // Special format for currency_convert and similar
              else if (
                item.type &&
                (item.type.startsWith('get_') || item.type.startsWith('currency_'))
              ) {
                const params =
                  item.function && item.function.parameters
                    ? item.function.parameters
                    : item.arguments || item.parameters || {};

                toolCalls.push({
                  name: item.type,
                  arguments: params,
                });
              }
            }

            // Process any standalone objects after the array (if present)
            // This handles the attraction format where an object follows the array
            if (arrayEndIndex < content.length) {
              const restContent = content.substring(arrayEndIndex).trim();
              if (restContent.startsWith('{') && restContent.includes('}')) {
                try {
                  const standaloneObj = JSON.parse(restContent);

                  // Handle "type": "call" format
                  if (standaloneObj.type === 'call' && standaloneObj.function) {
                    toolCalls.push({
                      name: standaloneObj.function,
                      arguments: standaloneObj.arguments || {},
                    });
                  }
                } catch (err) {
                  // If we can't parse as a single object, try to extract objects
                  // Find all potential JSON objects using the manual approach
                  let startPos = 0;
                  while (startPos < restContent.length) {
                    const objectStart = restContent.indexOf('{', startPos);
                    if (objectStart === -1) break;

                    let objectEnd = objectStart + 1;
                    let braceCount = 1;

                    while (objectEnd < restContent.length && braceCount > 0) {
                      if (restContent[objectEnd] === '{') braceCount++;
                      if (restContent[objectEnd] === '}') braceCount--;
                      objectEnd++;
                    }

                    if (braceCount === 0) {
                      const jsonStr = restContent.substring(objectStart, objectEnd);

                      try {
                        const obj = JSON.parse(jsonStr);

                        if (obj.type === 'call' && obj.function) {
                          toolCalls.push({
                            name: obj.function,
                            arguments: obj.arguments || {},
                          });
                        }
                      } catch (objErr) {
                        logger.warn(`Failed to parse standalone object: ${String(objErr)}`);
                      }
                    }

                    startPos = objectEnd;
                  }
                }
              }
            }

            if (toolCalls.length > 0) {
              result.metadata = {
                ...result.metadata,
                tool_calls: toolCalls,
              };

              // Add tool call information directly in output
              const toolCallDescriptions = toolCalls
                .map((toolCall) => {
                  const args =
                    typeof toolCall.arguments === 'string'
                      ? toolCall.arguments
                      : JSON.stringify(toolCall.arguments, null, 2);

                  return `Function call: ${toolCall.name}(${args})`;
                })
                .join('\n\n');

              // Append the tool calls
              result.output = `${content}\n\n${toolCallDescriptions}`;
            }
          }
        } catch (err) {
          logger.warn(`Failed to parse JSON content as tool calls: ${String(err)}`);
        }
      }
      // 3. Combined JSON array and objects in content
      else if (
        content.includes('type": "function"') ||
        content.includes('type": "call"') ||
        content.includes('type": "currency_convert"') ||
        content.includes('type": "get_')
      ) {
        try {
          // Extract all potential JSON objects from the content
          const jsonPattern = /\{(?:[^{}]|"[^"]*")*\}/g;
          const matches = content.match(jsonPattern) || [];

          const toolCalls = [];

          // Process each potential JSON match
          for (const match of matches) {
            try {
              const parsedMatch = JSON.parse(match);

              // Standard function call format
              if (parsedMatch.type === 'function' && parsedMatch.function) {
                if (typeof parsedMatch.function.arguments === 'string') {
                  try {
                    parsedMatch.function.arguments = JSON.parse(parsedMatch.function.arguments);
                  } catch {
                    // Leave as string if can't parse
                  }
                }

                toolCalls.push({
                  name: parsedMatch.function.name,
                  arguments:
                    parsedMatch.function.arguments || parsedMatch.function.parameters || {},
                });
              }
              // Type is 'call' format
              else if (parsedMatch.type === 'call' && parsedMatch.function) {
                toolCalls.push({
                  name: parsedMatch.function,
                  arguments: parsedMatch.arguments || {},
                });
              }
              // Type is a function name (like 'currency_convert')
              else if (
                parsedMatch.type &&
                (parsedMatch.type.startsWith('get_') || parsedMatch.type.startsWith('currency_'))
              ) {
                const args =
                  parsedMatch.arguments ||
                  (parsedMatch.function && parsedMatch.function.parameters) ||
                  parsedMatch.parameters ||
                  {};

                toolCalls.push({
                  name: parsedMatch.type,
                  arguments: args,
                });
              }
            } catch (err) {
              logger.warn(`Failed to parse JSON match as tool call: ${String(err)}`);
            }
          }

          if (toolCalls.length > 0) {
            result.metadata = {
              ...result.metadata,
              tool_calls: toolCalls,
            };

            // Add tool call information directly in output
            const toolCallDescriptions = toolCalls
              .map((toolCall) => {
                const args =
                  typeof toolCall.arguments === 'string'
                    ? toolCall.arguments
                    : JSON.stringify(toolCall.arguments, null, 2);

                return `Function call: ${toolCall.name}(${args})`;
              })
              .join('\n\n');

            // Append the tool calls
            result.output = `${content}\n\n${toolCallDescriptions}`;
          }
        } catch (err) {
          logger.warn(`Failed to parse tool calls from content: ${String(err)}`);
        }
      }
      // 4. JSON object embedded in plain text
      else {
        const jsonPattern = /\{[^{}]*"function"[^{}]*\}/g;
        const matches = content.match(jsonPattern);

        if (matches && matches.length > 0) {
          const toolCalls = [];

          for (const match of matches) {
            try {
              const parsedMatch = JSON.parse(match);
              if (parsedMatch.function && parsedMatch.function.name) {
                toolCalls.push({
                  name: parsedMatch.function.name,
                  arguments: parsedMatch.function.arguments || {},
                });
              } else if (parsedMatch.type === 'call' && parsedMatch.function) {
                toolCalls.push({
                  name: parsedMatch.function,
                  arguments: parsedMatch.arguments || {},
                });
              }
            } catch (err) {
              logger.warn(`Failed to parse JSON match as tool call: ${String(err)}`);
            }
          }

          if (toolCalls.length > 0) {
            result.metadata = {
              ...result.metadata,
              tool_calls: toolCalls,
            };

            // Add tool call information directly in output
            const toolCallDescriptions = toolCalls
              .map((toolCall) => {
                const args =
                  typeof toolCall.arguments === 'string'
                    ? toolCall.arguments
                    : JSON.stringify(toolCall.arguments, null, 2);

                return `Function call: ${toolCall.name}(${args})`;
              })
              .join('\n\n');

            // Append the tool calls
            result.output = `${content}\n\n${toolCallDescriptions}`;
          }
        }
      }

      // 4. Standard tool_calls field
      if (responseData.message?.tool_calls && responseData.message.tool_calls.length > 0) {
        result.metadata = {
          ...result.metadata,
          tool_calls: this.formatToolCalls(responseData.message.tool_calls),
        };

        // For better compatibility, add tool call information directly in output
        const toolCallDescriptions = responseData.message.tool_calls
          .map((toolCall) => {
            const args =
              typeof toolCall.function.arguments === 'string'
                ? toolCall.function.arguments
                : JSON.stringify(toolCall.function.arguments, null, 2);

            return `Function call: ${toolCall.function.name}(${args})`;
          })
          .join('\n\n');

        result.output = `${result.output}\n\n${toolCallDescriptions}`;
      }

      return result;
    } catch (err) {
      return {
        error: `Streaming API call error: ${String(err)}`,
      };
    }
  }
}
