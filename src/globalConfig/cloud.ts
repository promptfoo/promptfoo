import { z } from 'zod';
import logger from '../logger';
import { readGlobalConfig, updateAccountEmail, updateGlobalConfig } from './globalConfig';

import type { GlobalConfig } from '../configTypes';

export const CLOUD_API_HOST = 'https://api.promptfoo.app';

const CLOUD_HOSTNAMES = new Set([
  new URL(CLOUD_API_HOST).hostname,
  new URL('https://www.promptfoo.app').hostname,
  new URL('https://promptfoo.app').hostname,
]);

// Free customers created before this date are grandfathered into auto-share.
export const SHARING_CUTOFF_DATE = new Date('2026-03-09T00:00:00Z');

function isPromptfooCloudHost(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
    return CLOUD_HOSTNAMES.has(hostname);
  } catch {
    return false;
  }
}

let hasWarnedAboutLegacyApiHost = false;

function warnOnceAboutLegacyApiHost(): void {
  if (hasWarnedAboutLegacyApiHost) {
    return;
  }
  hasWarnedAboutLegacyApiHost = true;
  logger.warn(
    'Ignoring the API_HOST environment variable for Promptfoo Cloud routing. ' +
      'To point at a self-hosted deployment, use PROMPTFOO_CLOUD_API_URL or ' +
      '`promptfoo auth login --host <url>`.',
  );
}

const CloudTokenValidationSchema = z.object({
  user: z
    .object({
      id: z.string().min(1),
      name: z.string(),
      email: z.email(),
      createdAt: z.union([z.string(), z.date()]).nullish(),
    })
    .passthrough(),
  organization: z.object({ id: z.string().min(1), name: z.string() }).passthrough(),
  app: z.object({ url: z.url() }),
  hasActiveLicense: z.boolean().optional().catch(undefined),
});

type CloudTokenValidation = z.infer<typeof CloudTokenValidationSchema>;
type CloudConfigState = NonNullable<GlobalConfig['cloud']>;

function parseTokenValidation(response: unknown): CloudTokenValidation {
  const result = CloudTokenValidationSchema.safeParse(response);
  if (!result.success) {
    throw new Error('Invalid Cloud login response');
  }
  return result.data;
}

export class CloudConfig {
  constructor(initializeImmediately: boolean = true) {
    if (initializeImmediately) {
      void this.config;
    }
  }

  private get config(): CloudConfigState {
    return readGlobalConfig()?.cloud || {};
  }

  private update(update: (config: CloudConfigState) => void): void {
    updateGlobalConfig((config) => update((config.cloud ??= {})));
  }

  /**
   * Returns the API key from config file or PROMPTFOO_API_KEY environment variable.
   * Config file takes precedence over environment variable.
   */
  private resolveApiKey(config = this.config): string | undefined {
    return config.apiKey || process.env.PROMPTFOO_API_KEY;
  }

  /**
   * Returns the API host from config file, PROMPTFOO_CLOUD_API_URL environment variable,
   * or defaults to the standard cloud API host.
   * Config file takes precedence over environment variable.
   *
   * Trailing slashes are stripped so callers that append a path (e.g.
   * `${getApiHost()}/api/v1/...`) never produce a double slash. On-prem hosts
   * entered via `promptfoo auth login --host https://host/` commonly include one.
   */
  private resolveApiHost(config = this.config): string {
    // The generic API_HOST env var is intentionally NOT consulted: the cloud
    // origin decides where monkeyPatchFetch sends the saved bearer token, and
    // env files routinely define API_HOST for the app under test. Self-hosted
    // deployments must use `promptfoo auth login --host <url>` or
    // PROMPTFOO_CLOUD_API_URL. process.env is read directly (not
    // getEnvString) so an eval config's `env` block can never influence it.
    const host = config.apiHost || process.env.PROMPTFOO_CLOUD_API_URL || CLOUD_API_HOST;
    // monkeyPatchFetch resolves the host on every request, including evals that
    // never touch Cloud, so only warn when a Cloud credential is actually in
    // play — that's the only case where the legacy variable ever had an effect.
    if (
      !config.apiHost &&
      !process.env.PROMPTFOO_CLOUD_API_URL &&
      process.env.API_HOST &&
      (config.apiKey || process.env.PROMPTFOO_API_KEY)
    ) {
      warnOnceAboutLegacyApiHost();
    }
    return host.replace(/\/+$/, '');
  }

  /**
   * Returns the header name used to carry the Cloud API credential, from config file,
   * PROMPTFOO_CLOUD_AUTH_HEADER environment variable, or the default `Authorization`.
   * Config file takes precedence over environment variable, matching resolveApiHost().
   *
   * process.env is read directly (not getEnvString) for the same reason as
   * PROMPTFOO_CLOUD_API_URL: an eval config's `env` block must never be able to
   * influence Cloud auth routing.
   */
  private resolveAuthHeaderName(config = this.config): string {
    return config.authHeaderName || process.env.PROMPTFOO_CLOUD_AUTH_HEADER || 'Authorization';
  }

  isEnabled(): boolean {
    return !!this.resolveApiKey();
  }

  setApiHost(apiHost: string): void {
    // Persist without a trailing slash so the stored host stays clean regardless of
    // caller (defense in depth alongside the strip in resolveApiHost()).
    this.update((config) => {
      config.apiHost = apiHost.replace(/\/+$/, '');
    });
  }

  setApiKey(apiKey: string): void {
    this.update((config) => {
      config.apiKey = apiKey;
    });
  }

  getApiKey(): string | undefined {
    return this.resolveApiKey();
  }

  getApiHost(): string {
    return this.resolveApiHost();
  }

