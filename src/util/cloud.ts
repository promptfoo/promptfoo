import dedent from 'dedent';
import { z } from 'zod';
import { CLOUD_PROVIDER_PREFIX } from '../constants';
import { CloudSelectionChangedError, cloudConfig } from '../globalConfig/cloud';
import logger from '../logger';
import { type UnifiedConfig, UnifiedConfigSchema } from '../types/index';
import { ProviderOptionsSchema } from '../validators/providers';
import { fetchWithProxy } from './fetch/index';
import { isPromptfooCloudApiHost } from './fetch/monkeyPatchFetch';
import invariant from './invariant';
import { normalizeProviderRef } from './providerRef';
import { checkServerFeatureSupport } from './server';
import { isUuid } from './uuid';

import type { Plugin, Severity } from '../redteam/constants';
import type { PoliciesById } from '../redteam/types';
import type { ProviderOptions } from '../types/providers';

const PERMISSION_CHECK_SERVER_FEATURE_NAME = 'config-permission-check-endpoint';
const PERMISSION_CHECK_SERVER_FEATURE_DATE = '2025-09-03T14:49:11Z';

export interface ResolvedCloudTeam {
  id: string;
  name?: string;
  organizationId?: string;
  sessionId?: string;
}

const pendingTeamRecovery = new Map<string, Promise<void>>();

/** Recover a remembered environment selection before an unscoped Cloud task starts. */
export async function ensureCloudTeamContext(url?: string, targetId?: string): Promise<void> {
  if (targetId || !cloudConfig.hasPendingEnvironmentSelection()) {
    return;
  }
  const request = cloudConfig.getRequestConfig();
  if (!request.headers || (url && !isPromptfooCloudApiHost(url, request.apiHost))) {
    return;
  }
  let pending = pendingTeamRecovery.get(request.sessionId);
  if (!pending) {
    pending = resolveCloudTeam().then(() => undefined);
    pendingTeamRecovery.set(request.sessionId, pending);
  }
  try {
    await pending;
    if (cloudConfig.getRequestConfig().sessionId !== request.sessionId) {
      throw new Error('Cloud login changed while selecting a team. Retry the operation.');
    }
  } finally {
    if (pendingTeamRecovery.get(request.sessionId) === pending) {
      pendingTeamRecovery.delete(request.sessionId);
    }
  }
}

/** Resolve an operation's destination without replacing an explicit Cloud-config team. */
export async function resolveCloudTeam(
  config?: Partial<UnifiedConfig>,
): Promise<ResolvedCloudTeam | undefined> {
  const request = cloudConfig.getRequestConfig();
  if (!request.headers) {
    return undefined;
  }
  const assignedTeamId = config?.metadata?.configId ? config.metadata.teamId : undefined;
  // The server authorizes an assigned destination; a display lookup must not change it.
  const team =
    typeof assignedTeamId === 'string' && assignedTeamId
      ? { id: assignedTeamId }
      : await resolveTeamId();
  if (cloudConfig.getRequestConfig().sessionId !== request.sessionId) {
    throw new Error('Cloud login changed while selecting a team. Retry the operation.');
  }
  return { ...team, sessionId: request.sessionId };
}

/**
 * Makes an authenticated HTTP request to the PromptFoo Cloud API.
 * @param path - The API endpoint path (with or without leading slash)
 * @param method - HTTP method (GET, POST, PUT, DELETE, etc.)
 * @param body - Optional request body that will be JSON stringified
 * @returns Promise resolving to the fetch Response object
 * @throws Error if the request fails due to network or other issues
 */
