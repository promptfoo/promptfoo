import type { TokenCredential } from '@azure/identity';
import type {
  AssistantCreationOptions,
  AssistantsClient,
  FunctionDefinition,
  RunStepMessageCreationDetails,
  RunStepToolCallDetails,
} from '@azure/openai-assistants';
import dedent from 'dedent';
import { fetchWithCache } from '../cache';
import { getEnvFloat, getEnvInt, getEnvString } from '../envars';
import logger from '../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderEmbeddingResponse,
  ProviderResponse,
} from '../types';
import type { EnvOverrides } from '../types/env';
import { maybeLoadFromExternalFile, renderVarsInObject } from '../util';
import invariant from '../util/invariant';
import { sleep } from '../util/time';
import { calculateCost, parseChatPrompt, REQUEST_TIMEOUT_MS, toTitleCase } from './shared';

export const DEFAULT_AZURE_API_VERSION = '2024-12-01-preview';

interface AzureCompletionOptions {
  // Azure identity params
  azureClientId?: string;
  azureClientSecret?: string;
  azureTenantId?: string;
  azureAuthorityHost?: string;
  azureTokenScope?: string;
  o1?: boolean; // Indicates if the model should be treated as an o1 model
  max_completion_tokens?: number; // Maximum number of tokens to generate for o1 models

  // Azure cognitive services params
  deployment_id?: string;
  dataSources?: any;

  // Promptfoo supported params
  apiHost?: string;
  apiBaseUrl?: string;
  apiKey?: string;
  apiKeyEnvar?: string;
  apiVersion?: string;

  // OpenAI params
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  best_of?: number;
  functions?: {
    name: string;
    description?: string;
    parameters: any;
  }[];
  function_call?: 'none' | 'auto' | { name: string };
  tools?: {
    type: string;
    function: {
      name: string;
      description?: string;
      parameters: any;
    };
  }[];
  tool_choice?: 'none' | 'auto' | { type: 'function'; function?: { name: string } };
  response_format?:
    | { type: 'json_object' }
    | {
        type: 'json_schema';
        json_schema: {
          name: string;
          strict: boolean;
          schema: {
            type: 'object';
            properties: Record<string, any>;
            required?: string[];
            additionalProperties: false;
            $defs?: Record<string, any>;
          };
        };
      };
  stop?: string[];
  seed?: number;
  reasoning_effort?: 'low' | 'medium' | 'high';

  passthrough?: object;
}

const AZURE_MODELS = [
  {
    id: 'gpt-4o-2024-08-06',
    cost: {
      input: 2.5 / 1000000,
      output: 10 / 1000000,
    },
  },
  {
    id: 'gpt-4o',
    cost: {
      input: 5 / 1000000,
      output: 15 / 1000000,
    },
  },
  {
    id: 'gpt-4o-mini',
    cost: {
      input: 0.15 / 1000000,
      output: 0.6 / 1000000,
    },
  },
  {
    id: 'gpt-3.5-turbo-0125',
    cost: {
      input: 0.5 / 1000000,
      output: 1.5 / 1000000,
    },
  },
  {
    id: 'gpt-3.5-turbo-instruct',
    cost: {
      input: 1.5 / 1000000,
      output: 2 / 1000000,
    },
  },
  {
    id: 'gpt-4',
    cost: {
      input: 30 / 1000000,
      output: 60 / 1000000,
    },
  },
  {
    id: 'gpt-4-32k',
    cost: {
      input: 60 / 1000000,
      output: 120 / 1000000,
    },
  },
  {
    id: 'babbage-002',
    cost: {
      input: 0.4 / 1000000,
      output: 0.4 / 1000000,
    },
  },
  {
    id: 'davinci-002',
    cost: {
      input: 2 / 1000000,
      output: 2 / 1000000,
    },
  },
  {
    id: 'text-embedding-ada-002',
    cost: {
      input: 0.1 / 1000000,
      output: 0.1 / 1000000,
    },
  },
  {
    id: 'text-embedding-3-large',
    cost: {
      input: 0.13 / 1000000,
      output: 0.13 / 1000000,
    },
  },
  {
    id: 'text-embedding-3-small',
    cost: {
      input: 0.02 / 1000000,
      output: 0.02 / 1000000,
    },
  },
  // Legacy models
  {
    id: 'gpt-3.5-turbo-0301',
    cost: {
      input: 2 / 1000000,
      output: 2 / 1000000,
    },
  },
  {
    id: 'gpt-3.5-turbo-0613',
    cost: {
      input: 1.5 / 1000000,
      output: 2 / 1000000,
    },
  },
  {
    id: 'gpt-3.5-turbo-1106',
    cost: {
      input: 1 / 1000000,
      output: 2 / 1000000,
    },
  },
];

