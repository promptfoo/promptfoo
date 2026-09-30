import { getEnvString } from '../envars';
import logger from '../logger';
import { getLangfuseClient } from './langfuse';
import type { LangfuseClient } from '@langfuse/client';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;
const PAGE_SIZE = 100;
const TRACE_LIST_FIELDS = 'core,io,metrics';
const LANGFUSE_TRACES_PREFIX = 'langfuse://traces';

type LangfuseTracesResponse = Awaited<ReturnType<LangfuseClient['api']['trace']['list']>>;
type LangfuseTrace = LangfuseTracesResponse['data'][number];

interface FetchTracesQuery {
  fields?: string;
  limit?: number;
  page?: number;
  userId?: string;
  sessionId?: string;
  tags?: string[];
  name?: string;
  fromTimestamp?: string;
  toTimestamp?: string;
  version?: string;
  release?: string;
}

type TraceVarValue = string | number | boolean | object | unknown[];

export interface LangfuseTraceTestCase {
  description?: string;
  vars?: Record<string, TraceVarValue>;
  metadata?: Record<string, unknown>;
  options?: {
    disableVarExpansion?: boolean;
  };
  providerOutput?: string | Record<string, unknown>;
}

type MessageContent = {
  role?: unknown;
  content?: unknown;
};

