import dedent from 'dedent';
import { fetchWithProxy } from '../fetch';
import logger from '../logger';
import type { TestCase } from '../types';
import { getEnvString } from '../envars';

interface HuggingFaceParquetResponse {
  parquet_files: Array<{
    dataset: string;
    config: string;
    split: string;
    url: string;
    filename: string;
    size: number;
  }>;
  pending: string[];
  failed: string[];
  partial: boolean;
}

function parseDatasetPath(path: string): {
  owner: string;
  repo: string;
  queryParams: URLSearchParams;
} {
  // Remove the huggingface://datasets/ prefix and split into path and query
  const [pathPart, queryPart] = path.replace('huggingface://datasets/', '').split('?');
  const [owner, repo] = pathPart.split('/');

  // Start with minimal required parameters
  const defaultParams = new URLSearchParams({
    split: 'test',
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
  const baseUrl = 'https://datasets-server.huggingface.co/parquet';
  const { owner, repo, queryParams } = parseDatasetPath(datasetPath);

  logger.info(`[Huggingface Dataset] Fetching dataset: ${owner}/${repo} ...`);

  const url = `${baseUrl}?dataset=${encodeURIComponent(`${owner}/${repo}`)}&${queryParams.toString()}`;
  logger.debug(`[Huggingface Dataset] Fetching from ${url}`);

  // Get HuggingFace token from environment
  const hfToken = getEnvString('HUGGING_FACE_HUB_TOKEN');
  if (!hfToken) {
    throw new Error('[Huggingface Dataset] HUGGING_FACE_HUB_TOKEN environment variable is required');
  }

  const headers = {
    'Authorization': `Bearer ${hfToken}`
  };

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

  const data = (await response.json()) as HuggingFaceParquetResponse;
  
  if (!data.parquet_files?.length) {
    logger.error(
      `[Huggingface Dataset] No parquet files found in dataset: ${owner}/${repo}?${queryParams.toString()}`
    );
    logger.error(`[Huggingface Dataset] Full response: ${JSON.stringify(data, null, 2)}`);
    throw new Error('[Huggingface Dataset] No parquet files found in dataset');
  }

  // Download the first parquet file
  const parquetUrl = data.parquet_files[0].url;
  logger.debug(`[Huggingface Dataset] Downloading parquet file from ${parquetUrl}`);

  const parquetResponse = await fetchWithProxy(parquetUrl, { headers });
  if (!parquetResponse.ok) {
    const error = `[Huggingface Dataset] Failed to fetch parquet file: ${parquetResponse.statusText}`;
    logger.error(error);
    throw new Error(error);
  }

  // TODO: We need to add parquet-wasm as a dependency and parse the buffer
  // For now, throw an error with instructions
  throw new Error(
    '[Huggingface Dataset] Parquet parsing not yet implemented. Please add parquet-wasm as a dependency and implement parsing.'
  );
}
