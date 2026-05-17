import cliProgress from 'cli-progress';
import dedent from 'dedent';
import { type FetchWithCacheResult, fetchWithCache } from '../cache';
import cliState from '../cliState';
import { getEnvString, isCI } from '../envars';
import logger from '../logger';

import type { TestCase, Vars } from '../types/index';

/**
 * Safely casts HuggingFace row data to Vars type
 * HuggingFace typically returns string/number/boolean values which are compatible with Vars
 */
function castRowToVars(row: Record<string, unknown>): Vars {
  return row as Record<
    string,
    // biome-ignore lint/suspicious/noExplicitAny: FIXME
    string | number | boolean | any[] | Record<string, any> | (string | number | boolean)[]
  >;
}

// Constants for performance optimization thresholds
/** Multiplier for increasing page size when rows are small (<256B each) */
const SMALL_ROW_PAGE_SIZE_MULTIPLIER = 1.5;

/** Minimum pages remaining to trigger concurrent fetching */
const CONCURRENT_FETCH_PAGES_THRESHOLD = 2;

/** Progress threshold (80%) below which concurrent fetching is enabled */
const CONCURRENT_FETCH_PROGRESS_THRESHOLD = 0.8;

/** Maximum number of concurrent requests to make */
const MAX_CONCURRENT_REQUESTS = 3;

/** Frequency of progress logging (every N pages) */
const PROGRESS_LOG_FREQUENCY_PAGES = 5;

/**
 * Manages progress bar for HuggingFace dataset downloads
 */
class DatasetProgressBar {
  private progressBar: cliProgress.SingleBar | undefined;
  private isWebUI: boolean;
  private totalRows: number = 0;
  private fetchedRows: number = 0;

  constructor() {
    this.isWebUI = Boolean(cliState.webUI);
  }

  /**
   * Initialize progress bar for dataset fetching
   */
  initialize(totalRows: number, userLimit?: number): void {
    if (this.isWebUI || isCI()) {
      return;
    }

    this.totalRows = userLimit || totalRows;
    this.fetchedRows = 0;

    // Only show progress bar for datasets with multiple pages (>100 rows)
    if (this.totalRows <= 100) {
      return;
    }

    this.progressBar = new cliProgress.SingleBar(
      {
        format: 'Downloading dataset [{bar}] {percentage}% | {value}/{total} rows | ETA: {eta}s',
        hideCursor: true,
        stopOnComplete: true,
      },
      cliProgress.Presets.shades_classic,
    );

    this.progressBar.start(this.totalRows, 0);
  }

  /**
   * Update progress with newly fetched rows
   */
  update(newRows: number): void {
    if (this.isWebUI || isCI() || !this.progressBar) {
      return;
    }

    this.fetchedRows += newRows;
    this.progressBar.update(Math.min(this.fetchedRows, this.totalRows));
  }

  /**
   * Complete and stop the progress bar
   */
  stop(): void {
    if (this.progressBar) {
      this.progressBar.stop();
    }
  }
}

interface HuggingFaceResponse {
  num_rows_total: number;
  num_rows_per_page: number;
  features: Array<{
    name: string;
    type: {
      dtype: string;
      _type: string;
    };
  }>;
  rows: Array<{
    row: Record<string, unknown>;
  }>;
}

/**
 * Result type for concurrent fetch operations
 */
interface ConcurrentFetchResult {
  offset: number;
  response: FetchWithCacheResult<HuggingFaceResponse> | null;
  success: boolean;
  error?: unknown;
}

export function parseDatasetPath(path: string): {
  owner: string;
  repo: string;
  queryParams: URLSearchParams;
} {
  // Remove the huggingface://datasets/ prefix and split into path and query
  const [pathPart, queryPart] = path.replace('huggingface://datasets/', '').split('?');
  const [owner, repo] = pathPart.split('/');

  // Start with default parameters
  const defaultParams = new URLSearchParams({
    split: 'test',
    config: 'default',
  });

  // Parse user query parameters
  const userParams = new URLSearchParams(queryPart || '');

  // Merge user params into defaults (user params override defaults)
  const queryParams = new URLSearchParams();
  for (const [key, value] of defaultParams) {
    queryParams.set(key, value);
  }
  for (const [key, value] of userParams) {
    queryParams.set(key, value);
  }

  return { owner, repo, queryParams };
}

