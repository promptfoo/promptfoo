import { fetchWithRetries } from '../../fetch';
import logger from '../../logger';
import type { CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../../types';
import { maybeLoadFromExternalFile, renderVarsInObject } from '../../util';
import { sleep } from '../../util/time';
import { REQUEST_TIMEOUT_MS, toTitleCase } from '../shared';
import { AzureGenericProvider } from './generic';
import type { AzureAssistantOptions, AzureAssistantProviderOptions } from './types';

/**
 * Interface for thread creation response
 */
interface ThreadResponse {
  id: string;
  object: string;
  created_at: number;
}

/**
 * Interface for run creation and status
 */
interface RunResponse {
  id: string;
  object: string;
  created_at: number;
  status: string;
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
    code: string;
    message: string;
  };
}

/**
 * Interface for message list response
 */
interface MessageListResponse {
  data: Array<{
    id: string;
    object: string;
    created_at: number;
    role: string;
    content: Array<{
      type: string;
      text?: {
        value: string;
      };
    }>;
  }>;
}

/**
 * Interface for run steps list response
 */
interface RunStepsResponse {
  data: Array<{
    id: string;
    type: string;
    step_details?: {
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
        file_search?: Record<string, any>;
      }>;
    };
  }>;
}

export class AzureAssistantProvider extends AzureGenericProvider {
  assistantConfig: AzureAssistantOptions;

  constructor(deploymentName: string, options: AzureAssistantProviderOptions = {}) {
    super(deploymentName, options);
    this.assistantConfig = options.config || {};
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('Azure API key must be set.');
    }

    const apiBaseUrl = this.getApiBaseUrl();
    if (!apiBaseUrl) {
      throw new Error('Azure API host must be set.');
    }

    const apiVersion = this.assistantConfig.apiVersion || '2024-04-01-preview';

