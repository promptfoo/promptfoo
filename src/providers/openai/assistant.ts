import path from 'path';

import OpenAI from 'openai';
import cliState from '../../cliState';
import { importModule } from '../../esm';
import logger from '../../logger';
import { isJavascriptFile } from '../../util/fileExtensions';
import { maybeLoadToolsFromExternalFile } from '../../util/index';
import { sleep } from '../../util/time';
import { getRequestTimeoutMs, parseChatPrompt, toTitleCase } from '../shared';
import { OpenAiGenericProvider } from '.';
import { failApiCall, getTokenUsage } from './util';
import type { Metadata } from 'openai/resources/shared';

import type { EnvOverrides } from '../../types/env';
import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/index';
import type { AssistantFunctionCallback, CallbackContext, OpenAiSharedOptions } from './types';

type OpenAiAssistantOptions = OpenAiSharedOptions & {
  modelName?: string;
  instructions?: string;
  tools?: OpenAI.Beta.Threads.ThreadCreateAndRunParams['tools'];
  /**
   * If set, automatically call these functions when the assistant activates
   * these function tools.
   */
  functionToolCallbacks?: Record<
    OpenAI.FunctionDefinition['name'],
    string | AssistantFunctionCallback
  >;
  metadata?: Metadata;
  temperature?: number;
  toolChoice?:
    | 'none'
    | 'auto'
    | 'required'
    | { type: 'function'; function?: { name: string } }
    | { type: 'file_search' };
  attachments?: OpenAI.Beta.Threads.Message.Attachment[];
  tool_resources?: OpenAI.Beta.Threads.ThreadCreateAndRunParams['tool_resources'];
};

export class OpenAiAssistantProvider extends OpenAiGenericProvider {
  assistantId: string;
  assistantConfig: OpenAiAssistantOptions;
  private loadedFunctionCallbacks: Record<string, Function> = {};

