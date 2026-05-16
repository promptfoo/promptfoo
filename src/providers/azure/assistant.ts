import { createHmac } from 'crypto';

import { fetchWithCache, getCache, isCacheEnabled } from '../../cache';
import logger from '../../logger';
import { formatRateLimitErrorMessage, HttpRateLimitError } from '../../util/fetch/errors';
import { maybeLoadToolsFromExternalFile } from '../../util/index';
import invariant from '../../util/invariant';
import { safeJsonStringify } from '../../util/json';
import { sleep } from '../../util/time';
import { FunctionCallbackHandler } from '../functionCallbackUtils';
import { getRequestTimeoutMs, toTitleCase } from '../shared';
import {
  formatContentFilterResponse,
  isContentFilterError,
  isRateLimitError,
  isServiceError,
} from './errors';
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

type RequiredToolCalls = NonNullable<
  NonNullable<RunResponse['required_action']>['submit_tool_outputs']
>['tool_calls'];
type RequiredToolCall = RequiredToolCalls[number];
type FunctionToolCall = RequiredToolCall & {
  type: 'function';
  function: NonNullable<RequiredToolCall['function']>;
};
type RunStep = RunStepsResponse['data'][number];
type RunStepToolCall = NonNullable<NonNullable<RunStep['step_details']>['tool_calls']>[number];
type MessageContent = MessageListResponse['data'][number]['content'][number];

const AZURE_ASSISTANT_CACHE_KEY_HMAC_KEY = 'promptfoo-azure-assistant-cache-key-v1';

function normalizeAzureAssistantCacheValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    const normalized = value.map((item) => normalizeAzureAssistantCacheValue(item, seen));
    seen.delete(value);
    return normalized;
  }

  if (value && typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return value;
    }

    seen.add(value);
    const normalized = Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = normalizeAzureAssistantCacheValue((value as Record<string, unknown>)[key], seen);
        return acc;
      }, {});
    seen.delete(value);
    return normalized;
  }

  return value;
}

function hmacAzureAssistantCacheValue(value: unknown) {
  const serialized = safeJsonStringify(normalizeAzureAssistantCacheValue(value));
  invariant(
    serialized !== undefined,
    'Azure Assistant cache key input contains values that cannot be serialized',
  );

  return createHmac('sha256', AZURE_ASSISTANT_CACHE_KEY_HMAC_KEY).update(serialized).digest('hex');
}

function getAuthHeadersCacheIdentity(authHeaders: Record<string, string>) {
  const entries = Object.entries(authHeaders).sort(([nameA], [nameB]) =>
    nameA.localeCompare(nameB),
  );
  if (entries.length === 0) {
    return { headerNames: [], namespace: 'no-auth' };
  }

  return {
    headerNames: entries.map(([name]) => name),
    namespace: hmacAzureAssistantCacheValue(['auth', entries]),
  };
}

export class AzureAssistantProvider extends AzureGenericProvider {
  assistantConfig: AzureAssistantOptions;
  private functionCallbackHandler = new FunctionCallbackHandler();

  constructor(deploymentName: string, options: AzureAssistantProviderOptions = {}) {
    super(deploymentName, options);
    this.assistantConfig = options.config || {};
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
    const loadedTools = await maybeLoadToolsFromExternalFile(
      this.assistantConfig.tools,
      context?.vars,
    );
    const cacheKey = this.buildAssistantCacheKey(apiBaseUrl, apiVersion, prompt, loadedTools);
    const cachedResult = await this.getCachedAssistantResult(cacheKey, prompt);
    if (cachedResult) {
      return cachedResult;
    }

    // Execute the conversation flow
    try {
      const threadResponse = await this.createAssistantThread(apiBaseUrl, apiVersion, prompt);
      const runResponse = await this.createAssistantRun(
        apiBaseUrl,
        apiVersion,
        threadResponse.id,
        loadedTools,
      );
      const result = await this.executeAssistantRun(
        apiBaseUrl,
        apiVersion,
        threadResponse.id,
        runResponse.id,
      );
      await this.cacheAssistantResult(cacheKey, result, prompt);
      return result;
    } catch (err: any) {
      logger.error(`Error in Azure Assistant API call: ${err}`);
      return this.formatError(err);
    }
  }

