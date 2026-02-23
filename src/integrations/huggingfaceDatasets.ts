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

/**
 * Get HuggingFace authentication headers
 */
function getHFAuthHeaders(): Record<string, string> {
  const hfToken =
    getEnvString('HF_TOKEN') ||
    getEnvString('HF_API_TOKEN') ||
    getEnvString('HUGGING_FACE_HUB_TOKEN');
  const headers: Record<string, string> = {};
  if (hfToken) {
    headers.Authorization = `Bearer ${hfToken}`;
  }
  return headers;
}

/**
 * Convert HuggingFace rows to TestCase objects
 */
function rowsToTestCases(rows: HuggingFaceResponse['rows']): TestCase[] {
  return rows.map(({ row }) => ({
    vars: castRowToVars(row),
    options: { disableVarExpansion: true },
  }));
}

/**
 * Adaptively update page size based on average row size
 */
function adaptPageSize(rows: HuggingFaceResponse['rows'], currentPageSize: number): number {
  if (rows.length === 0) {
    return currentPageSize;
  }
  const avgRowSize = JSON.stringify(rows).length / rows.length;
  let pageSize = currentPageSize;

  if (avgRowSize > 2048) {
    pageSize = Math.max(25, Math.min(pageSize, 50));
  } else if (avgRowSize > 1024) {
    pageSize = Math.max(50, Math.min(pageSize, 75));
  } else if (avgRowSize < 256) {
    pageSize = Math.min(200, Math.round(pageSize * SMALL_ROW_PAGE_SIZE_MULTIPLIER));
  }

  if (pageSize !== currentPageSize) {
    logger.debug(
      `[HF Dataset] Adjusted page size from ${currentPageSize} to ${pageSize} (avg row: ${Math.round(avgRowSize)}B)`,
    );
  }
  return pageSize;
}

/**
 * Handle concurrent fetch results and add rows to tests array
 */
function processConcurrentResults(
  concurrentResults: PromiseSettledResult<ConcurrentFetchResult>[],
  tests: TestCase[],
  totalNeeded: number,
  totalRows: number | undefined,
  progressBar: DatasetProgressBar,
): { rowsAdded: number; updatedTotalRows: number | undefined } {
  let concurrentRowCount = 0;
  let updatedTotalRows = totalRows;

  for (const result of concurrentResults) {
    if (result.status === 'rejected') {
      logger.warn('[HF Dataset] Concurrent fetch promise rejected', { reason: result.reason });
      continue;
    }
    if (!result.value.success) {
      const errorInfo = result.value.error
        ? String(result.value.error)
        : `HTTP ${result.value.response?.status ?? 'unknown'}`;
      logger.warn(
        `[HF Dataset] Concurrent fetch at offset ${result.value.offset} failed: ${errorInfo}`,
      );
      continue;
    }
    const concurrentData = result.value.response?.data;
    if (!concurrentData) {
      logger.warn(
        `[HF Dataset] Concurrent fetch at offset ${result.value.offset} returned success but no data`,
      );
      continue;
    }
    if (updatedTotalRows === undefined && typeof concurrentData.num_rows_total === 'number') {
      updatedTotalRows = concurrentData.num_rows_total;
    }
    for (const { row } of concurrentData.rows) {
      if (tests.length >= totalNeeded) {
        break;
      }
      tests.push({ vars: castRowToVars(row), options: { disableVarExpansion: true } });
      concurrentRowCount++;
    }
  }

  progressBar.update(concurrentRowCount);
  return { rowsAdded: concurrentRowCount, updatedTotalRows };
}

/**
 * Fetch pages concurrently and process results
 */
