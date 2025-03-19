import type {
  AssistantsClient,
  RunStepMessageCreationDetails,
  RunStepToolCallDetails,
} from '@azure/openai-assistants';
import logger from '../../logger';
import type { CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../../types';
import invariant from '../../util/invariant';
import { sleep } from '../../util/time';
import { toTitleCase } from '../shared';
import { AzureGenericProvider } from './generic';
import type { AzureAssistantOptions, AzureAssistantProviderOptions } from './types';

export class AzureAssistantProvider extends AzureGenericProvider {
  assistantConfig: AzureAssistantOptions;
  assistantsClient: AssistantsClient | undefined;

  constructor(deploymentName: string, options: AzureAssistantProviderOptions = {}) {
    super(deploymentName, options);
    this.assistantConfig = options.config || {};

    this.initializationPromise = this.initialize();
  }

  async initialize() {
    await super.initialize();

    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('Azure API key must be set.');
    }

    const { AssistantsClient, AzureKeyCredential } = await import('@azure/openai-assistants');

    const apiBaseUrl = this.getApiBaseUrl();
    if (!apiBaseUrl) {
      throw new Error('Azure API host must be set.');
    }
    this.assistantsClient = new AssistantsClient(apiBaseUrl, new AzureKeyCredential(apiKey));
    this.initializationPromise = null;
  }

  async ensureInitialized() {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    await this.ensureInitialized();
    invariant(this.assistantsClient, 'Assistants client not initialized');
    if (!this.getApiBaseUrl()) {
      throw new Error('Azure API host must be set.');
    }

    const assistantId = this.deploymentName;

    const assistantThread = await this.assistantsClient.createThread();
    await this.assistantsClient.createMessage(assistantThread.id, 'user', prompt);

    let run = await this.assistantsClient.createRun(assistantThread.id, {
      assistantId,
    });

    logger.debug(`\tAzure thread run API response: ${JSON.stringify(run)}`);

    while (
      run.status === 'in_progress' ||
      run.status === 'queued' ||
      run.status === 'requires_action'
    ) {
      if (run.status === 'requires_action') {
        const requiredAction = run.requiredAction;
        invariant(requiredAction, 'Run requires action but no action is provided');
        if (requiredAction === null || requiredAction.type !== 'submit_tool_outputs') {
          break;
        }
        const functionCallsWithCallbacks = requiredAction.submitToolOutputs?.toolCalls.filter(
          (toolCall) => {
            return (
              toolCall.type === 'function' &&
              toolCall.function.name in (this.assistantConfig.functionToolCallbacks ?? {})
            );
          },
        );
        if (!functionCallsWithCallbacks || functionCallsWithCallbacks.length === 0) {
          break;
        }
        logger.debug(
          `Calling functionToolCallbacks for functions: ${functionCallsWithCallbacks.map(
            ({ function: { name } }) => name,
          )}`,
        );
        const toolOutputs = await Promise.all(
          functionCallsWithCallbacks.map(async (toolCall) => {
            logger.debug(
              `Calling functionToolCallbacks[${toolCall.function.name}]('${toolCall.function.arguments}')`,
            );
            const result = await this.assistantConfig.functionToolCallbacks![
              toolCall.function.name
            ](toolCall.function.arguments);
            return {
              tool_call_id: toolCall.id,
              output: result,
            };
          }),
        );
        logger.debug(
          `Calling Azure API, submitting tool outputs for ${run.threadId}: ${JSON.stringify(
            toolOutputs,
          )}`,
        );
        run = await this.assistantsClient.submitToolOutputsToRun(run.threadId, run.id, toolOutputs);
      }

      await sleep(1000);

      logger.debug(`Calling Azure API, getting thread run ${run.id} status`);
      run = await this.assistantsClient.getRun(run.threadId, run.id);
      logger.debug(`\tAzure thread run API response: ${JSON.stringify(run)}`);
    }

    if (run.status !== 'completed' && run.status !== 'requires_action') {
      if (run.lastError) {
        return {
          error: `Thread run failed: ${run.lastError.message}`,
        };
      }
      return {
        error: `Thread run failed: ${run.status}`,
      };
    }

    logger.debug(`Calling Azure API, getting thread run steps for ${run.threadId}`);
    const steps = await this.assistantsClient.listRunSteps(run.threadId, run.id, { order: 'asc' });
    logger.debug(`\tAzure thread run steps API response: ${JSON.stringify(steps)}`);

    const outputBlocks = [];
    for (const step of steps.data) {
      if (step.type === 'message_creation') {
        logger.debug(`Calling Azure API, getting message ${step.id}`);
        const stepDetails = step.stepDetails as RunStepMessageCreationDetails;
        // Bug in the API: the field is currently `message_id` even though it's documented as `messageId`
        const messageId =
          (stepDetails.messageCreation as any).message_id || stepDetails.messageCreation.messageId;
        const message = await this.assistantsClient.getMessage(run.threadId, messageId);
        logger.debug(`\tAzure thread run step message API response: ${JSON.stringify(message)}`);

        const content = message.content
          .map((content) =>
            content.type === 'text' ? content.text.value : `<${content.type} output>`,
          )
          .join('\n');
        outputBlocks.push(`[${toTitleCase(message.role)}] ${content}`);
      } else if (step.type === 'tool_calls') {
        for (const toolCall of (step.stepDetails as RunStepToolCallDetails).toolCalls) {
          if (toolCall.type === 'function') {
            outputBlocks.push(
              `[Call function ${toolCall.function.name} with arguments ${toolCall.function.arguments}]`,
            );
            outputBlocks.push(`[Function output: ${toolCall.function.output}]`);
          } else if (toolCall.type === 'retrieval') {
            outputBlocks.push(`[Ran retrieval]`);
          } else if (toolCall.type === 'code_interpreter') {
            const output = toolCall.codeInterpreter.outputs
              .map((output) => (output.type === 'logs' ? output.logs : `<${output.type} output>`))
              .join('\n');
            outputBlocks.push(`[Code interpreter input]`);
            outputBlocks.push(toolCall.codeInterpreter.input);
            outputBlocks.push(`[Code interpreter output]`);
            outputBlocks.push(output);
          } else {
            outputBlocks.push(`[Unknown tool call type: ${(toolCall as any).type}]`);
          }
        }
      } else {
        outputBlocks.push(`[Unknown step type: ${step.type}]`);
      }
    }

    return {
      output: outputBlocks.join('\n\n').trim(),
      /*
      tokenUsage: {
        total: data.usage.total_tokens,
        prompt: data.usage.prompt_tokens,
        completion: data.usage.completion_tokens,
      },
      */
    };
  }
}
