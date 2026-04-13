import crypto from 'crypto';

import WebSocket from 'ws';
import { VERSION } from '../../constants';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../shared';
import {
  buildSignedOpenClawDevice,
  clearOpenClawDeviceAuthToken,
  loadOpenClawDeviceAuthToken,
  loadOrCreateOpenClawDeviceIdentity,
  storeOpenClawDeviceAuthToken,
} from './device-auth';
import { resolveAuthSecret, resolveGatewayWsUrl } from './shared';

import type { ApiProvider, ProviderOptions, ProviderResponse } from '../../types/providers';
import type { OpenClawDeviceIdentity } from './device-auth';
import type { OpenClawConfig } from './types';

const OPENCLAW_PROTOCOL_VERSION = 3;
const CLIENT_ID = 'gateway-client';
const CLIENT_MODE = 'cli';
const CLIENT_ROLE = 'operator';
const DEFAULT_SCOPES = ['operator.read', 'operator.write'];

interface OpenClawFrameError {
  code?: string;
  message?: string;
  details?: {
    code?: string;
    reason?: string;
    canRetryWithDeviceToken?: boolean;
    recommendedNextStep?: string;
  };
}

interface OpenClawWsFrame {
  type: string;
  id?: string;
  event?: string;
  ok?: boolean;
  payload?: Record<string, unknown>;
  error?: OpenClawFrameError;
}

interface DeviceTokenAuth {
  token: string;
  scopes?: string[];
  source: 'config' | 'stored' | 'retry';
}

interface ConnectAuthState {
  auth?: { password?: string; token?: string; deviceToken?: string };
  deviceIdentity?: OpenClawDeviceIdentity;
  deviceTokenSource?: DeviceTokenAuth['source'];
  kind: 'password' | 'token' | 'deviceToken' | 'none';
  scopes: string[];
  signatureToken?: string | null;
}

type OpenClawAgentCallResult = ProviderResponse & { retryWithDeviceToken?: boolean };
type FinishConnection = (result: OpenClawAgentCallResult, closeSocket?: boolean) => void;

interface AgentConnectionState {
  agentRequestId: string;
  waitRequestId: string;
  idempotencyKey: string;
  lastText: string;
  lastError: string;
  connected: boolean;
  prompt: string;
  sessionKey: string;
  ws: WebSocket;
  finish: FinishConnection;
  connectAuthState?: ConnectAuthState;
  retryDeviceToken?: DeviceTokenAuth;
  runId?: string;
}

function normalizeScopes(scopes: string[] | undefined): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const scope of scopes || []) {
    const trimmed = scope.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      normalized.push(trimmed);
    }
  }
  return normalized;
}

function getStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const strings = value.filter((item): item is string => typeof item === 'string');
  return strings.length > 0 ? strings : undefined;
}

function stripRetryMarker(result: OpenClawAgentCallResult): ProviderResponse {
  const { retryWithDeviceToken: _retryWithDeviceToken, ...providerResponse } = result;
  return providerResponse;
}

function buildOpenClawAgentSessionKey(agentId: string, sessionKey: string): string {
  const trimmedSessionKey = sessionKey.trim();
  if (!trimmedSessionKey || trimmedSessionKey.toLowerCase().startsWith('agent:')) {
    return trimmedSessionKey;
  }

  const trimmedAgentId = agentId.trim();
  if (!trimmedAgentId || trimmedAgentId.toLowerCase() === 'main') {
    return trimmedSessionKey;
  }

  return `agent:${trimmedAgentId}:${trimmedSessionKey}`;
}