const TEXT_BLOCK_TYPES = new Set(['text', 'input_text', 'output_text']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDefinedVarValue(value: unknown): value is TraceVarValue {
  return value !== undefined && value !== null;
}

function setVar(vars: Record<string, TraceVarValue>, key: string, value: unknown): void {
  if (isDefinedVarValue(value)) {
    vars[key] = value;
  }
}

function isTextBlock(value: unknown): value is { text: unknown } {
  return (
    isRecord(value) &&
    typeof value.type === 'string' &&
    TEXT_BLOCK_TYPES.has(value.type) &&
    'text' in value
  );
}

function getTextBlockValues(content: unknown[]): unknown[] {
  return content.filter(isTextBlock).map((item) => item.text);
}

function joinTextValues(textValues: unknown[]): unknown {
  if (textValues.length === 1) {
    return textValues[0];
  }
  return textValues
    .map((text) => (typeof text === 'string' ? text : JSON.stringify(text)))
    .join('\n');
}

function extractTextBlocksIfPresent(content: unknown[]): unknown | undefined {
  const textValues = getTextBlockValues(content);
  if (textValues.some((value) => typeof value === 'object' && value !== null)) {
    return textValues.length === 1 ? textValues[0] : textValues.flat();
  }
  return textValues.length > 0 ? joinTextValues(textValues) : undefined;
}

function extractTextBlocks(content: unknown[]): unknown {
  if (content.length === 0) {
    return '';
  }
  return extractTextBlocksIfPresent(content) ?? JSON.stringify(content);
}

function getMessageToolCalls(message: Record<string, unknown>): unknown {
  return Array.isArray(message.tool_calls) && message.tool_calls.length > 0
    ? message.tool_calls
    : message.function_call;
}

function extractMessageContent(messagesInput: unknown[]): unknown | undefined {
  const messages = messagesInput.filter(isRecord) as MessageContent[];
  if (messages.length === 0) {
    return undefined;
  }

  const userMessages = messages.filter((message) => message.role === 'user');
  const lastMessage =
    userMessages.length > 0 ? userMessages[userMessages.length - 1] : messages[messages.length - 1];

  if (!lastMessage || !('content' in lastMessage)) {
    return undefined;
  }

  const content = lastMessage.content;
  if (Array.isArray(content)) {
    return extractTextBlocks(content);
  }
  return content;
}

function extractOutputItemText(item: unknown): unknown | undefined {
  if (!isRecord(item)) {
    return undefined;
  }

  if (isTextBlock(item)) {
    return item.text;
  }

  if (getMessageToolCalls(item) && item.content != null) {
    return item;
  }
  if (Array.isArray(item.content)) {
    return item.content.every(isTextBlock) ? extractTextBlocks(item.content) : item.content;
  }

  if (item.type === 'message' || item.role === 'assistant') {
    if (item.content !== undefined && item.content !== null) {
      return item.content;
    }

    const toolCall = getMessageToolCalls(item);
    if (toolCall !== undefined && toolCall !== null) {
      return toolCall;
    }
  }

  return undefined;
}

function extractOutputItemsText(outputItems: unknown[]): unknown | undefined {
  if (outputItems.length === 0) {
    return '';
  }
  if (
    outputItems.some(
      (item) =>
        isRecord(item) &&
        !isTextBlock(item) &&
        item.type !== 'message' &&
        item.type !== 'reasoning' &&
        item.role !== 'assistant',
    )
  ) {
    return outputItems;
  }
  const textValues = outputItems.map(extractOutputItemText).filter((value) => value !== undefined);

  if (textValues.some((value) => typeof value === 'object' && value !== null)) {
    return textValues.length === 1 ? textValues[0] : textValues.flat();
  }
  return textValues.length > 0 ? joinTextValues(textValues) : undefined;
}

function extractChatChoiceText(choice: unknown): unknown | undefined {
  if (!isRecord(choice)) {
    return undefined;
  }

  if (isRecord(choice.message)) {
    if (typeof choice.message.refusal === 'string' && choice.message.refusal) {
      return choice.message.refusal;
    }
    const content = choice.message.content;
    if (content != null && getMessageToolCalls(choice.message)) {
      return choice.message;
    }
    if (content !== undefined && content !== null) {
      return Array.isArray(content) && content.every(isTextBlock)
        ? extractTextBlocks(content)
        : content;
    }

    const toolCall = getMessageToolCalls(choice.message);
    if (toolCall !== undefined && toolCall !== null) {
      return toolCall;
    }
  }

  return choice.text;
}

function buildTraceUrl(baseUrl: string, htmlPath?: string | null): string | undefined {
  if (!htmlPath) {
    return undefined;
  }
  if (/^https?:\/\//i.test(htmlPath)) {
    return htmlPath;
  }
  return `${baseUrl}${htmlPath.startsWith('/') ? '' : '/'}${htmlPath}`;
}

export function isLangfuseTracesUrl(url: string): boolean {
  return url === LANGFUSE_TRACES_PREFIX || url.startsWith(`${LANGFUSE_TRACES_PREFIX}?`);
}

function redactTracesUrl(url: string): string {
  const [prefix, queryString] = url.split('?', 2);
  return queryString === undefined ? prefix : `${prefix}?<redacted>`;
}

export function parseTracesUrl(url: string): FetchTracesQuery {
  if (!isLangfuseTracesUrl(url)) {
    throw new Error(`Invalid Langfuse traces URL: ${redactTracesUrl(url)}`);
  }

  const queryString = url.slice(LANGFUSE_TRACES_PREFIX.length).replace(/^\?/, '');
  const params = new URLSearchParams(queryString);
  const supported = new Set([
    'limit',
    'userId',
    'sessionId',
    'tags',
    'name',
    'fromTimestamp',
    'toTimestamp',
    'version',
    'release',
  ]);
  for (const key of params.keys()) {
    if (!supported.has(key) || (key !== 'tags' && params.getAll(key).length > 1)) {
      throw new Error(
        'Unsupported or repeated Langfuse trace selector. Check the documented query parameters.',
      );
    }
  }

  const query: FetchTracesQuery = {};

  const limitParam = params.get('limit');
  if (limitParam !== null) {
    const limit = Number(limitParam);
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error('Invalid limit parameter: expected a positive integer');
    }
    query.limit = Math.min(limit, MAX_LIMIT);
  }

  const stringParams = [
    'userId',
    'sessionId',
    'name',
    'fromTimestamp',
    'toTimestamp',
    'version',
    'release',
  ] as const;

  for (const param of stringParams) {
    const value = params.get(param);
    if (value !== null) {
      if (!value.trim()) {
        throw new Error('Langfuse trace selectors must not be empty.');
      }
      query[param] = value;
    }
  }

  const tags = params
    .getAll('tags')
    .flatMap((value) => value.split(','))
    .map((tag) => tag.trim())
    .filter(Boolean);
  if (params.has('tags')) {
    if (tags.length === 0) {
      throw new Error('Langfuse trace selectors must not be empty.');
    }
    query.tags = tags;
  }

  return query;
}

