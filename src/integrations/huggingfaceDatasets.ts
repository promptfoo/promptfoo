import dedent from 'dedent';
import { getEnvString } from '../envars';
import { fetchWithCache } from '../cache';
import logger from '../logger';

import type { TestCase } from '../types';

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
    row: Record<string, string>;
  }>;
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

  // Single request optimization for small datasets
  if (userLimit && userLimit <= pageSize) {
    logger.debug(`[HF Dataset] Single request optimization for ${owner}/${repo} (limit: ${userLimit})`);
    
    // Build single request URL with exact limit needed
    const requestParams = new URLSearchParams(queryParams);
    requestParams.set('offset', '0');
    requestParams.set('length', userLimit.toString());
    
    const url = `${baseUrl}?dataset=${encodeURIComponent(`${owner}/${repo}`)}&${requestParams.toString()}`;
    
    // Set up headers for authentication
    const hfToken =
      getEnvString('HF_TOKEN') ||
      getEnvString('HF_API_TOKEN') ||
      getEnvString('HUGGING_FACE_HUB_TOKEN');
    const headers: Record<string, string> = {};
    if (hfToken) {
      headers.Authorization = `Bearer ${hfToken}`;
    }
    
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
    
    logger.info(`[HF Dataset] ${owner}/${repo} [${split}/${config}]: ${data.num_rows_total} rows (limit: ${userLimit})${cacheStr}`);
    
    // Convert HuggingFace rows to test cases
    const singleRequestTests: TestCase[] = [];
    for (const { row } of data.rows) {
      const test: TestCase = {
        vars: {
          ...row,
        },
        options: {
          disableVarExpansion: true,
        },
      };
      singleRequestTests.push(test);
    }
    
    logger.debug(`[HF Dataset] Successfully loaded ${singleRequestTests.length} test cases`);
    return singleRequestTests;
  }

  while (true) {
    // Create a new URLSearchParams for this request
    const requestParams = new URLSearchParams(queryParams);
    requestParams.set('offset', offset.toString());
    requestParams.set(
      'length',
      Math.min(pageSize, userLimit ? userLimit - offset : pageSize).toString(),
    );

    const url = `${baseUrl}?dataset=${encodeURIComponent(`${owner}/${repo}`)}&${requestParams.toString()}`;
    logger.debug(`[Huggingface Dataset] Fetching page from ${url}`);

    const hfToken =
      getEnvString('HF_TOKEN') ||
      getEnvString('HF_API_TOKEN') ||
      getEnvString('HUGGING_FACE_HUB_TOKEN');
    const headers: Record<string, string> = {};
    if (hfToken) {
      logger.debug('[Huggingface Dataset] Using token for authentication');
      headers.Authorization = `Bearer ${hfToken}`;
    }

    // Use fetchWithCache defaults (30s timeout, json format, 4 retries)
    const response = await fetchWithCache(url, { headers });

    if (response.status < 200 || response.status >= 300) {
      const error = `[HF Dataset] Failed to fetch dataset: ${response.statusText}.\nFetched ${url}`;
      logger.error(error);
      throw new Error(error);
    }

    const data = response.data as HuggingFaceResponse;

    if (offset === 0) {
      // Smart logging: contextual info with cache status on first successful request
      const config = queryParams.get('config') || 'default';
      const split = queryParams.get('split') || 'test';
      const limitStr = userLimit ? ` (limit: ${userLimit})` : '';
      const cacheStr = response.cached ? ' [cached]' : '';
      
      logger.info(`[HF Dataset] ${owner}/${repo} [${split}/${config}]: ${data.num_rows_total} rows${limitStr}${cacheStr}`);
      
      // Log features at debug level
      logger.debug(`[HF Dataset] Dataset features: ${JSON.stringify(data.features)}`);
      logger.debug(
        dedent`[HF Dataset] Using query parameters:
        ${Object.fromEntries(queryParams)}`,
      );
      
      // Memory-aware adaptive page sizing based on actual row size
      if (data.rows.length > 0) {
        const avgRowSize = JSON.stringify(data.rows).length / data.rows.length;
        const previousPageSize = pageSize;
        
        if (avgRowSize > 2048) { // Large rows (>2KB each)
          pageSize = Math.max(25, Math.min(pageSize, 50)); // Reduce to 25-50 rows
        } else if (avgRowSize > 1024) { // Medium rows (>1KB each)
          pageSize = Math.max(50, Math.min(pageSize, 75)); // Reduce to 50-75 rows
        } else if (avgRowSize < 256) { // Small rows (<256B each)
          pageSize = Math.min(200, pageSize * 1.5); // Can increase to up to 200 rows
        }
        
        if (pageSize !== previousPageSize) {
          logger.debug(`[HF Dataset] Adjusted page size from ${previousPageSize} to ${pageSize} (avg row: ${Math.round(avgRowSize)}B)`);
        }
      }
    } else {
      // Progress logging for subsequent pages
      logger.debug(
        `[HF Dataset] Received ${data.rows.length} rows (${tests.length + data.rows.length}/${userLimit || data.num_rows_total})`,
      );
    }

    // Convert HuggingFace rows to test cases
    for (const { row } of data.rows) {
      const test: TestCase = {
        vars: {
          ...row,
        },
        options: {
          disableVarExpansion: true,
        },
      };

      tests.push(test);
    }

    // Check if we've reached user's limit or end of dataset
    if (userLimit && tests.length >= userLimit) {
      logger.debug(`[HF Dataset] Reached user-specified limit of ${userLimit}`);
      break;
    }

    // Check if we've fetched all rows
    if (offset + data.rows.length >= data.num_rows_total) {
      logger.debug(`[HF Dataset] Finished fetching all rows`);
      break;
    }

    offset += data.rows.length;
    
    // Concurrent fetching optimization for large datasets
    const totalNeeded = userLimit || data.num_rows_total;
    const remainingRows = totalNeeded - tests.length;
    const pagesRemaining = Math.ceil(remainingRows / pageSize);
    
    if (pagesRemaining > 2 && tests.length < totalNeeded * 0.8) { // Still have significant work left
      const maxConcurrent = Math.min(3, pagesRemaining); // Max 3 concurrent requests
      const concurrentPromises: Promise<any>[] = [];
      
      for (let i = 1; i < maxConcurrent; i++) { // Start from next page
        const futureOffset = offset + (i * pageSize);
        const futureParams = new URLSearchParams(queryParams);
        futureParams.set('offset', futureOffset.toString());
        futureParams.set('length', Math.min(pageSize, totalNeeded - futureOffset).toString());
        
        const futureUrl = `${baseUrl}?dataset=${encodeURIComponent(`${owner}/${repo}`)}&${futureParams.toString()}`;
        
        concurrentPromises.push(
          fetchWithCache(futureUrl, { headers }).then(resp => ({
            offset: futureOffset,
            response: resp,
            success: resp.status >= 200 && resp.status < 300
          })).catch(err => ({
            offset: futureOffset,
            response: null,
            success: false,
            error: err
          }))
        );
      }
      
      if (concurrentPromises.length > 0) {
        logger.debug(`[HF Dataset] Fetching ${concurrentPromises.length} pages concurrently`);
        const concurrentResults = await Promise.allSettled(concurrentPromises);
        
        // Process concurrent results in order
        for (const result of concurrentResults) {
          if (result.status === 'fulfilled' && result.value.success) {
            const concurrentData = result.value.response.data as HuggingFaceResponse;
            for (const { row } of concurrentData.rows) {
              if (tests.length >= totalNeeded) {
                break;
              }
              tests.push({
                vars: { ...row },
                options: { disableVarExpansion: true },
              });
            }
          }
        }
        
        // Skip ahead by the concurrent pages we fetched
        offset += concurrentPromises.length * pageSize;
        logger.debug(`[HF Dataset] Processed ${concurrentPromises.length} concurrent pages, now at offset ${offset}`);
      }
    }
    
    // Progress logging for large datasets (every 5 pages or 500 rows)
    if (offset > 0 && offset % (pageSize * 5) === 0) {
      const progress = Math.round((tests.length / (userLimit || data.num_rows_total)) * 100);
      logger.info(`[HF Dataset] ${owner}/${repo}: ${progress}% (${tests.length}/${userLimit || data.num_rows_total} rows)`);
    } else {
      logger.debug(`[HF Dataset] Fetching next page starting at offset ${offset}`);
    }
  }

  // If user specified a limit, ensure we don't return more than that
  const finalTests = userLimit ? tests.slice(0, userLimit) : tests;

  logger.debug(`[HF Dataset] Successfully loaded ${finalTests.length} test cases`);
  return finalTests;
}
