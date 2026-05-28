/**
 * Langfuse Traces Integration
 *
 * Fetches traces from Langfuse and converts them to promptfoo TestCase objects.
 * This allows users to evaluate LLM outputs that are already stored in Langfuse.
 *
 * URL format: langfuse://traces?<params>
 *
 * Supported parameters:
 *   - limit: Maximum number of traces to fetch (default: 100, max: 1000)
 *   - userId: Filter by user ID
 *   - sessionId: Filter by session ID
 *   - tags: Filter by tags (comma-separated)
 *   - name: Filter by trace name
 *   - fromTimestamp: Start timestamp (ISO 8601)
 *   - toTimestamp: End timestamp (ISO 8601)
 *   - version: Filter by version
 *   - release: Filter by release
 *
 * Environment variables:
 *   - LANGFUSE_PUBLIC_KEY: Langfuse public key
 *   - LANGFUSE_SECRET_KEY: Langfuse secret key
 *   - LANGFUSE_BASE_URL or LANGFUSE_HOST: Langfuse host URL
 */

import cliProgress from 'cli-progress';
import cliState from '../cliState';
import { getEnvString, isCI } from '../envars';
import logger from '../logger';
import { getLangfuseBaseUrl, LANGFUSE_AUTH_ENV_VARS } from './langfuseShared';
import type { ApiTraceListParams, ApiTraces } from 'langfuse';

import type { TestCase, VarValue } from '../types';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;
const PAGE_SIZE = 100;
const TRACE_LIST_FIELDS = 'core,io';
const LANGFUSE_TRACES_PREFIX = 'langfuse://traces';

interface LangfuseTrace {
  id: string;
  timestamp: string;
  name?: string | null;
  input?: unknown;
  output?: unknown;
  sessionId?: string | null;
  release?: string | null;
  version?: string | null;
  userId?: string | null;
  metadata?: Record<string, unknown> | null;
  tags?: string[] | null;
  htmlPath?: string;
  latency?: number;
  totalCost?: number;
}

type LangfuseTracesResponse = ApiTraces;

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

interface LangfuseTracesClient {
  api: {
    traceList(query: ApiTraceListParams): Promise<LangfuseTracesResponse>;
  };
  shutdownAsync(): Promise<void>;
}

type MessageContent = {
  role?: unknown;
  content?: unknown;
};

const TEXT_BLOCK_TYPES = new Set(['text', 'input_text', 'output_text']);

let langfuseInstance: LangfuseTracesClient | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDefinedVarValue(value: unknown): value is VarValue {
  return value !== undefined && value !== null;
}

function setVar(vars: Record<string, VarValue>, key: string, value: unknown): void {
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
  return textValues.length > 0 ? joinTextValues(textValues) : undefined;
}

function extractTextBlocks(content: unknown[]): unknown {
  return extractTextBlocksIfPresent(content) ?? JSON.stringify(content);
}

function extractMessageContent(messagesInput: unknown[]): unknown | undefined {
  const messages = messagesInput.filter(isRecord) as MessageContent[];
  if (messages.length === 0) {
    return undefined;
  }

  // Get the last user message, or the last message if no user message.
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

  if (Array.isArray(item.content)) {
    return extractTextBlocks(item.content);
  }

  if ((item.type === 'message' || item.role === 'assistant') && item.content !== undefined) {
    return item.content;
  }

  return undefined;
}

function extractOutputItemsText(outputItems: unknown[]): unknown | undefined {
  const textValues = outputItems.map(extractOutputItemText).filter((value) => value !== undefined);

  return textValues.length > 0 ? joinTextValues(textValues) : undefined;
}

function extractChatChoiceText(choice: unknown): unknown | undefined {
  if (!isRecord(choice)) {
    return undefined;
  }

  if (isRecord(choice.message)) {
    const content = choice.message.content;
    if (content !== undefined && content !== null) {
      return Array.isArray(content) ? extractTextBlocks(content) : content;
    }

    const toolCall = choice.message.tool_calls ?? choice.message.function_call;
    if (toolCall !== undefined && toolCall !== null) {
      return toolCall;
    }
  }

  return choice.text;
}