function throwConfigurationError(message: string): never {
  throw new Error(dedent`
    ${message}

    See https://www.promptfoo.dev/docs/providers/azure/ to learn more about Azure configuration.
  `);
}

export function calculateAzureCost(
  modelName: string,
  config: AzureCompletionOptions,
  promptTokens?: number,
  completionTokens?: number,
): number | undefined {
  return calculateCost(
    modelName,
    { cost: undefined },
    promptTokens,
    completionTokens,
    AZURE_MODELS,
  );
}

export class AzureGenericProvider implements ApiProvider {
  deploymentName: string;
  apiHost?: string;
  apiBaseUrl?: string;

  config: AzureCompletionOptions;
  env?: EnvOverrides;

  authHeaders?: Record<string, string>;

  protected initializationPromise: Promise<void> | null = null;

  constructor(
    deploymentName: string,
    options: { config?: AzureCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, id, env } = options;
    this.env = env;

    this.deploymentName = deploymentName;

    this.apiHost =
      config?.apiHost ||
      // These and similar OPENAI envars: Backwards compatibility for Azure rename 2024-11-09 / 0.96.0
      env?.AZURE_API_HOST ||
      env?.AZURE_OPENAI_API_HOST ||
      getEnvString('AZURE_API_HOST') ||
      getEnvString('AZURE_OPENAI_API_HOST');
    this.apiBaseUrl =
      config?.apiBaseUrl ||
      env?.AZURE_API_BASE_URL ||
      env?.AZURE_OPENAI_API_BASE_URL ||
      env?.AZURE_OPENAI_BASE_URL ||
      getEnvString('AZURE_API_BASE_URL') ||
      getEnvString('AZURE_OPENAI_API_BASE_URL') ||
      getEnvString('AZURE_OPENAI_BASE_URL');

    this.config = config || {};
    this.id = id ? () => id : this.id;

    this.initializationPromise = this.initialize();
  }

  async initialize() {
    this.authHeaders = await this.getAuthHeaders();
  }

  async ensureInitialized() {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  getApiKey(): string | undefined {
    return (
      this.config?.apiKey ||
      (this.config?.apiKeyEnvar
        ? process.env[this.config.apiKeyEnvar] ||
          this.env?.[this.config.apiKeyEnvar as keyof EnvOverrides]
        : undefined) ||
      this.env?.AZURE_API_KEY ||
      getEnvString('AZURE_API_KEY') ||
      this.env?.AZURE_OPENAI_API_KEY ||
      getEnvString('AZURE_OPENAI_API_KEY')
    );
  }

  getApiKeyOrThrow(): string {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throwConfigurationError('Azure API key must be set.');
    }
    return apiKey;
  }

  async getAzureTokenCredential(): Promise<TokenCredential> {
    const clientSecret =
      this.config?.azureClientSecret ||
      this.env?.AZURE_CLIENT_SECRET ||
      getEnvString('AZURE_CLIENT_SECRET');
    const clientId =
      this.config?.azureClientId || this.env?.AZURE_CLIENT_ID || getEnvString('AZURE_CLIENT_ID');
    const tenantId =
      this.config?.azureTenantId || this.env?.AZURE_TENANT_ID || getEnvString('AZURE_TENANT_ID');
    const authorityHost =
      this.config?.azureAuthorityHost ||
      this.env?.AZURE_AUTHORITY_HOST ||
      getEnvString('AZURE_AUTHORITY_HOST');

    const { ClientSecretCredential, AzureCliCredential } = await import('@azure/identity');

    if (clientSecret && clientId && tenantId) {
      const credential = new ClientSecretCredential(tenantId, clientId, clientSecret, {
        authorityHost: authorityHost || 'https://login.microsoftonline.com',
      });
      return credential;
    }

    // Fallback to Azure CLI
    const credential = new AzureCliCredential();
    return credential;
  }

  async getAccessToken() {
    const credential = await this.getAzureTokenCredential();
    const tokenScope =
      this.config?.azureTokenScope ||
      this.env?.AZURE_TOKEN_SCOPE ||
      getEnvString('AZURE_TOKEN_SCOPE');
    const tokenResponse = await credential.getToken(
      tokenScope || 'https://cognitiveservices.azure.com/.default',
    );
    if (!tokenResponse) {
      throwConfigurationError('Failed to retrieve access token.');
    }
    return tokenResponse.token;
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    const apiKey = this.getApiKey();
    if (apiKey) {
      return { 'api-key': apiKey };
    } else {
      try {
        const token = await this.getAccessToken();
        return { Authorization: 'Bearer ' + token };
      } catch (err) {
        logger.info(`Azure Authentication failed. Please check your credentials: ${err}`);
        throw new Error(`Azure Authentication failed. 
Please choose one of the following options:
  1. Set an API key via the AZURE_API_KEY environment variable.
  2. Provide client credentials (AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID).
  3. Authenticate with Azure CLI using az login.
    `);
      }
    }
  }

