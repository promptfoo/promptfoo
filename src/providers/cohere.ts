import { fetchWithCache } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import { type GenAISpanContext, type GenAISpanResult, withGenAISpan } from '../tracing/genaiTracer';
import { getRequestTimeoutMs } from './shared';

import type { EnvOverrides } from '../types/env';
import type {
  ApiEmbeddingProvider,
  ApiProvider,
  CallApiContextParams,
  ProviderEmbeddingResponse,
  ProviderResponse,
  TokenUsage,
} from '../types/index';

type CohereCitationMode = 'ACCURATE' | 'FAST' | 'ENABLED' | 'DISABLED' | 'OFF';
type CohereLegacyCitationMode = 'accurate' | 'fast';

interface CohereV2Document {
  data: string | Record<string, unknown>;
  id?: string;
}

interface CohereLegacyDocument {
  citation_quality?: CohereLegacyCitationMode;
  id?: string;
  [key: string]: unknown;
}

interface CohereCitationOptions {
  mode?: CohereCitationMode | CohereLegacyCitationMode;
  [key: string]: unknown;
}

interface CohereChatOptions {
  apiKey?: string;
  apiBaseUrl?: string;
  modelName?: string;
  chatHistory?: Array<{
    role: string;
    message: string;
    user_name?: string;
    conversation_id?: string;
  }>;
  chat_history?: Array<{
    role: string;
    message: string;
    user_name?: string;
    conversation_id?: string;
  }>;
  connectors?: Array<{
    id: string;
    user_access_token?: string;
    continue_on_failure?: boolean;
    options?: object;
  }>;
  preamble?: string;
  preamble_override?: string;
  prompt_truncation?: 'AUTO' | 'OFF';
  search_queries_only?: boolean;
  documents?: Array<string | CohereV2Document | CohereLegacyDocument>;
  citation_options?: CohereCitationOptions;
  temperature?: number;
  max_tokens?: number;
  k?: number;
  p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop_sequences?: string[];
  seed?: number;
  logprobs?: boolean;
  tools?: Array<Record<string, unknown>>;
  tool_choice?: 'REQUIRED' | 'NONE';
  strict_tools?: boolean;
  response_format?: Record<string, unknown>;
  safety_mode?: 'CONTEXTUAL' | 'STRICT' | 'OFF';
  thinking?: Record<string, unknown>;
  priority?: number;

  // promptfoo-provided options
  basePath?: string;
  linkedTargetId?: string;
  showDocuments?: boolean;
  showSearchQueries?: boolean;
}

interface CohereV2Message {
  role: string;
  content: unknown;
}

const COHERE_V2_CHAT_MODELS = new Set(['command-a-plus-05-2026', 'north-mini-code-1-0']);
const DEFAULT_COHERE_API_BASE_URL = 'https://api.cohere.ai';
const DEFAULT_COHERE_EMBEDDING_API_BASE_URL = 'https://api.cohere.com/v1';

function getCohereChatApiUrl(apiBaseUrl: string, version: 'v1' | 'v2'): string {
  const normalizedApiBaseUrl = apiBaseUrl.replace(/\/+$/, '').replace(/\/v[12]$/, '');
  return `${normalizedApiBaseUrl}/${version}/chat`;
}

function getCohereEmbeddingApiUrl(apiBaseUrl: string): string {
  const normalizedApiBaseUrl = apiBaseUrl.replace(/\/+$/, '');
  try {
    const url = new URL(normalizedApiBaseUrl);
    const isOfficialHost = url.hostname === 'api.cohere.ai' || url.hostname === 'api.cohere.com';
    const isVersionlessRoot =
      url.protocol === 'https:' &&
      url.port === '' &&
      (url.pathname === '' || url.pathname === '/') &&
      url.search === '' &&
      url.hash === '';
    if (isOfficialHost && isVersionlessRoot) {
      return `${url.origin}/v1/embed`;
    }
  } catch {
    // Preserve non-URL proxy base paths exactly as the embedding provider did before.
  }
  return `${normalizedApiBaseUrl}/embed`;
}

