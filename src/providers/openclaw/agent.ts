import crypto from 'crypto';

import WebSocket from 'ws';
import { VERSION } from '../../constants';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../shared';
import { resolveAuthToken, resolveGatewayUrl } from './shared';

import type { ApiProvider, ProviderOptions, ProviderResponse } from '../../types/providers';
import type { OpenClawConfig } from './types';

const OPENCLAW_PROTOCOL_VERSION = 3;

/**
 * OpenClaw WebSocket Agent Provider
 *
 * Custom provider that uses the native OpenClaw WS RPC protocol to invoke agents.
 * Supports full streaming with event accumulation.
 *
 * Protocol flow:
 *   1. Open WS connection to gateway
 *   2. Receive connect.challenge event → send connect request
 *   3. Receive hello-ok response → send agent request
 *   4. Receive agent accepted response → send agent.wait
 *   5. Accumulate streaming "agent" events (stream: "assistant")
 *   6. Resolve on agent.wait response
 *
 * Usage:
 *   openclaw:agent           - default agent (main)
 *   openclaw:agent:main      - explicit agent ID
 *   openclaw:agent:my-agent  - custom agent ID
 */
export class OpenClawAgentProvider implements ApiProvider {
  private agentId: string;
  private gatewayUrl: string;
  private authToken: string | undefined;
  private openclawConfig: OpenClawConfig;
  private timeoutMs: number;
  private ws: WebSocket | null = null;

  constructor(agentId: string, providerOptions: ProviderOptions = {}) {
    this.agentId = agentId;
    this.openclawConfig = (providerOptions.config || {}) as OpenClawConfig;
    const env = providerOptions.env as Record<string, string | undefined> | undefined;
    this.gatewayUrl = resolveGatewayUrl(this.openclawConfig, env);
    this.authToken = resolveAuthToken(this.openclawConfig, env);
    this.timeoutMs = this.openclawConfig.timeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  id(): string {
    return `openclaw:agent:${this.agentId}`;
  }

  toString(): string {
    return `[OpenClaw Agent Provider ${this.agentId}]`;
  }

  toJSON() {
    return { provider: this.id() };
  }

  async cleanup(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    const wsUrl = this.gatewayUrl.replace(/^http(s?):\/\//, 'ws$1://');

    return new Promise<ProviderResponse>((resolve) => {
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      const agentRequestId = crypto.randomUUID();
      const waitRequestId = crypto.randomUUID();
      const idempotencyKey = crypto.randomUUID();
      let lastText = '';
      let runId: string | undefined;
      let connected = false;
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          ws.close();
          resolve({ error: `OpenClaw agent request timed out after ${this.timeoutMs}ms` });
        }
      }, this.timeoutMs);

      const finish = (result: ProviderResponse) => {
        if (resolved) {
          return;
        }
        resolved = true;
        clearTimeout(timeout);
        if (this.ws === ws) {
          this.ws = null;
        }
        ws.close();
        resolve(result);
      };

      ws.on('error', (err) => {
        finish({ error: `OpenClaw WebSocket error: ${err.message}` });
      });

      ws.on('close', () => {
        if (!resolved) {
          finish({ error: 'OpenClaw WebSocket connection closed unexpectedly' });
        }
      });

      ws.on('message', (data) => {
        let frame: {
          type: string;
          id?: string;
          event?: string;
          ok?: boolean;
          payload?: Record<string, unknown>;
          error?: { code?: string; message?: string };
        };

        try {
          frame = JSON.parse(data.toString());
        } catch {
          logger.debug('[OpenClaw Agent] Failed to parse WS frame');
          return;
        }

        logger.debug('[OpenClaw Agent] Frame received', {
          type: frame.type,
          event: frame.event,
          id: frame.id,
        });

        // Step 2: Receive connect.challenge → send connect
        if (frame.type === 'event' && frame.event === 'connect.challenge') {
          ws.send(
            JSON.stringify({
              type: 'req',
              id: crypto.randomUUID(),
              method: 'connect',
              params: {
                minProtocol: OPENCLAW_PROTOCOL_VERSION,
                maxProtocol: OPENCLAW_PROTOCOL_VERSION,
                client: {
                  id: 'gateway-client',
                  displayName: 'promptfoo',
                  version: VERSION,
                  platform: process.platform,
                  mode: 'cli',
                },
                role: 'operator',
                scopes: ['operator.read', 'operator.write'],
                caps: [],
                commands: [],
                permissions: {},
                ...(this.authToken && { auth: { token: this.authToken } }),
              },
            }),
          );
          return;
        }

        // Step 3: Receive connect response → send agent request
        if (frame.type === 'res' && !connected) {
          if (!frame.ok) {
            finish({
              error: `OpenClaw connect failed: ${frame.error?.message || 'unknown error'}`,
            });
            return;
          }

          connected = true;

          ws.send(
            JSON.stringify({
              type: 'req',
              id: agentRequestId,
              method: 'agent',
              params: {
                message: prompt,
                agentId: this.agentId,
                idempotencyKey,
                ...(this.openclawConfig.session_key && {
                  sessionKey: this.openclawConfig.session_key,
                }),
                ...(this.openclawConfig.thinking_level && {
                  thinking: this.openclawConfig.thinking_level,
                }),
              },
            }),
          );
          return;
        }

        // Step 4: Agent request accepted → send agent.wait
        if (frame.type === 'res' && frame.id === agentRequestId) {
          if (!frame.ok) {
            finish({
              error: `OpenClaw agent error: ${frame.error?.message || 'unknown error'}`,
            });
            return;
          }

          const payload = frame.payload as { runId?: string } | undefined;
          runId = payload?.runId;
          if (runId) {
            ws.send(
              JSON.stringify({
                type: 'req',
                id: waitRequestId,
                method: 'agent.wait',
                params: { runId, timeoutMs: this.timeoutMs },
              }),
            );
          }
          return;
        }

        // Step 5: Accumulate streaming agent events (stream: "assistant")
        if (frame.type === 'event' && frame.event === 'agent') {
          const payload = frame.payload as {
            runId?: string;
            stream?: string;
            data?: { text?: string; delta?: string };
          };
          // Filter by runId to ignore events from other concurrent runs
          if (payload?.runId && runId && payload.runId !== runId) {
            return;
          }
          if (payload?.stream === 'assistant' && payload?.data?.text) {
            // text is the full accumulated output so far, not a delta
            lastText = payload.data.text;
          }
          return;
        }

        // Step 6: agent.wait response → resolve with accumulated output
        if (frame.type === 'res' && frame.id === waitRequestId) {
          if (frame.ok) {
            const output = lastText || 'No output from agent';
            finish({ output });
          } else {
            finish({
              error: `OpenClaw agent error: ${frame.error?.message || 'unknown error'}`,
            });
          }
          return;
        }
      });
    });
  }
}
