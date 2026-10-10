import { STATUS_CODES } from 'http';

import { NumericValue } from '@smithy/core/serde';
import { providerRegistry } from '../providerRegistry';
import { throwIfAborted } from '../shared';
import { AwsBedrockGenericProvider, type BedrockOptions } from './base';
import { isValidBedrockRetrievalFilter } from './retrievalFilter';
import { createBedrockRequestHandler } from './util';
import type { BedrockAgentRuntime } from '@aws-sdk/client-bedrock-agent-runtime';
import type { ResponseMetadata } from '@smithy/types';

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
  AgenticRetrieveStream: {
    service: 'agent',
    method: 'agenticRetrieveStream',
    stream: 'stream',
    maxAttempts: 1,
  },
  OptimizePrompt: { service: 'agent', method: 'optimizePrompt', stream: 'optimizedPrompt' },
  InvokeInlineAgent: {
    service: 'agent',
    method: 'invokeInlineAgent',
    stream: 'completion',
    maxAttempts: 1,
  },
  StartFlowExecution: { service: 'agent', method: 'startFlowExecution', maxAttempts: 1 },
  GetFlowExecution: { service: 'agent', method: 'getFlowExecution' },
  ListFlowExecutionEvents: { service: 'agent', method: 'listFlowExecutionEvents' },
  RetrieveAndGenerate: { service: 'agent', method: 'retrieveAndGenerate', maxAttempts: 1 },
  RetrieveAndGenerateStream: {
    service: 'agent',
    method: 'retrieveAndGenerateStream',
    stream: 'stream',
    maxAttempts: 1,
  },
  InvokeAgent: { service: 'agent', method: 'invokeAgent', stream: 'completion', maxAttempts: 1 },
  Rerank: { service: 'agent', method: 'rerank' },
  InvokeFlow: { service: 'agent', method: 'invokeFlow', stream: 'responseStream', maxAttempts: 1 },
} as const;

type NativeOperation = keyof typeof OPERATIONS;

interface NativeApiConfig extends BedrockOptions {
  maxRetries?: number | string;
}

/** Compare decimal values without expanding exponent notation into arbitrarily many zeros. */
function normalizeNumericLiteral(source: string): string {
  const [mantissa, exponent = '0'] = source.toLowerCase().split('e');
  const [integer, fraction = ''] = mantissa.split('.');
  const digits = integer + fraction;
  let end = digits.length;
  while (end > 0 && digits[end - 1] === '0') {
    end--;
  }
  const significant = digits.slice(0, end).replace(/^(-?)0+/, '$1');
  if (significant === '' || significant === '-') {
    return '0';
  }
  return `${significant}e${Number(exponent) - fraction.length + digits.length - end}`;
}

async function parseNativeJson(value: string | Uint8Array): Promise<any> {
  const text = typeof value === 'string' ? value : new TextDecoder().decode(value);
  return JSON.parse(text, (_key, number, context?: { source?: string }) => {
    const source = context?.source;
    if (typeof number !== 'number' || !source || source === String(number)) {
      return number;
    }
    if (
      Number.isFinite(number) &&
      !Object.is(number, -0) &&
      normalizeNumericLiteral(source) === normalizeNumericLiteral(String(number))
    ) {
      return number;
    }
    // Keep precise and extreme numbers lexical; the SDK reviver expands exponent literals.
    return new NumericValue(source, 'bigDecimal');
  });
}

/** JSON cannot represent SDK blobs. Decode only an explicit, single-key blob wrapper. */
function decodeBlobs(value: any): any {
  if (NumericValue.prototype.isPrototypeOf(value)) {
    return value;
  }
  if (value instanceof NumericValue) {
    throw new Error(
      'Native Bedrock document inputs cannot contain ordinary objects with the SDK reserved bigDecimal shape; the SDK would convert them into numbers',
    );
  }
  if (Array.isArray(value)) {
    return value.map(decodeBlobs);
  }
  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 1 && '$base64' in value) {
      if (
        typeof value.$base64 !== 'string' ||
        value.$base64.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(value.$base64)
      ) {
        throw new Error('Native Bedrock $base64 blobs require valid padded base64');
      }
      return Buffer.from(value.$base64, 'base64');
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeBlobs(item)]));
  }
  return value;
}

// Available on supported Node versions, beyond the project's ES2022 type declarations.
const nativeJson = JSON as typeof JSON & {
  rawJSON: (value: string) => unknown;
  isRawJSON: (value: unknown) => boolean;
};

function encodeBlobs(value: any): any {
  if (nativeJson.isRawJSON(value)) {
    return value;
  }
  // NumericValue's instanceof check also matches ordinary {type, string} document objects.
  if (typeof value === 'bigint' || NumericValue.prototype.isPrototypeOf(value)) {
    return nativeJson.rawJSON(String(value));
  }
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
    if (Object.prototype.hasOwnProperty.call(value, '__proto__') && value.__proto__ === undefined) {
      throw new Error(
        'The AWS SDK discarded an own __proto__ field in a native document response; refusing to return altered JSON',
      );
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeBlobs(item)]));
  }
  return value;
}

/** Native request/response access for model features that do not fit the text/embedding adapters. */
export class AwsBedrockNativeApiProvider extends AwsBedrockGenericProvider {
  declare config: NativeApiConfig;
  private readonly operation: NativeOperation;
  private runtime?: ReturnType<AwsBedrockGenericProvider['getBedrockInstance']>;
  private agentRuntime?: Promise<BedrockAgentRuntime>;

