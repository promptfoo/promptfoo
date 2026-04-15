import logger from '../../logger';
import { fetchWithProxy } from '../../util/fetch/index';
import { REQUEST_TIMEOUT_MS } from '../shared';
import { buildOpenClawContextHeaders, resolveAuthToken, resolveGatewayUrl } from './shared';

import type { ApiProvider, ProviderOptions, ProviderResponse } from '../../types/providers';
import type { OpenClawConfig } from './types';

/**
 * OpenClaw Tool Invoke Provider
 *
 * Simple HTTP provider for direct tool invocation via POST /tools/invoke.
 * The tool name is extracted from the provider path:
 * openclaw:tools:sessions_list → tool="sessions_list"
 *
 * The prompt is parsed as JSON for tool arguments. If it's not valid JSON,
 * it's passed as a single `input` argument.
 *
 * Usage:
 *   openclaw:tools:sessions_list - invoke the sessions_list tool
 *   openclaw:tools:session_status - invoke the session_status tool
 *
 * Optional config:
 *   action  - tool sub-action, forwarded as body.action
 *   dry_run - dry-run hint, forwarded as body.dryRun
 */
export class OpenClawToolInvokeProvider implements ApiProvider {
  private toolName: string;
  private gatewayUrl: string;
  private authToken: string | undefined;
  private openclawConfig: OpenClawConfig;
  private timeoutMs: number;

  constructor(toolName: string, providerOptions: ProviderOptions = {}) {
    this.toolName = toolName;
    this.openclawConfig = (providerOptions.config || {}) as OpenClawConfig;
    const env = providerOptions.env as Record<string, string | undefined> | undefined;
    this.gatewayUrl = resolveGatewayUrl(this.openclawConfig, env);
    this.authToken = resolveAuthToken(this.openclawConfig, env);
    this.timeoutMs = this.openclawConfig.timeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  id(): string {
    return `openclaw:tools:${this.toolName}`;
  }

  toString(): string {
    return `[OpenClaw Tool Provider ${this.toolName}]`;
  }

  toJSON() {
    return { provider: this.id() };
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(prompt);
    } catch {
      args = { input: prompt };
    }

    const url = `${this.gatewayUrl}/tools/invoke`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.openclawConfig.headers || {}),
      ...buildOpenClawContextHeaders(this.openclawConfig),
    };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const body = {
      tool: this.toolName,
      ...(this.openclawConfig.action && { action: this.openclawConfig.action }),
      args,
      ...(typeof this.openclawConfig.dry_run === 'boolean' && {
        dryRun: this.openclawConfig.dry_run,
      }),
      ...(this.openclawConfig.session_key && { sessionKey: this.openclawConfig.session_key }),
    };

    logger.debug(`[OpenClaw Tool] POST ${url}`, { tool: this.toolName, args });

    try {
      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), this.timeoutMs);
      const response = await fetchWithProxy(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      }).finally(() => clearTimeout(fetchTimeout));

      if (!response.ok) {
        const text = await response.text();
        return {
          error: `OpenClaw tool invoke failed (${response.status}): ${text}`,
        };
      }

      const data = (await response.json()) as {
        ok: boolean;
        result?: unknown;
        error?: string | { message?: string; type?: string; code?: string };
      };

      if (data.ok) {
        const output = typeof data.result === 'string' ? data.result : JSON.stringify(data.result);
        return { output };
      }

      if (typeof data.error === 'string') {
        return { error: data.error };
      }
      return {
        error: data.error?.message || data.error?.type || data.error?.code || 'Unknown tool error',
      };
    } catch (err) {
      return {
        error: `OpenClaw tool invoke error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