  getApiBaseUrl(): string | undefined {
    if (this.apiBaseUrl) {
      return this.apiBaseUrl.replace(/\/$/, '');
    }
    const host = this.apiHost?.replace(/^(https?:\/\/)/, '').replace(/\/$/, '');
    if (!host) {
      return undefined;
    }
    return `https://${host}`;
  }

  id(): string {
    return `azure:${this.deploymentName}`;
  }

  toString(): string {
    return `[Azure Provider ${this.deploymentName}]`;
  }

  // @ts-ignore: Params are not used in this implementation
  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    throw new Error('Not implemented');
  }
}

export class AzureEmbeddingProvider extends AzureGenericProvider {
  async callEmbeddingApi(text: string): Promise<ProviderEmbeddingResponse> {
    await this.ensureInitialized();
    invariant(this.authHeaders, 'auth headers are not initialized');
    if (!this.getApiBaseUrl()) {
      throwConfigurationError('Azure API host must be set.');
    }

    const body = {
      input: text,
      model: this.deploymentName,
    };
    let data,
      cached = false;
    try {
      ({ data, cached } = (await fetchWithCache(
        `${this.getApiBaseUrl()}/openai/deployments/${this.deploymentName}/embeddings?api-version=${
          this.config.apiVersion || DEFAULT_AZURE_API_VERSION
        }`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.authHeaders,
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      )) as unknown as any);
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
        tokenUsage: {
          total: 0,
          prompt: 0,
          completion: 0,
        },
      };
    }
    logger.debug(`\tAzure API response (embeddings): ${JSON.stringify(data)}`);

    try {
      const embedding = data?.data?.[0]?.embedding;
      if (!embedding) {
        throw new Error('No embedding returned');
      }
      const ret = {
        embedding,
        tokenUsage: cached
          ? { cached: data.usage.total_tokens, total: data.usage.total_tokens }
          : {
              total: data.usage.total_tokens,
              prompt: data.usage.prompt_tokens,
              completion: data.usage.completion_tokens,
            },
      };
      return ret;
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
        tokenUsage: cached
          ? {
              cached: data.usage.total_tokens,
              total: data.usage.total_tokens,
            }
          : {
              total: data?.usage?.total_tokens,
              prompt: data?.usage?.prompt_tokens,
              completion: data?.usage?.completion_tokens,
            },
      };
    }
  }
}

export class AzureCompletionProvider extends AzureGenericProvider {
  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    await this.ensureInitialized();
    invariant(this.authHeaders, 'auth headers are not initialized');

    if (!this.getApiBaseUrl()) {
      throwConfigurationError('Azure API host must be set.');
    }