function getHuggingFaceHeaders() {
  const hfToken =
    getEnvString('HF_TOKEN') ||
    getEnvString('HF_API_TOKEN') ||
    getEnvString('HUGGING_FACE_HUB_TOKEN');
  const headers: Record<string, string> = {};
  if (hfToken) {
    logger.debug('[HF Dataset] Using token for authentication');
    headers.Authorization = `Bearer ${hfToken}`;
  }
  return headers;
}

function buildDatasetUrl(baseUrl: string, owner: string, repo: string, params: URLSearchParams) {
  return `${baseUrl}?dataset=${encodeURIComponent(`${owner}/${repo}`)}&${params.toString()}`;
}

function rowsToTests(rows: HuggingFaceResponse['rows']): TestCase[] {
  return rows.map(({ row }) => ({
    vars: castRowToVars(row),
    options: {
      disableVarExpansion: true,
    },
  }));
}

async function fetchSingleRequestDataset({
  baseUrl,
  owner,
  repo,
  queryParams,
  userLimit,
}: {
  baseUrl: string;
  owner: string;
  repo: string;
  queryParams: URLSearchParams;
  userLimit: number;
}): Promise<TestCase[]> {
  logger.debug(
    `[HF Dataset] Single request optimization for ${owner}/${repo} (limit: ${userLimit})`,
  );
  const requestParams = new URLSearchParams(queryParams);
  requestParams.set('offset', '0');
  requestParams.set('length', userLimit.toString());
  const url = buildDatasetUrl(baseUrl, owner, repo, requestParams);
  const response = await fetchWithCache(url, { headers: getHuggingFaceHeaders() });
  if (response.status < 200 || response.status >= 300) {
    const error = `[HF Dataset] Failed to fetch dataset: ${response.statusText}.\nFetched ${url}`;
    logger.error(error);
    throw new Error(error);
  }
  const data = response.data as HuggingFaceResponse;
  const config = queryParams.get('config') || 'default';
  const split = queryParams.get('split') || 'test';
  const cacheStr = response.cached ? ' [cached]' : '';
  logger.info(
    `[HF Dataset] ${owner}/${repo} [${split}/${config}]: ${data.num_rows_total} rows (limit: ${userLimit})${cacheStr}`,
  );
  const tests = rowsToTests(data.rows);
  logger.debug(`[HF Dataset] Successfully loaded ${tests.length} test cases`);
  return tests;
}

function getRequestedLength(
  pageSize: number,
  offset: number,
  userLimit: number | undefined,
  totalRows: number | undefined,
) {
  const remainingUserLimit = userLimit === undefined ? undefined : Math.max(userLimit - offset, 0);
  const remainingDatasetRows = totalRows === undefined ? undefined : Math.max(totalRows - offset, 0);
  if (remainingUserLimit === undefined) {
    return remainingDatasetRows === undefined ? pageSize : Math.min(pageSize, remainingDatasetRows);
  }
  return Math.min(pageSize, remainingUserLimit);
}

function maybeAdjustPageSize(pageSize: number, rows: HuggingFaceResponse['rows']) {
  if (rows.length === 0) {
    return pageSize;
  }
  const avgRowSize = JSON.stringify(rows).length / rows.length;
  let nextPageSize = pageSize;
  if (avgRowSize > 2048) {
    nextPageSize = Math.max(25, Math.min(pageSize, 50));
  } else if (avgRowSize > 1024) {
    nextPageSize = Math.max(50, Math.min(pageSize, 75));
  } else if (avgRowSize < 256) {
    nextPageSize = Math.min(200, Math.round(pageSize * SMALL_ROW_PAGE_SIZE_MULTIPLIER));
  }
  if (nextPageSize !== pageSize) {
    logger.debug(
      `[HF Dataset] Adjusted page size from ${pageSize} to ${nextPageSize} (avg row: ${Math.round(avgRowSize)}B)`,
    );
  }
  return nextPageSize;
}