export function makeRequest(
  path: string,
  method: string,
  body?: any,
  request = cloudConfig.getRequestConfig(),
): Promise<Response> {
  const { apiHost, headers } = request;
  const url = `${apiHost}/api/v1/${path.startsWith('/') ? path.slice(1) : path}`;
  try {
    return fetchWithProxy(url, {
      method,
      body: JSON.stringify(body),
      headers: { ...headers, 'Content-Type': 'application/json' },
      skipCloudAuthInjection: true,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function fetchCloudConfig(path: string): Promise<unknown> {
  const response = await makeRequest(path, 'GET');
  if (!response.ok) {
    const errorMessage = typeof response.text === 'function' ? await response.text() : '';
    logger.error(
      `[Cloud] Failed to fetch config from cloud: ${errorMessage}. HTTP Status: ${response.status} -- ${response.statusText}.`,
    );
    throw new Error(`Failed to fetch config from cloud: ${response.statusText}`);
  }
  return response.json();
}

function looksLikeEvalConfig(config: Record<string, unknown>): boolean {
  return (
    'providers' in config ||
    'providerIds' in config ||
    'prompts' in config ||
    'tests' in config ||
    'testCases' in config
  );
}

function extractEvalConfigPayload(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) {
    throw new Error('Invalid cloud eval config response: expected a JSON object.');
  }

  const bodyConfig = isRecord(body.config) ? body.config : undefined;
  if (!bodyConfig) {
    if (looksLikeEvalConfig(body)) {
      return body;
    }
    throw new Error('Invalid cloud eval config response: missing "config" object.');
  }

  const nestedConfig = isRecord(bodyConfig.config) ? bodyConfig.config : undefined;
  if (!nestedConfig) {
    return mergeEvalConfigEnvelope(bodyConfig, body);
  }

  return mergeEvalConfigEnvelope(nestedConfig, bodyConfig);
}

function mergeEvalConfigEnvelope(
  config: Record<string, unknown>,
  envelope: Record<string, unknown>,
): Record<string, unknown> {
  const mergedConfig: Record<string, unknown> = {
    ...config,
    ...(typeof config.name !== 'string' && typeof envelope.name === 'string'
      ? { name: envelope.name }
      : {}),
  };
  const envelopeMetadata = {
    ...(typeof envelope.teamId === 'string' ? { teamId: envelope.teamId } : {}),
    ...(typeof envelope.id === 'string' ? { configId: envelope.id } : {}),
  };

  if (
    Object.keys(envelopeMetadata).length > 0 &&
    (mergedConfig.metadata === undefined || isRecord(mergedConfig.metadata))
  ) {
    mergedConfig.metadata = {
      ...(isRecord(mergedConfig.metadata) ? mergedConfig.metadata : {}),
      ...envelopeMetadata,
    };
  }

  return mergedConfig;
}

function normalizeCloudEvalProvider(provider: unknown): unknown {
  if (isRecord(provider)) {
    const descriptor = normalizeProviderRef(provider);
    if (descriptor.kind === 'options' && typeof provider.id === 'string') {
      const id = normalizeCloudEvalProvider(provider.id);
      return id === provider.id ? provider : { ...provider, id };
    }
    if (descriptor.kind === 'map') {
      const originalOptions = provider[descriptor.loadProviderPath];
      const options =
        isRecord(originalOptions) && typeof originalOptions.id === 'string'
          ? { ...originalOptions, id: normalizeCloudEvalProvider(originalOptions.id) }
          : originalOptions;
      return { [normalizeCloudEvalProvider(descriptor.loadProviderPath) as string]: options };
    }
    return provider;
  }
  if (typeof provider !== 'string') {
    return provider;
  }
  if (provider.startsWith(CLOUD_PROVIDER_PREFIX) || !isUuid(provider)) {
    return provider;
  }
  return `${CLOUD_PROVIDER_PREFIX}${provider}`;
}

function normalizeCloudEvalProviders(providers: unknown): unknown[] {
  const providerList = Array.isArray(providers) ? providers : [providers];
  return providerList.map(normalizeCloudEvalProvider);
}

function normalizeCloudEvalPrompt(prompt: unknown): unknown {
  if (!isRecord(prompt)) {
    return prompt;
  }

  if (typeof prompt.raw === 'string') {
    return typeof prompt.label === 'string' ? prompt : { ...prompt, label: prompt.raw };
  }
  if (typeof prompt.content === 'string') {
    const { content, ...rest } = prompt;
    return {
      ...rest,
      raw: content,
      label: typeof prompt.label === 'string' ? prompt.label : content,
    };
  }
  return prompt;
}

function normalizeEvalConfig(config: Record<string, unknown>): UnifiedConfig {
  const providers =
    config.providers === undefined
      ? config.providerIds === undefined
        ? config.targets === undefined
          ? []
          : undefined
        : normalizeCloudEvalProviders(config.providerIds)
      : normalizeCloudEvalProviders(config.providers);
  const targets =
    config.targets === undefined ? undefined : normalizeCloudEvalProviders(config.targets);
  const prompts =
    config.prompts === undefined
      ? []
      : Array.isArray(config.prompts)
        ? config.prompts.map(normalizeCloudEvalPrompt)
        : config.prompts;
  const tests =
    config.tests === undefined
      ? config.testCases === undefined
        ? []
        : config.testCases
      : config.tests;

  const legacyCommandLineOptions = {
    ...(config.maxConcurrency == null ? {} : { maxConcurrency: config.maxConcurrency }),
    ...(config.delay == null ? {} : { delay: config.delay }),
    ...(config.verbose == null ? {} : { verbose: config.verbose }),
  };
  const commandLineOptions =
    config.commandLineOptions === undefined
      ? Object.keys(legacyCommandLineOptions).length > 0
        ? legacyCommandLineOptions
        : undefined
      : isRecord(config.commandLineOptions)
        ? { ...config.commandLineOptions, ...legacyCommandLineOptions }
        : config.commandLineOptions;

  const normalizedConfig: Record<string, unknown> = {
    ...config,
    ...(providers === undefined ? {} : { providers }),
    ...(targets === undefined ? {} : { targets }),
    prompts,
    tests,
    ...(commandLineOptions === undefined ? {} : { commandLineOptions }),
  };

  if (typeof config.description === 'string' && config.description.trim().length > 0) {
    normalizedConfig.description = config.description;
  } else if (typeof config.name === 'string' && config.name.trim().length > 0) {
    normalizedConfig.description = config.name;
  }

  delete normalizedConfig.providerIds;
  delete normalizedConfig.testCases;
  delete normalizedConfig.maxConcurrency;
  delete normalizedConfig.delay;
  delete normalizedConfig.verbose;
  delete normalizedConfig.name;

  // Validate without replacing the config with Zod's default-injecting output.
  UnifiedConfigSchema.parse(normalizedConfig);

  if (normalizedConfig.targets !== undefined && normalizedConfig.providers === undefined) {
    normalizedConfig.providers = normalizedConfig.targets;
    delete normalizedConfig.targets;
  }

  return normalizedConfig as UnifiedConfig;
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
    const body = await fetchCloudConfig(
      `redteam/configs/${id}/unified${providerId ? `?providerId=${providerId}` : ''}`,
    );
    logger.info(`Config fetched from cloud: ${id}`);
    return body as UnifiedConfig;
  } catch (e) {
    logger.error(`Failed to fetch config from cloud: ${id}.`);
    logger.error(String(e));
    throw new Error(`Failed to fetch config from cloud: ${id}.`);
  }
}

/**
 * Fetches an eval configuration from PromptFoo Cloud by ID.
 * The response may contain legacy eval fields, which are normalized into UnifiedConfig.
 * @param id - The unique identifier of the cloud eval configuration
 * @returns Promise resolving to a normalized unified configuration object
 * @throws Error if cloud is not enabled, config not found, or response shape is invalid
 */
export async function getEvalConfigFromCloud(id: string): Promise<UnifiedConfig> {
  if (!cloudConfig.isEnabled()) {
    throw new Error(
      `Could not fetch Config ${id} from cloud. Cloud config is not enabled. Please run \`promptfoo auth login\` to login.`,
    );
  }
  try {
    const body = await fetchCloudConfig(`eval/configs/${id}`);
    const config = normalizeEvalConfig(extractEvalConfigPayload(body));
    logger.info(`Eval config fetched from cloud: ${id}`);
    return config;
  } catch (e) {
    logger.debug('[Cloud] Failed to fetch eval config', { id, error: e });
    if (e instanceof Error) {
      throw e;
    }
    throw new Error(String(e));
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

const UserTeamSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    slug: z.string(),
    organizationId: z.string().min(1),
    createdAt: z.string(),
    updatedAt: z.string().optional(),
  })
  .passthrough();

/**
 * Retrieves all teams for the current user from Promptfoo Cloud.
 * @returns Promise resolving to an array of team objects
 * @throws Error if the request fails
 */
export async function getUserTeams(
  apiHost?: string,
  apiKey?: string,
  authHeaderName?: string,
  request?: ReturnType<typeof cloudConfig.getRequestConfig>,
): Promise<z.infer<typeof UserTeamSchema>[]> {
  const response =
    apiHost && apiKey
      ? await fetchWithProxy(`${apiHost}/api/v1/users/me/teams`, {
          headers: {
            [authHeaderName || cloudConfig.getAuthHeaderName()]: `Bearer ${apiKey}`,
          },
          skipCloudAuthInjection: true,
        })
      : await makeRequest(`/users/me/teams`, 'GET', undefined, request);
  if (!response.ok) {
    throw new Error(`Failed to get user teams: ${response.statusText}`);
  }

  const result = z.array(UserTeamSchema).safeParse(await response.json());
  if (!result.success) {
    throw new Error('Failed to get user teams: invalid response');
  }
  return result.data;
}

/** Returns the oldest team by creation date, which matches the enterprise app's default team. */
export function getOldestTeam<T extends { createdAt: string }>(teams: T[]): T {
  return [...teams].sort(
    (teamA, teamB) => new Date(teamA.createdAt).getTime() - new Date(teamB.createdAt).getTime(),
  )[0];
}

/** Finds an exact team ID first; otherwise prefers names and slugs in the selected organization. */
export function findTeam<
  T extends { id: string; name: string; slug: string; organizationId: string },
>(teams: T[], identifier: string, preferredOrganizationId?: string): T | undefined {
  const name = identifier.toLowerCase();
  const findByNameOrSlug = (candidates: T[]) =>
    candidates.find((team) => team.name.toLowerCase() === name) ??
    candidates.find((team) => team.slug === identifier);
  return (
    teams.find((team) => team.id === identifier) ??
    (preferredOrganizationId
      ? findByNameOrSlug(teams.filter((team) => team.organizationId === preferredOrganizationId))
      : undefined) ??
    findByNameOrSlug(teams)
  );
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

async function resolveOrganizationId(selection: ReturnType<typeof cloudConfig.getTeamSelection>) {
  if (selection.organizationId) {
    return selection.organizationId;
  }
  const response = await makeRequest('/users/me', 'GET', undefined, selection.request);
  const organizationId = response.ok ? (await response.json())?.organization?.id : undefined;
  if (typeof organizationId !== 'string' || !organizationId) {
    throw new Error(
      "Could not determine the current organization. Run 'promptfoo auth login' to select it.",
    );
  }
  return organizationId;
}

/**
 * Resolves a team identifier (name, slug, or ID) to a team object. When several
 * organizations share a team name or slug, the current organization's team wins.
 * @param identifier - The team name, slug, or ID
 * @returns Promise resolving to an object with team id, name, organizationId, and createdAt
 * @throws Error if the team is not found
 */
export async function resolveTeamFromIdentifier(
  identifier: string,
  selection = cloudConfig.getTeamSelection(),
): Promise<{ id: string; name: string; organizationId: string; createdAt: string }> {
  const teams = await getUserTeams(undefined, undefined, undefined, selection.request);
  let team = findTeam(teams, identifier, selection.organizationId);
  // Only ambiguous names and slugs need organization discovery.
  if (
    !selection.organizationId &&
    team &&
    team.id !== identifier &&
    findTeam(
      teams.filter((candidate) => candidate.organizationId !== team?.organizationId),
      identifier,
    )
  ) {
    team = findTeam(teams, identifier, await resolveOrganizationId(selection));
  }
  cloudConfig.assertTeamSelection(selection);

  if (!team) {
    const availableTeams = teams.map((t) => t.name).join(', ');
    throw new Error(`Team '${identifier}' not found. Available teams: ${availableTeams}`);
  }

  return {
    id: team.id,
    name: team.name,
    organizationId: team.organizationId,
    createdAt: team.createdAt,
  };
}

/**
 * Resolves a team within the selected organization, preferring its stored team.
 * A new environment credential discovers its organization before reusing a preference.
 * @param teamIdentifier - Optional explicit team identifier to use
 * @param fallbackToDefault - Whether to fall back to server default team
 * @returns Promise resolving to an object with team id and name
 * @throws Error if no team can be resolved
 */
export async function resolveTeamId(
  teamIdentifier?: string,
  fallbackToDefault = true,
  selection = cloudConfig.getTeamSelection(),
): Promise<{ id: string; name: string; organizationId: string }> {
  // 1. Use explicit team identifier if provided
  if (teamIdentifier) {
    logger.debug(`[Team Resolution] Using explicit team identifier: ${teamIdentifier}`);
    return await resolveTeamFromIdentifier(teamIdentifier, selection);
  }

  // 2. Use stored current team preference (scoped to current organization)
  const currentOrganizationId = await resolveOrganizationId(selection);
  // Validate legacy preferences against the token's organization before migrating them.
  const scopedTeamId = selection.selection.teams?.[currentOrganizationId]?.currentTeamId;
  const currentTeamId = scopedTeamId || selection.selection.currentTeamId;
  if (!currentTeamId && !fallbackToDefault) {
    throw new Error('No team specified and no default available');
  }
  // Let lookup failures propagate: only a successful lookup proves the stored team is gone.
  const teams = (await getUserTeams(undefined, undefined, undefined, selection.request)).filter(
    (team) => team.organizationId === currentOrganizationId,
  );
  const storedTeam = teams.find((team) => team.id === currentTeamId);
  if (storedTeam) {
    cloudConfig.saveTeamSelection(selection, currentOrganizationId, storedTeam.id);
    logger.debug(`[Team Resolution] Using stored team ID: ${currentTeamId}`);
    return storedTeam;
  }
  if (currentTeamId) {
    logger.warn(
      `[Team Resolution] Stored team ${currentTeamId} no longer accessible, falling back`,
    );
    if (teams.length === 0) {
      cloudConfig.saveTeamSelection(
        selection,
        scopedTeamId ? currentOrganizationId : undefined,
        null,
      );
    }
  }

  // 3. Fall back to server default (oldest team in the current organization)
  if (!fallbackToDefault) {
    throw new Error('No team specified and no default available');
  }
  if (teams.length === 0) {
    throw new Error(
      `No accessible teams in organization '${currentOrganizationId}'. Log in with an API key for the organization you want to use: 'promptfoo auth login --api-key <apiKey>'.`,
    );
  }
  const defaultTeam = getOldestTeam(teams);
  // Store the default team where the next lookup reads it
  cloudConfig.saveTeamSelection(selection, currentOrganizationId, defaultTeam.id);
  logger.info(`Using team: ${defaultTeam.name} (use 'promptfoo auth teams set <name>' to change)`);
  return defaultTeam;
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
export async function checkCloudPermissions(
  config: Partial<UnifiedConfig>,
  team?: ResolvedCloudTeam,
  request = cloudConfig.getRequestConfig(),
): Promise<ResolvedCloudTeam | undefined> {
  if (!request.headers) {
    return;
  }

  if (!config.providers) {
    logger.warn('No providers specified. Skipping permission check.');
    return;
  }

  // Local configs need a destination only when sharing supplies a resolved team.
  const hasCloudProvider = [config.providers].flat().some((provider) => {
    const ref = normalizeProviderRef(provider);
    const linkedTargetId =
      'loadOptions' in ref ? ref.loadOptions.config?.linkedTargetId : undefined;
    return (
      ('loadProviderPath' in ref && isCloudProvider(ref.loadProviderPath)) ||
      (typeof linkedTargetId === 'string' && isCloudProvider(linkedTargetId))
    );
  });
  if (!team && !config.metadata?.configId && !hasCloudProvider) {
    return;
  }

  const assertSession = () => {
    if (
      cloudConfig.getRequestConfig().sessionId !== request.sessionId ||
      (team?.sessionId && team.sessionId !== request.sessionId)
    ) {
      throw new CloudSelectionChangedError();
    }
  };
  assertSession();

  try {
    const hasPermissionCheckServerFeature = await checkServerFeatureSupport(
      PERMISSION_CHECK_SERVER_FEATURE_NAME,
      PERMISSION_CHECK_SERVER_FEATURE_DATE,
      request,
    );
    assertSession();
    if (!hasPermissionCheckServerFeature) {
      logger.debug(
        `[Config Permission Check] Server feature ${PERMISSION_CHECK_SERVER_FEATURE_NAME} is not supported. Skipping permission check.`,
      );
      return;
    }
    const resolvedTeam = team ?? (await resolveCloudTeam(config));
    assertSession();
    // Strip large fields not needed for permission validation.
    // The server only needs providers, metadata, and whether redteam exists.
    const { tests, scenarios, defaultTest, evaluateOptions, ...minimalConfig } = config;
    if (minimalConfig.redteam) {
      minimalConfig.redteam = {} as typeof minimalConfig.redteam;
    }

    const response = await makeRequest(
      'permissions/check',
      'POST',
      {
        config: minimalConfig,
        ...(resolvedTeam && { teamId: resolvedTeam.id }),
      },
      request,
    );

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
    return resolvedTeam;
  } catch (error) {
    if (error instanceof ConfigPermissionError || error instanceof CloudSelectionChangedError) {
      throw error;
    }

    // If we can't check permissions, allow the operation to continue
    // It will fail later with a proper error message if permissions are actually missing
    logger.warn(`Error checking permissions: ${error}. Continuing anyway.`);
  } finally {
    assertSession();
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
    const team = await resolveTeamId();
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
           Run: promptfoo auth whoami

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
export async function getOrgContext(team?: ResolvedCloudTeam): Promise<{
  organizationName: string;
  teamName?: string;
} | null> {
  if (!cloudConfig.isEnabled()) {
    return null;
  }

  if (team && (!team.name || !team.organizationId)) {
    try {
      team = await getTeamById(team.id);
    } catch {
      // Preserve the actual destination label when optional name lookup fails.
      return { organizationName: team.id };
    }
  }

  try {
    const { apiHost, headers } = cloudConfig.getRequestConfig();
    const response = await fetchWithProxy(`${apiHost}/api/v1/users/me`, {
      headers,
      skipCloudAuthInjection: true,
    });

    if (!response.ok) {
      return null;
    }

    const { organization } = await response.json();
    const organizationId =
      team?.organizationId ?? cloudConfig.getCurrentOrganizationId() ?? organization.id;
    const organizationName = getCloudOrganizationLabel(organization, organizationId);
    const currentTeamId = team?.id ?? cloudConfig.getCurrentTeamId(organizationId);

    // Only include team name if it differs from organization name
    let teamName: string | undefined;
    if (currentTeamId) {
      try {
        const selectedTeam = team ?? (await getTeamById(currentTeamId));
        if (
          selectedTeam.organizationId === organizationId &&
          selectedTeam.name !== organizationName
        ) {
          teamName = selectedTeam.name;
        }
      } catch {
        // Team lookup failed, continue without team name
      }
    }

    return {
      organizationName,
      teamName,
    };
  } catch {
    // Silently fail and return null
    return null;
  }
}

/** The token's organization name applies only to that organization; otherwise show the active ID. */
export function getCloudOrganizationLabel(
  tokenOrganization: { id: string; name: string },
  organizationId = cloudConfig.getCurrentOrganizationId(),
): string {
  return !organizationId || organizationId === tokenOrganization.id
    ? tokenOrganization.name
    : organizationId;
}
