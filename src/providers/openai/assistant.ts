import { OpenAiGenericProvider } from '.';
import logger from '../../logger';
import type { CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../../types';
import type { EnvOverrides } from '../../types/env';
import { renderVarsInObject } from '../../util';
import { maybeLoadFromExternalFile } from '../../util';
import { sleep } from '../../util/time';
import { REQUEST_TIMEOUT_MS, parseChatPrompt, toTitleCase } from '../shared';
import type { OpenAiSharedOptions } from './types';
import { failApiCall, getTokenUsage } from './util';

// Define our own Metadata type to avoid the OpenAI SDK dependency
type Metadata = Record<string, string>;

// Define types for OpenAI API responses
type ThreadRun = {
  id: string;
  thread_id: string;
  status:
    | 'queued'
    | 'in_progress'
    | 'completed'
    | 'requires_action'
    | 'failed'
    | 'cancelled'
    | 'expired';
  required_action?: {
    type: string;
    submit_tool_outputs?: {
      tool_calls: Array<{
        id: string;
        type: string;
        function?: {
          name: string;
          arguments: string;
        };
      }>;
    };
  };
  last_error?: {
    code?: string;
    message: string;
  };
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

type ThreadRunSteps = {
  data: Array<{
    id: string;
    step_details: {
      type: string;
      message_creation?: {
        message_id: string;
      };
      tool_calls?: Array<{
        type: string;
        function?: {
          name: string;
          arguments: string;
          output?: string;
        };
        code_interpreter?: {
          input: string;
          outputs: Array<{
            type: string;
            logs?: string;
          }>;
        };
      }>;
    };
  }>;
};

// Original types
export type OpenAiAssistantOptions = OpenAiSharedOptions & {
  modelName?: string;
  instructions?: string;
  tools?: Array<{
    type: string;
    function?: {
      name: string;
      description?: string;
      parameters?: Record<string, any>;
    };
  }>;
  /**
   * If set, automatically call these functions when the assistant activates
   * these function tools.
   */
  functionToolCallbacks?: Record<string, string | ((arg: string) => Promise<string>)>;
  metadata?: Metadata;
  temperature?: number;
  toolChoice?:
    | 'none'
    | 'auto'
    | 'required'
    | { type: 'function'; function?: { name: string } }
    | { type: 'file_search' };
  attachments?: Array<{
    type: string;
    [key: string]: any;
  }>;
  tool_resources?: {
    code_interpreter?: { file_ids?: string[] };
    file_search?: { vector_store_ids?: string[] };
  };
};

type AssistantMessage = {
  role: string;
  content: Array<{
    type: string;
    text?: {
      value: string;
      annotations: any[];
    };
  }>;
};

export class OpenAiAssistantProvider extends OpenAiGenericProvider {
  assistantId: string;
  assistantConfig: OpenAiAssistantOptions;
  parsedFunctionCallbacks: Record<string, (arg: string) => Promise<string>>;

  constructor(
    assistantId: string,
    options: { config?: OpenAiAssistantOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(assistantId, options);
    this.assistantConfig = options.config || {};
    this.parsedFunctionCallbacks = {};

    // Parse function callbacks if they are provided as strings
    if (this.assistantConfig.functionToolCallbacks) {
      Object.entries(this.assistantConfig.functionToolCallbacks).forEach(([name, callback]) => {
        if (typeof callback === 'string') {
          try {
            // Create a function from the string
            this.parsedFunctionCallbacks[name] = async (args: string) => {
              // Create a function from the string and execute it with the args
              const fnBody = callback.trim();

              const fn = new Function(
                'args',
                `
                const fnBody = ${fnBody};
                return fnBody(args);
              `,
              );
              return await fn(args);
            };
          } catch (error: any) {
            logger.error(`Error parsing function callback ${name}: ${error.message}`);
          }
        } else {
          // If it's already a function, just use it
          this.parsedFunctionCallbacks[name] = callback;
        }
      });
    }

    // Extract the assistant ID from the provider ID if it's in the format openai:assistant:ASSISTANT_ID
    let extractedId = assistantId;
    if (assistantId.includes(':')) {
      const parts = assistantId.split(':');
      if (parts.length > 2) {
        extractedId = parts[2];
      }
    }

    this.assistantId = extractedId;

    logger.debug(
      `Initialized OpenAiAssistantProvider with original ID: ${assistantId}, extracted assistant ID: ${this.assistantId}`,
    );
  }

  private async fetchOpenAI<T>(endpoint: string, method: string, body?: any): Promise<T> {
    const baseURL = this.getApiUrl() || 'https://api.openai.com/v1';
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.getApiKey()}`,
      'OpenAI-Beta': 'assistants=v2',
    };

    const organization = this.getOrganization();
    if (organization) {
      headers['OpenAI-Organization'] = organization;
    }

    if (this.assistantConfig.headers) {
      Object.assign(headers, this.assistantConfig.headers);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const url = `${baseURL}${endpoint}`;
      logger.debug(`Fetching OpenAI API: ${method} ${url}`);

      if (body) {
        logger.debug(`Request body: ${JSON.stringify(body)}`);
      }

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: { message: errorText, type: 'Parse Error' } };
        }

        const message = errorData.error?.message || response.statusText;
        const type = errorData.error?.type || 'API Error';

        logger.error(`OpenAI API error: ${type}: ${message}`);
        logger.error(`Response status: ${response.status} ${response.statusText}`);
        logger.error(`Request URL: ${url}`);

        const error = new Error(`${type}: ${message}`);
        Object.defineProperty(error, 'status', { value: response.status });
        Object.defineProperty(error, 'type', { value: type });
        Object.defineProperty(error, 'message', { value: message });
        throw error;
      }

      const responseText = await response.text();
      try {
        return JSON.parse(responseText) as T;
      } catch (error: any) {
        logger.error(`Failed to parse JSON response: ${responseText}`);
        throw new Error(`Failed to parse JSON response: ${error.message}`);
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    try {
      if (!this.getApiKey()) {
        throw new Error(
          'OpenAI API key is not set. Set the OPENAI_API_KEY environment variable or add `apiKey` to the provider config.',
        );
      }

      if (!this.assistantId) {
        throw new Error(
          'OpenAI Assistant ID is not set. Please use the format openai:assistant:YOUR_ASSISTANT_ID as the provider ID.',
        );
      }

      logger.debug(
        `Starting request to OpenAI Assistant API with assistant ID: ${this.assistantId}`,
      );

      const messages = parseChatPrompt(prompt, [
        {
          role: 'user',
          content: prompt,
          ...(this.assistantConfig.attachments
            ? { attachments: this.assistantConfig.attachments }
            : {}),
        },
      ]) as any[];

      const body: any = {
        assistant_id: this.assistantId,
        thread: {
          messages,
        },
      };

      // Only add tools if they exist
      if (this.assistantConfig.tools) {
        body.tools = maybeLoadFromExternalFile(
          renderVarsInObject(this.assistantConfig.tools, context?.vars),
        );
      }

      logger.debug(`Calling OpenAI API, creating thread run: ${JSON.stringify(body)}`);
      let run: ThreadRun;
      try {
        run = await this.fetchOpenAI<ThreadRun>('/threads/runs', 'POST', body);
      } catch (err) {
        return failApiCall(err);
      }

      logger.debug(`\tOpenAI thread run API response: ${JSON.stringify(run)}`);

      while (true) {
        const currentRun = await this.fetchOpenAI<ThreadRun>(
          `/threads/${run.thread_id}/runs/${run.id}`,
          'GET',
        );

        if (currentRun.status === 'completed') {
          run = currentRun;
          break;
        }

        if (currentRun.status === 'requires_action') {
          const requiredAction = currentRun.required_action;
          if (
            requiredAction === null ||
            requiredAction === undefined ||
            requiredAction.type !== 'submit_tool_outputs'
          ) {
            run = currentRun;
            break;
          }

          const toolCalls = requiredAction.submit_tool_outputs?.tool_calls || [];
          const functionCallsWithCallbacks = toolCalls.filter((toolCall) => {
            return (
              toolCall.type === 'function' &&
              toolCall.function?.name &&
              this.parsedFunctionCallbacks[toolCall.function.name] !== undefined
            );
          });

          if (functionCallsWithCallbacks.length === 0) {
            run = currentRun;
            break;
          }

          logger.debug(
            `Calling functionToolCallbacks for functions: ${functionCallsWithCallbacks.map(
              ({ function: fnc }) => fnc?.name || 'unknown',
            )}`,
          );

          const toolOutputs = await Promise.all(
            functionCallsWithCallbacks.map(async (toolCall) => {
              const functionName = toolCall.function!.name;
              const functionArgs = toolCall.function!.arguments;
              logger.debug(`Calling functionToolCallbacks[${functionName}]('${functionArgs}')`);
              const functionResult = await this.parsedFunctionCallbacks[functionName](functionArgs);
              return {
                tool_call_id: toolCall.id,
                output: functionResult,
              };
            }),
          );

          logger.debug(
            `Calling OpenAI API, submitting tool outputs for ${currentRun.thread_id}: ${JSON.stringify(
              toolOutputs,
            )}`,
          );

          try {
            run = await this.fetchOpenAI<ThreadRun>(
              `/threads/${currentRun.thread_id}/runs/${currentRun.id}/submit_tool_outputs`,
              'POST',
              {
                tool_outputs: toolOutputs,
              },
            );
          } catch (err) {
            return failApiCall(err);
          }
          continue;
        }

        if (
          currentRun.status === 'failed' ||
          currentRun.status === 'cancelled' ||
          currentRun.status === 'expired'
        ) {
          run = currentRun;
          break;
        }

        await sleep(1000);
      }

      if (run.status !== 'completed' && run.status !== 'requires_action') {
        if (run.last_error) {
          return {
            error: `Thread run failed: ${run.last_error.message}`,
          };
        }
        return {
          error: `Thread run failed: ${run.status}`,
        };
      }

      // Get run steps
      logger.debug(`Calling OpenAI API, getting thread run steps for ${run.thread_id}`);
      let steps: ThreadRunSteps;
      try {
        steps = await this.fetchOpenAI<ThreadRunSteps>(
          `/threads/${run.thread_id}/runs/${run.id}/steps?order=asc`,
          'GET',
        );
      } catch (err) {
        return failApiCall(err);
      }
      logger.debug(`\tOpenAI thread run steps API response: ${JSON.stringify(steps)}`);

      const outputBlocks = [];

      // Ensure steps.data exists and is iterable
      if (steps && Array.isArray(steps.data) && steps.data.length > 0) {
        for (const step of steps.data) {
          if (step.step_details.type === 'message_creation') {
            logger.debug(`Calling OpenAI API, getting message ${step.id}`);
            let message: AssistantMessage;
            try {
              message = await this.fetchOpenAI<AssistantMessage>(
                `/threads/${run.thread_id}/messages/${step.step_details.message_creation!.message_id}`,
                'GET',
              );
            } catch (err) {
              return failApiCall(err);
            }
            logger.debug(
              `\tOpenAI thread run step message API response: ${JSON.stringify(message)}`,
            );

            const content = message.content
              .map((content) =>
                content.type === 'text' && content.text
                  ? content.text.value
                  : `<${content.type} output>`,
              )
              .join('\n');
            outputBlocks.push(`[${toTitleCase(message.role)}] ${content}`);
          } else if (step.step_details.type === 'tool_calls') {
            const toolCalls = step.step_details.tool_calls || [];
            for (const toolCall of toolCalls) {
              if (toolCall.type === 'function') {
                const name = toolCall.function!.name;
                const args = toolCall.function!.arguments;
                const output = toolCall.function!.output;
                outputBlocks.push(`[Call function ${name} with arguments ${args}]`);
                outputBlocks.push(`[Function output: ${output}]`);
              } else if (toolCall.type === 'file_search') {
                outputBlocks.push(`[Ran file search]`);
              } else if (toolCall.type === 'code_interpreter') {
                const input = toolCall.code_interpreter!.input;
                const output = toolCall
                  .code_interpreter!.outputs.map((output) =>
                    output.type === 'logs' ? output.logs : `<${output.type} output>`,
                  )
                  .join('\n');
                outputBlocks.push(`[Code interpreter input]`);
                outputBlocks.push(input);
                outputBlocks.push(`[Code interpreter output]`);
                outputBlocks.push(output);
              } else {
                outputBlocks.push(`[Unknown tool call type: ${toolCall.type}]`);
              }
            }
          } else {
            outputBlocks.push(`[Unknown step type: ${step.step_details.type}]`);
          }
        }
      } else {
        // If no steps data is available, provide a default message
        outputBlocks.push('[Assistant] The assistant completed without generating any content.');
      }

      return {
        output: outputBlocks.join('\n\n').trim(),
        tokenUsage: getTokenUsage(run, false),
      };
    } catch (error: any) {
      logger.error(`Unhandled error in OpenAiAssistantProvider.callApi: ${error.message}`);
      return {
        error: `Unhandled error: ${error.message}`,
      };
    }
  }
}