function logFirstPageSummary(
  owner: string,
  repo: string,
  queryParams: URLSearchParams,
  data: HuggingFaceResponse,
  userLimit: number | undefined,
  cached: boolean | undefined,
) {
  const config = queryParams.get('config') || 'default';
  const split = queryParams.get('split') || 'test';
  const limitStr = userLimit ? ` (limit: ${userLimit})` : '';
  const cacheStr = cached ? ' [cached]' : '';
  logger.info(`[HF Dataset] ${owner}/${repo} [${split}/${config}]: ${data.num_rows_total} rows${limitStr}${cacheStr}`);
  logger.debug(`[HF Dataset] Dataset features: ${JSON.stringify(data.features)}`);
  logger.debug(
    dedent`[HF Dataset] Using query parameters:
        ${Object.fromEntries(queryParams)}`,
  );
}

async function handleFetchResponseError({
  response,
  owner,
  repo,
  offset,
  requestedLength,
  pageSize,
  url,
}: {
  response: Awaited<ReturnType<typeof fetchWithCache>>;
  owner: string;
  repo: string;
  offset: number;
  requestedLength: number;
  pageSize: number;
  url: string;
}) {
  if (response.status === 422) {
    const nextPageSize = Math.max(1, Math.floor(pageSize / 2));
    logger.warn(
      `[HF Dataset] ${owner}/${repo}: received 422 Unprocessable Entity at offset ${offset} (requested length ${requestedLength}). Reducing page size from ${pageSize} to ${nextPageSize} and retrying.`,
    );
    if (nextPageSize === pageSize) {
      const error = `[HF Dataset] Failed to fetch dataset: ${response.statusText} after reducing page size.\nFetched ${url}`;
      logger.error(error);
      throw new Error(error);
    }
    return nextPageSize;
  }
  const error = `[HF Dataset] Failed to fetch dataset: ${response.statusText}.\nFetched ${url}`;
  logger.error(error);
  throw new Error(error);
}

async function prefetchAdditionalPages({
  baseUrl,
  owner,
  repo,
  queryParams,
  headers,
  offset,
  pageSize,
  totalNeeded,
  tests,
  progressBar,
  totalRows,
}: {
  baseUrl: string;
  owner: string;
  repo: string;
  queryParams: URLSearchParams;
  headers: Record<string, string>;
  offset: number;
  pageSize: number;
  totalNeeded: number;
  tests: TestCase[];
  progressBar: DatasetProgressBar;
  totalRows: number | undefined;
}) {
  const remainingRows = totalNeeded - tests.length;
  const pagesRemaining = Math.ceil(remainingRows / pageSize);
  if (
    pagesRemaining <= CONCURRENT_FETCH_PAGES_THRESHOLD ||
    tests.length >= totalNeeded * CONCURRENT_FETCH_PROGRESS_THRESHOLD
  ) {
    return { offset, totalRows };
  }

  const maxConcurrent = Math.min(MAX_CONCURRENT_REQUESTS, pagesRemaining);
  const concurrentPromises: Promise<ConcurrentFetchResult>[] = [];
  for (let i = 0; i < maxConcurrent - 1; i++) {
    const futureOffset = offset + i * pageSize;
    const futureParams = new URLSearchParams(queryParams);
    futureParams.set('offset', futureOffset.toString());
    futureParams.set('length', Math.min(pageSize, totalNeeded - futureOffset).toString());
    const futureUrl = buildDatasetUrl(baseUrl, owner, repo, futureParams);
    concurrentPromises.push(
      fetchWithCache<HuggingFaceResponse>(futureUrl, { headers })
        .then((resp) => ({ offset: futureOffset, response: resp, success: resp.status >= 200 && resp.status < 300 }))
        .catch((err) => ({ offset: futureOffset, response: null, success: false, error: err })),
    );
  }

  if (concurrentPromises.length === 0) {
    return { offset, totalRows };
  }

  logger.debug(`[HF Dataset] Fetching ${concurrentPromises.length} pages concurrently`);
  const concurrentResults = await Promise.allSettled(concurrentPromises);
  let concurrentRowCount = 0;
  let nextTotalRows = totalRows;
  for (const result of concurrentResults) {
    if (result.status === 'rejected') {
      logger.warn(`[HF Dataset] Concurrent fetch promise rejected`, { reason: result.reason });
      continue;
    }
    if (!result.value.success) {
      const errorInfo = result.value.error
        ? String(result.value.error)
        : `HTTP ${result.value.response?.status ?? 'unknown'}`;
      logger.warn(`[HF Dataset] Concurrent fetch at offset ${result.value.offset} failed: ${errorInfo}`);
      continue;
    }
    const concurrentData = result.value.response?.data;
    if (!concurrentData) {
      logger.warn(`[HF Dataset] Concurrent fetch at offset ${result.value.offset} returned success but no data`);
      continue;
    }
    if (nextTotalRows === undefined && typeof concurrentData.num_rows_total === 'number') {
      nextTotalRows = concurrentData.num_rows_total;
    }
    for (const test of rowsToTests(concurrentData.rows)) {
      if (tests.length >= totalNeeded) {
        break;
      }
      tests.push(test);
      concurrentRowCount++;
    }
  }
  progressBar.update(concurrentRowCount);
  const nextOffset = offset + concurrentRowCount;
  logger.debug(`[HF Dataset] Processed ${concurrentPromises.length} concurrent pages, now at offset ${nextOffset}`);
  return { offset: nextOffset, totalRows: nextTotalRows };
}

