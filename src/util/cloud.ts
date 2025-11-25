import dedent from 'dedent';
import { CLOUD_PROVIDER_PREFIX } from '../constants';
import { cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';
import { ProviderOptionsSchema } from '../validators/providers';
import { fetchWithProxy } from './fetch/index';
import invariant from './invariant';
import { checkServerFeatureSupport } from './server';

import type { Plugin, Severity } from '../redteam/constants';
import type { PoliciesById } from '../redteam/types';
import type { UnifiedConfig } from '../types/index';
import type { ProviderOptions } from '../types/providers';

const PERMISSION_CHECK_SERVER_FEATURE_NAME = 'config-permission-check-endpoint';
const PERMISSION_CHECK_SERVER_FEATURE_DATE = '2025-09-03T14:49:11Z';

/**
 * Makes an authenticated HTTP request to the PromptFoo Cloud API.
 * @param path - The API endpoint path (with or without leading slash)
 * @param method - HTTP method (GET, POST, PUT, DELETE, etc.)
 * @param body - Optional request body that will be JSON stringified
 * @returns Promise resolving to the fetch Response object
 * @throws Error if the request fails due to network or other issues
 */
export function makeRequest(path: string, method: string, body?: any): Promise<Response> {
  const apiHost = cloudConfig.getApiHost();
  const apiKey = cloudConfig.getApiKey();
  const url = `${apiHost}/api/v1/${path.startsWith('/') ? path.slice(1) : path}`;
  try {
    return fetchWithProxy(url, {
      method,
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    logger.error(`[Cloud] Failed to make request to ${url}: ${e}`);
    if ((e as any).cause) {
      logger.error(`Cause: ${(e as any).cause}`);
    }
    throw e;
  }
}

/**
 * Fetches a provider configuration from PromptFoo Cloud by its ID.
 * @param id - The unique identifier of the cloud provider
 * @returns Promise resolving to provider options with guaranteed id field
 * @throws Error if cloud is not enabled, provider not found, or request fails
 */
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

/**
 * Fetches a unified configuration from PromptFoo Cloud for red team operations.
 * @param id - The unique identifier of the cloud configuration
 * @param providerId - Optional provider ID to filter the configuration
 * @returns Promise resolving to a unified configuration object
 * @throws Error if cloud is not enabled, config not found, or request fails
 */
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
    return body;
  } catch (e) {
    logger.error(`Failed to fetch config from cloud: ${id}.`);
    logger.error(String(e));
    throw new Error(`Failed to fetch config from cloud: ${id}.`);
  }
}

/**
 * Checks if a provider path represents a cloud-based provider.
 * @param providerPath - The provider path to check
 * @returns True if the path starts with the cloud provider prefix, false otherwise
 */
export function isCloudProvider(providerPath: string): boolean {
  return providerPath.startsWith(CLOUD_PROVIDER_PREFIX);
}

/**
 * Extracts the database ID from a cloud provider path.
 * @param providerPath - The cloud provider path
 * @returns The database ID portion of the path
 * @throws Error if the path is not a valid cloud provider path
 */
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

/**
 * Retrieves all teams for the current user from Promptfoo Cloud.
 * @returns Promise resolving to an array of team objects
 * @throws Error if the request fails
 */
export async function getUserTeams(): Promise<
  Array<{
    id: string;
    name: string;
    slug: string;
    organizationId: string;
    createdAt: string;
    updatedAt: string;
  }>
> {
  const response = await makeRequest(`/users/me/teams`, 'GET');
  if (!response.ok) {
    throw new Error(`Failed to get user teams: ${response.statusText}`);
  }

  const body = await response.json();
  return body;
}

/**
 * Retrieves the default team for the current user from Promptfoo Cloud.
 * The default team is determined as the oldest team by creation date.
 * @returns Promise resolving to an object with team id, name, organizationId, and createdAt
 * @throws Error if the request fails or no teams are found
 */
export async function getDefaultTeam(): Promise<{
  id: string;
  name: string;
  organizationId: string;
  createdAt: string;
}> {
  const teams = await getUserTeams();

  if (teams.length === 0) {
    throw new Error('No teams found for user');
  }

  // get the oldest team -- this matches the logic of the enterprise app
  const oldestTeam = teams.sort((a, b) => {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  })[0];

  return {
    id: oldestTeam.id,
    name: oldestTeam.name,
    organizationId: oldestTeam.organizationId,
    createdAt: oldestTeam.createdAt,
  };
}

/**
 * Retrieves a team by its ID.
 * @param teamId - The team ID to look up
 * @returns Promise resolving to an object with team id, name, organizationId, and createdAt
 * @throws Error if the team is not found or not accessible
 */
export async function getTeamById(
  teamId: string,
): Promise<{ id: string; name: string; organizationId: string; createdAt: string }> {
  const teams = await getUserTeams();
  const team = teams.find((t) => t.id === teamId);

  if (!team) {
    throw new Error(`Team with ID '${teamId}' not found or not accessible`);
  }

  return {
    id: team.id,
    name: team.name,
    organizationId: team.organizationId,
    createdAt: team.createdAt,
  };
}

/**
 * Resolves a team identifier (name, slug, or ID) to a team object.
 * @param identifier - The team name, slug, or ID
 * @returns Promise resolving to an object with team id, name, organizationId, and createdAt
 * @throws Error if the team is not found
 */
export async function resolveTeamFromIdentifier(
  identifier: string,
): Promise<{ id: string; name: string; organizationId: string; createdAt: string }> {
  const teams = await getUserTeams();

  // Try exact ID match first
  let team = teams.find((t) => t.id === identifier);
  if (team) {
    return {
      id: team.id,
      name: team.name,
      organizationId: team.organizationId,
      createdAt: team.createdAt,
    };
  }

  // Try name match (case-insensitive)
  team = teams.find((t) => t.name.toLowerCase() === identifier.toLowerCase());
  if (team) {
    return {
      id: team.id,
      name: team.name,
      organizationId: team.organizationId,
      createdAt: team.createdAt,
    };
  }

  // Try slug match
  team = teams.find((t) => t.slug === identifier);
  if (team) {
    return {
      id: team.id,
      name: team.name,
      organizationId: team.organizationId,
      createdAt: team.createdAt,
    };
  }

  const availableTeams = teams.map((t) => t.name).join(', ');
  throw new Error(`Team '${identifier}' not found. Available teams: ${availableTeams}`);
}

/**
 * Resolves the current team context, checking stored preferences first.
 * @param teamIdentifier - Optional explicit team identifier to use
 * @param fallbackToDefault - Whether to fall back to server default team
 * @returns Promise resolving to an object with team id and name
 * @throws Error if no team can be resolved
 */
export async function resolveTeamId(
  teamIdentifier?: string,
  fallbackToDefault = true,
): Promise<{ id: string; name: string }> {
  // 1. Use explicit team identifier if provided
  if (teamIdentifier) {
    logger.debug(`[Team Resolution] Using explicit team identifier: ${teamIdentifier}`);
    return await resolveTeamFromIdentifier(teamIdentifier);
  }

  // 2. Use stored current team preference (scoped to current organization)
  const currentOrganizationId = cloudConfig.getCurrentOrganizationId();
  const currentTeamId = cloudConfig.getCurrentTeamId(currentOrganizationId);
  if (currentTeamId) {
    try {
      logger.debug(`[Team Resolution] Using stored team ID: ${currentTeamId}`);
      return await getTeamById(currentTeamId);
    } catch (_error) {
      logger.warn(
        `[Team Resolution] Stored team ${currentTeamId} no longer accessible, falling back`,
      );
    }
  }

  // 3. Fall back to server default (oldest team)
  if (fallbackToDefault) {
    logger.debug(`[Team Resolution] Using server default team`);
    const defaultTeam = await getDefaultTeam();
    // Store the default team for future use (scoped to organization)
    cloudConfig.setCurrentTeamId(defaultTeam.id, defaultTeam.organizationId);
    logger.info(
      `Using team: ${defaultTeam.name} (use 'promptfoo auth teams set <name>' to change)`,
    );
    return defaultTeam;
  }

  throw new Error('No team specified and no default available');
}

/**
 * Custom error class for configuration permission-related failures.
 * Thrown when users lack necessary permissions to use certain cloud features.
 */
export class ConfigPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigPermissionError';
  }
}