    try {
      // 1. Create a thread
      const threadResponse = await this.makeRequest<ThreadResponse>(
        `${apiBaseUrl}/openai/threads?api-version=${apiVersion}`,
        {
          method: 'POST',
          headers: await this.getHeaders(),
          body: JSON.stringify({}),
        },
      );

      // 2. Create a message
      await this.makeRequest(
        `${apiBaseUrl}/openai/threads/${threadResponse.id}/messages?api-version=${apiVersion}`,
        {
          method: 'POST',
          headers: await this.getHeaders(),
          body: JSON.stringify({
            role: 'user',
            content: prompt,
          }),
        },
      );

      // 3. Prepare the run options
      const runOptions: Record<string, any> = {
        assistant_id: this.deploymentName,
      };

      // Add configuration parameters
      if (this.assistantConfig.temperature !== undefined) {
        runOptions.temperature = this.assistantConfig.temperature;
      }
      if (this.assistantConfig.top_p !== undefined) {
        runOptions.top_p = this.assistantConfig.top_p;
      }
      if (this.assistantConfig.tool_resources) {
        runOptions.tool_resources = this.assistantConfig.tool_resources;
      }
      if (this.assistantConfig.tool_choice) {
        runOptions.tool_choice = this.assistantConfig.tool_choice;
      }
      if (this.assistantConfig.tools) {
        runOptions.tools = maybeLoadFromExternalFile(
          renderVarsInObject(this.assistantConfig.tools, context?.vars),
        );
      }
      if (this.assistantConfig.modelName) {
        runOptions.model = this.assistantConfig.modelName;
      }
      if (this.assistantConfig.instructions) {
        runOptions.instructions = this.assistantConfig.instructions;
      }

      logger.debug(`Creating run with options: ${JSON.stringify(runOptions)}`);

      // 4. Create a run
      const runResponse = await this.makeRequest<RunResponse>(
        `${apiBaseUrl}/openai/threads/${threadResponse.id}/runs?api-version=${apiVersion}`,
        {
          method: 'POST',
          headers: await this.getHeaders(),
          body: JSON.stringify(runOptions),
        },
      );

      // 5. Handle function calls if needed
      if (
        this.assistantConfig.functionToolCallbacks &&
        Object.keys(this.assistantConfig.functionToolCallbacks).length > 0
      ) {
        return await this.pollRunWithToolCallHandling(
          apiBaseUrl,
          apiVersion,
          threadResponse.id,
          runResponse.id,
        );
      }

      // 6. Poll for completion
      const completedRun = await this.pollRun(
        apiBaseUrl,
        apiVersion,
        threadResponse.id,
        runResponse.id,
      );

      // 7. Process the completed run
      if (completedRun.status !== 'completed') {
        if (completedRun.last_error) {
          return {
            error: `Thread run failed: ${completedRun.last_error.code || ''} - ${completedRun.last_error.message}`,
            retryable: this.isRetryableError(
              completedRun.last_error.code,
              completedRun.last_error.message,
            ),
          };
        }
        return {
          error: `Thread run failed with status: ${completedRun.status}`,
          retryable: completedRun.status === 'expired' || completedRun.status === 'cancelled',
        };
      }

      // 8. Process messages and steps
      return await this.processCompletedRun(
        apiBaseUrl,
        apiVersion,
        threadResponse.id,
        completedRun,
      );
    } catch (err: any) {
      logger.error(`Error in Azure Assistant API call: ${err}`);

      // Check for specific error cases
      const errorMessage = err.message || String(err);

      // Handle thread with run in progress errors - these aren't retryable as we need a new thread
      if (
        errorMessage.includes("Can't add messages to thread") &&
        errorMessage.includes('while a run')
      ) {
        return {
          error: `Error in Azure Assistant API call: ${errorMessage}`,
          retryable: false, // Explicitly mark as not retryable
        };
      }

      // Check for rate limit errors
      if (this.isRateLimitError(errorMessage)) {
        return {
          error: `Rate limit exceeded: ${errorMessage}`,
          retryable: true,
        };
      }

      // Check for service errors
      if (this.isServiceError(errorMessage)) {
        return {
          error: `Service error: ${errorMessage}`,
          retryable: true,
        };
      }

      return {
        error: `Error in Azure Assistant API call: ${errorMessage}`,
        retryable: this.isServerError(errorMessage),
      };
    }
  }

  /**
   * Helper method to make HTTP requests using fetchWithRetries
   */
  private async makeRequest<T>(url: string, options: RequestInit): Promise<T> {
    const timeoutMs = this.assistantConfig.timeoutMs || REQUEST_TIMEOUT_MS;
    const retries = this.assistantConfig.retryOptions?.maxRetries || 4;

    const response = await fetchWithRetries(url, options, timeoutMs, retries);

    if (response.status < 200 || response.status >= 300) {
      // Try to extract a more detailed error message from the response
      let errorDetails = '';
      try {
        const errorBody = await response.text();
        if (errorBody) {
          try {
            const parsedError = JSON.parse(errorBody);
            if (parsedError.error && parsedError.error.message) {
              errorDetails = `: ${parsedError.error.message}`;
            } else {
              errorDetails = `: ${errorBody}`;
            }
          } catch {
            // If we can't parse the error body as JSON, just use it as a string
            errorDetails = `: ${errorBody}`;
          }
        }
      } catch (error) {
        logger.debug(`Failed to read error body: ${error}`);
      }

      throw new Error(`API error: ${response.status} ${response.statusText}${errorDetails}`);
    }

    try {
      return (await response.json()) as T;
    } catch (error) {
      logger.error(`Failed to parse response as JSON: ${error}`);
      throw new Error(`Failed to parse response as JSON: ${error}`);
    }
  }

  /**
   * Get headers for API requests
   */
  private async getHeaders(): Promise<Record<string, string>> {
    // Make sure we're initialized to have the auth headers ready
    await this.ensureInitialized();

    // Use the authHeaders from parent class that already handles all auth methods
    return {
      'Content-Type': 'application/json',
      ...(this.authHeaders || {}),
    };
  }

  /**
   * Helper methods to check for specific error types
   */
  private isRateLimitError(errorMessage: string): boolean {
    return (
      errorMessage.includes('rate limit') ||
      errorMessage.includes('Rate limit') ||
      errorMessage.includes('429')
    );
  }

  private isServiceError(errorMessage: string): boolean {
    return (
      errorMessage.includes('Service unavailable') ||
      errorMessage.includes('Bad gateway') ||
      errorMessage.includes('Gateway timeout') ||
      errorMessage.includes('Server is busy') ||
      errorMessage.includes('Sorry, something went wrong')
    );
  }

  private isServerError(errorMessage: string): boolean {
    return (
      errorMessage.includes('500') ||
      errorMessage.includes('502') ||
      errorMessage.includes('503') ||
      errorMessage.includes('504')
    );
  }

  private isRetryableError(code?: string, message?: string): boolean {
    if (code === 'rate_limit_exceeded') {
      return true;
    }
    if (!message) {
      return false;
    }

    return (
      this.isRateLimitError(message) || this.isServiceError(message) || this.isServerError(message)
    );
  }

  /**
   * Poll a run until it completes or fails
   */
  private async pollRun(
    apiBaseUrl: string,
    apiVersion: string,
    threadId: string,
    runId: string,
    pollIntervalMs = 1000,
  ): Promise<RunResponse> {
    // Get initial run status
    let runStatus = await this.makeRequest<RunResponse>(
      `${apiBaseUrl}/openai/threads/${threadId}/runs/${runId}?api-version=${apiVersion}`,
      {
        method: 'GET',
        headers: await this.getHeaders(),
      },
    );

    // Maximum polling time (5 minutes)
    const maxPollTime = this.assistantConfig.maxPollTimeMs || 300000;
    const startTime = Date.now();

    // Poll until terminal state
    while (['queued', 'in_progress'].includes(runStatus.status)) {
      // Check timeout
      if (Date.now() - startTime > maxPollTime) {
        throw new Error(
          `Run polling timed out after ${maxPollTime}ms. Last status: ${runStatus.status}`,
        );
      }

      await sleep(pollIntervalMs);

      // Get latest status
      runStatus = await this.makeRequest<RunResponse>(
        `${apiBaseUrl}/openai/threads/${threadId}/runs/${runId}?api-version=${apiVersion}`,
        {
          method: 'GET',
          headers: await this.getHeaders(),
        },
      );

      // Increase polling interval gradually for longer-running operations
      if (Date.now() - startTime > 30000) {
        // After 30 seconds
        pollIntervalMs = Math.min(pollIntervalMs * 1.5, 5000);
      }
    }

    return runStatus;
  }

  /**
   * Handle tool calls during run polling
   */
  private async pollRunWithToolCallHandling(
    apiBaseUrl: string,
    apiVersion: string,
    threadId: string,
    runId: string,
  ): Promise<ProviderResponse> {
    // Maximum polling time (5 minutes)
    const maxPollTime = this.assistantConfig.maxPollTimeMs || 300000;
    const startTime = Date.now();
    let pollIntervalMs = 1000;

    // Poll until terminal state
    while (true) {
      // Check timeout
      if (Date.now() - startTime > maxPollTime) {
        return {
          error: `Run polling timed out after ${maxPollTime}ms. The operation may still be in progress.`,
          retryable: true, // Timeouts are generally retryable
        };
      }

      try {
        // Get latest status
        const run = await this.makeRequest<RunResponse>(
          `${apiBaseUrl}/openai/threads/${threadId}/runs/${runId}?api-version=${apiVersion}`,
          {
            method: 'GET',
            headers: await this.getHeaders(),
          },
        );

        logger.debug(`Run status: ${run.status}`);

        // Check for required action
        if (run.status === 'requires_action') {
          if (
            run.required_action?.type === 'submit_tool_outputs' &&
            run.required_action.submit_tool_outputs?.tool_calls
          ) {
            const toolCalls = run.required_action.submit_tool_outputs.tool_calls;

            // Filter for function calls that have callbacks
            const functionCallsWithCallbacks = toolCalls.filter((toolCall) => {
              return (
                toolCall.type === 'function' &&
                toolCall.function &&
                toolCall.function.name in (this.assistantConfig.functionToolCallbacks ?? {})
              );
            });

            if (functionCallsWithCallbacks.length === 0) {
              logger.error(
                `No function calls with callbacks found. Available functions: ${Object.keys(
                  this.assistantConfig.functionToolCallbacks || {},
                ).join(', ')}. Tool calls: ${JSON.stringify(toolCalls)}`,
              );
              break;
            }

            // Process tool calls
            const toolOutputs = await Promise.all(
              functionCallsWithCallbacks.map(async (toolCall) => {
                const functionName = toolCall.function!.name;
                const functionArgs = toolCall.function!.arguments;
                const callback = this.assistantConfig.functionToolCallbacks?.[functionName];

                try {
                  logger.debug(`Calling function ${functionName} with args: ${functionArgs}`);

                  let result;
                  if (typeof callback === 'string') {
                    logger.debug(`Callback is a string, evaluating as function: ${callback}`);
                    const asyncFunction = new Function('return ' + callback)();
                    result = await asyncFunction(functionArgs);
                  } else {
                    result = await callback!(functionArgs);
                  }

                  logger.debug(`Function ${functionName} result: ${result}`);
                  return {
                    tool_call_id: toolCall.id,
                    output: result,
                  };
                } catch (error) {
                  logger.error(`Error calling function ${functionName}: ${error}`);
                  return {
                    tool_call_id: toolCall.id,
                    output: JSON.stringify({ error: String(error) }),
                  };
                }
              }),
            );

            // Submit tool outputs
            const validToolOutputs = toolOutputs.filter((output) => output !== null);
            if (validToolOutputs.length === 0) {
              logger.error('No valid tool outputs to submit');
              break;
            }

            logger.debug(`Submitting tool outputs: ${JSON.stringify(validToolOutputs)}`);

            // Submit tool outputs
            try {
              await this.makeRequest(
                `${apiBaseUrl}/openai/threads/${threadId}/runs/${runId}/submit_tool_outputs?api-version=${apiVersion}`,
                {
                  method: 'POST',
                  headers: await this.getHeaders(),
                  body: JSON.stringify({
                    tool_outputs: validToolOutputs,
                  }),
                },
              );
            } catch (error: any) {
              logger.error(`Error submitting tool outputs: ${error.message}`);
              return {
                error: `Error submitting tool outputs: ${error.message}`,
                retryable: this.isRetryableError('', error.message || ''),
              };
            }
          } else {
            logger.error(`Unknown required action type: ${run.required_action?.type}`);
            break;
          }
        } else if (['completed', 'failed', 'cancelled', 'expired'].includes(run.status)) {
          // Run is in a terminal state
          if (run.status !== 'completed') {
            // Return error for failed runs
            if (run.last_error) {
              return {
                error: `Thread run failed: ${run.last_error.code || ''} - ${run.last_error.message}`,
                retryable: this.isRetryableError(run.last_error.code, run.last_error.message),
              };
            }

            return {
              error: `Thread run failed with status: ${run.status}`,
              retryable: run.status === 'expired' || run.status === 'cancelled',
            };
          }

          break; // Exit the loop if completed successfully
        }

        // Wait before polling again
        await sleep(pollIntervalMs);

        // Increase polling interval gradually for longer-running operations
        if (Date.now() - startTime > 30000) {
          // After 30 seconds
          pollIntervalMs = Math.min(pollIntervalMs * 1.5, 5000);
        }
      } catch (error: any) {
        // Handle error during polling
        logger.error(`Error polling run status: ${error}`);
        const errorMessage = error.message || String(error);

        // For transient errors, return a retryable error response
        if (this.isRetryableError('', errorMessage)) {
          return {
            error: `Error polling run status: ${errorMessage}`,
            retryable: true,
          };
        }

        // For other errors, just return the error without marking as retryable
        return {
          error: `Error polling run status: ${errorMessage}`,
        };
      }
    }

    // Process the completed run
    return await this.processCompletedRun(apiBaseUrl, apiVersion, threadId, runId);
  }

  /**
   * Process a completed run to extract messages and tool calls
   */
  private async processCompletedRun(
    apiBaseUrl: string,
    apiVersion: string,
    threadId: string,
    runIdOrResponse: string | RunResponse,
  ): Promise<ProviderResponse> {
    try {
      const runId = typeof runIdOrResponse === 'string' ? runIdOrResponse : runIdOrResponse.id;

      // Get all messages in the thread
      const messagesResponse = await this.makeRequest<MessageListResponse>(
        `${apiBaseUrl}/openai/threads/${threadId}/messages?api-version=${apiVersion}`,
        {
          method: 'GET',
          headers: await this.getHeaders(),
        },
      );

      // Get run steps to process tool calls
      const stepsResponse = await this.makeRequest<RunStepsResponse>(
        `${apiBaseUrl}/openai/threads/${threadId}/runs/${runId}/steps?api-version=${apiVersion}`,
        {
          method: 'GET',
          headers: await this.getHeaders(),
        },
      );

      const outputBlocks: string[] = [];
      const runResponseObj =
        typeof runIdOrResponse === 'string'
          ? await this.makeRequest<RunResponse>(
              `${apiBaseUrl}/openai/threads/${threadId}/runs/${runId}?api-version=${apiVersion}`,
              {
                method: 'GET',
                headers: await this.getHeaders(),
              },
            )
          : runIdOrResponse;

      // Process messages
      const messages = messagesResponse.data || [];
      for (const message of messages) {
        // Only include messages created after the run started
        if (new Date(message.created_at) >= new Date(runResponseObj.created_at)) {
          const contentBlocks = message.content
            .map((content) =>
              content.type === 'text' ? content.text!.value : `<${content.type} output>`,
            )
            .join('\n');

          outputBlocks.push(`[${toTitleCase(message.role)}] ${contentBlocks}`);
        }
      }

      // Process run steps to capture tool call details
      const steps = stepsResponse.data || [];
      for (const step of steps) {
        // Check if step is a tool call step with tool_calls array
        if (
          step.type === 'tool_calls' &&
          step.step_details &&
          typeof step.step_details === 'object' &&
          'tool_calls' in step.step_details &&
          Array.isArray(step.step_details.tool_calls)
        ) {
          const toolCalls = step.step_details.tool_calls;

          for (const toolCall of toolCalls) {
            if (toolCall.type === 'function' && toolCall.function) {
              outputBlocks.push(
                `[Call function ${toolCall.function.name} with arguments ${toolCall.function.arguments}]`,
              );
              if (toolCall.function.output) {
                outputBlocks.push(`[Function output: ${toolCall.function.output}]`);
              }
            } else if (
              toolCall.type &&
              toolCall.type === 'code_interpreter' &&
              toolCall.code_interpreter
            ) {
              const outputs = toolCall.code_interpreter.outputs || [];
              const input = toolCall.code_interpreter.input || '';

              const outputText =
                outputs
                  .map((output) =>
                    output.type === 'logs' ? output.logs : `<${output.type} output>`,
                  )
                  .join('\n') || '[No output]';

              outputBlocks.push(`[Code interpreter input]`);
              outputBlocks.push(input || '[No input]');
              outputBlocks.push(`[Code interpreter output]`);
              outputBlocks.push(outputText);
            } else if (toolCall.type && toolCall.type === 'file_search' && toolCall.file_search) {
              outputBlocks.push(`[Ran file search]`);
              outputBlocks.push(`[File search details: ${JSON.stringify(toolCall.file_search)}]`);
            } else if (toolCall.type && String(toolCall.type) === 'retrieval') {
              outputBlocks.push(`[Ran retrieval]`);
            } else {
              outputBlocks.push(`[Unknown tool call type: ${String(toolCall.type)}]`);
            }
          }
        }
      }

      return {
        output: outputBlocks.join('\n\n').trim(),
      };
    } catch (err: any) {
      logger.error(`Error processing run results: ${err}`);
      const errorMessage = err.message || String(err);

      return {
        error: `Error processing run results: ${errorMessage}`,
        retryable: this.isRetryableError('', errorMessage),
      };
    }
  }
}
