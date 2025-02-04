import dedent from 'dedent';
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
  const baseUrl = 'https://datasets-server.huggingface.co/rows';
  const { owner, repo, queryParams } = parseDatasetPath(datasetPath);

  logger.info(`[Huggingface Dataset] Fetching dataset: ${owner}/${repo} ...`);

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

    const response = await fetchWithProxy(url);
    if (!response.ok) {
      const error = `[Huggingface Dataset] Failed to fetch dataset: ${response.statusText}.\nFetched ${url}`;
      logger.error(error);
      throw new Error(error);
    }

    const data = (await response.json()) as HuggingFaceResponse;
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
    for (const { row } of data.rows) {
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

  // If user specified a limit, ensure we don't return more than that
  const finalTests = userLimit ? tests.slice(0, userLimit) : tests;

  logger.debug(`[Huggingface Dataset] Successfully loaded ${finalTests.length} test cases`);
  return finalTests;
}