function buildTraceUrl(baseUrl: string, htmlPath?: string): string | undefined {
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

/**
 * Get or create the Langfuse client instance
 */
async function getLangfuseClient(): Promise<LangfuseTracesClient> {
  if (langfuseInstance) {
    return langfuseInstance;
  }

  const publicKey = getEnvString('LANGFUSE_PUBLIC_KEY');
  const secretKey = getEnvString('LANGFUSE_SECRET_KEY');
  const baseUrl = getLangfuseBaseUrl();

  if (!publicKey || !secretKey) {
    throw new Error(
      'Langfuse credentials not configured. Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY environment variables.',
    );
  }

  let Langfuse: typeof import('langfuse').Langfuse;
  try {
    ({ Langfuse } = await import('langfuse'));
  } catch (error) {
    throw new Error(
      `The langfuse package is required for Langfuse traces integration. Install it with: npm install langfuse. Original error: ${getFetchErrorMessage(error)}`,
    );
  }

  langfuseInstance = new Langfuse({
    publicKey,
    secretKey,
    baseUrl,
  }) as unknown as LangfuseTracesClient;
  return langfuseInstance;
}

/**
 * Parse the langfuse://traces URL and extract query parameters
 */
export function parseTracesUrl(url: string): FetchTracesQuery {
  if (!isLangfuseTracesUrl(url)) {
    throw new Error(`Invalid Langfuse traces URL: ${redactTracesUrl(url)}`);
  }

  const queryString = url.slice(LANGFUSE_TRACES_PREFIX.length).replace(/^\?/, '');
  const params = new URLSearchParams(queryString);

  const query: FetchTracesQuery = {};

  // Parse limit with validation
  const limitParam = params.get('limit');
  if (limitParam) {
    const limit = Number(limitParam);
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error(`Invalid limit parameter: ${limitParam}`);
    }
    query.limit = Math.min(limit, MAX_LIMIT);
  }

  // Parse other string parameters
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
    if (value) {
      query[param] = value;
    }
  }

  const tags = params
    .getAll('tags')
    .flatMap((value) => value.split(','))
    .map((tag) => tag.trim())
    .filter(Boolean);
  if (tags.length > 0) {
    query.tags = tags;
  }

  return query;
}

/**
 * Extract text content from various input formats
 */
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

  // Simple key patterns: { query, prompt, message, input, text }.
  // Responses requests commonly nest message arrays under `input`; process
  // those through the same extractor rather than stringifying envelopes.
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

