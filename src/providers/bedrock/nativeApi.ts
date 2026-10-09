import { throwIfAborted } from '../shared';
import { AwsBedrockGenericProvider } from './base';
import { isValidBedrockRetrievalFilter } from './retrievalFilter';
import { createBedrockRequestHandler } from './util';
import type { BedrockAgentRuntime } from '@aws-sdk/client-bedrock-agent-runtime';

import type {
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../types/providers';

// Inference/data-plane operations only. Provisioning and account administration are not eval targets.
const OPERATIONS = {
  InvokeModel: { service: 'runtime', method: 'invokeModel' },
  InvokeModelWithResponseStream: {
    service: 'runtime',
    method: 'invokeModelWithResponseStream',
    stream: 'body',
  },
  Converse: { service: 'runtime', method: 'converse' },
  ConverseStream: { service: 'runtime', method: 'converseStream', stream: 'stream' },
  CountTokens: { service: 'runtime', method: 'countTokens' },
  ApplyGuardrail: { service: 'runtime', method: 'applyGuardrail' },
  InvokeGuardrailChecks: { service: 'runtime', method: 'invokeGuardrailChecks' },
  ListAsyncInvokes: { service: 'runtime', method: 'listAsyncInvokes' },
  StartAsyncInvoke: { service: 'runtime', method: 'startAsyncInvoke' },
  GetAsyncInvoke: { service: 'runtime', method: 'getAsyncInvoke' },
  Retrieve: { service: 'agent', method: 'retrieve' },
  GenerateQuery: { service: 'agent', method: 'generateQuery' },
  AgenticRetrieveStream: { service: 'agent', method: 'agenticRetrieveStream', stream: 'stream' },
  OptimizePrompt: { service: 'agent', method: 'optimizePrompt', stream: 'optimizedPrompt' },
  InvokeInlineAgent: { service: 'agent', method: 'invokeInlineAgent', stream: 'completion' },
  StartFlowExecution: { service: 'agent', method: 'startFlowExecution' },
  GetFlowExecution: { service: 'agent', method: 'getFlowExecution' },
  ListFlowExecutionEvents: { service: 'agent', method: 'listFlowExecutionEvents' },
  RetrieveAndGenerate: { service: 'agent', method: 'retrieveAndGenerate' },
  RetrieveAndGenerateStream: {
    service: 'agent',
    method: 'retrieveAndGenerateStream',
    stream: 'stream',
  },
  InvokeAgent: { service: 'agent', method: 'invokeAgent', stream: 'completion' },
  Rerank: { service: 'agent', method: 'rerank' },
  InvokeFlow: { service: 'agent', method: 'invokeFlow', stream: 'responseStream' },
} as const;

type NativeOperation = keyof typeof OPERATIONS;

/** JSON cannot represent SDK blobs. Decode only an explicit, single-key blob wrapper. */
function decodeBlobs(value: any): any {
  if (Array.isArray(value)) {
    return value.map(decodeBlobs);
  }
  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 1 && '$base64' in value) {
      if (
        typeof value.$base64 !== 'string' ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.$base64)
      ) {
        throw new Error('Native Bedrock $base64 blobs require valid padded base64');
      }
      return Buffer.from(value.$base64, 'base64');
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeBlobs(item)]));
  }
  return value;
}

function encodeBlobs(value: any): any {
  if (value instanceof Uint8Array) {
    return { $base64: Buffer.from(value).toString('base64') };
  }
  if (Array.isArray(value)) {
    return value.map(encodeBlobs);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeBlobs(item)]));
  }
  return value;
}

/** Native request/response access for model features that do not fit the text/embedding adapters. */
export class AwsBedrockNativeApiProvider extends AwsBedrockGenericProvider {
  private readonly operation: NativeOperation;
  private agentRuntime?: BedrockAgentRuntime;

  constructor(
    operation: string,
    options: ConstructorParameters<typeof AwsBedrockGenericProvider>[1] = {},
  ) {
    if (!Object.prototype.hasOwnProperty.call(OPERATIONS, operation)) {
      throw new Error(
        `Unsupported Bedrock native API operation "${operation}". Choose ${Object.keys(OPERATIONS).join(', ')}.`,
      );
    }
    super(operation, options);
    this.operation = operation as NativeOperation;
  }

  id(): string {
    return `bedrock:api:${this.operation}`;
  }

  protected getApiKey(): string | undefined {
    // Agent Runtime accepts SigV4 credentials, not Bedrock Runtime bearer tokens.
    return OPERATIONS[this.operation].service === 'runtime' ? super.getApiKey() : undefined;
  }

  async getAgentRuntimeClient() {
    if (!this.agentRuntime) {
      const { BedrockAgentRuntime } = await import('@aws-sdk/client-bedrock-agent-runtime');
      const credentials = await this.getCredentials();
      this.agentRuntime = new BedrockAgentRuntime({
        region: this.getRegion(),
        maxAttempts: this.getMaxAttempts(),
        retryMode: 'adaptive',
        requestHandler: await createBedrockRequestHandler(),
        ...(credentials ? { credentials } : {}),
        ...(this.config.endpoint ? { endpoint: this.config.endpoint } : {}),
      });
    }
    return this.agentRuntime;
  }

