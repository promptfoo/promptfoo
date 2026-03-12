const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const OPENCLAW_PROTOCOL_VERSION = 3;
const DEFAULT_GATEWAY_PORT = 18789;
const DEFAULT_GATEWAY_HOST = '127.0.0.1';
const DEFAULT_TIMEOUT_MS = 120000;

function readOpenClawConfig() {
  const configPath =
    process.env.OPENCLAW_CONFIG_PATH || path.join(os.homedir(), '.openclaw', 'openclaw.json');

  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return {};
  }
}

function normalizeWsUrl(url) {
  if (!url) {
    return undefined;
  }
  if (url.startsWith('https://')) {
    return `wss://${url.slice('https://'.length)}`;
  }
  if (url.startsWith('http://')) {
    return `ws://${url.slice('http://'.length)}`;
  }
  return url;
}

function resolveGatewayWsUrl(config) {
  if (config.gatewayUrl) {
    return normalizeWsUrl(config.gatewayUrl);
  }

  if (process.env.OPENCLAW_GATEWAY_URL) {
    return normalizeWsUrl(process.env.OPENCLAW_GATEWAY_URL);
  }

  const openclawConfig = readOpenClawConfig();
  const gateway = openclawConfig.gateway || {};

  if (gateway.mode === 'remote' && gateway.remote && gateway.remote.url) {
    return normalizeWsUrl(gateway.remote.url);
  }

  const tlsEnabled = Boolean(gateway.tls && gateway.tls.enabled);
  const scheme = tlsEnabled ? 'wss' : 'ws';
  const port = gateway.port || DEFAULT_GATEWAY_PORT;
  return `${scheme}://${DEFAULT_GATEWAY_HOST}:${port}`;
}

function resolveAuth(config) {
  if (config.authToken) {
    return { kind: 'token', value: config.authToken };
  }
  if (config.authPassword) {
    return { kind: 'password', value: config.authPassword };
  }
  if (process.env.OPENCLAW_GATEWAY_TOKEN) {
    return { kind: 'token', value: process.env.OPENCLAW_GATEWAY_TOKEN };
  }
  if (process.env.OPENCLAW_GATEWAY_PASSWORD) {
    return { kind: 'password', value: process.env.OPENCLAW_GATEWAY_PASSWORD };
  }

  const openclawConfig = readOpenClawConfig();
  const gateway = openclawConfig.gateway || {};

  if (gateway.auth && gateway.auth.mode === 'password' && gateway.auth.password) {
    return { kind: 'password', value: gateway.auth.password };
  }
  if (gateway.auth && gateway.auth.token) {
    return { kind: 'token', value: gateway.auth.token };
  }
  if (gateway.remote && gateway.remote.password) {
    return { kind: 'password', value: gateway.remote.password };
  }
  if (gateway.remote && gateway.remote.token) {
    return { kind: 'token', value: gateway.remote.token };
  }

  return undefined;
}

function getWebSocketImpl() {
  if (typeof WebSocket !== 'undefined') {
    return WebSocket;
  }
  return require('ws');
}

function addListener(ws, event, handler) {
  if (typeof ws.addEventListener === 'function') {
    ws.addEventListener(event, handler);
    return;
  }
  ws.on(event, handler);
}

function getMessageData(event) {
  if (event && typeof event === 'object' && 'data' in event) {
    return event.data;
  }
  return event;
}

function toText(data) {
  if (typeof data === 'string') {
    return data;
  }
  if (Buffer.isBuffer(data)) {
    return data.toString('utf8');
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8');
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
  }
  return String(data);
}

