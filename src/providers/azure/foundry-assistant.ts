import path from 'path';

import { DefaultAzureCredential } from '@azure/identity';
import { getCache, isCacheEnabled } from '../../cache';
import cliState from '../../cliState';
import { importModule } from '../../esm';
import logger from '../../logger';
import { maybeLoadToolsFromExternalFile } from '../../util';
import { isJavascriptFile } from '../../util/fileExtensions';
import { sleep } from '../../util/time';
import { toTitleCase } from '../shared';
import { AzureGenericProvider } from './generic';

import type { CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../../types';
import type { CallbackContext } from '../openai/types';
import type { AzureAssistantOptions, AzureAssistantProviderOptions } from './types';

// Azure AI Projects SDK types
interface AIProjectClient {
  agents: {
    getAgent(assistantId: string): Promise<Agent>;
    threads: {
      create(): Promise<Thread>;
    };
    messages: {
      create(threadId: string, role: string, content: string): Promise<Message>;
      list(threadId: string, options?: { order: string }): AsyncIterable<Message>;
    };
    runs: {
      create(threadId: string, assistantId: string, options?: any): Promise<Run>;
      get(threadId: string, runId: string): Promise<Run>;
      submitToolOutputs(threadId: string, runId: string, toolOutputs: ToolOutput[]): Promise<Run>;
    };
  };
}

interface Agent {
  id: string;
  name: string;
}

interface Thread {
  id: string;
}

interface Message {
  id: string;
  role: string;
  content: Array<{
    type: string;
    text?: {
      value: string;
    };
  }>;
}

interface Run {
  id: string;
  status: string;
  lastError?: {
    code: string;
    message: string;
  };
  requiredAction?: {
    type: string;
    submitToolOutputs?: {
      toolCalls: Array<{
        id: string;
        type: string;
        function?: {
          name: string;
          arguments: string;
        };
      }>;
    };
  };
}

interface ToolOutput {
  toolCallId: string;
  output: string;
}

export class AzureFoundryAssistantProvider extends AzureGenericProvider {
  assistantConfig: AzureAssistantOptions;
  private loadedFunctionCallbacks: Record<string, Function> = {};
  private projectClient: AIProjectClient | null = null;
  private projectUrl: string;

  constructor(deploymentName: string, options: AzureAssistantProviderOptions = {}) {
    super(deploymentName, options);
    this.assistantConfig = options.config || {};

    // Extract project URL from options or use environment variable
    this.projectUrl = options.projectUrl || process.env.AZURE_AI_PROJECT_URL || '';

    if (!this.projectUrl) {
      throw new Error(
        'Azure AI Project URL must be provided via projectUrl option or AZURE_AI_PROJECT_URL environment variable',
      );
    }

    // Preload function callbacks if available
    if (this.assistantConfig.functionToolCallbacks) {
      this.preloadFunctionCallbacks();
    }
  }

  /**
   * Initialize the Azure AI Project client
   */
  private async initializeClient() {
    if (this.projectClient) {
      return this.projectClient;
    }

    try {
      // Dynamic import to avoid bundling issues
      const { AIProjectClient } = await import('@azure/ai-projects');

      // Patch: Ensure type compatibility for Agent.name (string | null -> string)
      // @ts-expect-error: Suppress type incompatibility due to upstream SDK types
      this.projectClient = new AIProjectClient(this.projectUrl, new DefaultAzureCredential());

      logger.debug('Azure AI Project client initialized successfully');
      return this.projectClient;
    } catch (error) {
      logger.error(
        `Failed to initialize Azure AI Project client: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new Error(
        `Failed to initialize Azure AI Project client: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Preloads all function callbacks to ensure they're ready when needed
   */
  private async preloadFunctionCallbacks() {
    if (!this.assistantConfig.functionToolCallbacks) {
      return;
    }

    const callbacks = this.assistantConfig.functionToolCallbacks;
    for (const [name, callback] of Object.entries(callbacks)) {
      try {
        if (typeof callback === 'string') {
          // Check if it's a file reference
          const callbackStr: string = callback;
          if (callbackStr.startsWith('file://')) {
            const fn = await this.loadExternalFunction(callbackStr);
            this.loadedFunctionCallbacks[name] = fn;
            logger.debug(`Successfully preloaded function callback '${name}' from file`);
          } else {
            // It's an inline function string
            this.loadedFunctionCallbacks[name] = new Function('return ' + callbackStr)();
            logger.debug(`Successfully preloaded inline function callback '${name}'`);
          }
        } else if (typeof callback === 'function') {
          this.loadedFunctionCallbacks[name] = callback;
          logger.debug(`Successfully stored function callback '${name}'`);
        }
      } catch (error) {
        logger.error(`Failed to preload function callback '${name}': ${error}`);
      }
    }
  }

  /**
   * Loads a function from an external file
   * @param fileRef The file reference in the format 'file://path/to/file:functionName'
   * @returns The loaded function
   */
  private async loadExternalFunction(fileRef: string): Promise<Function> {
    let filePath = fileRef.slice('file://'.length);
    let functionName: string | undefined;

    if (filePath.includes(':')) {
      const splits = filePath.split(':');
      if (splits[0] && isJavascriptFile(splits[0])) {
        [filePath, functionName] = splits;
      }
    }

    try {
      const resolvedPath = path.resolve(cliState.basePath || '', filePath);
      logger.debug(
        `Loading function from ${resolvedPath}${functionName ? `:${functionName}` : ''}`,
      );

      const requiredModule = await importModule(resolvedPath, functionName);

      if (typeof requiredModule === 'function') {
        return requiredModule;
      } else if (
        requiredModule &&
        typeof requiredModule === 'object' &&
        functionName &&
        functionName in requiredModule
      ) {
        const fn = requiredModule[functionName];
        if (typeof fn === 'function') {
          return fn;
        }
      }

      throw new Error(
        `Function callback malformed: ${filePath} must export ${
          functionName
            ? `a named function '${functionName}'`
            : 'a function or have a default export as a function'
        }`,
      );
    } catch (error: any) {
      throw new Error(`Error loading function from ${filePath}: ${error.message || String(error)}`);
    }
  }

  /**
   * Executes a function callback with proper error handling
   */
  private async executeFunctionCallback(
    functionName: string,
    args: string,
    context?: CallbackContext,
  ): Promise<string> {
    try {
      // Check if we've already loaded this function
      let callback = this.loadedFunctionCallbacks[functionName];

      // If not loaded yet, try to load it now
      if (!callback) {
        const callbackRef = this.assistantConfig.functionToolCallbacks?.[functionName];

        if (callbackRef && typeof callbackRef === 'string') {
          const callbackStr: string = callbackRef;
          if (callbackStr.startsWith('file://')) {
            callback = await this.loadExternalFunction(callbackStr);
          } else {
            callback = new Function('return ' + callbackStr)();
          }

          // Cache for future use
          this.loadedFunctionCallbacks[functionName] = callback;
        } else if (typeof callbackRef === 'function') {
          callback = callbackRef;
          this.loadedFunctionCallbacks[functionName] = callback;
        }
      }

      if (!callback) {
        throw new Error(`No callback found for function '${functionName}'`);
      }

      // Execute the callback with explicit context
      logger.debug(
        `Executing function '${functionName}' with args: ${args}${
          context ? ` and context: ${JSON.stringify(context)}` : ''
        }`,
      );
      const result = await callback(args, context);

      // Format the result
      if (result === undefined || result === null) {
        return '';
      } else if (typeof result === 'object') {
        try {
          return JSON.stringify(result);
        } catch (error) {
          logger.warn(`Error stringifying result from function '${functionName}': ${error}`);
          return String(result);
        }
      } else {
        return String(result);
      }
    } catch (error: any) {
      logger.error(`Error executing function '${functionName}': ${error.message || String(error)}`);
      return JSON.stringify({
        error: `Error in ${functionName}: ${error.message || String(error)}`,
      });
    }
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Create a simple cache key based on the input and configuration
    const cacheKey = `azure_foundry_assistant:${this.deploymentName}:${JSON.stringify({
      instructions: this.assistantConfig.instructions,
      max_tokens: this.assistantConfig.max_tokens,
      model: this.assistantConfig.modelName,
      prompt,
      response_format: this.assistantConfig.response_format,
      temperature: this.assistantConfig.temperature,
      tool_choice: this.assistantConfig.tool_choice,
      tool_resources: this.assistantConfig.tool_resources,
      tools: JSON.stringify(
        maybeLoadToolsFromExternalFile(this.assistantConfig.tools, context?.vars),
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

    try {
      // Initialize the client
      const client = await this.initializeClient();
      if (!client) {
        throw new Error('Failed to initialize Azure AI Project client');
      }
      // Get the agent (assistant)
      const agent = await client.agents.getAgent(this.deploymentName);
      logger.debug(`Retrieved agent: ${agent.name}`);

      // Create a thread
      const thread = await client.agents.threads.create();
      logger.debug(`Created thread: ${thread.id}`);

      // Create a message
      const message = await client.agents.messages.create(thread.id, 'user', prompt);
      logger.debug(`Created message: ${message.id}`);

      // Prepare run options
      const runOptions: any = {};

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
        runOptions.tools = maybeLoadToolsFromExternalFile(
          this.assistantConfig.tools,
          context?.vars,
        );
      }
      if (this.assistantConfig.modelName) {
        runOptions.model = this.assistantConfig.modelName;
      }
      if (this.assistantConfig.instructions) {
        runOptions.instructions = this.assistantConfig.instructions;
      }

      // Create a run
      const run = await client.agents.runs.create(thread.id, agent.id, runOptions);
      logger.debug(`Created run: ${run.id}`);

      // Handle function calls if needed or poll for completion
      let result: ProviderResponse;
      if (
        this.assistantConfig.functionToolCallbacks &&
        Object.keys(this.assistantConfig.functionToolCallbacks).length > 0
      ) {
        result = await this.pollRunWithToolCallHandling(client, thread.id, run);
      } else {
        // Poll for completion
        const completedRun = await this.pollRun(client, thread.id, run.id);

        // Process the completed run
        if (completedRun.status === 'completed') {
          result = await this.processCompletedRun(client, thread.id, completedRun);
        } else {
          if (completedRun.lastError) {
            // Check if the error is a content filter error
            const errorCode = completedRun.lastError.code || '';
            const errorMessage = completedRun.lastError.message || '';

            if (errorCode === 'content_filter' || this.isContentFilterError(errorMessage)) {
              const lowerErrorMessage = errorMessage.toLowerCase();
              const isInputFiltered =
                lowerErrorMessage.includes('prompt') || lowerErrorMessage.includes('input');
              const isOutputFiltered =
                lowerErrorMessage.includes('output') || lowerErrorMessage.includes('response');

              // Ensure mutual exclusivity - prioritize input if both are detected
              const flaggedInput = isInputFiltered;
              const flaggedOutput = !isInputFiltered && (isOutputFiltered || !isOutputFiltered);

              result = {
                output:
                  "The generated content was filtered due to triggering Azure OpenAI Service's content filtering system.",
                guardrails: {
                  flagged: true,
                  flaggedInput,
                  flaggedOutput,
                },
              };
            } else {
              result = {
                error: `Thread run failed: ${errorCode} - ${errorMessage}`,
              };
            }
          } else {
            result = {
              error: `Thread run failed with status: ${completedRun.status}`,
            };
          }
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
      logger.error(`Error in Azure Foundry Assistant API call: ${err}`);
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
      return { error: `Error in Azure Foundry Assistant API call: ${errorMessage}` };
    }
    if (this.isRateLimitError(errorMessage)) {
      return { error: `Rate limit exceeded: ${errorMessage}` };
    }
    if (this.isServiceError(errorMessage)) {
      return { error: `Service error: ${errorMessage}` };
    }

    return { error: `Error in Azure Foundry Assistant API call: ${errorMessage}` };
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
    client: AIProjectClient,
    threadId: string,
    runId: string,
    pollIntervalMs = 1000,
  ): Promise<Run> {
    // Maximum polling time (5 minutes)
    const maxPollTime = this.assistantConfig.maxPollTimeMs || 300000;
    const startTime = Date.now();

    // Poll until terminal state
    let run = await client.agents.runs.get(threadId, runId);

    while (['queued', 'in_progress'].includes(run.status)) {
      // Check timeout
      if (Date.now() - startTime > maxPollTime) {
        throw new Error(`Run polling timed out after ${maxPollTime}ms. Last status: ${run.status}`);
      }

      await sleep(pollIntervalMs);

      // Get latest status
      run = await client.agents.runs.get(threadId, runId);

      // Increase polling interval gradually for longer-running operations
      if (Date.now() - startTime > 30000) {
        // After 30 seconds
        pollIntervalMs = Math.min(pollIntervalMs * 1.5, 5000);
      }
    }

    return run;
  }

  /**
   * Handle tool calls during run polling
   */
  private async pollRunWithToolCallHandling(
    client: AIProjectClient,
    threadId: string,
    initialRun: Run,
  ): Promise<ProviderResponse> {
    // Maximum polling time (5 minutes)
    const maxPollTime = this.assistantConfig.maxPollTimeMs || 300000;
    const startTime = Date.now();
    let pollIntervalMs = 1000;
    let run = initialRun;

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
        run = await client.agents.runs.get(threadId, run.id);
        logger.debug(`Run status: ${run.status}`);

        // Check for required action
        if (run.status === 'requires_action') {
          if (
            run.requiredAction?.type === 'submit_tool_outputs' &&
            run.requiredAction.submitToolOutputs?.toolCalls
          ) {
            const toolCalls = run.requiredAction.submitToolOutputs.toolCalls;

            // Filter for function calls that have callbacks
            const functionCallsWithCallbacks = toolCalls.filter((toolCall) => {
              return (
                toolCall.type === 'function' &&
                toolCall.function &&
                toolCall.function.name in (this.assistantConfig.functionToolCallbacks ?? {})
              );
            });

            if (functionCallsWithCallbacks.length === 0) {
              // No matching callbacks found, but we should still handle the required action
              logger.debug(
                `No matching callbacks found for tool calls. Available functions: ${Object.keys(
                  this.assistantConfig.functionToolCallbacks || {},
                ).join(', ')}. Tool calls: ${JSON.stringify(toolCalls)}`,
              );

              // Submit empty outputs for all tool calls
              const emptyOutputs: ToolOutput[] = toolCalls.map((toolCall) => ({
                toolCallId: toolCall.id,
                output: JSON.stringify({
                  message: `No callback registered for function ${toolCall.type === 'function' ? toolCall.function?.name : toolCall.type}`,
                }),
              }));

              // Submit the empty outputs to continue the run
              try {
                await client.agents.runs.submitToolOutputs(threadId, run.id, emptyOutputs);
                // Continue polling after submission
                await sleep(pollIntervalMs);
                continue;
              } catch (error: any) {
                logger.error(`Error submitting empty tool outputs: ${error.message}`);
                return {
                  error: `Error submitting empty tool outputs: ${error.message}`,
                };
              }
            }

            // Build context for function callbacks
            const callbackContext: CallbackContext = {
              threadId,
              runId: run.id,
              assistantId: this.deploymentName,
              provider: 'azure-foundry',
            };

            // Process tool calls that have matching callbacks
            const toolOutputs: ToolOutput[] = await Promise.all(
              functionCallsWithCallbacks.map(async (toolCall) => {
                const functionName = toolCall.function!.name;
                const functionArgs = toolCall.function!.arguments;

                try {
                  logger.debug(`Calling function ${functionName} with args: ${functionArgs}`);

                  // Use our executeFunctionCallback method with context
                  const outputResult = await this.executeFunctionCallback(
                    functionName,
                    functionArgs,
                    callbackContext,
                  );

                  logger.debug(`Function ${functionName} result: ${outputResult}`);
                  return {
                    toolCallId: toolCall.id,
                    output: outputResult,
                  };
                } catch (error) {
                  logger.error(`Error calling function ${functionName}: ${error}`);
                  return {
                    toolCallId: toolCall.id,
                    output: JSON.stringify({ error: String(error) }),
                  };
                }
              }),
            );

            // Submit tool outputs
            if (toolOutputs.length === 0) {
              logger.error('No valid tool outputs to submit');
              break;
            }

            logger.debug(`Submitting tool outputs: ${JSON.stringify(toolOutputs)}`);

            // Submit tool outputs
            try {
              await client.agents.runs.submitToolOutputs(threadId, run.id, toolOutputs);
            } catch (error: any) {
              logger.error(`Error submitting tool outputs: ${error.message}`);
              return {
                error: `Error submitting tool outputs: ${error.message}`,
              };
            }
          } else {
            logger.error(`Unknown required action type: ${run.requiredAction?.type}`);
            break;
          }
        } else if (['completed', 'failed', 'cancelled', 'expired'].includes(run.status)) {
          // Run is in a terminal state
          if (run.status !== 'completed') {
            // Return error for failed runs
            if (run.lastError) {
              const errorCode = run.lastError.code || '';
              const errorMessage = run.lastError.message || '';

              if (errorCode === 'content_filter' || this.isContentFilterError(errorMessage)) {
                const lowerErrorMessage = errorMessage.toLowerCase();
                const isInputFiltered =
                  lowerErrorMessage.includes('prompt') || lowerErrorMessage.includes('input');
                const isOutputFiltered =
                  lowerErrorMessage.includes('output') || lowerErrorMessage.includes('response');

                // Ensure mutual exclusivity - prioritize input if both are detected
                const flaggedInput = isInputFiltered;
                const flaggedOutput = !isInputFiltered && (isOutputFiltered || !isOutputFiltered);

                return {
                  output:
                    "The generated content was filtered due to triggering Azure OpenAI Service's content filtering system.",
                  guardrails: {
                    flagged: true,
                    flaggedInput,
                    flaggedOutput,
                  },
                };
              }

              return {
                error: `Thread run failed: ${errorCode} - ${errorMessage}`,
              };
            }

            return {
              error: `Thread run failed with status: ${run.status}`,
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
          };
        }

        // For other errors, just return the error without marking as retryable
        return {
          error: `Error polling run status: ${errorMessage}`,
        };
      }
    }

    // Process the completed run
    return await this.processCompletedRun(client, threadId, run);
  }

  /**
   * Process a completed run to extract messages
   */
  private async processCompletedRun(
    client: AIProjectClient,
    threadId: string,
    run: Run,
  ): Promise<ProviderResponse> {
    try {
      // Get all messages in the thread
      const messages: Message[] = [];
      for await (const message of client.agents.messages.list(threadId, { order: 'asc' })) {
        messages.push(message);
      }

      // Process messages to create output
      const outputBlocks: string[] = [];

      // Sort messages by creation time if needed (they should already be sorted by 'asc' order)
      messages.forEach((message) => {
        const contentBlocks = message.content
          .map((content) =>
            content.type === 'text' && content.text
              ? content.text.value
              : `<${content.type} output>`,
          )
          .join('\n');

        outputBlocks.push(`[${toTitleCase(message.role)}] ${contentBlocks}`);
      });

      return {
        output: outputBlocks.join('\n\n').trim(),
      };
    } catch (err: any) {
      logger.error(`Error processing run results: ${err}`);
      const errorMessage = err.message || String(err);

      return {
        error: `Error processing run results: ${errorMessage}`,
      };
    }
  }
}