  async cleanup(): Promise<void> {
    this.bedrock?.destroy();
    this.agentRuntime?.destroy();
    this.bedrock = undefined;
    this.agentRuntime = undefined;
  }

  async callApi(
    prompt: string,
    _context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    try {
      throwIfAborted(options?.abortSignal);
      const input = JSON.parse(prompt);
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('Native Bedrock prompts must be JSON request objects');
      }
      // InvokeModel bodies are model-native JSON, not SDK structures. Leave their base64 strings intact.
      if (this.operation === 'InvokeModel' || this.operation === 'InvokeModelWithResponseStream') {
        if (input.body && typeof input.body === 'object' && !('$base64' in input.body)) {
          input.body = JSON.stringify(input.body);
        }
        input.contentType ??= 'application/json';
        input.accept ??= 'application/json';
      }
      const retrievals = [
        ...(input.knowledgeBases ?? []).map((kb: any) => kb.retrievalConfiguration),
        input.retrievalConfiguration,
        input.retrieveAndGenerateConfiguration?.knowledgeBaseConfiguration?.retrievalConfiguration,
        ...(input.sessionState?.knowledgeBaseConfigurations ?? []).map(
          (kb: any) => kb.retrievalConfiguration,
        ),
        ...(input.inlineSessionState?.knowledgeBaseConfigurations ?? []).map(
          (kb: any) => kb.retrievalConfiguration,
        ),
        ...(input.collaborators ?? []).flatMap((collaborator: any) =>
          (collaborator.knowledgeBases ?? []).map((kb: any) => kb.retrievalConfiguration),
        ),
      ];
      const filters = [
        ...retrievals.flatMap((retrieval) => [
          retrieval?.vectorSearchConfiguration?.filter,
          retrieval?.managedSearchConfiguration?.filter,
        ]),
        ...(input.retrievers ?? []).map(
          (retriever: any) => retriever.configuration?.knowledgeBase?.retrievalOverrides?.filter,
        ),
      ];
      if (
        filters.some((filter) => filter !== undefined && !isValidBedrockRetrievalFilter(filter))
      ) {
        throw new Error(
          'Invalid Bedrock retrieval filter: use a native filter operator such as equals or andAll',
        );
      }
      const request = decodeBlobs(input);
      const operation = OPERATIONS[this.operation];
      let response: Record<string, any>;
      if (operation.service === 'runtime') {
        const client = await this.getBedrockInstance();
        throwIfAborted(options?.abortSignal);
        // The operation name comes only from the fixed inference allowlist above.
        const invoke = client[operation.method] as (input: any, options: any) => Promise<any>;
        if (typeof invoke !== 'function') {
          throw new Error(
            `Installed AWS SDK does not expose ${this.operation}; update the Bedrock ${operation.service} SDK package.`,
          );
        }
        response = await invoke.call(client, request, { abortSignal: options?.abortSignal });
      } else {
        const client = await this.getAgentRuntimeClient();
        throwIfAborted(options?.abortSignal);
        const invoke = client[operation.method] as (input: any, options: any) => Promise<any>;
        if (typeof invoke !== 'function') {
          throw new Error(
            `Installed AWS SDK does not expose ${this.operation}; update the Bedrock ${operation.service} SDK package.`,
          );
        }
        response = await invoke.call(client, request, { abortSignal: options?.abortSignal });
      }
      const { $metadata, ...native } = response;
      if ('stream' in operation) {
        const stream = native[operation.stream];
        if (!stream?.[Symbol.asyncIterator]) {
          throw new Error(`Bedrock ${this.operation} returned no event stream`);
        }
        const events: any[] = [];
        for await (const event of stream) {
          throwIfAborted(options?.abortSignal);
          const failure = Object.entries(event).find(([key]) => /exception$/i.test(key));
          if (failure) {
            throw new Error(`${failure[0]}: ${JSON.stringify(failure[1])}`);
          }
          // InvokeModel's payload chunks contain model-native JSON. Preserve each event separately.
          if (this.operation === 'InvokeModelWithResponseStream' && event.chunk?.bytes) {
            events.push({
              ...event,
              chunk: {
                ...event.chunk,
                bytes: JSON.parse(new TextDecoder().decode(event.chunk.bytes)),
              },
            });
          } else {
            events.push(encodeBlobs(event));
          }
        }
        if (!events.length) {
          throw new Error(`Bedrock ${this.operation} returned an empty event stream`);
        }
        native[operation.stream] = events;
      } else if (this.operation === 'InvokeModel') {
        if (!(native.body instanceof Uint8Array)) {
          throw new Error('Bedrock InvokeModel returned no response body');
        }
        native.body = (native.contentType ?? 'application/json').includes('json')
          ? JSON.parse(new TextDecoder().decode(native.body))
          : encodeBlobs(native.body);
      }
      return {
        output: JSON.stringify(encodeBlobs(native)),
        tokenUsage: { numRequests: 1 },
        metadata: { operation: this.operation, aws: $metadata },
      };
    } catch (error) {
      return { error: `Bedrock ${this.operation} error: ${String(error)}` };
    }
  }
}