/**
 * Converts an array of structured error objects into a human-readable message.
 * @param errors - Array of error objects with type, id, and message fields
 * @returns A comma-separated string of formatted error messages
 */
function convertErrorsToReadableMessage(
  errors: { type: string; id: string; message: string }[],
): string {
  return errors.map((error) => `${error.type} ${error.id}: ${error.message}`).join(', ');
}

/**
 * Validates that the current user has necessary permissions for the given configuration.
 * Checks with PromptFoo Cloud to ensure providers and other resources can be accessed.
 * Gracefully degrades if cloud is disabled or server doesn't support permission checking.
 * @param config - The configuration to validate permissions for
 * @throws ConfigPermissionError if permissions are insufficient (403 responses)
 * @throws Error for other critical permission check failures
 */
export async function checkCloudPermissions(config: Partial<UnifiedConfig>): Promise<void> {
  if (!cloudConfig.isEnabled()) {
    return;
  }

  if (!config.providers) {
    logger.warn('No providers specified. Skipping permission check.');
    return;
  }

  try {
    const hasPermissionCheckServerFeature = await checkServerFeatureSupport(
      PERMISSION_CHECK_SERVER_FEATURE_NAME,
      PERMISSION_CHECK_SERVER_FEATURE_DATE,
    );
    if (!hasPermissionCheckServerFeature) {
      logger.debug(
        `[Config Permission Check] Server feature ${PERMISSION_CHECK_SERVER_FEATURE_NAME} is not supported. Skipping permission check.`,
      );
      return;
    }
    const response = await makeRequest('permissions/check', 'POST', {
      config,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ errors: ['Unknown error'] }));
      const errors: { type: string; id: string; message: string }[] = Array.isArray(
        errorData.errors,
      )
        ? errorData.errors.map((error: any) => {
            // Handle both new structured error format and legacy string format
            if (typeof error === 'string') {
              return { type: 'config', id: 'unknown', message: error };
            }
            return error;
          })
        : [
            {
              type: 'config',
              id: 'unknown',
              message: errorData.error || 'Permission check failed',
            },
          ];

      if (response.status === 403) {
        throw new ConfigPermissionError(
          `Permission denied: ${convertErrorsToReadableMessage(errors)}`,
        );
      }

      // For other errors, log and continue (existing behavior)
      logger.warn(
        `Error checking permissions: ${convertErrorsToReadableMessage(errors)}. Continuing anyway.`,
      );
      return;
    }

    const result = await response.json();
    if (result.errors && result.errors.length > 0) {
      throw new ConfigPermissionError(
        `Not able to continue with config: ${convertErrorsToReadableMessage(result.errors)}`,
      );
    }

    logger.debug('Permission check passed');
  } catch (error) {
    if (error instanceof ConfigPermissionError) {
      throw error;
    }

    // If we can't check permissions, allow the operation to continue
    // It will fail later with a proper error message if permissions are actually missing
    logger.warn(`Error checking permissions: ${error}. Continuing anyway.`);
  }

  return;
}