  constructor(
    assistantId: string,
    options: { config?: OpenAiAssistantOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(assistantId, options);
    this.assistantConfig = options.config || {};
    this.assistantId = assistantId;

    // Preload function callbacks if available
    if (this.assistantConfig.functionToolCallbacks) {
      void this.preloadFunctionCallbacks();
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
      // Note: OpenAI assistant provider maintains backward compatibility by parsing args
      logger.debug(
        `Executing function '${functionName}' with args: ${args}${
          context ? ` and context: ${JSON.stringify(context)}` : ''
        }`,
      );
      let parsedArgs;
      try {
        parsedArgs = JSON.parse(args);
      } catch (error) {
        logger.warn(`Error parsing function arguments for '${functionName}': ${error}`);
        parsedArgs = {};
      }

      const result = await callback(parsedArgs, context);

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

  private createClient() {
    return new OpenAI({
      apiKey: this.getApiKey(),
      organization: this.getOrganization(),
      baseURL: this.getApiUrl(),
      maxRetries: 3,
      timeout: getRequestTimeoutMs(),
      defaultHeaders: this.assistantConfig.headers,
    });
  }

  private async buildCreateAndRunBody(
    prompt: string,
    context?: CallApiContextParams,
  ): Promise<OpenAI.Beta.Threads.ThreadCreateAndRunParams> {
    const messages = parseChatPrompt(prompt, [
      {
        role: 'user',
        content: prompt,
        ...(this.assistantConfig.attachments
          ? { attachments: this.assistantConfig.attachments }
          : {}),
      },
    ]) as OpenAI.Beta.Threads.ThreadCreateParams.Message[];

    return {
      assistant_id: this.assistantId,
      model: this.assistantConfig.modelName || undefined,
      instructions: this.assistantConfig.instructions || undefined,
      tools:
        (await maybeLoadToolsFromExternalFile(this.assistantConfig.tools, context?.vars)) ||
        undefined,
      metadata: this.assistantConfig.metadata || undefined,
      temperature: this.assistantConfig.temperature ?? undefined,
      tool_choice: this.assistantConfig.toolChoice || undefined,
      tool_resources: this.assistantConfig.tool_resources || undefined,
      thread: { messages },
    };
  }

  private getFunctionCallsWithCallbacks(currentRun: OpenAI.Beta.Threads.Run) {
    const requiredAction = currentRun.required_action;
    if (requiredAction === null || requiredAction.type !== 'submit_tool_outputs') {
      return [];
    }
    return requiredAction.submit_tool_outputs.tool_calls.filter(
      (toolCall): toolCall is OpenAI.Beta.Threads.Runs.RequiredActionFunctionToolCall =>
        toolCall.type === 'function' &&
        toolCall.function.name in (this.assistantConfig.functionToolCallbacks ?? {}),
    );
  }

  private async submitFunctionToolOutputs(
    openai: OpenAI,
    currentRun: OpenAI.Beta.Threads.Run,
    functionCalls: OpenAI.Beta.Threads.Runs.RequiredActionFunctionToolCall[],
  ) {
    const callbackContext: CallbackContext = {
      threadId: currentRun.thread_id,
      runId: currentRun.id,
      assistantId: this.assistantId,
      provider: 'openai',
    };

    logger.debug(
      `Calling functionToolCallbacks for functions: ${functionCalls.map(
        ({ function: { name } }) => name,
      )}`,
    );
    const toolOutputs = await Promise.all(
      functionCalls.map(async (toolCall) => {
        logger.debug(
          `Calling functionToolCallbacks[${toolCall.function.name}]('${toolCall.function.arguments}')`,
        );
        return {
          tool_call_id: toolCall.id,
          output: await this.executeFunctionCallback(
            toolCall.function.name,
            toolCall.function.arguments,
            callbackContext,
          ),
        };
      }),
    );
    logger.debug(
      `Calling OpenAI API, submitting tool outputs for ${currentRun.thread_id}: ${JSON.stringify(
        toolOutputs,
      )}`,
    );
    return openai.beta.threads.runs.submitToolOutputs(currentRun.id, {
      thread_id: currentRun.thread_id,
      tool_outputs: toolOutputs,
    });
  }

  private async waitForRunCompletion(openai: OpenAI, initialRun: OpenAI.Beta.Threads.Run) {
    let run = initialRun;
    while (true) {
      const currentRun = await openai.beta.threads.runs.retrieve(run.id, {
        thread_id: run.thread_id,
      });
      if (currentRun.status === 'completed') {
        return currentRun;
      }
      if (currentRun.status === 'requires_action') {
        const functionCalls = this.getFunctionCallsWithCallbacks(currentRun);
        if (functionCalls.length === 0) {
          return currentRun;
        }
        try {
          run = await this.submitFunctionToolOutputs(openai, currentRun, functionCalls);
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
        return currentRun;
      }
      await sleep(1000);
    }
  }

  private async loadRunSteps(openai: OpenAI, run: OpenAI.Beta.Threads.Run) {
    logger.debug(`Calling OpenAI API, getting thread run steps for ${run.thread_id}`);
    const steps = await openai.beta.threads.runs.steps.list(run.id, {
      thread_id: run.thread_id,
      order: 'asc',
    });
    logger.debug(`\tOpenAI thread run steps API response: ${JSON.stringify(steps)}`);
    return steps;
  }

  private async buildMessageStepOutput(
    openai: OpenAI,
    run: OpenAI.Beta.Threads.Run,
    step: OpenAI.Beta.Threads.Runs.RunStep,
  ) {
    if (step.step_details.type !== 'message_creation') {
      return undefined;
    }
    logger.debug(`Calling OpenAI API, getting message ${step.id}`);
    const message = await openai.beta.threads.messages.retrieve(
      step.step_details.message_creation.message_id,
      { thread_id: run.thread_id },
    );
    logger.debug(`\tOpenAI thread run step message API response: ${JSON.stringify(message)}`);
    const content = message.content
      .map((content) => (content.type === 'text' ? content.text.value : `<${content.type} output>`))
      .join('\n');
    return `[${toTitleCase(message.role)}] ${content}`;
  }

  private buildToolCallStepOutput(step: OpenAI.Beta.Threads.Runs.RunStep) {
    if (step.step_details.type !== 'tool_calls') {
      return [];
    }
    return step.step_details.tool_calls.flatMap((toolCall) => {
      if (toolCall.type === 'function') {
        return [
          `[Call function ${toolCall.function.name} with arguments ${toolCall.function.arguments}]`,
          `[Function output: ${toolCall.function.output}]`,
        ];
      }
      if (toolCall.type === 'file_search') {
        return ['[Ran file search]'];
      }
      if (toolCall.type === 'code_interpreter') {
        const output = toolCall.code_interpreter.outputs
          .map((item) => (item.type === 'logs' ? item.logs : `<${item.type} output>`))
          .join('\n');
        return [
          '[Code interpreter input]',
          toolCall.code_interpreter.input,
          '[Code interpreter output]',
          output,
        ];
      }
      return [`[Unknown tool call type: ${(toolCall as any).type}]`];
    });
  }

  private async buildOutputBlocks(openai: OpenAI, run: OpenAI.Beta.Threads.Run) {
    let steps;
    try {
      steps = await this.loadRunSteps(openai, run);
    } catch (err) {
      return failApiCall(err);
    }

    const outputBlocks: string[] = [];
    for (const step of steps.data) {
      try {
        const messageOutput = await this.buildMessageStepOutput(openai, run, step);
        if (messageOutput) {
          outputBlocks.push(messageOutput);
          continue;
        }
      } catch (err) {
        return failApiCall(err);
      }

      if (step.step_details.type === 'tool_calls') {
        outputBlocks.push(...this.buildToolCallStepOutput(step));
      } else {
        outputBlocks.push(`[Unknown step type: ${(step.step_details as any).type}]`);
      }
    }
    return outputBlocks;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    _callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    if (!this.getApiKey()) {
      throw new Error(this.getMissingApiKeyErrorMessage());
    }

    const openai = this.createClient();
    const body = await this.buildCreateAndRunBody(prompt, context);
    let run: OpenAI.Beta.Threads.Run;
    try {
      run = (await openai.beta.threads.createAndRun(body)) as OpenAI.Beta.Threads.Run;
    } catch (err) {
      return failApiCall(err);
    }

    const completedRun = await this.waitForRunCompletion(openai, run);
    if ('error' in completedRun) {
      return completedRun as ProviderResponse;
    }
    run = completedRun;

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

    const outputBlocks = await this.buildOutputBlocks(openai, run);
    if ('error' in outputBlocks) {
      return outputBlocks;
    }

    return {
      output: outputBlocks.join('\n\n').trim(),
      tokenUsage: getTokenUsage(run, false),
    };
  }
}