/**
 * Extract text content from various output formats
 */
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

  // Anthropic format: { content: [{type: 'text', text: '...'}] } or { content: '...' }
  if (obj.content !== undefined) {
    if (Array.isArray(obj.content)) {
      return extractTextBlocks(obj.content);
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

/**
 * Convert a Langfuse trace to a promptfoo TestCase
 */
function traceToTestCase(trace: LangfuseTrace, baseUrl: string): TestCase {
  // Extract input and output, handling different formats
  const inputValue = extractInputText(trace.input);
  const outputValue = extractOutputText(trace.output);

  const traceUrl = buildTraceUrl(baseUrl, trace.htmlPath);

  // Create the test case with vars populated from trace data
  // Build vars object, filtering out undefined values
  const vars: Record<string, VarValue> = {
    // Prefixed Langfuse fields to avoid collisions
    __langfuse_trace_id: trace.id,
    __langfuse_timestamp: trace.timestamp,
  };

  // Add optional fields only if they have values
  setVar(vars, '__langfuse_input', trace.input);
  setVar(vars, '__langfuse_output', trace.output);
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
  if (trace.metadata) {
    vars.__langfuse_metadata = trace.metadata as Record<string, unknown>;
  }
  if (trace.latency !== undefined) {
    vars.__langfuse_latency = trace.latency;
  }
  if (trace.totalCost !== undefined) {
    vars.__langfuse_cost = trace.totalCost;
  }
  if (traceUrl) {
    vars.__langfuse_url = traceUrl;
  }

  // Also provide convenient unprefixed access to main content
  setVar(vars, 'input', inputValue);
  setVar(vars, 'output', outputValue);

  const testCase: TestCase = {
    description: `Trace: ${trace.name || trace.id} (${new Date(trace.timestamp).toLocaleDateString()})`,
    vars,
    metadata: {
      langfuseTraceId: trace.id,
      langfuseTraceUrl: traceUrl,
    },
    options: {
      // Disable variable expansion since trace data is already resolved
      disableVarExpansion: true,
    },
  };

  // Never fall back to a configured provider for stored-trace evaluation.
  testCase.providerOutput =
    outputValue === undefined || outputValue === null
      ? ''
      : typeof outputValue === 'string'
        ? outputValue
        : JSON.stringify(outputValue);

  return testCase;
}

function createProgressBar(limit: number): cliProgress.SingleBar | undefined {
  if (cliState.webUI || isCI() || limit <= PAGE_SIZE) {
    return undefined;
  }

  const progressBar = new cliProgress.SingleBar(
    {
      format: 'Fetching Langfuse traces [{bar}] {percentage}% | {value}/{total} traces',
      hideCursor: true,
      stopOnComplete: true,
    },
    cliProgress.Presets.shades_classic,
  );
  progressBar.start(limit, 0);
  return progressBar;
}

function getFetchErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function fetchTracePage(
  langfuse: LangfuseTracesClient,
  fetchQuery: FetchTracesQuery,
): Promise<LangfuseTracesResponse> {
  try {
    const response = await langfuse.api.traceList(fetchQuery);
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
        `Langfuse authentication failed. Check your ${LANGFUSE_AUTH_ENV_VARS} environment variables.`,
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

function shouldFetchNextPage(
  response: LangfuseTracesResponse,
  currentPage: number,
  pageLimit: number,
): boolean {
  if (response.meta) {
    return currentPage < response.meta.totalPages;
  }
  return response.data.length === pageLimit;
}

/**
 * Fetch traces from Langfuse and convert them to TestCase objects
 *
 * @param url - The langfuse://traces URL with query parameters
 * @returns Array of TestCase objects
 */
export async function fetchLangfuseTraces(url: string): Promise<TestCase[]> {
  const query = parseTracesUrl(url);
  const limit = query.limit ?? DEFAULT_LIMIT;
  const appliedFilters = Object.keys(query).filter((key) => key !== 'limit');

  logger.debug('[Langfuse Traces] Fetching traces', { limit, appliedFilters });

  const langfuse = await getLangfuseClient();
  const baseUrl = getLangfuseBaseUrl();

  const tests: TestCase[] = [];
  let page = 1;
  let hasMore = true;
  const pageLimit = Math.min(PAGE_SIZE, limit);
  const progressBar = createProgressBar(limit);

  try {
    while (hasMore && tests.length < limit) {
      // Build the query for this page
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

      // Convert traces to test cases
      for (const trace of response.data) {
        if (tests.length >= limit) {
          break;
        }
        tests.push(traceToTestCase(trace, baseUrl));
      }

      // Update progress
      if (progressBar) {
        progressBar.update(tests.length);
      }

      // If no metadata is present, assume more pages when the page is full.
      hasMore = shouldFetchNextPage(response, page, pageLimit);

      page++;

      // Log progress for large fetches
      if (tests.length > 0 && tests.length % 100 === 0) {
        logger.debug('[Langfuse Traces] Fetch progress', { traceCount: tests.length });
      }
    }
  } finally {
    if (progressBar) {
      progressBar.stop();
    }
  }

  logger.info('[Langfuse Traces] Loaded traces', {
    traceCount: tests.length,
    appliedFilters,
  });

  if (tests.length === 0) {
    logger.warn(
      '[Langfuse Traces] No traces found. Check your filter parameters or ensure traces exist in Langfuse.',
    );
  }

  return tests;
}

/**
 * Shutdown the Langfuse client (call when done)
 */
export async function shutdownLangfuse(): Promise<void> {
  if (langfuseInstance) {
    await langfuseInstance.shutdownAsync();
    langfuseInstance = undefined;
  }
}
