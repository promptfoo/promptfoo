import chalk from 'chalk';
import { getEnvString } from '../envars';
import { fetchWithProxy } from '../fetch';
import logger from '../logger';
import { readGlobalConfig, writeGlobalConfigPartial } from './globalConfig';

export const API_HOST = getEnvString('API_HOST', 'https://api.promptfoo.app');

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

interface CloudApp {
  url: string;
}

export class CloudConfig {
  private config: {
    appUrl: string;
    apiHost: string;
    apiKey?: string;
  };
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.config = {
      appUrl: 'https://www.promptfoo.app',
      apiHost: API_HOST,
      apiKey: undefined,
    };
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = (async () => {
      const savedConfig = (await readGlobalConfig())?.cloud || {};
      this.config = {
        appUrl: savedConfig.appUrl || 'https://www.promptfoo.app',
        apiHost: savedConfig.apiHost || API_HOST,
        apiKey: savedConfig.apiKey,
      };
      this.initialized = true;
    })();
    
    return this.initPromise;
  }

  async isEnabled(): Promise<boolean> {
    await this.initialize();
    return !!this.config.apiKey;
  }

  async setApiHost(apiHost: string): Promise<void> {
    await this.initialize();
    this.config.apiHost = apiHost;
    await this.saveConfig();
  }

  async setApiKey(apiKey: string): Promise<void> {
    await this.initialize();
    this.config.apiKey = apiKey;
    await this.saveConfig();
  }

  async getApiKey(): Promise<string | undefined> {
    await this.initialize();
    return this.config.apiKey;
  }

  async getApiHost(): Promise<string> {
    await this.initialize();
    return this.config.apiHost;
  }

  async setAppUrl(appUrl: string): Promise<void> {
    await this.initialize();
    this.config.appUrl = appUrl;
    await this.saveConfig();
  }

  async getAppUrl(): Promise<string> {
    await this.initialize();
    return this.config.appUrl;
  }

  async delete(): Promise<void> {
    await writeGlobalConfigPartial({ cloud: {} });
  }

  private async saveConfig(): Promise<void> {
    await writeGlobalConfigPartial({ cloud: this.config });
    await this.reload();
  }

  private async reload(): Promise<void> {
    const savedConfig = (await readGlobalConfig())?.cloud || {};
    this.config = {
      appUrl: savedConfig.appUrl || 'https://www.promptfoo.app',
      apiHost: savedConfig.apiHost || API_HOST,
      apiKey: savedConfig.apiKey,
    };
  }

  async validateAndSetApiToken(
    token: string,
    apiHost: string,
  ): Promise<{ user: CloudUser; organization: CloudOrganization; app: CloudApp }> {
    try {
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
      await this.setApiKey(token);
      await this.setApiHost(apiHost);
      await this.setAppUrl(app.url);

      logger.info(chalk.green.bold('Successfully logged in'));
      logger.info(chalk.dim('Logged in as:'));
      logger.info(`User: ${chalk.cyan(user.email)}`);
      logger.info(`Organization: ${chalk.cyan(organization.name)}`);
      logger.info(`Access the app at ${chalk.cyan(app.url)}`);

      return {
        user,
        organization,
        app,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[Cloud] Failed to validate API token with host ${apiHost}: ${errorMessage}`);
      if ((error as any).cause) {
        logger.error(`Cause: ${(error as any).cause}`);
      }
      throw error;
    }
  }
}

// singleton instance
export const cloudConfig = new CloudConfig();
