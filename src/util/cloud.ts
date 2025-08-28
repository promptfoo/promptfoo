import { CLOUD_PROVIDER_PREFIX } from '../constants';
import { fetchWithProxy } from '../fetch';
import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';
import { ProviderOptionsSchema } from '../validators/providers';
import invariant from './invariant';
import { checkServerFeatureSupport } from './server';

import type { Plugin, Severity } from '../redteam/constants';
import type { UnifiedConfig } from '../types';
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

export async function checkIfCliTargetExists(id: string, teamId: string): Promise<boolean> {
  const hasCliListEndpoint = await checkServerFeatureSupport(
    'cli-list-endpoint',
    '2025-08-28T14:49:11-07:00',
  );
  if (hasCliListEndpoint) {
    try {
      const response = await makeRequest(`providers/cli/${teamId}/${id}`, 'GET');

      logger.debug(`[checkIfCliTargetExists] Response: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        return false;
      }

      const body = await response.json();
      logger.debug(`[checkIfCliTargetExists] Body: ${JSON.stringify(body, null, 2)}`);

      return true;
    } catch (error) {
      logger.error(`[checkIfCliTargetExists] Error checking if target exists: ${String(error)}`);
      return false;
    }

    // If we get a 404, the endpoint might not exist yet, fall back to legacy endpoint
  } else {
    logger.debug(
      `[checkIfCliTargetExists] New endpoint not found, falling back to legacy dashboard/targets endpoint`,
    );

    try {
      const legacyResponse = await makeRequest(`dashboard/targets?teamId=${teamId}`, 'GET');

      if (!legacyResponse.ok) {
        logger.debug(
          `[checkIfCliTargetExists] Legacy endpoint failed: ${legacyResponse.status} ${legacyResponse.statusText}`,
        );
        return false;
      }

      const targets = await legacyResponse.json();
      logger.debug(`[checkIfCliTargetExists] Legacy targets: ${JSON.stringify(targets, null, 2)}`);

      // Check if the target exists in the array
      const targetExists =
        Array.isArray(targets) && targets.some((target: any) => target.id === id);
      logger.debug(
        `[checkIfCliTargetExists] Target ${id} exists in legacy response: ${targetExists}`,
      );

      return targetExists;
    } catch (error) {
      logger.error(`[checkIfCliTargetExists] Error checking legacy endpoint: ${error}`);
      return false;
    }
  }
}

export async function canCreateTargets(teamId: string | undefined): Promise<boolean> {
  if (!cloudConfig.isEnabled()) {
    logger.debug(
      '[canCreateTargets] Cloud config is not enabled, create providers is not relevant.',
    );
    return true;
  }
  if (!teamId) {
    const team = await getDefaultTeam();
    teamId = team.id;
    logger.debug(
      `[canCreateTargets] No team id provided, using default team ${team.name} (${teamId})`,
    );
  }

  const response = await makeRequest(`/users/me/abilities?teamId=${teamId}`, 'GET');
  if (!response.ok) {
    throw new Error(`Failed to check provider permissions: ${response.statusText}`);
  }

  const body = await response.json();

  logger.debug(
    `[canCreateTargets] Checking provider permissions for team ${teamId}: ${JSON.stringify(
      body.filter((ability: { action: string; subject: string }) => ability.subject === 'Provider'),
      null,
      2,
    )}`,
  );

  return body.some(
    (ability: { action: string; subject: string }) =>
      ability.action === 'create' && ability.subject === 'Provider',
  );
}