function processFetchedPage({
  owner,
  repo,
  queryParams,
  data,
  userLimit,
  responseCached,
  progressBar,
  offset,
  pageSize,
  tests,
  totalRows,
}: {
  owner: string;
  repo: string;
  queryParams: URLSearchParams;
  data: HuggingFaceResponse;
  userLimit: number | undefined;
  responseCached: boolean | undefined;
  progressBar: DatasetProgressBar;
  offset: number;
  pageSize: number;
  tests: TestCase[];
  totalRows: number | undefined;
}) {
  let nextPageSize = pageSize;
  let nextTotalRows = totalRows;
  if (offset === 0) {
    logFirstPageSummary(owner, repo, queryParams, data, userLimit, responseCached);
    nextTotalRows = data.num_rows_total;
    progressBar.initialize(data.num_rows_total, userLimit);
    nextPageSize = maybeAdjustPageSize(pageSize, data.rows);
  } else {
    logger.debug(
      `[HF Dataset] Received ${data.rows.length} rows (${tests.length + data.rows.length}/${userLimit || data.num_rows_total})`,
    );
    if (nextTotalRows === undefined) {
      nextTotalRows = data.num_rows_total;
    }
  }
  progressBar.update(data.rows.length);
  tests.push(...rowsToTests(data.rows));
  return { pageSize: nextPageSize, totalRows: nextTotalRows };
}

function shouldStopAfterPage({
  tests,
  userLimit,
  offset,
  data,
}: {
  tests: TestCase[];
  userLimit: number | undefined;
  offset: number;
  data: HuggingFaceResponse;
}) {
  if (userLimit && tests.length >= userLimit) {
    logger.debug(`[HF Dataset] Reached user-specified limit of ${userLimit}`);
    return true;
  }
  if (offset + data.rows.length >= data.num_rows_total) {
    logger.debug(`[HF Dataset] Finished fetching all rows`);
    return true;
  }
  return false;
}

function logNextPageProgress(
  owner: string,
  repo: string,
  offset: number,
  pageSize: number,
  tests: TestCase[],
  userLimit: number | undefined,
  data: HuggingFaceResponse,
) {
  if (offset > 0 && offset % (pageSize * PROGRESS_LOG_FREQUENCY_PAGES) === 0) {
    const progress = Math.round((tests.length / (userLimit || data.num_rows_total)) * 100);
    logger.info(
      `[HF Dataset] ${owner}/${repo}: ${progress}% (${tests.length}/${userLimit || data.num_rows_total} rows)`,
    );
    return;
  }
  logger.debug(`[HF Dataset] Fetching next page starting at offset ${offset}`);
}

