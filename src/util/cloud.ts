import { fetchWithProxy } from '../fetch';
import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';

const CHUNKED_RESULTS_BUILD_DATE = new Date('2025-01-10');

function makeRequest(path: string, method: string, body?: any) {
  const apiHost = cloudConfig.getApiHost();
  const apiKey = cloudConfig.getApiKey();
  const url = `${apiHost}/${path}`;
  return fetchWithProxy(url, {
    method,
    body: JSON.stringify(body),
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

export async function getConfigFromCloud(id: string) {
  if (!cloudConfig.isEnabled()) {
    throw new Error('Cloud config is not enabled. Please run `promptfoo auth login` to login.');
  }

  const response = await makeRequest(`redteam/configs/${id}`, 'GET');
  const body = await response.json();
  if (response.ok) {
    logger.info(`Config fetched from cloud: ${id}`);
    logger.debug(`Config from cloud: ${JSON.stringify(body, null, 2)}`);
  } else {
    throw new Error(`Failed to fetch config from cloud: ${response.statusText}`);
  }
  return body;
}

export async function targetApiBuildDate(): Promise<Date | null> {
  try {
    const response = await makeRequest('version', 'GET');

    const data = await response.json();

    const { buildDate } = data;
    logger.debug(`[targetApiBuildDate] ${buildDate}`);
    if (buildDate) {
      return new Date(buildDate);
    }
    return null;
  } catch {
    return null;
  }
}

export async function cloudCanAcceptChunkedResults() {
  const buildDate = await targetApiBuildDate();
  return buildDate != null && buildDate > CHUNKED_RESULTS_BUILD_DATE;
}