async function fetchConcurrentPages(
  baseUrl: string,
  owner: string,
  repo: string,
  queryParams: URLSearchParams,
  currentOffset: number,
  pageSize: number,
  totalNeeded: number,
  pagesRemaining: number,
  tests: TestCase[],
  totalRows: number | undefined,
  progressBar: DatasetProgressBar,
  headers: Record<string, string>,
): Promise<{ offsetDelta: number; updatedTotalRows: number | undefined }> {
  const maxConcurrent = Math.min(MAX_CONCURRENT_REQUESTS, pagesRemaining);
  const concurrentPromises: Promise<ConcurrentFetchResult>[] = [];

  for (let i = 0; i < maxConcurrent - 1; i++) {
    const futureOffset = currentOffset + i * pageSize;
    const futureParams = new URLSearchParams(queryParams);
    futureParams.set('offset', futureOffset.toString());
    futureParams.set('length', Math.min(pageSize, totalNeeded - futureOffset).toString());

    const futureUrl = `${baseUrl}?dataset=${encodeURIComponent(`${owner}/${repo}`)}&${futureParams.toString()}`;

    const p = fetchWithCache<HuggingFaceResponse>(futureUrl, { headers })
      .then((resp) => ({
        offset: futureOffset,
        response: resp,
        success: resp.status >= 200 && resp.status < 300,
      }))
      .catch((err) => ({
        offset: futureOffset,
        response: null,
        success: false,
        error: err,
      }));
    concurrentPromises.push(p);
  }

  if (concurrentPromises.length === 0) {
    return { offsetDelta: 0, updatedTotalRows: totalRows };
  }

  logger.debug(`[HF Dataset] Fetching ${concurrentPromises.length} pages concurrently`);
  const concurrentResults = await Promise.allSettled(concurrentPromises);

  const { rowsAdded, updatedTotalRows } = processConcurrentResults(
    concurrentResults,
    tests,
    totalNeeded,
    totalRows,
    progressBar,
  );

  logger.debug(
    `[HF Dataset] Processed ${concurrentPromises.length} concurrent pages, now at offset ${currentOffset + rowsAdded}`,
  );

  return { offsetDelta: rowsAdded, updatedTotalRows };
}

/**
 * Handle 422 error by reducing page size
 */
function handlePageSizeError(
  pageSize: number,
  response: { statusText: string; status: number },
  url: string,
  owner: string,
  repo: string,
  offset: number,
  requestedLength: number,
): number {
  const previousPageSize = pageSize;
  const newPageSize = Math.max(1, Math.floor(pageSize / 2));
  logger.warn(
    `[HF Dataset] ${owner}/${repo}: received 422 Unprocessable Entity at offset ${offset} (requested length ${requestedLength}). Reducing page size from ${previousPageSize} to ${newPageSize} and retrying.`,
  );
  if (newPageSize === previousPageSize) {
    const error = `[HF Dataset] Failed to fetch dataset: ${response.statusText} after reducing page size.\nFetched ${url}`;
    logger.error(error);
    throw new Error(error);
  }
  return newPageSize;
}

interface PageLoopState {
  offset: number;
  pageSize: number;
  totalRows: number | undefined;
}

/**
 * Calculate the requested length for the current page
 */
function calculateRequestedLength(
  pageSize: number,
  offset: number,
  userLimit: number | undefined,
  totalRows: number | undefined,
): number {
  const remainingUserLimit = userLimit !== undefined ? Math.max(userLimit - offset, 0) : undefined;
  const remainingDatasetRows =
    totalRows !== undefined ? Math.max(totalRows - offset, 0) : undefined;

  if (remainingUserLimit !== undefined) {
    return Math.min(pageSize, remainingUserLimit);
  }
  if (remainingDatasetRows !== undefined) {
    return Math.min(pageSize, remainingDatasetRows);
  }
  return pageSize;
}

/**
 * Process a successfully fetched page: log info, update progress, add rows
 * Returns whether the loop should break after this page
 */