export async function fetchHuggingFaceDataset(
  datasetPath: string,
  limit?: number,
): Promise<TestCase[]> {
  const baseUrl = 'https://datasets-server.huggingface.co/rows';
  const { owner, repo, queryParams } = parseDatasetPath(datasetPath);

  const tests: TestCase[] = [];
  let offset = 0;
  let pageSize = 100; // Number of rows per request (adaptive)
  const queryParamLimit = queryParams.get('limit');
  const userLimit = limit ?? (queryParamLimit ? Number.parseInt(queryParamLimit, 10) : undefined);
  let totalRows: number | undefined;

  // Honor explicit 0 limit and avoid network traffic
  if (userLimit === 0) {
    logger.debug('[HF Dataset] User-specified limit is 0; returning no test cases');
    return [];
  }

  // Single request optimization for small datasets
  if (userLimit !== undefined && userLimit <= pageSize) {
    return fetchSingleRequestDataset({ baseUrl, owner, repo, queryParams, userLimit });
  }

  // Initialize progress bar for multi-page datasets
  const progressBar = new DatasetProgressBar();
  const headers = getHuggingFaceHeaders();

  try {
    while (true) {
      // Create a new URLSearchParams for this request
      const requestParams = new URLSearchParams(queryParams);
      requestParams.set('offset', offset.toString());

      const requestedLength = getRequestedLength(pageSize, offset, userLimit, totalRows);

      if (requestedLength <= 0) {
        logger.debug(
          `[HF Dataset] No remaining rows to fetch for ${owner}/${repo} (offset ${offset})`,
        );
        break;
      }

      requestParams.set('length', requestedLength.toString());

      const url = buildDatasetUrl(baseUrl, owner, repo, requestParams);
      logger.debug(`[HF Dataset] Fetching page from ${url}`);

      // Use fetchWithCache defaults (30s timeout, json format, 4 retries)
      const response = await fetchWithCache(url, { headers });

      if (response.status < 200 || response.status >= 300) {
        const nextPageSize = await handleFetchResponseError({
          response,
          owner,
          repo,
          offset,
          requestedLength,
          pageSize,
          url,
        });
        if (nextPageSize !== undefined) {
          pageSize = nextPageSize;
          continue;
        }
      }

      const data = response.data as HuggingFaceResponse;
      const isDatasetExhausted = offset >= data.num_rows_total;
      if (data.rows.length === 0 && !isDatasetExhausted) {
        const error = `[HF Dataset] Received an empty page at offset ${offset} before reaching ${data.num_rows_total} total rows. Aborting to avoid retrying the same page indefinitely.\nFetched ${url}`;
        logger.error(error);
        throw new Error(error);
      }

      const processedPage = processFetchedPage({
        owner,
        repo,
        queryParams,
        data,
        userLimit,
        responseCached: response.cached,
        progressBar,
        offset,
        pageSize,
        tests,
        totalRows,
      });
      pageSize = processedPage.pageSize;
      totalRows = processedPage.totalRows;

      if (shouldStopAfterPage({ tests, userLimit, offset, data })) {
        break;
      }

      offset += data.rows.length;

      const totalNeeded = userLimit || data.num_rows_total;
      const prefetched = await prefetchAdditionalPages({
        baseUrl,
        owner,
        repo,
        queryParams,
        headers,
        offset,
        pageSize,
        totalNeeded,
        tests,
        progressBar,
        totalRows,
      });
      offset = prefetched.offset;
      totalRows = prefetched.totalRows;

      logNextPageProgress(owner, repo, offset, pageSize, tests, userLimit, data);
    }

    // Stop the progress bar
    progressBar.stop();

    // If user specified a limit, ensure we don't return more than that
    const finalTests = userLimit ? tests.slice(0, userLimit) : tests;

    logger.debug(`[HF Dataset] Successfully loaded ${finalTests.length} test cases`);
    return finalTests;
  } catch (error) {
    // Ensure progress bar is stopped even if an error occurs
    progressBar.stop();
    throw error;
  }
}