  private buildAssistantCacheKey(
    apiBaseUrl: string,
    apiVersion: string,
    prompt: string,
    loadedTools: unknown,
  ): string {
    return `azure_assistant:${this.deploymentName}:${hmacAzureAssistantCacheValue({
      apiBaseUrl,
      apiVersion,
      auth: getAuthHeadersCacheIdentity(this.authHeaders ?? {}),
      instructions: this.assistantConfig.instructions,
      max_tokens: this.assistantConfig.max_tokens,
      model: this.assistantConfig.modelName,
      prompt,
      response_format: this.assistantConfig.response_format,
      temperature: this.assistantConfig.temperature,
      tool_choice: this.assistantConfig.tool_choice,
      tool_resources: this.assistantConfig.tool_resources,
      tools: loadedTools,
      top_p: this.assistantConfig.top_p,
    })}`;
  }

  private async getCachedAssistantResult(
    cacheKey: string,
    prompt: string,
  ): Promise<ProviderResponse | undefined> {
    if (!isCacheEnabled()) {
      return undefined;
    }

    try {
      const cache = await getCache();
      const cachedResult = await cache.get<ProviderResponse>(cacheKey);
      if (!cachedResult) {
        return undefined;
      }
      logger.debug('Cache hit for assistant prompt', { promptLength: prompt.length });
      return { ...cachedResult, cached: true };
    } catch (err) {
      logger.warn(`Error checking cache: ${err}`);
      return undefined;
    }
  }

  private async createAssistantThread(
    apiBaseUrl: string,
    apiVersion: string,
    prompt: string,
  ): Promise<ThreadResponse> {
    const threadResponse = await this.makeRequest<ThreadResponse>(
      `${apiBaseUrl}/openai/threads?api-version=${apiVersion}`,
      {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify({}),
      },
    );
    logger.debug('Created thread for assistant prompt', {
      threadId: threadResponse.id,
      promptLength: prompt.length,
    });
    await this.makeRequest(
      `${apiBaseUrl}/openai/threads/${threadResponse.id}/messages?api-version=${apiVersion}`,
      {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify({ role: 'user', content: prompt }),
      },
    );
    return threadResponse;
  }

  private buildAssistantRunOptions(loadedTools: unknown): Record<string, any> {
    const runOptions: Record<string, any> = { assistant_id: this.deploymentName };
    const maybeAssign = (key: string, value: unknown) => {
      if (value !== undefined && value !== null) {
        runOptions[key] = value;
      }
    };
    maybeAssign('temperature', this.assistantConfig.temperature);
    maybeAssign('top_p', this.assistantConfig.top_p);
    maybeAssign('tool_resources', this.assistantConfig.tool_resources);
    maybeAssign('tool_choice', this.assistantConfig.tool_choice);
    maybeAssign('model', this.assistantConfig.modelName);
    maybeAssign('instructions', this.assistantConfig.instructions);
    if (this.assistantConfig.tools && loadedTools !== undefined) {
      runOptions.tools = loadedTools;
    }
    return runOptions;
  }

  private async createAssistantRun(
    apiBaseUrl: string,
    apiVersion: string,
    threadId: string,
    loadedTools: unknown,
  ): Promise<RunResponse> {
    return this.makeRequest<RunResponse>(
      `${apiBaseUrl}/openai/threads/${threadId}/runs?api-version=${apiVersion}`,
      {
        method: 'POST',
        headers: await this.getHeaders(),
        body: JSON.stringify(this.buildAssistantRunOptions(loadedTools)),
      },
    );
  }

  private async executeAssistantRun(
    apiBaseUrl: string,
    apiVersion: string,
    threadId: string,
    runId: string,
  ): Promise<ProviderResponse> {
    if (this.hasFunctionToolCallbacks()) {
      return this.pollRunWithToolCallHandling(apiBaseUrl, apiVersion, threadId, runId);
    }

    const completedRun = await this.pollRun(apiBaseUrl, apiVersion, threadId, runId);
    if (completedRun.status === 'completed') {
      return this.processCompletedRun(apiBaseUrl, apiVersion, threadId, completedRun);
    }
    return this.formatFailedRun(completedRun);
  }

  private hasFunctionToolCallbacks(): boolean {
    return Boolean(
      this.assistantConfig.functionToolCallbacks &&
        Object.keys(this.assistantConfig.functionToolCallbacks).length > 0,
    );
  }

  private formatFailedRun(run: RunResponse): ProviderResponse {
    if (!run.last_error) {
      return { error: `Thread run failed with status: ${run.status}` };
    }

    const errorCode = run.last_error.code || '';
    const errorMessage = run.last_error.message || '';
    if (errorCode === 'content_filter' || isContentFilterError(errorMessage)) {
      return formatContentFilterResponse(errorMessage);
    }
    return { error: `Thread run failed: ${errorCode} - ${errorMessage}` };
  }