function isCohereV2EmbeddingApiUrl(apiUrl: string): boolean {
  try {
    return new URL(apiUrl).pathname.replace(/\/+$/, '').endsWith('/v2/embed');
  } catch {
    return apiUrl.split(/[?#]/, 1)[0].replace(/\/+$/, '').endsWith('/v2/embed');
  }
}

const COHERE_V2_REQUEST_FIELDS = [
  'tools',
  'response_format',
  'safety_mode',
  'max_tokens',
  'stop_sequences',
  'temperature',
  'seed',
  'frequency_penalty',
  'presence_penalty',
  'k',
  'p',
  'logprobs',
  'tool_choice',
  'thinking',
  'priority',
  'strict_tools',
] as const satisfies readonly (keyof CohereChatOptions)[];

function pickV2RequestParams(params: Record<string, any>): Record<string, unknown> {
  return Object.fromEntries(
    COHERE_V2_REQUEST_FIELDS.flatMap((field) =>
      params[field] === undefined ? [] : [[field, params[field]]],
    ),
  );
}

function toV2Role(role: string): string {
  return role.toLowerCase() === 'chatbot' ? 'assistant' : role.toLowerCase();
}

function parseV2Prompt(prompt: string): {
  parsedPrompt: boolean;
  promptParams: Record<string, any>;
} {
  try {
    const promptObj = JSON.parse(prompt);
    if (Array.isArray(promptObj)) {
      return { parsedPrompt: true, promptParams: { messages: promptObj } };
    }
    if (typeof promptObj === 'object' && promptObj !== null && !Array.isArray(promptObj)) {
      return { parsedPrompt: true, promptParams: promptObj };
    }
  } catch {
    // Plain text prompts are converted to a v2 user message by buildV2Messages.
  }
  return { parsedPrompt: false, promptParams: {} };
}

function hasV2RequestValue(value: unknown): boolean {
  return value != null && (!Array.isArray(value) || value.length > 0);
}

function getV2ConfigError(params: Record<string, any>): string | undefined {
  const chatHistory = params.chat_history ?? params.chatHistory;
  if (chatHistory !== undefined) {
    if (!Array.isArray(chatHistory)) {
      return 'Cohere v2 Chat API chat_history must be an array.';
    }
    for (const [index, historyMessage] of chatHistory.entries()) {
      if (
        typeof historyMessage !== 'object' ||
        historyMessage === null ||
        Array.isArray(historyMessage)
      ) {
        return `Cohere v2 Chat API chat_history[${index}] must be an object.`;
      }
      if (typeof historyMessage.role !== 'string' || historyMessage.role.trim().length === 0) {
        return `Cohere v2 Chat API chat_history[${index}].role must be a non-empty string.`;
      }
      if (
        typeof historyMessage.message !== 'string' ||
        historyMessage.message.trim().length === 0
      ) {
        return `Cohere v2 Chat API chat_history[${index}].message must be a non-empty string.`;
      }
    }
  }
  if (params.safety_mode === 'OFF') {
    return 'Cohere v2 Chat API safety_mode "OFF" is not supported for command-a-plus-05-2026 or north-mini-code-1-0. Use "CONTEXTUAL" or "STRICT".';
  }
  const hasTools = hasV2RequestValue(params.tools);
  const hasDocuments = hasV2RequestValue(params.documents);
  if (params.safety_mode === 'STRICT' && (hasTools || hasDocuments)) {
    return 'Cohere v2 Chat API safety_mode "STRICT" cannot be used with tools or documents because Cohere silently downgrades it to "CONTEXTUAL".';
  }
  if (params.connectors?.length) {
    return 'Cohere v2 Chat API does not support connectors. Use a v2 tool definition instead.';
  }
  if (params.search_queries_only) {
    return 'Cohere v2 Chat API does not support search_queries_only. Use a v2 tool definition instead.';
  }
  if (params.showSearchQueries) {
    return 'Cohere v2 Chat API does not return generated search queries.';
  }
  if (params.prompt_truncation && params.prompt_truncation !== 'OFF') {
    return 'Cohere v2 Chat API does not support prompt_truncation.';
  }
  return undefined;
}

function normalizeV2Documents(params: Record<string, any>): {
  citationOptions: unknown;
  documents: unknown;
} {
  const documents = params.documents;
  let legacyCitationMode: CohereLegacyCitationMode | undefined;

  const normalizedDocuments = Array.isArray(documents)
    ? documents.map((document: unknown) => {
        if (typeof document === 'string' || typeof document !== 'object' || document === null) {
          return document;
        }

        const {
          citation_quality: citationQuality,
          data,
          id,
          ...legacyData
        } = document as Record<string, unknown>;
        if (
          legacyCitationMode === undefined &&
          (citationQuality === 'accurate' || citationQuality === 'fast')
        ) {
          legacyCitationMode = citationQuality;
        }

        if ('data' in document) {
          if (typeof data === 'string') {
            return id === undefined ? data : { id, data: { text: data } };
          }
          return {
            ...(id === undefined ? {} : { id }),
            data,
          };
        }

        return {
          ...(id === undefined ? {} : { id }),
          data: legacyData,
        };
      })
    : documents;

  return {
    documents: normalizedDocuments,
    citationOptions: normalizeV2CitationOptions(params.citation_options, legacyCitationMode),
  };
}

const COHERE_V2_CITATION_MODES = new Set<CohereCitationMode>([
  'ACCURATE',
  'FAST',
  'ENABLED',
  'DISABLED',
  'OFF',
]);

function normalizeV2CitationMode(mode: unknown): unknown {
  if (typeof mode !== 'string') {
    return mode;
  }
  const normalizedMode = mode.toUpperCase() as CohereCitationMode;
  return COHERE_V2_CITATION_MODES.has(normalizedMode) ? normalizedMode : mode;
}

function normalizeV2CitationOptions(
  citationOptions: unknown,
  legacyMode?: CohereLegacyCitationMode,
): unknown {
  const resolvedOptions =
    citationOptions ?? (legacyMode === undefined ? undefined : { mode: legacyMode });
  if (!resolvedOptions || typeof resolvedOptions !== 'object' || Array.isArray(resolvedOptions)) {
    return resolvedOptions;
  }
  const mode = (resolvedOptions as { mode?: unknown }).mode;
  return mode === undefined
    ? resolvedOptions
    : { ...resolvedOptions, mode: normalizeV2CitationMode(mode) };
}

function buildV2Messages(
  prompt: string,
  parsedPrompt: boolean,
  params: Record<string, any>,
): CohereV2Message[] {
  const messages: CohereV2Message[] = [];
  const systemMessage = params.preamble ?? params.preamble_override;
  if (systemMessage) {
    messages.push({ role: 'system', content: systemMessage });
  }

  const history = params.chat_history ?? params.chatHistory ?? [];
  for (const historyMessage of history) {
    messages.push({
      role: toV2Role(historyMessage.role),
      content: historyMessage.message,
    });
  }

  if (Array.isArray(params.messages)) {
    messages.push(...params.messages);
    return messages;
  }

  const userMessage = params.message ?? (parsedPrompt ? undefined : prompt);
  if (userMessage !== undefined) {
    messages.push({ role: 'user', content: userMessage });
  }
  return messages;
}

function getV2TextContent(data: any): string | undefined {
  const content = data?.message?.content;
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return undefined;
  }
  return content
    .map((part: unknown) => {
      if (typeof part === 'string') {
        return part;
      }
      if (typeof part === 'object' && part !== null && 'text' in part) {
        return typeof part.text === 'string' ? part.text : '';
      }
      return '';
    })
    .join('');
}

function getV2Output(data: any): unknown | undefined {
  const message = data?.message;
  const content = getV2TextContent(data);
  const toolCalls =
    Array.isArray(message?.tool_calls) && message.tool_calls.length > 0
      ? message.tool_calls
      : undefined;

  if (content && toolCalls) {
    return { ...message, content };
  }
  if (toolCalls) {
    return toolCalls;
  }
  return content || undefined;
}

function getUniqueV2CitedDocuments(data: any): string[] {
  const serializedDocuments: string[] = [];
  const seenDocuments = new Set<string>();
  const citations = data?.message?.citations;

  if (!Array.isArray(citations)) {
    return serializedDocuments;
  }

  for (const citation of citations) {
    if (!Array.isArray(citation?.sources)) {
      continue;
    }
    for (const source of citation.sources) {
      if (source?.type !== 'document' || source.document === undefined) {
        continue;
      }
      const serializedDocument = JSON.stringify(source.document);
      if (serializedDocument === undefined || seenDocuments.has(serializedDocument)) {
        continue;
      }
      seenDocuments.add(serializedDocument);
      serializedDocuments.push(serializedDocument);
    }
  }

  return serializedDocuments;
}

function appendV2Documents(output: unknown, data: any, showDocuments: boolean): unknown {
  if (!showDocuments) {
    return output;
  }

  const documents = getUniqueV2CitedDocuments(data);
  if (documents.length === 0) {
    return output;
  }

  const documentsSuffix = `\n\nDocuments:\n${documents.join('\n')}`;
  if (typeof output === 'string') {
    return output + documentsSuffix;
  }
  if (
    typeof output === 'object' &&
    output !== null &&
    !Array.isArray(output) &&
    'content' in output &&
    typeof output.content === 'string'
  ) {
    return { ...output, content: output.content + documentsSuffix };
  }
  return output;
}

type NormalizedCohereCitation = { content: string; source?: string; url?: string };

function normalizeV2CitationSource(
  source: unknown,
  citationText?: string,
): NormalizedCohereCitation | undefined {
  if (!source || typeof source !== 'object') {
    return undefined;
  }
  const sourceRecord = source as {
    id?: unknown;
    document?: unknown;
    tool_output?: unknown;
    url?: unknown;
    uri?: unknown;
  };
  const payload = sourceRecord.document ?? sourceRecord.tool_output;
  const payloadRecord =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined;
  const sourceUrl = [
    payloadRecord?.url,
    payloadRecord?.uri,
    sourceRecord.url,
    sourceRecord.uri,
  ].find(
    (candidate): candidate is string =>
      typeof candidate === 'string' && /^https?:\/\//i.test(candidate),
  );
  const fallbackContent =
    payload === undefined
      ? JSON.stringify(source)
      : typeof payload === 'string'
        ? payload
        : JSON.stringify(payload);
  const content = citationText || fallbackContent || 'Cohere citation';

  if (sourceUrl) {
    return { url: sourceUrl, content };
  }
  const sourceTitle = payloadRecord?.title;
  return {
    source:
      typeof sourceTitle === 'string'
        ? sourceTitle
        : typeof sourceRecord.id === 'string'
          ? sourceRecord.id
          : 'Cohere',
    content,
  };
}

function normalizeV2Citation(citation: unknown): NormalizedCohereCitation[] {
  if (!citation || typeof citation !== 'object') {
    return [];
  }
  const citationRecord = citation as { text?: unknown; sources?: unknown };
  const citationText =
    typeof citationRecord.text === 'string' && citationRecord.text.trim()
      ? citationRecord.text
      : undefined;
  if (!Array.isArray(citationRecord.sources) || citationRecord.sources.length === 0) {
    return citationText ? [{ source: 'Cohere', content: citationText }] : [];
  }
  return citationRecord.sources
    .map((source) => normalizeV2CitationSource(source, citationText))
    .filter((citation): citation is NormalizedCohereCitation => citation !== undefined);
}

function getV2ResponseMetadata(data: any): Record<string, unknown> | undefined {
  const rawCitations = data?.message?.citations;
  if (!Array.isArray(rawCitations) || rawCitations.length === 0) {
    return undefined;
  }
  const citations = rawCitations.flatMap(normalizeV2Citation);

  return {
    ...(citations.length > 0 ? { citations } : {}),
    cohere: { citations: rawCitations },
  };
}

export class CohereChatCompletionProvider implements ApiProvider {
  static COHERE_CHAT_MODELS = [
    'command-a-plus-05-2026',
    'north-mini-code-1-0',
    'command-a-03-2025',
    'command-r7b-12-2024',
    'command-a-translate-08-2025',
    'command-a-reasoning-08-2025',
    'command-a-vision-07-2025',
    'command-r-08-2024',
    'command-r-plus-08-2024',
    'tiny-aya-global',
    'tiny-aya-earth',
    'tiny-aya-fire',
    'tiny-aya-water',
    'c4ai-aya-expanse-32b',
    'c4ai-aya-vision-32b',
    // Legacy aliases retained to avoid warning on existing configs.
    'command',
    'command-r',
    'command-r-plus',
    'command-r-v1',
  ];

  config: CohereChatOptions;

  private apiBaseUrl: string;
  private apiKey: string;
  private env?: EnvOverrides;
  private modelName: string;

  constructor(
    modelName: string,
    options: { config?: CohereChatOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, id, env } = options;
    this.apiBaseUrl =
      config?.apiBaseUrl ||
      env?.COHERE_API_BASE_URL ||
      getEnvString('COHERE_API_BASE_URL') ||
      DEFAULT_COHERE_API_BASE_URL;
    this.apiKey = config?.apiKey || env?.COHERE_API_KEY || getEnvString('COHERE_API_KEY') || '';
    this.env = env;
    this.modelName = modelName;
    if (!CohereChatCompletionProvider.COHERE_CHAT_MODELS.includes(this.modelName)) {
      logger.warn(`Using unknown Cohere chat model: ${this.modelName}`);
    }
    this.id = id ? () => id : this.id;
    this.config = config || {};
  }

  id() {
    return `cohere:${this.modelName}`;
  }

  getApiKey(): string | undefined {
    return this.apiKey || undefined;
  }

  requiresApiKey(): boolean {
    return true;
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    // Authentication and transport settings are provider-level only. Prompt config can override
    // request options, but it must not redirect provider credentials to another endpoint.
    const promptConfig = context?.prompt?.config as CohereChatOptions | undefined;
    const promptRequestConfig = { ...promptConfig };
    delete promptRequestConfig.apiKey;
    delete promptRequestConfig.apiBaseUrl;
    const config: CohereChatOptions = {
      ...this.config,
      ...promptRequestConfig,
    };
    if (COHERE_V2_CHAT_MODELS.has(this.modelName)) {
      config.preamble =
        promptConfig?.preamble ??
        promptConfig?.preamble_override ??
        this.config.preamble ??
        this.config.preamble_override;
      config.chat_history =
        promptConfig?.chat_history ??
        promptConfig?.chatHistory ??
        this.config.chat_history ??
        this.config.chatHistory;
    }

    // Set up tracing context
    const spanContext: GenAISpanContext = {
      system: 'cohere',
      operationName: 'chat',
      model: this.modelName,
      providerId: this.id(),
      temperature: config.temperature,
      topP: config.p,
      maxTokens: config.max_tokens,
      testIndex: context?.test?.vars?.__testIdx as number | undefined,
      promptLabel: context?.prompt?.label,
      // W3C Trace Context for linking to evaluation trace
      traceparent: context?.traceparent,
    };

    // Result extractor to set response attributes on the span
    const resultExtractor = (response: ProviderResponse): GenAISpanResult => {
      const result: GenAISpanResult = {};
      if (response.tokenUsage) {
        result.tokenUsage = {
          prompt: response.tokenUsage.prompt,
          completion: response.tokenUsage.completion,
          total: response.tokenUsage.total,
        };
      }
      return result;
    };

    return withGenAISpan(spanContext, () => this.callApiInternal(prompt, config), resultExtractor);
  }

  private async callApiInternal(
    prompt: string,
    config: CohereChatOptions,
  ): Promise<ProviderResponse> {
    if (!this.apiKey) {
      return { error: 'Cohere API key is not set. Please provide a valid apiKey.' };
    }

    if (COHERE_V2_CHAT_MODELS.has(this.modelName)) {
      return this.callV2ChatApi(prompt, config);
    }

    const defaultParams = {
      chatHistory: [],
      connectors: [],
      prompt_truncation: 'OFF',
      search_queries_only: false,
      documents: [],
      temperature: 0.3,
      k: 0,
      p: 0.75,
      frequency_penalty: 0,
      presence_penalty: 0,
    };

    const params = { ...defaultParams, ...config };

    let body;
    try {
      const promptObj = JSON.parse(prompt);
      if (typeof promptObj === 'object' && promptObj !== null) {
        body = {
          ...params,
          ...promptObj,
          model: this.modelName,
        };
      } else {
        throw new Error('Prompt is not a JSON object');
      }
    } catch {
      body = {
        message: prompt,
        ...params,
        model: this.modelName,
      };
    }
    delete body.apiKey;
    delete body.apiBaseUrl;

    let data,
      cached = false,
      status: number | undefined,
      statusText = '';
    try {
      ({ data, cached, status, statusText } = (await fetchWithCache(
        getCohereChatApiUrl(this.apiBaseUrl, 'v1'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
            'X-Client-Name':
              this.env?.COHERE_CLIENT_NAME || getEnvString('COHERE_CLIENT_NAME') || 'promptfoo',
          },
          body: JSON.stringify(body),
        },
        getRequestTimeoutMs(),
        'json',
        // The default cache key includes request headers. Avoid persisting a cache identity
        // derived from the bearer token because Cohere does not expose a safe tenant ID.
        true,
      )) as unknown as {
        data: any;
        cached: boolean;
        status: number;
        statusText: string;
      });

      if (status !== undefined && (status < 200 || status >= 300)) {
        return {
          error: `API error: ${status} ${statusText}\n${
            typeof data === 'string' ? data : JSON.stringify(data)
          }`,
        };
      }

      const errorMessage =
        typeof data?.message === 'string'
          ? data.message
          : typeof data?.error === 'string'
            ? data.error
            : data?.error?.message;
      if (errorMessage) {
        return { error: errorMessage };
      }

      const tokenUsage: TokenUsage = {
        cached: cached ? data.token_count?.total_tokens || 0 : 0,
        total: data.token_count?.total_tokens || 0,
        prompt: data.token_count?.prompt_tokens || 0,
        completion: data.token_count?.response_tokens || 0,
        numRequests: 1,
      };

      let output = data.text;
      if (this.config.showSearchQueries && data.search_queries) {
        output +=
          '\n\nSearch Queries:\n' +
          data.search_queries
            .map((query: { text: string; generation_id: string }) => query.text)
            .join('\n');
      }
      if (this.config.showDocuments && data.documents) {
        output +=
          '\n\nDocuments:\n' +
          data.documents
            .map((doc: { id: string; additionalProp: string }) => JSON.stringify(doc))
            .join('\n');
      }
      return {
        cached,
        output,
        tokenUsage,
      };
    } catch (error) {
      logger.error(`API call error: ${error}`);
      return { error: `API call error: ${error}` };
    }
  }

  private async callV2ChatApi(
    prompt: string,
    config: CohereChatOptions,
  ): Promise<ProviderResponse> {
    const defaultParams = {
      temperature: 0.3,
      k: 0,
      p: 0.75,
      frequency_penalty: 0,
      presence_penalty: 0,
    };

    const { parsedPrompt, promptParams } = parseV2Prompt(prompt);

    const params: Record<string, any> = {
      ...defaultParams,
      ...config,
      ...promptParams,
      // JSON prompt objects are model input, not trusted provider configuration. Keep tool and
      // safety controls on the provider/prompt-config path so prompt content cannot weaken them.
      tools: config.tools,
      tool_choice: config.tool_choice,
      strict_tools: config.strict_tools,
      safety_mode: config.safety_mode,
      preamble:
        promptParams.preamble ??
        promptParams.preamble_override ??
        config.preamble ??
        config.preamble_override,
      chat_history:
        promptParams.chat_history ??
        promptParams.chatHistory ??
        config.chat_history ??
        config.chatHistory,
    };
    const configError = getV2ConfigError(params);
    if (configError) {
      return { error: configError };
    }

    const v2Params = pickV2RequestParams(params);

    const { documents, citationOptions } = normalizeV2Documents(params);

    const messages = buildV2Messages(prompt, parsedPrompt, params);

    if (messages.length === 0) {
      return { error: 'Cohere v2 Chat API requires at least one message.' };
    }

    let data,
      cached = false,
      status: number | undefined,
      statusText = '';
    try {
      ({ data, cached, status, statusText } = (await fetchWithCache(
        getCohereChatApiUrl(this.apiBaseUrl, 'v2'),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
            'X-Client-Name':
              this.env?.COHERE_CLIENT_NAME || getEnvString('COHERE_CLIENT_NAME') || 'promptfoo',
          },
          body: JSON.stringify({
            ...v2Params,
            ...(documents === undefined ? {} : { documents }),
            ...(citationOptions === undefined ? {} : { citation_options: citationOptions }),
            model: this.modelName,
            messages,
          }),
        },
        getRequestTimeoutMs(),
        'json',
        // The default key includes headers. Bypass persistence because the bearer
        // token has no safe, non-secret tenant identifier that can replace it.
        true,
      )) as unknown as {
        data: any;
        cached: boolean;
        status: number;
        statusText: string;
      });

      if (status !== undefined && (status < 200 || status >= 300)) {
        return {
          error: `API error: ${status} ${statusText}\n${
            typeof data === 'string' ? data : JSON.stringify(data)
          }`,
        };
      }

      const errorMessage =
        typeof data?.message === 'string'
          ? data.message
          : typeof data?.error === 'string'
            ? data.error
            : data?.error?.message;
      if (errorMessage) {
        return { error: errorMessage };
      }

      let output = getV2Output(data);
      if (output === undefined) {
        return { error: 'Cohere v2 Chat API response did not contain text content.' };
      }
      output = appendV2Documents(output, data, Boolean(params.showDocuments));

      const usage = data?.usage?.tokens ?? data?.usage?.billed_units ?? {};
      const promptTokens = usage.input_tokens || 0;
      const completionTokens = usage.output_tokens || 0;
      const totalTokens = promptTokens + completionTokens;
      const serverCachedTokens =
        typeof data?.usage?.cached_tokens === 'number' ? data.usage.cached_tokens : 0;
      const tokenUsage: TokenUsage = {
        cached: cached ? totalTokens : serverCachedTokens,
        total: totalTokens,
        prompt: promptTokens,
        completion: completionTokens,
        numRequests: 1,
      };
      const metadata = getV2ResponseMetadata(data);

      return {
        cached,
        output,
        tokenUsage,
        ...(metadata ? { metadata } : {}),
      };
    } catch (error) {
      logger.error(`API call error: ${error}`);
      return { error: `API call error: ${error}` };
    }
  }
}

