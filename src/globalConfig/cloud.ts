import { getEnvString } from '../envars';
import logger from '../logger';
import { readGlobalConfig, writeGlobalConfigPartial } from './globalConfig';

export const CLOUD_API_HOST = 'https://api.promptfoo.app';

export const API_HOST = getEnvString('API_HOST', CLOUD_API_HOST);

interface CloudUser {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

interface CloudOrganization {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

interface CloudTeam {
  id: string;
  name: string;
  slug: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

interface CloudApp {
  url: string;
}

export class CloudConfig {
  private config: {
    appUrl: string;
    apiHost?: string;
    apiKey?: string;
    currentOrganizationId?: string;
    currentTeamId?: string;
    teams?: {
      [organizationId: string]: {
        currentTeamId?: string;
        cache?: Array<{
          id: string;
          name: string;
          slug: string;
          lastFetched: string;
        }>;
      };
    };
  };

  constructor() {
    const savedConfig = readGlobalConfig()?.cloud || {};
    this.config = {
      appUrl: savedConfig.appUrl || 'https://www.promptfoo.app',
      apiHost: savedConfig.apiHost,
      apiKey: savedConfig.apiKey,
      currentOrganizationId: savedConfig.currentOrganizationId,
      currentTeamId: savedConfig.currentTeamId,
      teams: savedConfig.teams,
    };
  }

  /**
   * Returns the API key from config file or PROMPTFOO_API_KEY environment variable.
   * Config file takes precedence over environment variable.
   */
  private resolveApiKey(): string | undefined {
    return this.config.apiKey || process.env.PROMPTFOO_API_KEY;
  }

  /**
   * Returns the API host from config file, PROMPTFOO_CLOUD_API_URL environment variable,
   * or defaults to the standard cloud API host.
   * Config file takes precedence over environment variable.
   */
  private resolveApiHost(): string {
    return this.config.apiHost || process.env.PROMPTFOO_CLOUD_API_URL || API_HOST;
  }

  isEnabled(): boolean {
    return !!this.resolveApiKey();
  }

  setApiHost(apiHost: string): void {
    this.config.apiHost = apiHost;
    this.saveConfig();
  }

  setApiKey(apiKey: string): void {
    this.config.apiKey = apiKey;
    this.saveConfig();
  }

  getApiKey(): string | undefined {
    return this.resolveApiKey();
  }

  getApiHost(): string {
    return this.resolveApiHost();
  }

  setAppUrl(appUrl: string): void {
    this.config.appUrl = appUrl;
    this.saveConfig();
  }

  getAppUrl(): string {
    return this.config.appUrl;
  }

  delete(): void {
    writeGlobalConfigPartial({ cloud: {} });
  }

  private saveConfig(): void {
    writeGlobalConfigPartial({ cloud: this.config });
    this.reload();
  }

  private reload(): void {
    const savedConfig = readGlobalConfig()?.cloud || {};
    this.config = {
      appUrl: savedConfig.appUrl || 'https://www.promptfoo.app',
      apiHost: savedConfig.apiHost,
      apiKey: savedConfig.apiKey,
      currentOrganizationId: savedConfig.currentOrganizationId,
      currentTeamId: savedConfig.currentTeamId,
      teams: savedConfig.teams,
    };
  }

  async validateAndSetApiToken(
    token: string,
    apiHost: string,
  ): Promise<{ user: CloudUser; organization: CloudOrganization; app: CloudApp }> {
    try {
      const { fetchWithProxy } = await import('../util/fetch');
      const response = await fetchWithProxy(`${apiHost}/api/v1/users/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorMessage = await response.text();
        logger.error(
          `[Cloud] Failed to validate API token: ${errorMessage}. HTTP Status: ${response.status} - ${response.statusText}.`,
        );
        throw new Error('Failed to validate API token: ' + response.statusText);
      }

      const { user, organization, app } = await response.json();
      this.setApiKey(token);
      this.setApiHost(apiHost);
      this.setAppUrl(app.url);

      return {
        user,
        organization,
        app,
      };
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
    this.config.currentOrganizationId = organizationId;
    this.saveConfig();
  }

  getCurrentTeamId(organizationId?: string): string | undefined {
    if (organizationId) {
      return this.config.teams?.[organizationId]?.currentTeamId;
    }
    return this.config.currentTeamId;
  }

  setCurrentTeamId(teamId: string, organizationId?: string): void {
    if (organizationId) {
      if (!this.config.teams) {
        this.config.teams = {};
      }
      if (!this.config.teams[organizationId]) {
        this.config.teams[organizationId] = {};
      }
      this.config.teams[organizationId].currentTeamId = teamId;
    } else {
      this.config.currentTeamId = teamId;
    }
    this.saveConfig();
  }

  clearCurrentTeamId(organizationId?: string): void {
    if (organizationId) {
      if (this.config.teams?.[organizationId]) {
        delete this.config.teams[organizationId].currentTeamId;
      }
    } else {
      delete this.config.currentTeamId;
    }
    this.saveConfig();
  }

  cacheTeams(teams: CloudTeam[], organizationId?: string): void {
    if (organizationId) {
      if (!this.config.teams) {
        this.config.teams = {};
      }
      if (!this.config.teams[organizationId]) {
        this.config.teams[organizationId] = {};
      }

      this.config.teams[organizationId].cache = teams.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        lastFetched: new Date().toISOString(),
      }));
    }
    this.saveConfig();
  }

  getCachedTeams(
    organizationId?: string,
  ): Array<{ id: string; name: string; slug: string }> | undefined {
    if (organizationId) {
      return this.config.teams?.[organizationId]?.cache;
    }
    return undefined;
  }
}

// singleton instance
export const cloudConfig = new CloudConfig();