  private async cacheAssistantResult(
    cacheKey: string,
    result: ProviderResponse,
    prompt: string,
  ): Promise<void> {
    if (!isCacheEnabled() || result.error) {
      return;
    }

    try {
      const cache = await getCache();
      await cache.set(cacheKey, result);
      logger.debug('Cached assistant response for prompt', { promptLength: prompt.length });
    } catch (err) {
      logger.warn(`Error caching result: ${err}`);
    }
  }

  /**
   * Format error responses consistently
   */
  private formatError(err: any): ProviderResponse {
    const errorMessage = err?.message || String(err);

    // Structured rate-limit errors carry status, code, retry-after metadata.
    // Use them in preference to substring matching so we can distinguish a
    // hard quota (don't retry) from a per-window rate limit (retry-safe).
    // `metadata.rateLimitKind` lets the scheduler honor the same fail-fast
    // contract on the result path, even though we're folding the structured
    // error into a string here.
    if (err instanceof HttpRateLimitError) {
      return {
        error: formatRateLimitErrorMessage(err),
        metadata: { rateLimitKind: err.kind },
      };
    }

    if (isContentFilterError(errorMessage)) {
      return formatContentFilterResponse(errorMessage);
    }

    if (
      errorMessage.includes("Can't add messages to thread") &&
      errorMessage.includes('while a run')
    ) {
      return { error: `Error in Azure Assistant API call: ${errorMessage}` };
    }
    if (isRateLimitError(errorMessage)) {
      return { error: `Rate limit exceeded: ${errorMessage}` };
    }
    if (isServiceError(errorMessage)) {
      return { error: `Service error: ${errorMessage}` };
    }

    return { error: `Error in Azure Assistant API call: ${errorMessage}` };
  }