/**
 * Checks if the current user can create new targets (providers) for a given team.
 * @param teamId - The team ID to check permissions for. If undefined, uses the default team
 * @returns Promise resolving to true if user can create targets, false otherwise
 * @throws Error if the permission check request fails
 */
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

  return body.some(
    (ability: { action: string; subject: string }) =>
      ability.action === 'create' && ability.subject === 'Provider',
  );
}

/**
 * Given a list of policy IDs, fetches custom policies from Promptfoo Cloud.
 * @param ids - The IDs of the policies to fetch.
 * @param teamId - The ID of the team to fetch policies from. Note that all policies must belong to this team.
 * @returns A map of policy IDs to their texts and severities.
 */
export async function getPoliciesFromCloud(ids: string[], teamId: string): Promise<PoliciesById> {
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

    const policiesById = new Map();
    body.forEach((policy: { id: string; text: string; severity: Severity; name: string }) => {
      policiesById.set(policy.id, {
        text: policy.text,
        severity: policy.severity,
        name: policy.name,
      });
    });

    return policiesById;
  } catch (e) {
    logger.error(`Failed to fetch policies from cloud.`);
    logger.error(String(e));
    throw new Error(`Failed to fetch policies from cloud.`);
  }
}

/**
 * Validates linkedTargetId format and existence.
 * linkedTargetId is a Promptfoo Cloud feature that links custom provider results
 * to an existing target instead of creating duplicates.
 *
 * Validates the prefix and checks existence in cloud. Format validation
 * (e.g., UUID format) is deferred to the cloud API for simplicity.
 *
 * @param linkedTargetId - The linkedTargetId to validate
 * @throws Error if validation fails
 */
