import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';

function makeRequest(path: string, method: string, body?: any) {
  const apiHost = cloudConfig.getApiHost();
  const apiKey = cloudConfig.getApiKey();
  const url = `${apiHost}/${path}`;
  return fetch(url, {
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
