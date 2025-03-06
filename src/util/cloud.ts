import { fetchWithProxy } from '../fetch';
import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';
import type { ProviderOptions } from '../types/providers';
import { ProviderOptionsSchema } from '../validators/providers';
import invariant from './invariant';

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

export async function getProviderModelFromCloud(id: string) {
  if (!cloudConfig.isEnabled()) {
    throw new Error(
      `Could not fetch Provider ${id} from cloud. Cloud config is not enabled. Please run \`promptfoo auth login\` to login.`,
    );
  }
  try {
    const response = await makeRequest(`api/providers/${id}`, 'GET');
    const body = await response.json();
    if (response.ok) {
      logger.info(`Provider fetched from cloud: ${id}`);
      logger.debug(`Provider from cloud: ${JSON.stringify(body, null, 2)}`);
    } else {
      throw new Error(`Failed to fetch provider from cloud: ${response.statusText}`);
    }
    return body;
  } catch (e) {
    logger.error(`Failed to fetch provider from cloud: ${id}.`);
    logger.error(String(e));
    throw new Error(`Failed to fetch provider from cloud: ${id}.`);
  }
}

export async function getProviderFromCloud(id: string): Promise<ProviderOptions & { id: string }> {
  if (!cloudConfig.isEnabled()) {
    throw new Error(
      `Could not fetch Provider ${id} from cloud. Cloud config is not enabled. Please run \`promptfoo auth login\` to login.`,
    );
  }
  try {
    const model = await getProviderModelFromCloud(id);
    const provider = ProviderOptionsSchema.parse(model.config);
    // The provider options schema has ID field as optional but we know it's required for cloud providers
    invariant(provider.id, `Provider ${id} has no id in ${model.config}`);
    return { ...provider, id: provider.id };
  } catch (e) {
    logger.error(`Failed to fetch provider from cloud: ${id}.`);
    logger.error(String(e));
    throw new Error(`Failed to fetch provider from cloud: ${id}.`);
  }
}

export async function getConfigFromCloud(id: string) {
  if (!cloudConfig.isEnabled()) {
    throw new Error(
      `Could not fetch Config ${id} from cloud. Cloud config is not enabled. Please run \`promptfoo auth login\` to login.`,
    );
  }
  try {
    const response = await makeRequest(`api/redteam/configs/${id}`, 'GET');
    const body = await response.json();
    if (response.ok) {
      logger.info(`Config fetched from cloud: ${id}`);
      logger.debug(`Config from cloud: ${JSON.stringify(body, null, 2)}`);
    } else {
      throw new Error(`Failed to fetch config from cloud: ${response.statusText}`);
    }
    return body;
  } catch (e) {
    logger.error(`Failed to fetch config from cloud: ${id}.`);
    logger.error(String(e));
    throw new Error(`Failed to fetch config from cloud: ${id}.`);
  }
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

export { CHUNKED_RESULTS_BUILD_DATE, makeRequest };
