import Anthropic from '@anthropic-ai/sdk';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import {
  CLAUDE_CODE_OAUTH_BETA_FEATURES,
  isCredentialExpired,
  loadClaudeCodeCredential,
} from './claudeCodeAuth';

import type { EnvOverrides } from '../../types/env';
import type { ApiProvider, CallApiContextParams, ProviderResponse } from '../../types/index';

/**
 * Base options shared by all Anthropic provider implementations.
 */
interface AnthropicBaseOptions {
  apiKey?: string;
  apiBaseUrl?: string;
  /**
   * When `false`, skip the upfront API key check and fall back to
   * authenticating through a local Claude Code session (OAuth token sourced
   * from the macOS keychain or `$HOME/.claude/.credentials.json`).
   *
   * Matches the `apiKeyRequired` option already exposed by the
   * `anthropic:claude-agent-sdk` provider.
   *
   * @default true
   */
  apiKeyRequired?: boolean;
  headers?: Record<string, string>;
  cost?: number;
}

/**
 * Generic provider class for Anthropic APIs.
 *
 * Serves as a base class with shared functionality for all Anthropic providers
 * (messages, completions). Handles API key resolution and, when
 * `apiKeyRequired: false` is set on the provider config, falls back to an
 * OAuth token loaded from a local Claude Code session so Claude.ai
 * subscribers can run evals without a separate console API key.
 */
export class AnthropicGenericProvider implements ApiProvider {
  modelName: string;
  config: AnthropicBaseOptions;
  env?: EnvOverrides;
  apiKey?: string;
  /**
   * `true` when this provider is authenticating via a Claude Code OAuth token
   * rather than a standard `ANTHROPIC_API_KEY`. Subclasses use this to inject
   * the Claude Code identity system block that Anthropic's API requires for
   * OAuth-authenticated Messages requests.
   */
  usingClaudeCodeOAuth: boolean;
  anthropic: Anthropic;

  constructor(
    modelName: string,
    options: {
      config?: AnthropicBaseOptions;
      id?: string;
      env?: EnvOverrides;
    } = {},
  ) {
    const { config, id, env } = options;
    this.env = env;
    this.modelName = modelName;
    this.config = config || {};
    this.apiKey = this.getApiKey();
    this.usingClaudeCodeOAuth = false;

    let authToken: string | undefined;
    const defaultHeaders: Record<string, string> = {};

    if (!this.apiKey && this.config.apiKeyRequired === false) {
      const credential = loadClaudeCodeCredential();
      if (credential) {
        if (isCredentialExpired(credential)) {
          logger.warn(
            '[anthropic] Claude Code OAuth credential is expired. Run `claude /login` to refresh it.',
          );
        } else {
          logger.debug(
            '[anthropic] Authenticating with Claude Code OAuth credential from local session.',
          );
        }
        authToken = credential.accessToken;
        this.usingClaudeCodeOAuth = true;
        defaultHeaders['anthropic-beta'] = CLAUDE_CODE_OAUTH_BETA_FEATURES.join(',');
        // Mimic the Claude Code CLI user-agent / x-app headers so the OAuth
        // token is accepted. Anthropic's API gates OAuth tokens to the Claude
        // Code app identity; without these headers requests fail with 401.
        defaultHeaders['user-agent'] = 'claude-cli/1.0.0 (external, promptfoo)';
        defaultHeaders['x-app'] = 'cli';
      } else {
        logger.warn(
          '[anthropic] apiKeyRequired is false but no Claude Code credential was found. ' +
            'Run `claude /login` to create one, or set ANTHROPIC_API_KEY.',
        );
      }
    }

    this.anthropic = new Anthropic({
      apiKey: this.apiKey ?? null,
      authToken: authToken ?? null,
      baseURL: this.getApiBaseUrl(),
      ...(Object.keys(defaultHeaders).length > 0 ? { defaultHeaders } : {}),
    });
    this.id = id ? () => id : this.id;
  }

  id(): string {
    return `anthropic:${this.modelName}`;
  }

  toString(): string {
    return `[Anthropic Provider ${this.modelName}]`;
  }

  /**
   * Whether promptfoo's preflight check should require an API key before
   * dispatching requests to this provider. Callers that set
   * `apiKeyRequired: false` opt into authenticating via a local Claude Code
   * session instead, so the preflight check is skipped.
   */
  requiresApiKey(): boolean {
    if (this.config.apiKeyRequired === false) {
      return false;
    }
    return true;
  }

  getApiKey(): string | undefined {
    return this.config?.apiKey || this.env?.ANTHROPIC_API_KEY || getEnvString('ANTHROPIC_API_KEY');
  }

  getApiBaseUrl(): string | undefined {
    return (
      this.config?.apiBaseUrl || this.env?.ANTHROPIC_BASE_URL || getEnvString('ANTHROPIC_BASE_URL')
    );
  }

  /**
   * Base implementation - should be overridden by specific provider implementations
   */
  async callApi(_prompt: string, _context?: CallApiContextParams): Promise<ProviderResponse> {
    throw new Error('Not implemented: callApi must be implemented by subclasses');
  }
}