  setAuthHeaderName(authHeaderName: string): void {
    this.update((config) => {
      config.authHeaderName = authHeaderName;
    });
  }

  getAuthHeaderName(): string {
    return this.resolveAuthHeaderName();
  }

  /**
   * Returns the header(s) to attach to a Cloud API request for the current credential,
   * or `undefined` when no API key is resolved. Callers should spread the result
   * conditionally (`...(cloudConfig.getAuthHeaders() ?? {})`) rather than sending a
   * header with a `Bearer undefined` value.
   */
  getAuthHeaders(): Record<string, string> | undefined {
    return this.getRequestConfig().headers;
  }

  /** Resolve one request's host, credentials, and active team from the same saved session. */
  getRequestConfig(): {
    apiHost: string;
    authHeaderName: string;
    headers: Record<string, string> | undefined;
    teamId: string | undefined;
  } {
    const config = this.config;
    const token = this.resolveApiKey(config);
    const authHeaderName = this.resolveAuthHeaderName(config);
    return {
      apiHost: this.resolveApiHost(config),
      authHeaderName,
      headers: token ? { [authHeaderName]: `Bearer ${token}` } : undefined,
      teamId: config.currentOrganizationId
        ? config.teams?.[config.currentOrganizationId]?.currentTeamId
        : config.currentTeamId,
    };
  }

  setAppUrl(appUrl: string): void {
    this.update((config) => {
      config.appUrl = appUrl;
    });
  }

  getAppUrl(): string {
    return this.config.appUrl || 'https://www.promptfoo.app';
  }

  getSharing(): boolean | undefined {
    return this.config.sharing;
  }

  /**
   * Sets the sharing preference. Note: this value is only updated at authentication time
   * (via `saveValidatedApiToken`) and may become stale if the user's license status
   * changes between re-authentications.
   */
  setSharing(sharing: boolean): void {
    this.update((config) => {
      config.sharing = sharing;
    });
  }

  delete(): void {
    updateGlobalConfig((config) => {
      delete config.cloud;
      updateAccountEmail(config);
    });
  }

  /** Commit a validated login only after organization/team selection has completed. */
  saveValidatedApiToken(
    session: CloudTokenValidation & {
      token: string;
      apiHost: string;
      authHeaderName?: string;
      organizationId?: string;
      // Undefined preserves a remembered preference after discovery fails; null clears it.
      teamId?: string | null;
    },
  ): void {
    const { user, organization, app, hasActiveLicense } = parseTokenValidation(session);
    const organizationId = session.organizationId ?? organization.id;
    const isPublicCloud = isPromptfooCloudHost(session.apiHost) || isPromptfooCloudHost(app.url);
    const isGrandfathered =
      user.createdAt != null && new Date(user.createdAt) < SHARING_CUTOFF_DATE;
    updateGlobalConfig((config) => {
      const cloud = (config.cloud ??= {});
      cloud.apiKey = session.token;
      cloud.apiHost = session.apiHost.replace(/\/+$/, '');
      cloud.appUrl = app.url;
      if (session.authHeaderName) {
        cloud.authHeaderName = session.authHeaderName;
      }
      cloud.sharing = !isPublicCloud || hasActiveLicense === true || isGrandfathered;
      cloud.currentOrganizationId = organizationId;
      delete cloud.currentTeamId;
      if (session.teamId) {
        (cloud.teams ??= {})[organizationId] = { currentTeamId: session.teamId };
      } else if (session.teamId === null && cloud.teams) {
        delete cloud.teams[organizationId];
      }
      updateAccountEmail(config, user.email);
    });
  }

  async validateApiToken(
    token: string,
    apiHost: string,
    authHeaderName?: string,
  ): Promise<CloudTokenValidation> {
    try {
      const { fetchWithProxy } = await import('../util/fetch/index');
      const response = await fetchWithProxy(`${apiHost}/api/v1/users/me`, {
        headers: {
          [authHeaderName || this.getAuthHeaderName()]: `Bearer ${token}`,
        },
        skipCloudAuthInjection: true,
      });

      if (!response.ok) {
        const errorMessage = await response.text();
        logger.error(
          `[Cloud] Failed to validate API token: ${errorMessage}. HTTP Status: ${response.status} - ${response.statusText}.`,
        );
        throw new Error('Failed to validate API token: ' + response.statusText);
      }

      return parseTokenValidation(await response.json());
    } catch (err) {
      const error = err as Error & { cause?: string };
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[Cloud] Failed to validate API token with host ${apiHost}: ${errorMessage}`);
      if (error.cause) {
        logger.error(`Cause: ${error.cause}`);
      }
      throw error;
    }
  }

  getCurrentOrganizationId(): string | undefined {
    return this.config.currentOrganizationId;
  }

  setCurrentOrganization(organizationId: string): void {
    this.update((config) => {
      config.currentOrganizationId = organizationId;
    });
  }

  getCurrentTeamId(organizationId?: string): string | undefined {
    if (organizationId) {
      return this.config.teams?.[organizationId]?.currentTeamId;
    }
    return this.config.currentTeamId;
  }

  setCurrentTeamId(teamId: string, organizationId?: string): void {
    this.update((config) => {
      if (organizationId) {
        (config.teams ??= {})[organizationId] = { currentTeamId: teamId };
      } else {
        config.currentTeamId = teamId;
      }
    });
  }

  clearCurrentTeamId(organizationId?: string): void {
    this.update((config) => {
      if (organizationId) {
        if (config.teams) {
          delete config.teams[organizationId];
        }
      } else {
        delete config.currentTeamId;
      }
    });
  }
}

// singleton instance
// The CLI initializes this singleton lazily after early --env-file handling. Direct CloudConfig
// instances retain eager initialization for backward compatibility.
export const cloudConfig = new CloudConfig(false);
