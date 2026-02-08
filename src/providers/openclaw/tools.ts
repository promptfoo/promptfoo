import logger from '../../logger';
import { fetchWithProxy } from '../../util/fetch/index';
import { REQUEST_TIMEOUT_MS } from '../shared';
import { resolveAuthToken, resolveGatewayUrl } from './shared';

import type { ApiProvider, ProviderOptions, ProviderResponse } from '../../types/providers';
import type { OpenClawConfig } from './types';

/**
 * OpenClaw Tool Invoke Provider
 *
 * Simple HTTP provider for direct tool invocation via POST /tools/invoke.
 * The tool name is extracted from the provider path: openclaw:tools:bash → tool="bash"
 *
 * The prompt is parsed as JSON for tool arguments. If it's not valid JSON,
 * it's passed as a single `input` argument.
 *
 * Usage:
 *   openclaw:tools:bash        - invoke the bash tool
 *   openclaw:tools:agents_list - invoke the agents_list tool
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
    };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const body = {
      tool: this.toolName,
      args,
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

      const data = (await response.json()) as { ok: boolean; result?: unknown; error?: string };

      if (data.ok) {
        const output = typeof data.result === 'string' ? data.result : JSON.stringify(data.result);
        return { output };
      }

      return { error: data.error || 'Unknown tool error' };
    } catch (err) {
      return {
        error: `OpenClaw tool invoke error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