export async function validateLinkedTargetId(linkedTargetId: string): Promise<void> {
  // Validate format: promptfoo://provider/{id}
  if (!isCloudProvider(linkedTargetId)) {
    const apiHost = cloudConfig.getApiHost();
    const appHost = apiHost.replace('/api', '').replace(':3201', '');

    throw new Error(
      dedent`
        Invalid linkedTargetId format: "${linkedTargetId}"

        linkedTargetId must start with "${CLOUD_PROVIDER_PREFIX}" followed by a target ID.
        Example: ${CLOUD_PROVIDER_PREFIX}12345678-1234-1234-1234-123456789abc

        linkedTargetId links your local provider configuration to a cloud target, allowing you to:
        - Consolidate findings from multiple eval runs
        - Track performance and vulnerabilities over time
        - View comprehensive reporting in the cloud dashboard

        To get a valid linkedTargetId:
        1. Log in to Promptfoo Cloud: ${appHost}
        2. Navigate to Targets page: ${appHost}/redteam/targets
        3. Find the target you want to link to and copy its ID
        4. Format as: ${CLOUD_PROVIDER_PREFIX}<target-id>
      `,
    );
  }

  // Check existence in cloud (if enabled)
  if (!cloudConfig.isEnabled()) {
    logger.warn('[Cloud] linkedTargetId specified but cloud is not configured', {
      linkedTargetId,
      suggestion: "Run 'promptfoo auth login' to enable cloud features",
    });
    return;
  }

  const providerId = getCloudDatabaseId(linkedTargetId);
  try {
    logger.debug('[Cloud] Validating linkedTargetId exists in cloud', {
      linkedTargetId,
      providerId,
    });
    await getProviderFromCloud(providerId);
    logger.debug('[Cloud] linkedTargetId validation successful', {
      linkedTargetId,
    });
  } catch (error) {
    logger.error('[Cloud] linkedTargetId validation failed', {
      linkedTargetId,
      error,
    });
    const apiHost = cloudConfig.getApiHost();
    const appHost = apiHost.replace('/api', '').replace(':3201', '');

    throw new Error(
      dedent`
        linkedTargetId not found: "${linkedTargetId}"

        This target doesn't exist in your Promptfoo Cloud organization or you don't have access to it.

        Troubleshooting steps:
        1. Verify you're logged in to the correct organization
           Run: promptfoo auth status

        2. Check that the target exists in your cloud dashboard:
           ${appHost}/redteam/targets

        3. Ensure you have permission to access this target
           (Targets are scoped to your organization)

        4. Verify the target ID is correct and hasn't been deleted
      `,
    );
  }
}

/**
 * Fetches the current organization and optional team context for display.
 * Returns null if cloud is not enabled or if fetching fails.
 * @returns Promise resolving to organization name and optional team name, or null
 */
export async function getOrgContext(): Promise<{
  organizationName: string;
  teamName?: string;
} | null> {
  if (!cloudConfig.isEnabled()) {
    return null;
  }

  try {
    const apiHost = cloudConfig.getApiHost();
    const apiKey = cloudConfig.getApiKey();
    const response = await fetchWithProxy(`${apiHost}/api/v1/users/me`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      return null;
    }

    const { organization } = await response.json();
    const currentTeamId = cloudConfig.getCurrentTeamId(organization.id);

    // Only include team name if it differs from organization name
    let teamName: string | undefined;
    if (currentTeamId) {
      try {
        const team = await getTeamById(currentTeamId);
        if (team.name !== organization.name) {
          teamName = team.name;
        }
      } catch {
        // Team lookup failed, continue without team name
      }
    }

    return {
      organizationName: organization.name,
      teamName,
    };
  } catch {
    // Silently fail and return null
    return null;
  }
}
