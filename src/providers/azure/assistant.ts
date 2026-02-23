import { fetchWithCache, getCache, isCacheEnabled } from '../../cache';
import logger from '../../logger';
import { maybeLoadToolsFromExternalFile } from '../../util/index';
import invariant from '../../util/invariant';
import { sleep } from '../../util/time';
import { FunctionCallbackHandler } from '../functionCallbackUtils';
import { REQUEST_TIMEOUT_MS, toTitleCase } from '../shared';
import { AzureGenericProvider } from './generic';

import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { CallbackContext } from '../openai/types';
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
  private functionCallbackHandler = new FunctionCallbackHandler();

  constructor(deploymentName: string, options: AzureAssistantProviderOptions = {}) {
    super(deploymentName, options);
    this.assistantConfig = options.config || {};
  }

  /**
   * Build run options from the assistant configuration.
   */
  private async buildRunOptions(context?: CallApiContextParams): Promise<Record<string, any>> {
    const runOptions: Record<string, any> = {
      assistant_id: this.deploymentName,
    };

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
      const loadedTools = await maybeLoadToolsFromExternalFile(
        this.assistantConfig.tools,
        context?.vars,
      );
      if (loadedTools !== undefined) {
        runOptions.tools = loadedTools;
      }
    }
    if (this.assistantConfig.modelName) {
      runOptions.model = this.assistantConfig.modelName;
    }
    if (this.assistantConfig.instructions) {
      runOptions.instructions = this.assistantConfig.instructions;
    }

    return runOptions;
  }

  /**
   * Resolve a non-completed run to a ProviderResponse.
   */
  private resolveFailedRun(run: RunResponse): ProviderResponse {
    if (run.last_error) {
      const errorCode = run.last_error.code || '';
      const errorMessage = run.last_error.message || '';

      if (errorCode === 'content_filter' || this.isContentFilterError(errorMessage)) {
        return this.buildContentFilterResponse(errorMessage);
      }
      return { error: `Thread run failed: ${errorCode} - ${errorMessage}` };
    }
    return { error: `Thread run failed with status: ${run.status}` };
  }

  /**
   * Build the content filter guardrail response from an error message.
   */
  private buildContentFilterResponse(errorMessage: string): ProviderResponse {
    const lowerErrorMessage = errorMessage.toLowerCase();
    const isInputFiltered =
      lowerErrorMessage.includes('prompt') || lowerErrorMessage.includes('input');
    const flaggedOutput = !isInputFiltered;

    return {
      output:
        "The generated content was filtered due to triggering Azure OpenAI Service's content filtering system.",
      guardrails: {
        flagged: true,
        flaggedInput: isInputFiltered,
        flaggedOutput,
      },
    };
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    await this.ensureInitialized();
    invariant(this.authHeaders, 'auth headers are not initialized');

    const apiBaseUrl = this.getApiBaseUrl();
    if (!apiBaseUrl) {
      throw new Error('Azure API host must be set.');
    }

    if (!this.authHeaders['api-key'] && !this.authHeaders.Authorization) {
      throw new Error(
        'Azure API authentication failed. Set AZURE_API_KEY environment variable or configure apiKey in provider config.\n' +
          'You can also use Microsoft Entra ID authentication.',
      );
    }

    const apiVersion = this.assistantConfig.apiVersion || '2024-04-01-preview';

    // Create a simple cache key based on the input and configuration
    const cacheKey = `azure_assistant:${this.deploymentName}:${JSON.stringify({
      apiVersion,
      instructions: this.assistantConfig.instructions,
      max_tokens: this.assistantConfig.max_tokens,
      model: this.assistantConfig.modelName,
      prompt,
      response_format: this.assistantConfig.response_format,
      temperature: this.assistantConfig.temperature,
      tool_choice: this.assistantConfig.tool_choice,
      tool_resources: this.assistantConfig.tool_resources,
      tools: JSON.stringify(
        await maybeLoadToolsFromExternalFile(this.assistantConfig.tools, context?.vars),
      ),
      top_p: this.assistantConfig.top_p,
    })}`;

    // Check the cache if enabled
    if (isCacheEnabled()) {
      try {
        const cache = await getCache();
        const cachedResult = await cache.get<ProviderResponse>(cacheKey);

        if (cachedResult) {
          logger.debug(`Cache hit for assistant prompt: ${prompt.substring(0, 50)}...`);
          return { ...cachedResult, cached: true };
        }
      } catch (err) {
        logger.warn(`Error checking cache: ${err}`);
        // Continue if cache check fails
      }
    }

    // Execute the conversation flow
    try {
      // Create a thread
      const threadResponse = await this.makeRequest<ThreadResponse>(
        `${apiBaseUrl}/openai/threads?api-version=${apiVersion}`,
        {
          method: 'POST',
          headers: await this.getHeaders(),
          body: JSON.stringify({}),
        },
      );

      logger.debug(`Created thread ${threadResponse.id} for prompt: ${prompt.substring(0, 30)}...`);

      // Create a message
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

      const runOptions = await this.buildRunOptions(context);

      // Create a run
      const runResponse = await this.makeRequest<RunResponse>(
        `${apiBaseUrl}/openai/threads/${threadResponse.id}/runs?api-version=${apiVersion}`,
        {
          method: 'POST',
          headers: await this.getHeaders(),
          body: JSON.stringify(runOptions),
        },
      );

      // Handle function calls if needed or poll for completion
      let result: ProviderResponse;
      if (
        this.assistantConfig.functionToolCallbacks &&
        Object.keys(this.assistantConfig.functionToolCallbacks).length > 0
      ) {
        result = await this.pollRunWithToolCallHandling(
          apiBaseUrl,
          apiVersion,
          threadResponse.id,
          runResponse.id,
        );
      } else {
        const completedRun = await this.pollRun(
          apiBaseUrl,
          apiVersion,
          threadResponse.id,
          runResponse.id,
        );

        if (completedRun.status === 'completed') {
          result = await this.processCompletedRun(
            apiBaseUrl,
            apiVersion,
            threadResponse.id,
            completedRun,
          );
        } else {
          result = this.resolveFailedRun(completedRun);
        }
      }

      // Cache successful results if caching is enabled
      if (isCacheEnabled() && !result.error) {
        try {
          const cache = await getCache();
          await cache.set(cacheKey, result);
          logger.debug(`Cached assistant response for prompt: ${prompt.substring(0, 50)}...`);
        } catch (err) {
          logger.warn(`Error caching result: ${err}`);
          // Continue even if caching fails
        }
      }

      return result;
    } catch (err: any) {
      logger.error(`Error in Azure Assistant API call: ${err}`);
      return this.formatError(err);
    }
  }

  /**
   * Format error responses consistently
   */
  private formatError(err: any): ProviderResponse {
    const errorMessage = err.message || String(err);

    // Handle content filter errors
    if (this.isContentFilterError(errorMessage)) {
      const lowerErrorMessage = errorMessage.toLowerCase();
      const isInputFiltered =
        lowerErrorMessage.includes('prompt') || lowerErrorMessage.includes('input');
      const isOutputFiltered =
        lowerErrorMessage.includes('output') || lowerErrorMessage.includes('response');

      return {
        output:
          "The generated content was filtered due to triggering Azure OpenAI Service's content filtering system.",
        guardrails: {
          flagged: true,
          flaggedInput: isInputFiltered,
          flaggedOutput: isOutputFiltered || (!isInputFiltered && !isOutputFiltered), // Default to output if neither is explicitly mentioned
        },
      };
    }

    // Format specific error types
    if (
      errorMessage.includes("Can't add messages to thread") &&
      errorMessage.includes('while a run')
    ) {
      return { error: `Error in Azure Assistant API call: ${errorMessage}` };
    }
    if (this.isRateLimitError(errorMessage)) {
      return { error: `Rate limit exceeded: ${errorMessage}` };
    }
    if (this.isServiceError(errorMessage)) {
      return { error: `Service error: ${errorMessage}` };
    }

    return { error: `Error in Azure Assistant API call: ${errorMessage}` };
  }

  /**
   * Helper method to make HTTP requests using fetchWithCache
   */
  private async makeRequest<T>(url: string, options: RequestInit): Promise<T> {
    const timeoutMs = this.assistantConfig.timeoutMs || REQUEST_TIMEOUT_MS;
    const retries = this.assistantConfig.retryOptions?.maxRetries || 4;

    // These operations should never be cached
    const shouldBustCache =
      // Polling operations for run status
      (url.includes('/runs/') && options.method === 'GET') ||
      // Thread creation - always create a fresh thread
      (url.includes('/threads') &&
        options.method === 'POST' &&
        !url.includes('/messages') &&
        !url.includes('submit_tool_outputs'));

    try {
      const result = await fetchWithCache<T>(
        url,
        options,
        timeoutMs,
        'json',
        shouldBustCache,
        retries,
      );

      // Ensure we have a result
      if (!result) {
        throw new Error(`Empty response received from API endpoint: ${url}`);
      }

      if (result.status < 200 || result.status >= 300) {
        // For error responses, delete from cache to avoid reusing
        await result.deleteFromCache?.();

        // Check for content filter errors in the response data
        if (result.data && typeof result.data === 'object' && 'error' in result.data) {
          const errorData = result.data as any;
          if (errorData.error?.code === 'content_filter') {
            throw new Error(`Content filter triggered: ${errorData.error.message}`);
          }
        }

        // Handle error response
        throw new Error(
          `API error: ${result.status} ${result.statusText}${
            result.data && typeof result.data === 'object' && 'error' in result.data
              ? `: ${(result.data as any).error?.message || JSON.stringify(result.data)}`
              : typeof result.data === 'string'
                ? `: ${result.data}`
                : ''
          }`,
        );
      }

      // Ensure result.data exists before returning it
      if (result.data === undefined || result.data === null) {
        throw new Error(`Received null or undefined data from API endpoint: ${url}`);
      }

      // Result data is already parsed as JSON by fetchWithCache
      return result.data;
    } catch (error: any) {
      logger.error(`Request failed: ${error.message}`);
      throw error;
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
  private isContentFilterError(errorMessage: string): boolean {
    const lowerErrorMessage = errorMessage.toLowerCase();
    return (
      lowerErrorMessage.includes('content_filter') ||
      lowerErrorMessage.includes('content filter') ||
      lowerErrorMessage.includes('filtered due to') ||
      lowerErrorMessage.includes('content filtering') ||
      lowerErrorMessage.includes('inappropriate content') ||
      lowerErrorMessage.includes('safety guidelines') ||
      lowerErrorMessage.includes('guardrail')
    );
  }

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
   * Execute function callbacks for the given tool calls and return tool outputs.
   */
  private async executeToolCallbacks(
    toolCalls: NonNullable<
      NonNullable<RunResponse['required_action']>['submit_tool_outputs']
    >['tool_calls'],
    threadId: string,
    runId: string,
  ): Promise<Array<{ tool_call_id: string; output: string }>> {
    const callbackContext: CallbackContext = {
      threadId,
      runId,
      assistantId: this.deploymentName,
      provider: 'azure',
    };

    const functionCallsWithCallbacks = toolCalls.filter(
      (toolCall) =>
        toolCall.type === 'function' &&
        toolCall.function &&
        toolCall.function.name in (this.assistantConfig.functionToolCallbacks ?? {}),
    );

    return Promise.all(
      functionCallsWithCallbacks.map(async (toolCall) => {
        const functionName = toolCall.function!.name;
        const functionArgs = toolCall.function!.arguments;
        try {
          logger.debug(`Calling function ${functionName} with args: ${functionArgs}`);
          const result = await this.functionCallbackHandler.processCall(
            { name: functionName, arguments: functionArgs },
            this.assistantConfig.functionToolCallbacks,
            callbackContext,
          );
          if (result.isError) {
            throw new Error('Function callback failed');
          }
          logger.debug(`Function ${functionName} result: ${result.output}`);
          return { tool_call_id: toolCall.id, output: result.output };
        } catch (error) {
          logger.error(`Error calling function ${functionName}: ${error}`);
          return {
            tool_call_id: toolCall.id,
            output: JSON.stringify({
              error: `Error in ${functionName}: ${error instanceof Error ? error.message : String(error)}`,
            }),
          };
        }
      }),
    );
  }

  /**
   * Handle a run that requires a tool_outputs action.
   * Returns null to continue polling, or a ProviderResponse if we should stop.
   */
  private async handleToolOutputsAction(
    apiBaseUrl: string,
    apiVersion: string,
    threadId: string,
    runId: string,
    toolCalls: NonNullable<
      NonNullable<RunResponse['required_action']>['submit_tool_outputs']
    >['tool_calls'],
    pollIntervalMs: number,
  ): Promise<ProviderResponse | null> {
    const submitUrl = `${apiBaseUrl}/openai/threads/${threadId}/runs/${runId}/submit_tool_outputs?api-version=${apiVersion}`;

    const hasMatchingCallbacks = toolCalls.some(
      (tc) =>
        tc.type === 'function' &&
        tc.function &&
        tc.function.name in (this.assistantConfig.functionToolCallbacks ?? {}),
    );

    if (!hasMatchingCallbacks) {
      logger.debug(
        `No matching callbacks found for tool calls. Available functions: ${Object.keys(
          this.assistantConfig.functionToolCallbacks || {},
        ).join(', ')}. Tool calls: ${JSON.stringify(toolCalls)}`,
      );
      const emptyOutputs = toolCalls.map((toolCall) => ({
        tool_call_id: toolCall.id,
        output: JSON.stringify({
          message: `No callback registered for function ${toolCall.type === 'function' ? toolCall.function?.name : toolCall.type}`,
        }),
      }));
      try {
        await this.makeRequest(submitUrl, {
          method: 'POST',
          headers: await this.getHeaders(),
          body: JSON.stringify({ tool_outputs: emptyOutputs }),
        });
        await sleep(pollIntervalMs);
        return null; // continue polling
      } catch (error: any) {
        logger.error(`Error submitting empty tool outputs: ${error.message}`);
        return { error: `Error submitting empty tool outputs: ${error.message}` };
      }
    }

    const toolOutputs = await this.executeToolCallbacks(toolCalls, threadId, runId);
    const validToolOutputs = toolOutputs.filter((output) => output !== null);
    if (validToolOutputs.length === 0) {
      logger.error('No valid tool outputs to submit');
      return { error: 'No valid tool outputs to submit' };
    }

    logger.debug(`Submitting tool outputs: ${JSON.stringify(validToolOutputs)}`);
    try {
      await this.makeRequest(submitUrl, {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify({ tool_outputs: validToolOutputs }),
      });
      return null; // continue polling
    } catch (error: any) {
      logger.error(`Error submitting tool outputs: ${error.message}`);
      return { error: `Error submitting tool outputs: ${error.message}` };
    }
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
    const maxPollTime = this.assistantConfig.maxPollTimeMs || 300000;
    const startTime = Date.now();
    let pollIntervalMs = 1000;

    while (true) {
      if (Date.now() - startTime > maxPollTime) {
        return {
          error: `Run polling timed out after ${maxPollTime}ms. The operation may still be in progress.`,
        };
      }

      try {
        const run = await this.makeRequest<RunResponse>(
          `${apiBaseUrl}/openai/threads/${threadId}/runs/${runId}?api-version=${apiVersion}`,
          { method: 'GET', headers: await this.getHeaders() },
        );

        logger.debug(`Run status: ${run.status}`);

        if (run.status === 'requires_action') {
          if (
            run.required_action?.type === 'submit_tool_outputs' &&
            run.required_action.submit_tool_outputs?.tool_calls
          ) {
            const actionResult = await this.handleToolOutputsAction(
              apiBaseUrl,
              apiVersion,
              threadId,
              runId,
              run.required_action.submit_tool_outputs.tool_calls,
              pollIntervalMs,
            );
            if (actionResult !== null) {
              return actionResult;
            }
          } else {
            logger.error(`Unknown required action type: ${run.required_action?.type}`);
            break;
          }
        } else if (['completed', 'failed', 'cancelled', 'expired'].includes(run.status)) {
          if (run.status !== 'completed') {
            return this.resolveFailedRun(run);
          }
          break;
        }

        await sleep(pollIntervalMs);
        if (Date.now() - startTime > 30000) {
          pollIntervalMs = Math.min(pollIntervalMs * 1.5, 5000);
        }
      } catch (error: any) {
        logger.error(`Error polling run status: ${error}`);
        const errorMessage = error.message || String(error);
        return { error: `Error polling run status: ${errorMessage}` };
      }
    }

    return await this.processCompletedRun(apiBaseUrl, apiVersion, threadId, runId);
  }

  /**
   * Format a single tool call into text blocks for the output.
   */
  private formatToolCallStep(
    toolCall: NonNullable<
      NonNullable<RunStepsResponse['data'][0]['step_details']>['tool_calls']
    >[0],
  ): string[] {
    if (toolCall.type === 'function' && toolCall.function) {
      const blocks = [
        `[Call function ${toolCall.function.name} with arguments ${toolCall.function.arguments}]`,
      ];
      if (toolCall.function.output) {
        blocks.push(`[Function output: ${toolCall.function.output}]`);
      }
      return blocks;
    }

    if (toolCall.type === 'code_interpreter' && toolCall.code_interpreter) {
      const outputs = toolCall.code_interpreter.outputs || [];
      const input = toolCall.code_interpreter.input || '';
      const outputText =
        outputs
          .map((output: { type: string; logs?: string }) =>
            output.type === 'logs' ? output.logs : `<${output.type} output>`,
          )
          .join('\n') || '[No output]';

      return [
        '[Code interpreter input]',
        input || '[No input]',
        '[Code interpreter output]',
        outputText,
      ];
    }

    if (toolCall.type === 'file_search' && toolCall.file_search) {
      return [
        '[Ran file search]',
        `[File search details: ${JSON.stringify(toolCall.file_search)}]`,
      ];
    }

    if (toolCall.type && String(toolCall.type) === 'retrieval') {
      return ['[Ran retrieval]'];
    }

    return [`[Unknown tool call type: ${String(toolCall.type)}]`];
  }

  /**
   * Extract tool call text blocks from run steps.
   */
  private extractToolCallBlocks(stepsResponse: RunStepsResponse): string[] {
    const toolCallBlocks: string[] = [];
    for (const step of stepsResponse.data || []) {
      if (
        step.type === 'tool_calls' &&
        step.step_details &&
        typeof step.step_details === 'object' &&
        'tool_calls' in step.step_details &&
        Array.isArray(step.step_details.tool_calls)
      ) {
        for (const toolCall of step.step_details.tool_calls) {
          toolCallBlocks.push(...this.formatToolCallStep(toolCall));
        }
      }
    }
    return toolCallBlocks;
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

      // Fetch run info only if given a string ID
      if (typeof runIdOrResponse === 'string') {
        await this.makeRequest<RunResponse>(
          `${apiBaseUrl}/openai/threads/${threadId}/runs/${runId}?api-version=${apiVersion}`,
          { method: 'GET', headers: await this.getHeaders() },
        );
      }

      const messagesResponse = await this.makeRequest<MessageListResponse>(
        `${apiBaseUrl}/openai/threads/${threadId}/messages?api-version=${apiVersion}`,
        { method: 'GET', headers: await this.getHeaders() },
      );

      const stepsResponse = await this.makeRequest<RunStepsResponse>(
        `${apiBaseUrl}/openai/threads/${threadId}/runs/${runId}/steps?api-version=${apiVersion}`,
        { method: 'GET', headers: await this.getHeaders() },
      );

      const allMessages = messagesResponse.data.sort((a, b) => a.created_at - b.created_at);
      const outputBlocks: string[] = [];

      const userMessage = allMessages.find((message) => message.role === 'user');
      if (userMessage) {
        const userContent = userMessage.content
          .map((content: { type: string; text?: { value: string } }) =>
            content.type === 'text' && content.text
              ? content.text.value
              : `<${content.type} output>`,
          )
          .join('\n');
        outputBlocks.push(`[User] ${userContent}`);
      }

      const assistantMessages = allMessages.filter((message) => message.role === 'assistant');
      for (const message of assistantMessages) {
        const contentBlocks = message.content
          .map((content: { type: string; text?: { value: string } }) =>
            content.type === 'text' ? content.text!.value : `<${content.type} output>`,
          )
          .join('\n');
        outputBlocks.push(`[${toTitleCase(message.role)}] ${contentBlocks}`);
      }

      const toolCallBlocks = this.extractToolCallBlocks(stepsResponse);

      // Insert tool call blocks before the first assistant message
      const assistantBlockIndex = outputBlocks.findIndex((block) =>
        block.startsWith('[Assistant]'),
      );
      if (assistantBlockIndex > 0) {
        outputBlocks.splice(assistantBlockIndex, 0, ...toolCallBlocks);
      } else {
        outputBlocks.push(...toolCallBlocks);
      }

      return { output: outputBlocks.join('\n\n').trim() };
    } catch (err: any) {
      logger.error(`Error processing run results: ${err}`);
      const errorMessage = err.message || String(err);
      return { error: `Error processing run results: ${errorMessage}` };
    }
  }
}