export class CohereEmbeddingProvider implements ApiEmbeddingProvider {
  modelName: string;
  config: any;
  env?: any;

  constructor(modelName: string, config: any = {}, env?: any) {
    this.modelName = modelName;
    this.config = config;
    this.env = env;
  }

  id() {
    return `cohere:${this.modelName}`;
  }

  getApiKey(): string | undefined {
    return (
      this.config.apiKey ||
      (this.config?.apiKeyEnvar
        ? this.env?.[this.config.apiKeyEnvar as keyof EnvOverrides] ||
          getEnvString(this.config.apiKeyEnvar)
        : undefined) ||
      this.env?.COHERE_API_KEY ||
      getEnvString('COHERE_API_KEY')
    );
  }

  getApiUrl(): string {
    return (
      this.config.apiBaseUrl ||
      this.env?.COHERE_API_BASE_URL ||
      getEnvString('COHERE_API_BASE_URL') ||
      DEFAULT_COHERE_EMBEDDING_API_BASE_URL
    ).replace(/\/+$/, '');
  }

  async callApi(): Promise<ProviderResponse> {
    throw new Error('Cohere API does not provide text inference.');
  }

  async callEmbeddingApi(input: string): Promise<ProviderEmbeddingResponse> {
    if (!this.getApiKey()) {
      throw new Error('Cohere API key must be set for embedding');
    }

    const apiUrl = getCohereEmbeddingApiUrl(this.getApiUrl());
    const body = {
      model: this.modelName,
      texts: [input],
      input_type: 'classification',
      truncate: this.config.truncate || 'NONE',
      ...(isCohereV2EmbeddingApiUrl(apiUrl) && { embedding_types: ['float'] }),
    };

    let data;
    try {
      ({ data } = (await fetchWithCache(
        apiUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.getApiKey()}`,
            'X-Client-Name':
              this.env?.COHERE_CLIENT_NAME || getEnvString('COHERE_CLIENT_NAME') || 'promptfoo',
          },
          body: JSON.stringify(body),
        },
        getRequestTimeoutMs(),
        'json',
        // The default cache key includes request headers. Avoid persisting a cache identity
        // derived from the bearer token because Cohere does not expose a safe tenant ID.
        true,
      )) as unknown as any);
    } catch (err) {
      logger.error(`API call error: ${err}`);
      throw err;
    }

    const embedding = Array.isArray(data?.embeddings)
      ? data.embeddings[0]
      : data?.embeddings?.float?.[0];
    if (!embedding) {
      throw new Error('No embedding found in Cohere embeddings API response');
    }
    return {
      embedding,
      tokenUsage: {
        prompt: data.meta?.billed_units?.input_tokens || 0,
        total: data.meta?.billed_units?.input_tokens || 0,
        numRequests: 1,
      },
    };
  }
}
