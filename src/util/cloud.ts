import { fetchWithProxy } from '../fetch';
import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';
import type { SavedRedteamConfig } from '../redteam/types';
import type { ProviderOptions } from '../types/providers';
import { ProviderOptionsSchema } from '../validators/providers';
import invariant from './invariant';

const CHUNKED_RESULTS_BUILD_DATE = new Date('2025-01-10');

export function makeRequest(path: string, method: string, body?: any): Promise<Response> {
  const apiHost = cloudConfig.getApiHost();
  const apiKey = cloudConfig.getApiKey();
  const url = `${apiHost}/${path}`;
  return fetchWithProxy(url, {
    method,
    body: JSON.stringify(body),
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

export async function getProviderFromCloud(id: string): Promise<ProviderOptions & { id: string }> {
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
    const provider = ProviderOptionsSchema.parse(body.config);
    // The provider options schema has ID field as optional but we know it's required for cloud providers
    invariant(provider.id, `Provider ${id} has no id in ${body.config}`);
    return { ...provider, id: provider.id };
  } catch (e) {
    logger.error(`Failed to fetch provider from cloud: ${id}.`);
    logger.error(String(e));
    throw new Error(`Failed to fetch provider from cloud: ${id}.`);
  }
}

interface CloudConfig {
  id: string;
  config: SavedRedteamConfig;
  createdAt: string;
  updatedAt: string;
}

export async function getConfigFromCloud(id: string): Promise<CloudConfig> {
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

export async function cloudCanAcceptChunkedResults(): Promise<boolean> {
  const buildDate = await targetApiBuildDate();
  return buildDate != null && buildDate > CHUNKED_RESULTS_BUILD_DATE;
}