async function processPage(
  data: HuggingFaceResponse,
  state: PageLoopState,
  owner: string,
  repo: string,
  queryParams: URLSearchParams,
  userLimit: number | undefined,
  tests: TestCase[],
  progressBar: DatasetProgressBar,
  baseUrl: string,
  headers: Record<string, string>,
): Promise<{ shouldBreak: boolean; updatedState: PageLoopState }> {
  const { offset } = state;
  let { pageSize, totalRows } = state;

  if (offset === 0) {
    logFirstPageInfo(owner, repo, queryParams, data, userLimit, false);
    totalRows = data.num_rows_total;
    progressBar.initialize(data.num_rows_total, userLimit);
    logger.debug(`[HF Dataset] Dataset features: ${JSON.stringify(data.features)}`);
    logger.debug(
      dedent`[HF Dataset] Using query parameters:
    ${Object.fromEntries(queryParams)}`,
    );
    pageSize = adaptPageSize(data.rows, pageSize);
    progressBar.update(data.rows.length);
  } else {
    progressBar.update(data.rows.length);
    logger.debug(
      `[HF Dataset] Received ${data.rows.length} rows (${tests.length + data.rows.length}/${userLimit || data.num_rows_total})`,
    );
    if (totalRows === undefined) {
      totalRows = data.num_rows_total;
    }
  }

  tests.push(...rowsToTestCases(data.rows));

  if (userLimit && tests.length >= userLimit) {
    logger.debug(`[HF Dataset] Reached user-specified limit of ${userLimit}`);
    return { shouldBreak: true, updatedState: { offset, pageSize, totalRows } };
  }
  if (offset + data.rows.length >= data.num_rows_total) {
    logger.debug('[HF Dataset] Finished fetching all rows');
    return { shouldBreak: true, updatedState: { offset, pageSize, totalRows } };
  }

  let newOffset = offset + data.rows.length;

  // Concurrent fetching optimization for large datasets
  const totalNeeded = userLimit || data.num_rows_total;
  const remainingRows = totalNeeded - tests.length;
  const pagesRemaining = Math.ceil(remainingRows / pageSize);

  if (
    pagesRemaining > CONCURRENT_FETCH_PAGES_THRESHOLD &&
    tests.length < totalNeeded * CONCURRENT_FETCH_PROGRESS_THRESHOLD
  ) {
    const { offsetDelta, updatedTotalRows } = await fetchConcurrentPages(
      baseUrl,
      owner,
      repo,
      queryParams,
      newOffset,
      pageSize,
      totalNeeded,
      pagesRemaining,
      tests,
      totalRows,
      progressBar,
      headers,
    );
    newOffset += offsetDelta;
    if (updatedTotalRows !== undefined) {
      totalRows = updatedTotalRows;
    }
  }

  if (newOffset > 0 && newOffset % (pageSize * PROGRESS_LOG_FREQUENCY_PAGES) === 0) {
    const progress = Math.round((tests.length / (userLimit || data.num_rows_total)) * 100);
    logger.info(
      `[HF Dataset] ${owner}/${repo}: ${progress}% (${tests.length}/${userLimit || data.num_rows_total} rows)`,
    );
  } else {
    logger.debug(`[HF Dataset] Fetching next page starting at offset ${newOffset}`);
  }

  return { shouldBreak: false, updatedState: { offset: newOffset, pageSize, totalRows } };
}