  constructor(
    operation: string,
    options: ConstructorParameters<typeof AwsBedrockGenericProvider>[1] & {
      config?: NativeApiConfig;
    } = {},
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

  get handlesOwnRetries(): boolean {
    // The SDK owns retries; never replay a complete operation or a partially consumed stream.
    return true;
  }

  protected getMaxAttempts(): number {
    const operation = OPERATIONS[this.operation];
    if ('maxAttempts' in operation) {
      // These operations can mutate server-side state and have no request idempotency token.
      return operation.maxAttempts;
    }
    const raw = this.config.maxRetries;
    const retries = typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : raw;
    return typeof retries === 'number' && Number.isSafeInteger(retries) && retries >= 0
      ? retries + 1
      : super.getMaxAttempts();
  }

  protected getApiKey(): string | undefined {
    // Agent Runtime accepts SigV4 credentials, not Bedrock Runtime bearer tokens.
    return OPERATIONS[this.operation].service === 'runtime' ? super.getApiKey() : undefined;
  }

  getBedrockInstance() {
    providerRegistry.throwIfResourceUseAborted();
    if (!this.runtime) {
      providerRegistry.register(this);
      this.runtime = super.getBedrockInstance().catch((error) => {
        this.runtime = undefined;
        throw error;
      });
    }
    return this.runtime;
  }

  async getAgentRuntimeClient() {
    providerRegistry.throwIfResourceUseAborted();
    if (!this.agentRuntime) {
      providerRegistry.register(this);
      this.agentRuntime = (async () => {
        const { BedrockAgentRuntime } = await import('@aws-sdk/client-bedrock-agent-runtime');
        const credentials = await this.getCredentials();
        return new BedrockAgentRuntime({
          region: this.getRegion(),
          maxAttempts: this.getMaxAttempts(),
          retryMode: 'adaptive',
          requestHandler: await createBedrockRequestHandler(),
          ...(credentials ? { credentials } : {}),
          ...(this.config.endpoint ? { endpoint: this.config.endpoint } : {}),
        });
      })().catch((error) => {
        this.agentRuntime = undefined;
        throw error;
      });
    }
    return this.agentRuntime;
  }

  async shutdown(): Promise<void> {
    await this.cleanup();
  }

  async cleanup(): Promise<void> {
    const clients = await Promise.allSettled([this.runtime ?? this.bedrock, this.agentRuntime]);
    this.bedrock = undefined;
    this.runtime = undefined;
    this.agentRuntime = undefined;
    providerRegistry.unregister(this);
    for (const client of clients) {
      if (client.status === 'fulfilled') {
        client.value?.destroy();
      }
    }
  }

  async callApi(
    prompt: string,
    _context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    let responseMetadata: ResponseMetadata | undefined;
    try {
      throwIfAborted(options?.abortSignal);
      const input = await parseNativeJson(prompt);
      if (
        !input ||
        typeof input !== 'object' ||
        Array.isArray(input) ||
        NumericValue.prototype.isPrototypeOf(input)
      ) {
        throw new Error('Native Bedrock prompts must be JSON request objects');
      }
      // InvokeModel bodies are model-native JSON, not SDK structures. Leave their base64 strings intact.
      if (this.operation === 'InvokeModel' || this.operation === 'InvokeModelWithResponseStream') {
        if (
          input.body &&
          typeof input.body === 'object' &&
          !(Object.keys(input.body).length === 1 && '$base64' in input.body)
        ) {
          input.body = JSON.stringify(encodeBlobs(input.body));
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
      const client =
        operation.service === 'runtime'
          ? await this.getBedrockInstance()
          : await this.getAgentRuntimeClient();
      providerRegistry.throwIfResourceUseAborted();
      throwIfAborted(options?.abortSignal);
      // The operation name comes only from the fixed inference allowlist above.
      const invoke = client[operation.method as keyof typeof client] as (
        input: any,
        options: any,
      ) => Promise<Record<string, any>>;
      if (typeof invoke !== 'function') {
        throw new Error(
          `Installed AWS SDK does not expose ${this.operation}; update the Bedrock ${operation.service} SDK package.`,
        );
      }
      const response = await invoke.call(client, request, { abortSignal: options?.abortSignal });
      const { $metadata, ...native } = response;
      responseMetadata = $metadata;
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
            const prefix = failure[0].toLowerCase() === 'throttlingexception' ? 'Rate limit: ' : '';
            throw new Error(`${prefix}${failure[0]}: ${JSON.stringify(failure[1])}`);
          }
          // InvokeModel's payload chunks contain model-native JSON. Preserve each event separately.
          if (this.operation === 'InvokeModelWithResponseStream' && event.chunk?.bytes) {
            events.push({
              ...event,
              chunk: {
                ...event.chunk,
                bytes: await parseNativeJson(event.chunk.bytes),
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
          ? await parseNativeJson(native.body)
          : encodeBlobs(native.body);
      }
      return {
        output: JSON.stringify(encodeBlobs(native)),
        tokenUsage: { numRequests: 1 },
        metadata: { operation: this.operation, aws: $metadata },
      };
    } catch (error) {
      const errorMetadata =
        error && typeof error === 'object' && '$metadata' in error
          ? (error.$metadata as ResponseMetadata | undefined)
          : undefined;
      const aws = errorMetadata ?? responseMetadata;
      const prefix =
        error instanceof Error && error.name.toLowerCase() === 'throttlingexception'
          ? 'Rate limit: '
          : '';
      return {
        error: `Bedrock ${this.operation} error: ${prefix}${String(error)}`,
        ...(aws
          ? {
              metadata: {
                operation: this.operation,
                aws,
                ...(typeof aws.httpStatusCode === 'number'
                  ? {
                      http: {
                        status: aws.httpStatusCode,
                        statusText: STATUS_CODES[aws.httpStatusCode] ?? '',
                      },
                    }
                  : {}),
              },
            }
          : {}),
      };
    }
  }
}
