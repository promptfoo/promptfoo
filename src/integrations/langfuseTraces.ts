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
import type { TestCase } from '../types';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;
const PAGE_SIZE = 100;

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

interface LangfuseTracesResponse {
  data: LangfuseTrace[];
  meta?: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

interface FetchTracesQuery {
  limit?: number;
  page?: number;
  userId?: string;
  sessionId?: string;
  tags?: string | string[];
  name?: string;
  fromTimestamp?: string;
  toTimestamp?: string;
  version?: string;
  release?: string;
}

let langfuseInstance: any;

/**
 * Get or create the Langfuse client instance
 */
async function getLangfuseClient(): Promise<any> {
  if (langfuseInstance) {
    return langfuseInstance;
  }

  const publicKey = getEnvString('LANGFUSE_PUBLIC_KEY');
  const secretKey = getEnvString('LANGFUSE_SECRET_KEY');
  const baseUrl =
    getEnvString('LANGFUSE_BASE_URL') ||
    getEnvString('LANGFUSE_HOST') ||
    'https://cloud.langfuse.com';

  if (!publicKey || !secretKey) {
    throw new Error(
      'Langfuse credentials not configured. Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY environment variables.',
    );
  }

  try {
    const { Langfuse } = await import('langfuse');
    langfuseInstance = new Langfuse({
      publicKey,
      secretKey,
      baseUrl,
    });
    return langfuseInstance;
  } catch {
    throw new Error(
      'The langfuse package is required for Langfuse traces integration. Install it with: npm install langfuse',
    );
  }
}

/**
 * Parse the langfuse://traces URL and extract query parameters
 */
export function parseTracesUrl(url: string): FetchTracesQuery {
  // Remove the langfuse://traces prefix
  const queryString = url.replace(/^langfuse:\/\/traces\??/, '');
  const params = new URLSearchParams(queryString);

  const query: FetchTracesQuery = {};

  // Parse limit with validation
  const limitParam = params.get('limit');
  if (limitParam) {
    const limit = parseInt(limitParam, 10);
    if (isNaN(limit) || limit < 1) {
      throw new Error(`Invalid limit parameter: ${limitParam}`);
    }
    query.limit = Math.min(limit, MAX_LIMIT);
  }

  // Parse other string parameters
  const stringParams: Array<keyof FetchTracesQuery> = [
    'userId',
    'sessionId',
    'name',
    'fromTimestamp',
    'toTimestamp',
    'version',
    'release',
  ];

  for (const param of stringParams) {
    const value = params.get(param);
    if (value) {
      (query as any)[param] = value;
    }
  }

  // Parse tags (comma-separated or multiple params)
  const tagsParam = params.get('tags');
  if (tagsParam) {
    query.tags = tagsParam;
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

  if (typeof input !== 'object' || input === null) {
    return input;
  }

  const obj = input as Record<string, unknown>;

  // OpenAI chat format: { messages: [{role: 'user', content: '...'}] }
  if (Array.isArray(obj.messages) && obj.messages.length > 0) {
    // Get the last user message, or the last message if no user message
    const userMessages = obj.messages.filter((m: any) => m.role === 'user');
    const lastMessage = userMessages.length > 0 ? userMessages[userMessages.length - 1] : obj.messages[obj.messages.length - 1];
    if (lastMessage && typeof lastMessage === 'object' && 'content' in lastMessage) {
      const content = (lastMessage as any).content;
      // Handle Anthropic-style content array
      if (Array.isArray(content)) {
        const textBlock = content.find((c: any) => c.type === 'text');
        return textBlock?.text ?? JSON.stringify(content);
      }
      return content;
    }
  }

  // Simple key patterns: { query, prompt, message, input, text }
  return obj.query ?? obj.prompt ?? obj.message ?? obj.input ?? obj.text ?? input;
}

/**
 * Extract text content from various output formats
 */
function extractOutputText(output: unknown): unknown {
  if (typeof output === 'string') {
    return output;
  }

  if (typeof output !== 'object' || output === null) {
    return output;
  }

  const obj = output as Record<string, unknown>;

  // OpenAI completion format: { choices: [{message: {content: '...'}}] } or { choices: [{text: '...'}] }
  if (Array.isArray(obj.choices) && obj.choices.length > 0) {
    const choice = obj.choices[0] as any;
    if (choice.message?.content !== undefined) {
      return choice.message.content;
    }
    if (choice.text !== undefined) {
      return choice.text;
    }
  }

  // Anthropic format: { content: [{type: 'text', text: '...'}] } or { content: '...' }
  if (obj.content !== undefined) {
    if (Array.isArray(obj.content)) {
      const textBlock = obj.content.find((c: any) => c.type === 'text');
      return textBlock?.text ?? JSON.stringify(obj.content);
    }
    return obj.content;
  }

  // Simple key patterns: { response, output, result, completion, text }
  return obj.response ?? obj.output ?? obj.result ?? obj.completion ?? obj.text ?? output;
}

/**
 * Convert a Langfuse trace to a promptfoo TestCase
 */
function traceToTestCase(trace: LangfuseTrace, baseUrl: string): TestCase {
  // Extract input and output, handling different formats
  const inputValue = extractInputText(trace.input);
  const outputValue = extractOutputText(trace.output);

  // Build the trace URL
  const traceUrl = trace.htmlPath ? `${baseUrl}${trace.htmlPath}` : undefined;

  // Create the test case with vars populated from trace data
  const testCase: TestCase = {
    description: `Trace: ${trace.name || trace.id} (${new Date(trace.timestamp).toLocaleDateString()})`,
    vars: {
      // Prefixed Langfuse fields to avoid collisions
      __langfuse_trace_id: trace.id,
      __langfuse_input: trace.input,
      __langfuse_output: trace.output,
      __langfuse_timestamp: trace.timestamp,
      __langfuse_name: trace.name ?? undefined,
      __langfuse_user_id: trace.userId ?? undefined,
      __langfuse_session_id: trace.sessionId ?? undefined,
      __langfuse_tags: trace.tags ?? undefined,
      __langfuse_metadata: trace.metadata ?? undefined,
      __langfuse_latency: trace.latency,
      __langfuse_cost: trace.totalCost,
      __langfuse_url: traceUrl,

      // Also provide convenient unprefixed access to main content
      input: inputValue,
      output: outputValue,
    },
    metadata: {
      langfuseTraceId: trace.id,
      langfuseTraceUrl: traceUrl,
    },
    options: {
      // Disable variable expansion since trace data is already resolved
      disableVarExpansion: true,
    },
  };

  // If we have an output, set providerOutput for assertion-only evaluation
  // This allows evaluating stored outputs without re-running the LLM
  if (outputValue !== undefined && outputValue !== null) {
    testCase.providerOutput = {
      output: typeof outputValue === 'string' ? outputValue : JSON.stringify(outputValue),
      tokenUsage: undefined,
      cost: trace.totalCost,
      latency: trace.latency ? trace.latency * 1000 : undefined, // Convert to ms
    };
  }

  return testCase;
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

  logger.debug(`[Langfuse Traces] Fetching traces with query: ${JSON.stringify(query)}`);

  const langfuse = await getLangfuseClient();
  const baseUrl =
    getEnvString('LANGFUSE_BASE_URL') ||
    getEnvString('LANGFUSE_HOST') ||
    'https://cloud.langfuse.com';

  const tests: TestCase[] = [];
  let page = 1;
  let hasMore = true;

  // Initialize progress bar for large fetches
  let progressBar: cliProgress.SingleBar | undefined;
  const showProgress = !cliState.webUI && !isCI() && limit > PAGE_SIZE;

  if (showProgress) {
    progressBar = new cliProgress.SingleBar(
      {
        format: 'Fetching Langfuse traces [{bar}] {percentage}% | {value}/{total} traces',
        hideCursor: true,
        stopOnComplete: true,
      },
      cliProgress.Presets.shades_classic,
    );
    progressBar.start(limit, 0);
  }

  try {
    while (hasMore && tests.length < limit) {
      const pageLimit = Math.min(PAGE_SIZE, limit - tests.length);

      // Build the query for this page
      const fetchQuery: FetchTracesQuery = {
        ...query,
        limit: pageLimit,
        page,
      };

      logger.debug(`[Langfuse Traces] Fetching page ${page} with limit ${pageLimit}`);

      let response: LangfuseTracesResponse;
      try {
        response = await langfuse.fetchTraces(fetchQuery);
      } catch (fetchError: any) {
        // Handle API errors with helpful messages
        const message = fetchError?.message || String(fetchError);
        if (message.includes('401') || message.includes('Unauthorized')) {
          throw new Error(
            `Langfuse authentication failed. Check your LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, and LANGFUSE_BASE_URL environment variables.`,
          );
        }
        if (message.includes('403') || message.includes('Forbidden')) {
          throw new Error(
            `Langfuse access denied. Your API key may not have permission to access traces.`,
          );
        }
        throw new Error(`Failed to fetch traces from Langfuse: ${message}`);
      }

      // Check for null/undefined response (can happen on API errors)
      if (!response) {
        throw new Error(
          'Langfuse returned an empty response. Check your credentials and network connection.',
        );
      }

      if (!response.data || response.data.length === 0) {
        logger.debug(`[Langfuse Traces] No more traces found on page ${page}`);
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

      // Check if there are more pages
      if (response.meta) {
        hasMore = page < response.meta.totalPages;
      } else {
        // If no meta, assume more pages if we got a full page
        hasMore = response.data.length === pageLimit;
      }

      page++;

      // Log progress for large fetches
      if (tests.length > 0 && tests.length % 100 === 0) {
        logger.debug(`[Langfuse Traces] Fetched ${tests.length} traces so far`);
      }
    }
  } finally {
    if (progressBar) {
      progressBar.stop();
    }
  }

  // Log summary
  const filterDesc = Object.entries(query)
    .filter(([k, v]) => k !== 'limit' && v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');

  logger.info(
    `[Langfuse Traces] Loaded ${tests.length} traces${filterDesc ? ` (filters: ${filterDesc})` : ''}`,
  );

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
    langfuseInstance = null;
  }
}