function extractInputText(input: unknown): unknown {
  if (typeof input === 'string') {
    return input;
  }

  if (Array.isArray(input)) {
    return extractMessageContent(input) ?? extractTextBlocksIfPresent(input) ?? input;
  }

  if (typeof input !== 'object' || input === null) {
    return input;
  }

  const obj = input as Record<string, unknown>;

  // OpenAI chat format: { messages: [{role: 'user', content: '...'}] }
  if (Array.isArray(obj.messages) && obj.messages.length > 0) {
    const content = extractMessageContent(obj.messages);
    if (content !== undefined) {
      return content;
    }
  }

  // Responses requests can nest message arrays under `input`.
  if (obj.query !== undefined) {
    return obj.query;
  }
  if (obj.prompt !== undefined) {
    return obj.prompt;
  }
  if (obj.message !== undefined) {
    return obj.message;
  }
  if (obj.input !== undefined) {
    return extractInputText(obj.input);
  }
  return obj.text ?? input;
}

function extractOutputText(output: unknown): unknown {
  if (typeof output === 'string') {
    return output;
  }

  if (Array.isArray(output)) {
    return extractOutputItemsText(output) ?? output;
  }

  if (typeof output !== 'object' || output === null) {
    return output;
  }

  const obj = output as Record<string, unknown>;

  // OpenAI completion format: { choices: [{message: {content: '...'}}] } or { choices: [{text: '...'}] }
  if (Array.isArray(obj.choices) && obj.choices.length > 0) {
    const choiceText = extractChatChoiceText(obj.choices[0]);
    if (choiceText !== undefined) {
      return choiceText;
    }
  }

  if (obj.type === 'message' || obj.role === 'assistant') {
    const messageText = extractOutputItemText(obj);
    if (messageText !== undefined) {
      return messageText;
    }
  }

  // Anthropic format: { content: [{type: 'text', text: '...'}] } or { content: '...' }
  if (obj.content !== undefined) {
    if (Array.isArray(obj.content)) {
      return obj.content.every(isTextBlock) ? extractTextBlocks(obj.content) : obj.content;
    }
    return obj.content;
  }

  // Simple key patterns: { response, output, result, completion, text }
  if (Array.isArray(obj.output)) {
    const outputText = extractOutputItemsText(obj.output);
    if (outputText !== undefined) {
      return outputText;
    }
  }

  return (
    obj.response ??
    obj.output_text ??
    obj.output ??
    obj.result ??
    obj.completion ??
    obj.text ??
    output
  );
}

function traceToTestCase(trace: LangfuseTrace, baseUrl: string): LangfuseTraceTestCase {
  const inputValue = extractInputText(trace.input);
  const outputValue = extractOutputText(trace.output);

  const traceUrl = buildTraceUrl(baseUrl, trace.htmlPath);

  const vars: Record<string, TraceVarValue> = {
    __langfuse_trace_id: trace.id,
    __langfuse_timestamp: trace.timestamp,
  };

  setVar(vars, '__langfuse_input', trace.input);
  if (trace.name) {
    vars.__langfuse_name = trace.name;
  }
  if (trace.userId) {
    vars.__langfuse_user_id = trace.userId;
  }
  if (trace.sessionId) {
    vars.__langfuse_session_id = trace.sessionId;
  }
  if (trace.tags) {
    vars.__langfuse_tags = trace.tags;
  }
  setVar(vars, '__langfuse_metadata', trace.metadata);
  if (typeof trace.latency === 'number') {
    vars.__langfuse_latency = trace.latency;
  }
  if (typeof trace.totalCost === 'number') {
    vars.__langfuse_cost = trace.totalCost;
  }
  if (traceUrl) {
    vars.__langfuse_url = traceUrl;
  }

  setVar(vars, 'input', inputValue);

  const testCase: LangfuseTraceTestCase = {
    description: `Trace: ${trace.name || trace.id} (${new Date(trace.timestamp).toLocaleDateString()})`,
    vars,
    metadata: {
      __promptfoo: { remoteVars: Object.keys(vars) },
      langfuseTraceId: trace.id,
      langfuseTraceUrl: traceUrl,
    },
    options: {
      // Arrays in trace payloads are data, not separate test cases.
      disableVarExpansion: true,
    },
  };

  // Never fall back to a configured provider for stored-trace evaluation.
  if (outputValue === undefined || outputValue === null) {
    testCase.providerOutput = '';
  } else if (Array.isArray(outputValue)) {
    const toolCalls = outputValue.flatMap((item) => {
      if (!isRecord(item)) {
        return [];
      }
      if (isRecord(item.function)) {
        return [item];
      }
      if (item.type === 'function_call') {
        return [
          {
            id: item.call_id ?? item.id,
            type: 'function',
            function: { name: item.name, arguments: item.arguments },
          },
        ];
      }
      return Array.isArray(item.tool_calls) ? item.tool_calls : [];
    });
    const onlyToolCalls = outputValue.every(
      (item) => isRecord(item) && (isRecord(item.function) || item.type === 'function_call'),
    );
    testCase.providerOutput =
      toolCalls.length > 0
        ? { tool_calls: toolCalls, ...(!onlyToolCalls && { content: outputValue }) }
        : JSON.stringify(outputValue);
  } else {
    testCase.providerOutput =
      isRecord(outputValue) || typeof outputValue === 'string'
        ? outputValue
        : JSON.stringify(outputValue);
  }

  return testCase;
}

