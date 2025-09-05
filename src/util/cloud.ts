import { CLOUD_PROVIDER_PREFIX } from '../constants';
import { fetchWithProxy } from '../fetch';
import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';
import { ProviderOptionsSchema } from '../validators/providers';
import invariant from './invariant';

import type { Plugin, Severity } from '../redteam/constants';
import type { PolicyObject, PolicyTexts, UnifiedConfig } from '../types';
import type { ProviderOptions } from '../types/providers';

export function makeRequest(path: string, method: string, body?: any): Promise<Response> {
  const apiHost = cloudConfig.getApiHost();
  const apiKey = cloudConfig.getApiKey();
  const url = `${apiHost}/api/v1/${path.startsWith('/') ? path.slice(1) : path}`;
  try {
    return fetchWithProxy(url, {
      method,
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  } catch (e) {
    logger.error(`[Cloud] Failed to make request to ${url}: ${e}`);
    if ((e as any).cause) {
      logger.error(`Cause: ${(e as any).cause}`);
    }
    throw e;
  }
}

export async function getProviderFromCloud(id: string): Promise<ProviderOptions & { id: string }> {
  if (!cloudConfig.isEnabled()) {
    throw new Error(
      `Could not fetch Provider ${id} from cloud. Cloud config is not enabled. Please run \`promptfoo auth login\` to login.`,
    );
  }
  try {
    const response = await makeRequest(`providers/${id}`, 'GET');

    if (!response.ok) {
      const errorMessage = await response.text();
      logger.error(
        `[Cloud] Failed to fetch provider from cloud: ${errorMessage}. HTTP Status: ${response.status} -- ${response.statusText}.`,
      );
      throw new Error(`Failed to fetch provider from cloud: ${response.statusText}`);
    }
    const body = await response.json();
    logger.debug(`Provider fetched from cloud: ${id}`);
    logger.debug(`Provider from cloud: ${JSON.stringify(body, null, 2)}`);

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

export async function getConfigFromCloud(id: string, providerId?: string): Promise<UnifiedConfig> {
  if (!cloudConfig.isEnabled()) {
    throw new Error(
      `Could not fetch Config ${id} from cloud. Cloud config is not enabled. Please run \`promptfoo auth login\` to login.`,
    );
  }
  try {
    const response = await makeRequest(
      `redteam/configs/${id}/unified${providerId ? `?providerId=${providerId}` : ''}`,
      'GET',
    );
    if (!response.ok) {
      const errorMessage = await response.text();
      logger.error(
        `[Cloud] Failed to fetch config from cloud: ${errorMessage}. HTTP Status: ${response.status} -- ${response.statusText}.`,
      );
      throw new Error(`Failed to fetch config from cloud: ${response.statusText}`);
    }
    const body = await response.json();
    logger.info(`Config fetched from cloud: ${id}`);
    logger.debug(`Config from cloud: ${JSON.stringify(body, null, 2)}`);
    return body;
  } catch (e) {
    logger.error(`Failed to fetch config from cloud: ${id}.`);
    logger.error(String(e));
    throw new Error(`Failed to fetch config from cloud: ${id}.`);
  }
}

export function isCloudProvider(providerPath: string): boolean {
  return providerPath.startsWith(CLOUD_PROVIDER_PREFIX);
}

export function getCloudDatabaseId(providerPath: string): string {
  if (!isCloudProvider(providerPath)) {
    throw new Error(`Provider path ${providerPath} is not a cloud provider.`);
  }
  return providerPath.slice(CLOUD_PROVIDER_PREFIX.length);
}

/**
 * Get the plugin severity overrides for a cloud provider.
 * @param cloudProviderId - The cloud provider ID.
 * @returns The plugin severity overrides.
 */
export async function getPluginSeverityOverridesFromCloud(cloudProviderId: string): Promise<{
  id: string;
  severities: Record<Plugin, Severity>;
} | null> {
  if (!cloudConfig.isEnabled()) {
    throw new Error(
      `Could not fetch plugin severity overrides from cloud. Cloud config is not enabled. Please run \`promptfoo auth login\` to login.`,
    );
  }
  try {
    const response = await makeRequest(`/providers/${cloudProviderId}`, 'GET');

    if (!response.ok) {
      const errorMessage = await response.text();
      const formattedErrorMessage = `Failed to provider from cloud: ${errorMessage}. HTTP Status: ${response.status} -- ${response.statusText}.`;

      logger.error(`[Cloud] ${formattedErrorMessage}`);
      throw new Error(formattedErrorMessage);
    }

    const body = await response.json();

    if (body.pluginSeverityOverrideId) {
      // Fetch the plugin severity override from the cloud:
      const overrideRes = await makeRequest(
        `/redteam/plugins/severity-overrides/${body.pluginSeverityOverrideId}`,
        'GET',
      );

      if (!overrideRes.ok) {
        const errorMessage = await overrideRes.text();
        const formattedErrorMessage = `Failed to fetch plugin severity override from cloud: ${errorMessage}. HTTP Status: ${overrideRes.status} -- ${overrideRes.statusText}.`;

        logger.error(`[Cloud] ${formattedErrorMessage}`);
        throw new Error(formattedErrorMessage);
      }

      const pluginSeverityOverride = await overrideRes.json();

      logger.debug(
        `Plugin severity overrides ${pluginSeverityOverride.id} fetched from cloud: ${JSON.stringify(pluginSeverityOverride.members, null, 2)}`,
      );

      return {
        id: pluginSeverityOverride.id,
        severities: pluginSeverityOverride.members.reduce(
          (acc: Record<Plugin, Severity>, member: { pluginId: Plugin; severity: Severity }) => ({
            ...acc,
            [member.pluginId]: member.severity,
          }),
          {},
        ),
      };
    } else {
      logger.debug(`No plugin severity overrides found for cloud provider ${cloudProviderId}`);
      return null;
    }
  } catch (e) {
    logger.error(`Failed to fetch plugin severity overrides from cloud.`);
    logger.error(String(e));
    throw new Error(`Failed to fetch plugin severity overrides from cloud.`);
  }
}

export async function getDefaultTeam(): Promise<{ id: string; name: string }> {
  const response = await makeRequest(`/users/me/teams`, 'GET');
  if (!response.ok) {
    throw new Error(`Failed to get default team id: ${response.statusText}`);
  }

  const body = await response.json();

  // get the oldest team -- this matches the logic of the enterprise app
  const oldestTeam = body.sort((a: { createdAt: string }, b: { createdAt: string }) => {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  })[0];

  return oldestTeam;
}

/**
 * Given a list of policy IDs, fetches custom policies from Promptfoo Cloud.
 * @param ids - The IDs of the policies to fetch.
 * @param teamId - The ID of the team to fetch policies from. Note that all policies must belong to this team.
 * @returns A record mapping policy IDs to their texts.
 */
export async function getPoliciesFromCloud(ids: string[], teamId: string): Promise<PolicyTexts> {
  if (!cloudConfig.isEnabled()) {
    throw new Error(
      `Could not fetch policies from cloud. Cloud config is not enabled. Please run \`promptfoo auth login\` to login.`,
    );
  }
  try {
    // Encode the ids as search params
    const searchParams = new URLSearchParams();
    ids.forEach((id) => {
      searchParams.append('id', id);
    });
    const response = await makeRequest(
      `/custom-policies/?${searchParams.toString()}&teamId=${teamId}`,
      'GET',
    );

    if (!response.ok) {
      const errorMessage = await response.text();
      throw new Error(
        `Failed to fetch policies from cloud: ${errorMessage}. HTTP Status: ${response.status} -- ${response.statusText}.`,
      );
    }

    const body = await response.json();
    // Deserialize the body into a map of policy IDs to policy texts.
    return Object.fromEntries(
      body.map((policy: Required<PolicyObject>) => [policy.id, policy.text]),
    );
  } catch (e) {
    logger.error(`Failed to fetch policies from cloud.`);
    logger.error(String(e));
    throw new Error(`Failed to fetch policies from cloud.`);
  }
}
