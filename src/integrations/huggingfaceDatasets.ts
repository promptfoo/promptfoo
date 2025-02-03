import crypto from 'crypto';
import dedent from 'dedent';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getEnvString } from '../envars';
import { fetchWithProxy } from '../fetch';
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

function getTempDatasetPath(owner: string, repo: string, split: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(`${owner}/${repo}/${split}`)
    .digest('hex')
    .slice(0, 8);

  return path.join(os.tmpdir(), `promptfoo-dataset-${hash}.json`);
}

function parseDatasetPath(path: string): {
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
  const { owner, repo, queryParams } = parseDatasetPath(datasetPath);
  const split = queryParams.get('split') || 'test';

  // Check temp cache first
  const tempPath = getTempDatasetPath(owner, repo, split);
  if (fs.existsSync(tempPath)) {
    try {
      logger.debug(`[Huggingface Dataset] Using cached dataset from ${tempPath}`);
      const cached = (JSON.parse(fs.readFileSync(tempPath, 'utf8')) as TestCase[]).map((test) => {
        return Object.fromEntries(
          Object.entries(test).map(([key, value]) => [key, value === null ? undefined : value]),
        ) as TestCase;
      });
      logger.warn(`[Huggingface Dataset] First row: ${JSON.stringify(cached[0], null, 2)}`);
      return limit ? cached.slice(0, limit) : cached;
    } catch (error) {
      logger.warn(`[Huggingface Dataset] Error reading cache file: ${error}. Fetching fresh data.`);
      // Continue to fetch fresh data
    }
  }

  const baseUrl = 'https://datasets-server.huggingface.co/rows';
  logger.info(`[Huggingface Dataset] Fetching dataset: ${owner}/${repo} ...`);

  // Get HuggingFace token from environment
  const hfToken = getEnvString('HUGGING_FACE_HUB_TOKEN');
  const headers: Record<string, string> = {};
  if (hfToken) {
    logger.debug('[Huggingface Dataset] Using token for authentication');
    headers.Authorization = `Bearer ${hfToken}`;
  }

  const tests: TestCase[] = [];
  let offset = 0;
  const pageSize = 100; // Number of rows per request
  const queryParamLimit = queryParams.get('limit');
  const userLimit = limit ?? (queryParamLimit ? Number.parseInt(queryParamLimit, 10) : undefined);

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

    const response = await fetchWithProxy(url, { headers });
    if (!response.ok) {
      const responseText = await response.text();
      const error = dedent`
        [Huggingface Dataset] Failed to fetch dataset:
        Status: ${response.status} ${response.statusText}
        URL: ${url}
        Response headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2)}
        Response body: ${responseText}`;
      logger.error(error);
      throw new Error(error);
    }

    const data = (await response.json()) as HuggingFaceResponse;
    if (!data.rows) {
      logger.error(
        `[Huggingface Dataset] No rows found in dataset: ${owner}/${repo}?${requestParams.toString()}`,
      );
      logger.error(`[Huggingface Dataset] Full response: ${JSON.stringify(data, null, 2)}`);
      throw new Error('[Huggingface Dataset] No rows found in dataset');
    }

    logger.debug(
      `[Huggingface Dataset] Received ${data.rows.length} rows (total: ${data.num_rows_total})`,
    );

    if (offset === 0) {
      // Log schema information on first request
      logger.debug(`[Huggingface Dataset] Dataset features: ${JSON.stringify(data.features)}`);
      logger.debug(
        dedent`[Huggingface Dataset] Using query parameters:
        ${Object.fromEntries(queryParams)}`,
      );
    }

    // Convert HuggingFace rows to test cases
    let shown = false;
    for (const { row } of data.rows) {
      if (!shown) {
        logger.warn(`[Huggingface Dataset] First row: ${JSON.stringify(row, null, 2)}`);
        shown = true;
      }
      const test: TestCase = {
        vars: {
          ...row,
        },
      };
      tests.push(test);
    }

    logger.debug(`[Huggingface Dataset] Processed ${tests.length} total test cases so far`);

    // Check if we've reached user's limit or end of dataset
    if (userLimit && tests.length >= userLimit) {
      logger.debug(`[Huggingface Dataset] Reached user-specified limit of ${userLimit}`);
      break;
    }

    // Check if we've fetched all rows
    if (offset + data.rows.length >= data.num_rows_total) {
      logger.debug('[Huggingface Dataset] Finished fetching all rows');
      break;
    }

    offset += data.rows.length;
    logger.debug(`[Huggingface Dataset] Fetching next page starting at offset ${offset}`);
  }

  // Cache the full dataset in temp file
  try {
    fs.writeFileSync(tempPath, JSON.stringify(tests));
    logger.debug(`[Huggingface Dataset] Cached dataset to ${tempPath}`);
  } catch (error) {
    logger.warn(`[Huggingface Dataset] Failed to cache dataset: ${error}`);
  }

  // If user specified a limit, ensure we don't return more than that
  const finalTests = userLimit ? tests.slice(0, limit) : tests;

  logger.debug(`[Huggingface Dataset] Successfully loaded ${finalTests.length} test cases`);
  return finalTests;
}