function getFetchErrorMessage(error: unknown): string {
  if (isRecord(error) && typeof (error.status ?? error.statusCode) === 'number') {
    return `HTTP ${error.status ?? error.statusCode}`;
  }
  return error instanceof Error ? error.message : String(error);
}

async function fetchTracePage(
  langfuse: LangfuseClient,
  fetchQuery: FetchTracesQuery,
): Promise<LangfuseTracesResponse> {
  try {
    const response = await langfuse.api.trace.list(fetchQuery);
    if (!response) {
      throw new Error(
        'Langfuse returned an empty response. Check your credentials and network connection.',
      );
    }
    return response;
  } catch (error) {
    const message = getFetchErrorMessage(error);
    if (message.includes('Langfuse returned an empty response')) {
      throw error;
    }
    if (message.includes('401') || message.includes('Unauthorized')) {
      throw new Error(
        'Langfuse authentication failed. Check LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY.',
      );
    }
    if (message.includes('403') || message.includes('Forbidden')) {
      throw new Error(
        'Langfuse access denied. Your API key may not have permission to access traces.',
      );
    }
    throw new Error(`Failed to fetch traces from Langfuse: ${message}`);
  }
}

export async function fetchLangfuseTraces(url: string): Promise<LangfuseTraceTestCase[]> {
  const query = parseTracesUrl(url);
  const limit = query.limit ?? DEFAULT_LIMIT;
  const appliedFilters = Object.keys(query).filter((key) => key !== 'limit');

  logger.debug('[Langfuse Traces] Fetching traces', { limit, appliedFilters });

  if (!getEnvString('LANGFUSE_PUBLIC_KEY') || !getEnvString('LANGFUSE_SECRET_KEY')) {
    throw new Error(
      'Langfuse credentials not configured. Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY.',
    );
  }
  const baseUrl = (
    getEnvString('LANGFUSE_HOST') ||
    getEnvString('LANGFUSE_BASE_URL') ||
    'https://cloud.langfuse.com'
  ).replace(/\/+$/, '');
  const langfuse = await getLangfuseClient();

  const tests: LangfuseTraceTestCase[] = [];
  let page = 1;
  let hasMore = true;
  const pageLimit = Math.min(PAGE_SIZE, limit);
  while (hasMore && tests.length < limit) {
    const fetchQuery: FetchTracesQuery = {
      ...query,
      fields: TRACE_LIST_FIELDS,
      limit: pageLimit,
      page,
    };

    logger.debug('[Langfuse Traces] Fetching page', { page, pageLimit });

    const response = await fetchTracePage(langfuse, fetchQuery);

    if (!response.data || response.data.length === 0) {
      logger.debug('[Langfuse Traces] No more traces found', { page });
      break;
    }

    for (const trace of response.data) {
      if (tests.length >= limit) {
        break;
      }
      tests.push(traceToTestCase(trace, baseUrl));
    }

    // If no metadata is present, assume more pages when the page is full.
    hasMore = response.meta ? page < response.meta.totalPages : response.data.length === pageLimit;

    page++;

    if (tests.length > 0 && tests.length % 100 === 0) {
      logger.debug('[Langfuse Traces] Fetch progress', { traceCount: tests.length });
    }
  }

  logger.info('[Langfuse Traces] Loaded traces', {
    traceCount: tests.length,
    appliedFilters,
  });

  if (tests.length === 0) {
    throw new Error(
      'No Langfuse traces matched the filters. Check the trace source and filter parameters.',
    );
  }

  return tests;
}