module.exports = class OpenClawSessionProvider {
  constructor(options = {}) {
    this.providerId = options.id || 'openclaw-session-provider';
    this.config = options.config || {};
    this.gatewayUrl = resolveGatewayWsUrl(this.config);
    this.auth = resolveAuth(this.config);
    this.timeoutMs = this.config.timeoutMs || DEFAULT_TIMEOUT_MS;
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context) {
    const WebSocketImpl = getWebSocketImpl();
    const sessionKey =
      context?.vars?.sessionId ||
      context?.vars?.session_key ||
      this.config.sessionKey ||
      `promptfoo-${crypto.randomUUID()}`;
    const thinking = this.config.thinkingLevel || this.config.thinking_level;
    const extraSystemPrompt = this.config.extraSystemPrompt || this.config.extra_system_prompt;

    return new Promise((resolve) => {
      const ws = new WebSocketImpl(this.gatewayUrl);
      const agentRequestId = crypto.randomUUID();
      const waitRequestId = crypto.randomUUID();
      const idempotencyKey = crypto.randomUUID();
      let runId;
      let lastText = '';
      let finished = false;

      const finish = (result) => {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timeout);
        try {
          ws.close();
        } catch {}
        resolve({
          ...result,
          metadata: {
            ...(result.metadata || {}),
            sessionKey,
          },
        });
      };

      const timeout = setTimeout(() => {
        finish({ error: `OpenClaw request timed out after ${this.timeoutMs}ms` });
      }, this.timeoutMs);

      addListener(ws, 'error', (event) => {
        const err = event?.error || event;
        finish({ error: `OpenClaw WebSocket error: ${err?.message || String(err)}` });
      });

      addListener(ws, 'close', () => {
        if (!finished) {
          finish({ error: 'OpenClaw WebSocket connection closed unexpectedly' });
        }
      });

      addListener(ws, 'message', (event) => {
        let frame;
        try {
          frame = JSON.parse(toText(getMessageData(event)));
        } catch {
          return;
        }

        if (frame.type === 'event' && frame.event === 'connect.challenge') {
          const params = {
            minProtocol: OPENCLAW_PROTOCOL_VERSION,
            maxProtocol: OPENCLAW_PROTOCOL_VERSION,
            client: {
              id: 'gateway-client',
              displayName: 'promptfoo-custom',
              version: 'local',
              platform: process.platform,
              mode: 'cli',
            },
            role: 'operator',
            scopes: ['operator.read', 'operator.write'],
            caps: [],
            commands: [],
            permissions: {},
          };

          if (this.auth) {
            if (this.auth.kind === 'token') {
              params.token = this.auth.value;
            } else {
              params.password = this.auth.value;
            }
          }

          ws.send(
            JSON.stringify({
              jsonrpc: '2.0',
              id: agentRequestId,
              method: 'connect.accept',
              params,
            }),
          );
          return;
        }

        if (frame.id === agentRequestId && frame.result?.runId) {
          runId = frame.result.runId;
          ws.send(
            JSON.stringify({
              jsonrpc: '2.0',
              id: waitRequestId,
              method: 'sessions.wait',
              params: {
                runId,
              },
            }),
          );
          return;
        }

        if (frame.type === 'event' && frame.event === 'session.message.delta' && frame.params?.delta) {
          lastText += frame.params.delta;
          return;
        }

        if (frame.type === 'event' && frame.event === 'session.message.complete' && frame.params?.text) {
          lastText = frame.params.text;
          return;
        }

        if (frame.id === waitRequestId) {
          if (frame.error) {
            finish({ error: `OpenClaw sessions.wait failed: ${frame.error.message || 'Unknown error'}` });
            return;
          }
          const text = frame.result?.outputText || lastText || '';
          finish({
            output: text,
            metadata: {
              runId,
              idempotencyKey,
            },
          });
          return;
        }

        if (frame.type === 'event' && frame.event === 'connect.ready') {
          ws.send(
            JSON.stringify({
              jsonrpc: '2.0',
              id: agentRequestId,
              method: 'agents.run',
              params: {
                idempotencyKey,
                agentId: this.config.agentId || 'main',
                sessionKey,
                input: prompt,
                ...(thinking && { thinking }),
                ...(extraSystemPrompt && { extraSystemPrompt }),
              },
            }),
          );
        }
      });
    });
  }
};