export async function fetchHuggingFaceDataset(
  datasetPath: string,
  limit?: number,
): Promise<TestCase[]> {
  const baseUrl = 'https://datasets-server.huggingface.co/rows';
  const { owner, repo, queryParams } = parseDatasetPath(datasetPath);

  const tests: TestCase[] = [];
  const queryParamLimit = queryParams.get('limit');
  const userLimit = limit ?? (queryParamLimit ? Number.parseInt(queryParamLimit, 10) : undefined);

  // Honor explicit 0 limit and avoid network traffic
  if (userLimit === 0) {
    logger.debug('[HF Dataset] User-specified limit is 0; returning no test cases');
    return [];
  }

  const initialPageSize = 100;

  // Single request optimization for small datasets
  if (userLimit !== undefined && userLimit <= initialPageSize) {
    return fetchSinglePage(baseUrl, owner, repo, queryParams, userLimit);
  }

  // Initialize progress bar for multi-page datasets
  const progressBar = new DatasetProgressBar();
  const state: PageLoopState = { offset: 0, pageSize: initialPageSize, totalRows: undefined };

  try {
    while (true) {
      const requestParams = new URLSearchParams(queryParams);
      requestParams.set('offset', state.offset.toString());

      const requestedLength = calculateRequestedLength(
        state.pageSize,
        state.offset,
        userLimit,
        state.totalRows,
      );

      if (requestedLength <= 0) {
        logger.debug(
          `[HF Dataset] No remaining rows to fetch for ${owner}/${repo} (offset ${state.offset})`,
        );
        break;
      }

      requestParams.set('length', requestedLength.toString());
      const url = `${baseUrl}?dataset=${encodeURIComponent(`${owner}/${repo}`)}&${requestParams.toString()}`;
      logger.debug(`[HF Dataset] Fetching page from ${url}`);

      const headers = getHFAuthHeaders();
      if (headers.Authorization) {
        logger.debug('[HF Dataset] Using token for authentication');
      }

      const response = await fetchWithCache(url, { headers });

      if (response.status < 200 || response.status >= 300) {
        if (response.status === 422) {
          state.pageSize = handlePageSizeError(
            state.pageSize,
            response,
            url,
            owner,
            repo,
            state.offset,
            requestedLength,
          );
          continue;
        }
        const error = `[HF Dataset] Failed to fetch dataset: ${response.statusText}.\nFetched ${url}`;
        logger.error(error);
        throw new Error(error);
      }

      const data = response.data as HuggingFaceResponse;
      const { shouldBreak, updatedState } = await processPage(
        data,
        state,
        owner,
        repo,
        queryParams,
        userLimit,
        tests,
        progressBar,
        baseUrl,
        headers,
      );

      state.offset = updatedState.offset;
      state.pageSize = updatedState.pageSize;
      state.totalRows = updatedState.totalRows;

      if (shouldBreak) {
        break;
      }
    }

    progressBar.stop();
    const finalTests = userLimit ? tests.slice(0, userLimit) : tests;
    logger.debug(`[HF Dataset] Successfully loaded ${finalTests.length} test cases`);
    return finalTests;
  } catch (error) {
    progressBar.stop();
    throw error;
  }
}

/**
 * Fetch a single page for small dataset optimization
 */
async function fetchSinglePage(
  baseUrl: string,
  owner: string,
  repo: string,
  queryParams: URLSearchParams,
  userLimit: number,
): Promise<TestCase[]> {
  logger.debug(
    `[HF Dataset] Single request optimization for ${owner}/${repo} (limit: ${userLimit})`,
  );

  const requestParams = new URLSearchParams(queryParams);
  requestParams.set('offset', '0');
  requestParams.set('length', userLimit.toString());

  const url = `${baseUrl}?dataset=${encodeURIComponent(`${owner}/${repo}`)}&${requestParams.toString()}`;
  const headers = getHFAuthHeaders();
  const response = await fetchWithCache(url, { headers });

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

  const singleRequestTests = rowsToTestCases(data.rows);
  logger.debug(`[HF Dataset] Successfully loaded ${singleRequestTests.length} test cases`);
  return singleRequestTests;
}

/**
 * Log info for the first page of a multi-page dataset
 */
function logFirstPageInfo(
  owner: string,
  repo: string,
  queryParams: URLSearchParams,
  data: HuggingFaceResponse,
  userLimit: number | undefined,
  cached: boolean,
): void {
  const config = queryParams.get('config') || 'default';
  const split = queryParams.get('split') || 'test';
  const limitStr = userLimit ? ` (limit: ${userLimit})` : '';
  const cacheStr = cached ? ' [cached]' : '';
  logger.info(
    `[HF Dataset] ${owner}/${repo} [${split}/${config}]: ${data.num_rows_total} rows${limitStr}${cacheStr}`,
  );
}