/**
 * OpenClaw WebSocket Agent Provider
 *
 * Custom provider that uses the native OpenClaw WS RPC protocol to invoke agents.
 * Supports full streaming with event accumulation.
 *
 * Protocol flow:
 *   1. Open WS connection to gateway
 *   2. Receive connect.challenge event → send signed connect request
 *   3. Receive connect response → persist device token and send agent request
 *   4. Receive agent accepted response → send agent.wait
 *   5. Accumulate streaming "agent" events (assistant text/delta, lifecycle errors, error streams)
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
  private authKind: 'password' | 'token' | undefined;
  private authSecret: string | undefined;
  private openclawConfig: OpenClawConfig;
  private timeoutMs: number;
  private scopes: string[];
  private hasExplicitScopes: boolean;
  private activeConnections = new Set<WebSocket>();

  constructor(agentId: string, providerOptions: ProviderOptions = {}) {
    this.agentId = agentId;
    this.openclawConfig = (providerOptions.config || {}) as OpenClawConfig;
    const env = providerOptions.env as Record<string, string | undefined> | undefined;
    this.gatewayUrl = resolveGatewayWsUrl(this.openclawConfig, env);
    const authSecret = resolveAuthSecret(this.openclawConfig, env);
    this.authKind = authSecret?.kind;
    this.authSecret = authSecret?.value;
    this.timeoutMs = this.openclawConfig.timeoutMs ?? REQUEST_TIMEOUT_MS;
    this.scopes = normalizeScopes(this.openclawConfig.scopes);
    this.hasExplicitScopes = this.scopes.length > 0;
    if (!this.hasExplicitScopes) {
      this.scopes = [...DEFAULT_SCOPES];
    }
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
    for (const ws of this.activeConnections) {
      ws.close();
    }
    this.activeConnections.clear();
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    // Keep eval runs isolated from the user's persistent main session unless explicitly pinned.
    const sessionKey = buildOpenClawAgentSessionKey(
      this.agentId,
      this.openclawConfig.session_key || `promptfoo-${crypto.randomUUID()}`,
    );

    const firstResult = await this.callApiOnce(prompt, sessionKey);
    if (firstResult.retryWithDeviceToken) {
      const retryDeviceToken = this.resolveDeviceTokenForRetry();
      if (retryDeviceToken) {
        return stripRetryMarker(await this.callApiOnce(prompt, sessionKey, retryDeviceToken));
      }
    }

    return stripRetryMarker(firstResult);
  }

  private callApiOnce(
    prompt: string,
    sessionKey: string,
    retryDeviceToken?: DeviceTokenAuth,
  ): Promise<OpenClawAgentCallResult> {
    return new Promise<OpenClawAgentCallResult>((resolve) => {
      const wsHeaders = this.buildWebSocketHeaders();
      const ws = wsHeaders
        ? new WebSocket(this.gatewayUrl, { headers: wsHeaders })
        : new WebSocket(this.gatewayUrl);
      this.activeConnections.add(ws);

      let resolved = false;

      let timeout: ReturnType<typeof setTimeout>;
      const finish: FinishConnection = (result, closeSocket = true) => {
        if (resolved) {
          return;
        }
        resolved = true;
        clearTimeout(timeout);
        this.activeConnections.delete(ws);
        if (closeSocket) {
          ws.close();
        }
        resolve(result);
      };

      const state: AgentConnectionState = {
        agentRequestId: crypto.randomUUID(),
        waitRequestId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        lastText: '',
        lastError: '',
        connected: false,
        prompt,
        sessionKey,
        ws,
        finish,
        retryDeviceToken,
      };

      timeout = setTimeout(() => {
        finish({ error: `OpenClaw agent request timed out after ${this.timeoutMs}ms` });
      }, this.timeoutMs);

      ws.on('error', (err) => {
        finish({ error: `OpenClaw WebSocket error: ${err.message}` });
      });

      ws.on('close', () => {
        this.activeConnections.delete(ws);
        if (!resolved) {
          finish({ error: 'OpenClaw WebSocket connection closed unexpectedly' }, false);
        }
      });

      ws.on('message', (data) => {
        const frame = this.parseFrame(data);
        if (frame) {
          this.handleFrame(frame, state);
        }
      });
    });
  }

  private parseFrame(data: { toString(): string }): OpenClawWsFrame | undefined {
    try {
      const frame = JSON.parse(data.toString()) as OpenClawWsFrame;
      logger.debug('[OpenClaw Agent] Frame received', {
        type: frame.type,
        event: frame.event,
        id: frame.id,
        ok: frame.ok,
        payloadStatus:
          frame.payload && typeof frame.payload.status === 'string'
            ? frame.payload.status
            : undefined,
        payloadStream:
          frame.payload && typeof frame.payload.stream === 'string'
            ? frame.payload.stream
            : undefined,
      });
      return frame;
    } catch {
      logger.debug('[OpenClaw Agent] Failed to parse WS frame');
      return undefined;
    }
  }

  private handleFrame(frame: OpenClawWsFrame, state: AgentConnectionState): void {
    try {
      if (frame.type === 'event' && frame.event === 'connect.challenge') {
        this.handleConnectChallenge(frame, state);
        return;
      }
      if (frame.type === 'res' && !state.connected) {
        this.handleConnectResponse(frame, state);
        return;
      }
      if (frame.type === 'res' && frame.id === state.agentRequestId) {
        this.handleAgentAccepted(frame, state);
        return;
      }
      if (frame.type === 'event' && frame.event === 'agent') {
        this.handleAgentEvent(frame, state);
        return;
      }
      if (frame.type === 'res' && frame.id === state.waitRequestId) {
        this.handleAgentWaitResponse(frame, state);
      }
    } catch (err) {
      state.finish({
        error: `OpenClaw WebSocket error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  private handleConnectChallenge(frame: OpenClawWsFrame, state: AgentConnectionState): void {
    state.connectAuthState = this.buildConnectAuthState(state.retryDeviceToken);
    this.sendJson(state.ws, {
      type: 'req',
      id: crypto.randomUUID(),
      method: 'connect',
      params: this.buildConnectParams(frame, state.connectAuthState),
    });
  }

  private handleConnectResponse(frame: OpenClawWsFrame, state: AgentConnectionState): void {
    if (!frame.ok) {
      this.clearStoredDeviceTokenOnFailure(state.connectAuthState, frame.error);
      state.finish({
        error: this.formatConnectError(frame.error),
        retryWithDeviceToken:
          !state.retryDeviceToken && this.shouldRetryConnectWithDeviceToken(frame.error),
      });
      return;
    }

    state.connected = true;
    this.storeDeviceTokenFromHello(frame.payload, state.connectAuthState);
    this.sendJson(state.ws, {
      type: 'req',
      id: state.agentRequestId,
      method: 'agent',
      params: this.buildAgentRequestParams(state),
    });
  }

  private buildAgentRequestParams(state: AgentConnectionState): Record<string, unknown> {
    return {
      message: state.prompt,
      agentId: this.agentId,
      idempotencyKey: state.idempotencyKey,
      sessionKey: state.sessionKey,
      ...(this.openclawConfig.message_channel && {
        channel: this.openclawConfig.message_channel,
      }),
      ...(this.openclawConfig.account_id && {
        accountId: this.openclawConfig.account_id,
      }),
      ...(this.openclawConfig.thinking_level && {
        thinking: this.openclawConfig.thinking_level,
      }),
      ...(this.openclawConfig.extra_system_prompt && {
        extraSystemPrompt: this.openclawConfig.extra_system_prompt,
      }),
    };
  }

  private handleAgentAccepted(frame: OpenClawWsFrame, state: AgentConnectionState): void {
    if (!frame.ok) {
      state.finish({
        error: `OpenClaw agent error: ${frame.error?.message || 'unknown error'}`,
      });
      return;
    }

    const payload = frame.payload as { runId?: string } | undefined;
    state.runId =
      typeof payload?.runId === 'string' && payload.runId.trim() ? payload.runId : undefined;
    if (!state.runId) {
      logger.warn('[OpenClaw Agent] Missing runId in accepted response', {
        agentId: this.agentId,
        payload,
      });
      state.finish({ error: 'OpenClaw agent error: gateway accepted request without a runId' });
      return;
    }

    this.sendJson(state.ws, {
      type: 'req',
      id: state.waitRequestId,
      method: 'agent.wait',
      params: { runId: state.runId, timeoutMs: this.timeoutMs },
    });
  }

  private handleAgentEvent(frame: OpenClawWsFrame, state: AgentConnectionState): void {
    const payload = frame.payload as {
      runId?: string;
      stream?: string;
      data?: { text?: string; delta?: string; phase?: string; error?: string; reason?: string };
    };
    if (payload?.runId && state.runId && payload.runId !== state.runId) {
      return;
    }
    if (payload?.stream === 'lifecycle' && payload.data?.phase === 'error') {
      state.lastError = payload.data.error || 'OpenClaw agent lifecycle error';
      return;
    }
    if (payload?.stream === 'error') {
      state.lastError =
        payload.data?.error || payload.data?.reason || 'OpenClaw agent stream error';
      return;
    }
    if (payload?.stream !== 'assistant') {
      return;
    }
    if (typeof payload?.data?.text === 'string') {
      state.lastText = payload.data.text;
      state.lastError = '';
      return;
    }
    if (typeof payload?.data?.delta === 'string') {
      state.lastText += payload.data.delta;
      state.lastError = '';
    }
  }

  private handleAgentWaitResponse(frame: OpenClawWsFrame, state: AgentConnectionState): void {
    if (!frame.ok) {
      state.finish({
        error: `OpenClaw agent error: ${frame.error?.message || 'unknown error'}`,
      });
      return;
    }

    const payload = frame.payload as {
      status?: string;
      error?: string;
      output?: string;
      text?: string;
    };
    if (payload?.status === 'error') {
      state.finish({ error: `OpenClaw agent error: ${payload.error || 'unknown error'}` });
      return;
    }
    if (payload?.status === 'timeout') {
      state.finish({ error: `OpenClaw agent error: timed out waiting for run ${state.runId}` });
      return;
    }

    const finalText =
      typeof payload?.output === 'string'
        ? payload.output
        : typeof payload?.text === 'string'
          ? payload.text
          : undefined;
    if (state.lastText || finalText) {
      state.finish({ output: state.lastText || finalText });
      return;
    }
    if (state.lastError) {
      state.finish({ error: `OpenClaw agent error: ${state.lastError}` });
      return;
    }
    state.finish({ output: 'No output from agent' });
  }

  private sendJson(ws: WebSocket, payload: unknown): void {
    ws.send(JSON.stringify(payload));
  }

  private buildWebSocketHeaders(): Record<string, string> | undefined {
    const headers = {
      ...(this.openclawConfig.headers || {}),
      ...(this.openclawConfig.ws_headers || {}),
    };
    return Object.keys(headers).length > 0 ? headers : undefined;
  }

  private buildConnectAuthState(retryDeviceToken?: DeviceTokenAuth): ConnectAuthState {
    const deviceIdentity = this.loadDeviceIdentity();
    const storedOrConfiguredDeviceToken = deviceIdentity
      ? this.resolveDeviceTokenForConnect(deviceIdentity)
      : undefined;
    const deviceToken = retryDeviceToken || storedOrConfiguredDeviceToken;

    if (retryDeviceToken) {
      return {
        auth: { deviceToken: retryDeviceToken.token },
        deviceIdentity,
        deviceTokenSource: retryDeviceToken.source,
        kind: 'deviceToken',
        scopes: this.resolveScopesForDeviceToken(retryDeviceToken),
        signatureToken: retryDeviceToken.token,
      };
    }

    if (this.authSecret && this.authKind) {
      const auth =
        this.authKind === 'password' ? { password: this.authSecret } : { token: this.authSecret };
      return {
        auth,
        deviceIdentity,
        kind: this.authKind,
        scopes: this.scopes,
        signatureToken: this.authKind === 'token' ? this.authSecret : null,
      };
    }

    if (deviceToken) {
      return {
        auth: { deviceToken: deviceToken.token },
        deviceIdentity,
        deviceTokenSource: deviceToken.source,
        kind: 'deviceToken',
        scopes: this.resolveScopesForDeviceToken(deviceToken),
        signatureToken: deviceToken.token,
      };
    }

    return {
      deviceIdentity,
      kind: 'none',
      scopes: this.scopes,
      signatureToken: null,
    };
  }

  private buildConnectParams(frame: OpenClawWsFrame, authState: ConnectAuthState) {
    const nonce = this.extractChallengeNonce(frame);
    const params: Record<string, unknown> = {
      minProtocol: OPENCLAW_PROTOCOL_VERSION,
      maxProtocol: OPENCLAW_PROTOCOL_VERSION,
      client: {
        id: CLIENT_ID,
        displayName: 'promptfoo',
        version: VERSION,
        platform: process.platform,
        ...(this.openclawConfig.device_family && {
          deviceFamily: this.openclawConfig.device_family,
        }),
        mode: CLIENT_MODE,
      },
      role: CLIENT_ROLE,
      scopes: authState.scopes,
      caps: [],
      commands: [],
      permissions: {},
      ...(authState.auth && { auth: authState.auth }),
    };

    const device = this.buildSignedDevice(authState, nonce);
    if (device) {
      params.device = device;
    }

    return params;
  }

  private buildSignedDevice(
    authState: ConnectAuthState,
    nonce: string,
  ): ReturnType<typeof buildSignedOpenClawDevice> | undefined {
    if (!authState.deviceIdentity || this.openclawConfig.disable_device_auth) {
      return undefined;
    }

    try {
      return buildSignedOpenClawDevice({
        identity: authState.deviceIdentity,
        clientId: CLIENT_ID,
        clientMode: CLIENT_MODE,
        role: CLIENT_ROLE,
        scopes: authState.scopes,
        nonce,
        token: authState.signatureToken,
        platform: process.platform,
        deviceFamily: this.openclawConfig.device_family,
      });
    } catch (err) {
      logger.warn(
        '[OpenClaw Agent] Failed to sign device identity; connecting without device auth',
        {
          err,
        },
      );
      return undefined;
    }
  }

  private loadDeviceIdentity(): OpenClawDeviceIdentity | undefined {
    if (this.openclawConfig.disable_device_auth) {
      return undefined;
    }
    try {
      return loadOrCreateOpenClawDeviceIdentity(this.openclawConfig.device_identity_path);
    } catch (err) {
      logger.warn('[OpenClaw Agent] Failed to load device identity', { err });
      return undefined;
    }
  }

  private resolveDeviceTokenForConnect(
    deviceIdentity: OpenClawDeviceIdentity,
  ): DeviceTokenAuth | undefined {
    const configDeviceToken = this.openclawConfig.device_token?.trim();
    if (configDeviceToken) {
      return { token: configDeviceToken, scopes: this.scopes, source: 'config' };
    }

    const storedDeviceToken = loadOpenClawDeviceAuthToken({
      deviceId: deviceIdentity.deviceId,
      role: CLIENT_ROLE,
      filePath: this.openclawConfig.device_auth_path,
    });
    if (!storedDeviceToken?.token) {
      return undefined;
    }

    return {
      token: storedDeviceToken.token,
      scopes: this.hasExplicitScopes ? this.scopes : storedDeviceToken.scopes,
      source: 'stored',
    };
  }

  private resolveDeviceTokenForRetry(): DeviceTokenAuth | undefined {
    const identity = this.loadDeviceIdentity();
    if (!identity) {
      return undefined;
    }

    const deviceToken = this.resolveDeviceTokenForConnect(identity);
    return deviceToken ? { ...deviceToken, source: 'retry' } : undefined;
  }

  private resolveScopesForDeviceToken(deviceToken: DeviceTokenAuth): string[] {
    if (this.hasExplicitScopes) {
      return this.scopes;
    }
    return deviceToken.scopes && deviceToken.scopes.length > 0 ? deviceToken.scopes : this.scopes;
  }

  private storeDeviceTokenFromHello(
    payload: Record<string, unknown> | undefined,
    authState: ConnectAuthState | undefined,
  ): void {
    if (!authState?.deviceIdentity) {
      return;
    }

    const authPayload =
      payload?.auth && typeof payload.auth === 'object' && !Array.isArray(payload.auth)
        ? (payload.auth as Record<string, unknown>)
        : undefined;
    const deviceToken = typeof authPayload?.deviceToken === 'string' ? authPayload.deviceToken : '';
    if (!deviceToken.trim()) {
      return;
    }

    const scopes = getStringArray(authPayload?.scopes) || authState.scopes;
    const role =
      typeof authPayload?.role === 'string' && authPayload.role.trim()
        ? authPayload.role
        : CLIENT_ROLE;
    storeOpenClawDeviceAuthToken({
      deviceId: authState.deviceIdentity.deviceId,
      role,
      token: deviceToken,
      scopes,
      filePath: this.openclawConfig.device_auth_path,
    });
  }

  private clearStoredDeviceTokenOnFailure(
    authState: ConnectAuthState | undefined,
    error: OpenClawFrameError | undefined,
  ): void {
    if (
      !authState?.deviceIdentity ||
      authState.kind !== 'deviceToken' ||
      authState.deviceTokenSource === 'config'
    ) {
      return;
    }

    const detailCode = this.getConnectErrorDetailCode(error);
    const topLevelCode = error?.code;
    if (
      detailCode !== 'AUTH_DEVICE_TOKEN_MISMATCH' &&
      topLevelCode !== 'AUTH_DEVICE_TOKEN_MISMATCH'
    ) {
      return;
    }

    clearOpenClawDeviceAuthToken({
      deviceId: authState.deviceIdentity.deviceId,
      role: CLIENT_ROLE,
      filePath: this.openclawConfig.device_auth_path,
    });
  }

  private extractChallengeNonce(frame: OpenClawWsFrame): string {
    const nonce = frame.payload?.nonce;
    return typeof nonce === 'string' ? nonce : '';
  }

  private getConnectErrorDetailCode(error: OpenClawFrameError | undefined): string | undefined {
    return error?.details?.code || error?.code;
  }

  private shouldRetryConnectWithDeviceToken(error: OpenClawFrameError | undefined): boolean {
    const detailCode = this.getConnectErrorDetailCode(error);
    const recommendedNextStep = error?.details?.recommendedNextStep;
    return (
      detailCode === 'AUTH_TOKEN_MISMATCH' ||
      error?.details?.canRetryWithDeviceToken === true ||
      recommendedNextStep === 'retry_with_device_token'
    );
  }

  private formatConnectError(error: OpenClawFrameError | undefined): string {
    const message = error?.message || 'unknown error';
    const detailCode = this.getConnectErrorDetailCode(error);
    return detailCode && !message.includes(detailCode)
      ? `OpenClaw connect failed: ${message} (${detailCode})`
      : `OpenClaw connect failed: ${message}`;
  }
}