  /**
   * Helper method to make HTTP requests using fetchWithCache
   */
  private async makeRequest<T>(url: string, options: RequestInit): Promise<T> {
    const timeoutMs = this.assistantConfig.timeoutMs ?? getRequestTimeoutMs();
    const retries = this.assistantConfig.retryOptions?.maxRetries ?? 4;

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

        if (run.status === 'requires_action') {
          const actionResult = await this.handleRequiredToolAction(
            apiBaseUrl,
            apiVersion,
            threadId,
            runId,
            run,
            pollIntervalMs,
          );
          if (actionResult) {
            return actionResult;
          }
          if (!this.isSubmitToolOutputsAction(run)) {
            break;
          }
        } else if (['completed', 'failed', 'cancelled', 'expired'].includes(run.status)) {
          if (run.status !== 'completed') {
            return this.formatFailedRun(run);
          }
          break;
        }

        // Wait before polling again
        await sleep(pollIntervalMs);

        // Increase polling interval gradually for longer-running operations
        if (Date.now() - startTime > 30000) {
          // After 30 seconds
          pollIntervalMs = Math.min(pollIntervalMs * 1.5, 5000);
        }
      } catch (error: any) {
        // Route structured rate-limit errors through formatError so quota
        // vs per-window throttling produce distinct user-facing messages.
        // logger.warn (not error) since these are operator-actionable, not
        // unexpected failures.
        if (error instanceof HttpRateLimitError) {
          logger.warn(`Rate-limited while polling run status: ${error.message}`);
          return this.formatError(error);
        }

        logger.error(`Error polling run status: ${error}`);
        const errorMessage = error?.message || String(error);
        return {
          error: `Error polling run status: ${errorMessage}`,
        };
      }
    }

    // Process the completed run
    return await this.processCompletedRun(apiBaseUrl, apiVersion, threadId, runId);
  }

  private isSubmitToolOutputsAction(run: RunResponse): boolean {
    return Boolean(
      run.required_action?.type === 'submit_tool_outputs' &&
        run.required_action.submit_tool_outputs?.tool_calls,
    );
  }

  private async handleRequiredToolAction(
    apiBaseUrl: string,
    apiVersion: string,
    threadId: string,
    runId: string,
    run: RunResponse,
    pollIntervalMs: number,
  ): Promise<ProviderResponse | undefined> {
    if (!this.isSubmitToolOutputsAction(run)) {
      logger.error(`Unknown required action type: ${run.required_action?.type}`);
      return undefined;
    }

    const toolCalls = run.required_action!.submit_tool_outputs!.tool_calls;
    const functionCallsWithCallbacks = this.getFunctionCallsWithCallbacks(toolCalls);
    if (functionCallsWithCallbacks.length === 0) {
      return this.submitEmptyToolOutputs(
        apiBaseUrl,
        apiVersion,
        threadId,
        runId,
        toolCalls,
        pollIntervalMs,
      );
    }

    const toolOutputs = await this.buildToolOutputs(threadId, runId, functionCallsWithCallbacks);
    if (toolOutputs.length === 0) {
      logger.error('No valid tool outputs to submit');
      return undefined;
    }
    return this.submitToolOutputs(apiBaseUrl, apiVersion, threadId, runId, toolOutputs);
  }

  private getFunctionCallsWithCallbacks(toolCalls: RequiredToolCalls): FunctionToolCall[] {
    return toolCalls.filter((toolCall): toolCall is FunctionToolCall => {
      return Boolean(
        toolCall.type === 'function' &&
          toolCall.function &&
          toolCall.function.name in (this.assistantConfig.functionToolCallbacks ?? {}),
      );
    });
  }

  private async submitEmptyToolOutputs(
    apiBaseUrl: string,
    apiVersion: string,
    threadId: string,
    runId: string,
    toolCalls: RequiredToolCalls,
    pollIntervalMs: number,
  ): Promise<ProviderResponse | undefined> {
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

    const submissionResult = await this.submitToolOutputs(
      apiBaseUrl,
      apiVersion,
      threadId,
      runId,
      emptyOutputs,
      'empty',
    );
    if (submissionResult) {
      return submissionResult;
    }
    await sleep(pollIntervalMs);
    return undefined;
  }

  private async buildToolOutputs(threadId: string, runId: string, toolCalls: FunctionToolCall[]) {
    const callbackContext: CallbackContext = {
      threadId,
      runId,
      assistantId: this.deploymentName,
      provider: 'azure',
    };
    return Promise.all(
      toolCalls.map(async (toolCall) => {
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

  private async submitToolOutputs(
    apiBaseUrl: string,
    apiVersion: string,
    threadId: string,
    runId: string,
    toolOutputs: Array<{ tool_call_id: string; output: string }>,
    label = '',
  ): Promise<ProviderResponse | undefined> {
    try {
      logger.debug(`Submitting tool outputs: ${JSON.stringify(toolOutputs)}`);
      await this.makeRequest(
        `${apiBaseUrl}/openai/threads/${threadId}/runs/${runId}/submit_tool_outputs?api-version=${apiVersion}`,
        {
          method: 'POST',
          headers: await this.getHeaders(),
          body: JSON.stringify({ tool_outputs: toolOutputs }),
        },
      );
      return undefined;
    } catch (error: any) {
      const prefix = label ? `${label} ` : '';
      logger.error(`Error submitting ${prefix}tool outputs: ${error.message}`);
      return { error: `Error submitting ${prefix}tool outputs: ${error.message}` };
    }
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
      const runId = this.getCompletedRunId(runIdOrResponse);
      await this.ensureCompletedRunLoaded(apiBaseUrl, apiVersion, threadId, runIdOrResponse, runId);
      const [messagesResponse, stepsResponse] = await Promise.all([
        this.fetchCompletedRunMessages(apiBaseUrl, apiVersion, threadId),
        this.fetchCompletedRunSteps(apiBaseUrl, apiVersion, threadId, runId),
      ]);
      return {
        output: this.buildCompletedRunOutput(messagesResponse, stepsResponse),
      };
    } catch (err: any) {
      logger.error(`Error processing run results: ${err}`);
      const errorMessage = err.message || String(err);

      return {
        error: `Error processing run results: ${errorMessage}`,
      };
    }
  }

  private getCompletedRunId(runIdOrResponse: string | RunResponse): string {
    return typeof runIdOrResponse === 'string' ? runIdOrResponse : runIdOrResponse.id;
  }

  private async ensureCompletedRunLoaded(
    apiBaseUrl: string,
    apiVersion: string,
    threadId: string,
    runIdOrResponse: string | RunResponse,
    runId: string,
  ): Promise<void> {
    if (typeof runIdOrResponse !== 'string') {
      return;
    }

    await this.makeRequest<RunResponse>(
      `${apiBaseUrl}/openai/threads/${threadId}/runs/${runId}?api-version=${apiVersion}`,
      {
        method: 'GET',
        headers: await this.getHeaders(),
      },
    );
  }

  private async fetchCompletedRunMessages(
    apiBaseUrl: string,
    apiVersion: string,
    threadId: string,
  ): Promise<MessageListResponse> {
    return this.makeRequest<MessageListResponse>(
      `${apiBaseUrl}/openai/threads/${threadId}/messages?api-version=${apiVersion}`,
      {
        method: 'GET',
        headers: await this.getHeaders(),
      },
    );
  }

  private async fetchCompletedRunSteps(
    apiBaseUrl: string,
    apiVersion: string,
    threadId: string,
    runId: string,
  ): Promise<RunStepsResponse> {
    return this.makeRequest<RunStepsResponse>(
      `${apiBaseUrl}/openai/threads/${threadId}/runs/${runId}/steps?api-version=${apiVersion}`,
      {
        method: 'GET',
        headers: await this.getHeaders(),
      },
    );
  }

  private buildCompletedRunOutput(
    messagesResponse: MessageListResponse,
    stepsResponse: RunStepsResponse,
  ): string {
    const allMessages = [...messagesResponse.data].sort((a, b) => a.created_at - b.created_at);
    const outputBlocks = [
      ...this.buildUserMessageBlocks(allMessages),
      ...this.buildAssistantMessageBlocks(allMessages),
    ];
    const toolCallBlocks = this.buildToolCallBlocks(stepsResponse.data || []);
    this.insertToolCallBlocks(outputBlocks, toolCallBlocks);
    return outputBlocks.join('\n\n').trim();
  }

  private buildUserMessageBlocks(messages: MessageListResponse['data']): string[] {
    const userMessage = messages.find((message) => message.role === 'user');
    if (!userMessage) {
      return [];
    }
    return [`[User] ${this.formatMessageContent(userMessage.content, false)}`];
  }

  private buildAssistantMessageBlocks(messages: MessageListResponse['data']): string[] {
    return messages
      .filter((message) => message.role === 'assistant')
      .map(
        (message) =>
          `[${toTitleCase(message.role)}] ${this.formatMessageContent(message.content, true)}`,
      );
  }

  private formatMessageContent(content: MessageContent[], assumeText = false): string {
    return content
      .map((item) => {
        if (item.type === 'text' && item.text) {
          return item.text.value;
        }
        if (assumeText && item.type === 'text') {
          return '';
        }
        return `<${item.type} output>`;
      })
      .join('\n');
  }

  private buildToolCallBlocks(steps: RunStep[]): string[] {
    return steps.flatMap((step) => this.buildToolCallBlocksForStep(step));
  }

  private buildToolCallBlocksForStep(step: RunStep): string[] {
    if (!this.isToolCallStep(step)) {
      return [];
    }
    return step.step_details!.tool_calls!.flatMap((toolCall) => this.formatToolCall(toolCall));
  }

  private isToolCallStep(step: RunStep): boolean {
    return Boolean(
      step.type === 'tool_calls' &&
        step.step_details &&
        typeof step.step_details === 'object' &&
        'tool_calls' in step.step_details &&
        Array.isArray(step.step_details.tool_calls),
    );
  }

  private formatToolCall(toolCall: RunStepToolCall): string[] {
    if (toolCall.type === 'function' && toolCall.function) {
      return this.formatFunctionToolCall(toolCall.function);
    }
    if (toolCall.type === 'code_interpreter' && toolCall.code_interpreter) {
      return this.formatCodeInterpreterToolCall(toolCall.code_interpreter);
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

  private formatFunctionToolCall(functionCall: NonNullable<RunStepToolCall['function']>): string[] {
    const blocks = [
      `[Call function ${functionCall.name} with arguments ${functionCall.arguments}]`,
    ];
    if (functionCall.output) {
      blocks.push(`[Function output: ${functionCall.output}]`);
    }
    return blocks;
  }

  private formatCodeInterpreterToolCall(
    codeInterpreter: NonNullable<RunStepToolCall['code_interpreter']>,
  ): string[] {
    const outputText =
      codeInterpreter.outputs
        .map((output) => (output.type === 'logs' ? output.logs : `<${output.type} output>`))
        .join('\n') || '[No output]';

    return [
      '[Code interpreter input]',
      codeInterpreter.input || '[No input]',
      '[Code interpreter output]',
      outputText,
    ];
  }

  private insertToolCallBlocks(outputBlocks: string[], toolCallBlocks: string[]): void {
    const assistantBlockIndex = outputBlocks.findIndex((block) => block.startsWith('[Assistant]'));
    if (assistantBlockIndex > 0) {
      outputBlocks.splice(assistantBlockIndex, 0, ...toolCallBlocks);
      return;
    }
    outputBlocks.push(...toolCallBlocks);
  }
}