    let stop: string;
    try {
      stop = getEnvString('OPENAI_STOP')
        ? JSON.parse(getEnvString('OPENAI_STOP') || '')
        : this.config?.stop || ['<|im_end|>', '<|endoftext|>'];
    } catch (err) {
      throw new Error(`OPENAI_STOP is not a valid JSON string: ${err}`);
    }
    const body = {
      model: this.deploymentName,
      prompt,
      max_tokens: this.config.max_tokens ?? getEnvInt('OPENAI_MAX_TOKENS', 1024),
      temperature: this.config.temperature ?? getEnvFloat('OPENAI_TEMPERATURE', 0),
      top_p: this.config.top_p ?? getEnvFloat('OPENAI_TOP_P', 1),
      presence_penalty: this.config.presence_penalty ?? getEnvFloat('OPENAI_PRESENCE_PENALTY', 0),
      frequency_penalty:
        this.config.frequency_penalty ?? getEnvFloat('OPENAI_FREQUENCY_PENALTY', 0),
      best_of: this.config.best_of ?? getEnvInt('OPENAI_BEST_OF', 1),
      ...(this.config.seed === undefined ? {} : { seed: this.config.seed }),
      ...(this.config.deployment_id ? { deployment_id: this.config.deployment_id } : {}),
      ...(this.config.dataSources ? { dataSources: this.config.dataSources } : {}),
      ...(this.config.response_format ? { response_format: this.config.response_format } : {}),
      ...(callApiOptions?.includeLogProbs ? { logprobs: callApiOptions.includeLogProbs } : {}),
      ...(stop ? { stop } : {}),
      ...(this.config.passthrough || {}),
    };
    logger.debug(`Calling Azure API: ${JSON.stringify(body)}`);
    let data,
      cached = false;
    try {
      ({ data, cached } = (await fetchWithCache(
        `${this.getApiBaseUrl()}/openai/deployments/${
          this.deploymentName
        }/completions?api-version=${this.config.apiVersion || DEFAULT_AZURE_API_VERSION}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.authHeaders,
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      )) as unknown as any);
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
    logger.debug(`Azure API response: ${JSON.stringify(data)}`);
    try {
      return {
        output: data.choices[0].text,
        tokenUsage: cached
          ? { cached: data.usage.total_tokens, total: data.usage.total_tokens }
          : {
              total: data.usage.total_tokens,
              prompt: data.usage.prompt_tokens,
              completion: data.usage.completion_tokens,
            },
        cost: calculateAzureCost(
          this.deploymentName,
          this.config,
          data.usage?.prompt_tokens,
          data.usage?.completion_tokens,
        ),
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}

export class AzureChatCompletionProvider extends AzureGenericProvider {
  getOpenAiBody(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Record<string, any> {
    const config = {
      ...this.config,
      ...context?.prompt?.config,
    };

    // Fix: Match OpenAI's message handling exactly
    const messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);

    // Fix: Match OpenAI's response format handling with variable rendering
    const responseFormat = config.response_format
      ? {
          response_format: maybeLoadFromExternalFile(
            renderVarsInObject(config.response_format, context?.vars),
          ),
        }
      : {};

    const body = {
      model: this.deploymentName,
      messages,
      top_p: config.top_p ?? getEnvFloat('OPENAI_TOP_P', 1),
      presence_penalty: config.presence_penalty ?? getEnvFloat('OPENAI_PRESENCE_PENALTY', 0),
      frequency_penalty: config.frequency_penalty ?? getEnvFloat('OPENAI_FREQUENCY_PENALTY', 0),
      ...(config.o1
        ? {
            max_completion_tokens: config.max_completion_tokens,
            reasoning_effort: renderVarsInObject(config.reasoning_effort, context?.vars),
          }
        : {
            max_tokens: config.max_tokens ?? getEnvInt('OPENAI_MAX_TOKENS', 1024),
            temperature: config.temperature ?? getEnvFloat('OPENAI_TEMPERATURE', 0),
          }),
      ...(config.functions
        ? {
            functions: maybeLoadFromExternalFile(
              renderVarsInObject(config.functions, context?.vars),
            ),
          }
        : {}),
      ...(config.function_call ? { function_call: config.function_call } : {}),
      ...(config.seed === undefined ? {} : { seed: config.seed }),
      ...(config.tools
        ? {
            tools: maybeLoadFromExternalFile(renderVarsInObject(config.tools, context?.vars)),
          }
        : {}),
      ...(config.tool_choice ? { tool_choice: config.tool_choice } : {}),
      ...(config.deployment_id ? { deployment_id: config.deployment_id } : {}),
      ...(config.dataSources ? { dataSources: config.dataSources } : {}),
      ...responseFormat,
      ...(callApiOptions?.includeLogProbs ? { logprobs: callApiOptions.includeLogProbs } : {}),
      ...(config.stop ? { stop: config.stop } : {}),
      ...(config.passthrough || {}),
    };

    logger.debug(`Azure API request body: ${JSON.stringify(body)}`);
    return { body, config };
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    await this.ensureInitialized();
    invariant(this.authHeaders, 'auth headers are not initialized');

    if (!this.getApiBaseUrl()) {
      throwConfigurationError('Azure API host must be set.');
    }

    const { body, config } = this.getOpenAiBody(prompt, context, callApiOptions);

    let data;
    let cached = false;
    try {
      const url = config.dataSources
        ? `${this.getApiBaseUrl()}/openai/deployments/${
            this.deploymentName
          }/extensions/chat/completions?api-version=${config.apiVersion || DEFAULT_AZURE_API_VERSION}`
        : `${this.getApiBaseUrl()}/openai/deployments/${
            this.deploymentName
          }/chat/completions?api-version=${config.apiVersion || DEFAULT_AZURE_API_VERSION}`;

      const {
        data: responseData,
        cached: isCached,
        status,
      } = await fetchWithCache(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.authHeaders,
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      );

      cached = isCached;

      // Handle the response data
      if (typeof responseData === 'string') {
        try {
          data = JSON.parse(responseData);
        } catch {
          return {
            error: `API returned invalid JSON response (status ${status}): ${responseData}\n\nRequest body: ${JSON.stringify(body, null, 2)}`,
          };
        }
      } else {
        data = responseData;
      }
    } catch (err) {
      return {
        error: `API call error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    logger.debug(`Azure API response: ${JSON.stringify(data)}`);
    try {
      if (data.error) {
        if (data.error.code === 'content_filter' && data.error.status === 400) {
          return {
            output: data.error.message,
            guardrails: {
              flagged: true,
              flaggedInput: true,
              flaggedOutput: false,
            },
          };
        }
        return {
          error: `API response error: ${data.error.code} ${data.error.message}`,
        };
      }
      const hasDataSources = !!config.dataSources;
      const choice = hasDataSources
        ? data.choices.find(
            (choice: { message: { role: string; content: string } }) =>
              choice.message.role === 'assistant',
          )
        : data.choices[0];

      const message = choice?.message;

      // Handle structured output
      let output = message.content;

      if (output == null) {
        if (choice.finish_reason === 'content_filter') {
          output =
            'The generated content was filtered due to triggering Azure OpenAI Service’s content filtering system.';
        } else {
          // Restore tool_calls and function_call handling
          output = message.tool_calls ?? message.function_call;
        }
      } else if (
        config.response_format?.type === 'json_schema' ||
        config.response_format?.type === 'json_object'
      ) {
        try {
          output = JSON.parse(output);
        } catch (err) {
          logger.error(`Failed to parse JSON output: ${err}. Output was: ${output}`);
        }
      }

      const logProbs = data.choices[0].logprobs?.content?.map(
        (logProbObj: { token: string; logprob: number }) => logProbObj.logprob,
      );

      const contentFilterResults = data.choices[0]?.content_filter_results;
      const promptFilterResults = data.prompt_filter_results;

      const guardrailsTriggered = !!(
        (contentFilterResults && Object.keys(contentFilterResults).length > 0) ||
        (promptFilterResults && promptFilterResults.length > 0)
      );

      const flaggedInput =
        promptFilterResults?.some((result: any) =>
          Object.values(result.content_filter_results).some((filter: any) => filter.filtered),
        ) ?? false;

      const flaggedOutput = Object.values(contentFilterResults || {}).some(
        (filter: any) => filter.filtered,
      );

      return {
        output,
        tokenUsage: cached
          ? { cached: data.usage?.total_tokens, total: data?.usage?.total_tokens }
          : {
              total: data.usage?.total_tokens,
              prompt: data.usage?.prompt_tokens,
              completion: data.usage?.completion_tokens,
              ...(data.usage?.completion_tokens_details
                ? {
                    completionDetails: {
                      reasoning: data.usage.completion_tokens_details.reasoning_tokens,
                      acceptedPrediction:
                        data.usage.completion_tokens_details.accepted_prediction_tokens,
                      rejectedPrediction:
                        data.usage.completion_tokens_details.rejected_prediction_tokens,
                    },
                  }
                : {}),
            },
        cached,
        logProbs,
        cost: calculateAzureCost(
          this.deploymentName,
          config,
          data.usage?.prompt_tokens,
          data.usage?.completion_tokens,
        ),
        ...(guardrailsTriggered
          ? {
              guardrails: {
                flaggedInput,
                flaggedOutput,
                flagged: flaggedInput || flaggedOutput,
              },
            }
          : {}),
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}

type AzureAssistantOptions = AzureCompletionOptions &
  Partial<AssistantCreationOptions> & {
    /**
     * If set, automatically call these functions when the assistant activates
     * these function tools.
     */
    functionToolCallbacks?: Record<FunctionDefinition['name'], (arg: string) => Promise<string>>;
  };

// See https://learn.microsoft.com/en-us/javascript/api/overview/azure/openai-assistants-readme?view=azure-node-preview
export class AzureAssistantProvider extends AzureGenericProvider {
  assistantConfig: AzureAssistantOptions;
  assistantsClient: AssistantsClient | undefined;

  constructor(
    deploymentName: string,
    options: { config?: AzureAssistantOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(deploymentName, options);
    this.assistantConfig = options.config || {};

    this.initializationPromise = this.initialize();
  }

  async initialize() {
    await super.initialize();

    const apiKey = this.getApiKey();
    if (!apiKey) {
      throwConfigurationError('Azure API key must be set.');
    }

    const { AssistantsClient, AzureKeyCredential } = await import('@azure/openai-assistants');

    const apiBaseUrl = this.getApiBaseUrl();
    if (!apiBaseUrl) {
      throwConfigurationError('Azure API host must be set.');
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
      throwConfigurationError('Azure API host must be set.');
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
