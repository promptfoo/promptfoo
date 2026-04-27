import { randomUUID } from 'node:crypto';

import { z } from 'zod';
import { getEnvString } from '../envars';
import logger from '../logger';
import { fetchWithProxy } from '../util/fetch';

import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderOptions,
  ProviderResponse,
} from '../types/index';

export const COPILOT_STUDIO_DIRECTLINE_PROVIDER_ID = 'copilot-studio-directline';

function parseJsonConfigField(value: unknown): unknown {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function emptyStringToUndefined(value: unknown): unknown {
  if (typeof value === 'string' && value.trim().length === 0) {
    return undefined;
  }

  return value;
}

const CopilotStudioDirectLineConfigSchema = z.object({
  baseUrl: z.string().url().default('https://directline.botframework.com'),
  directLineSecret: z.preprocess(emptyStringToUndefined, z.string().min(1).optional()),
  userId: z.string().min(1).optional(),
  userName: z.string().min(1).optional(),
  locale: z.string().min(1).default('en-US'),
  pollTimeoutMs: z.number().int().positive().default(30000),
  pollIntervalMs: z.number().int().positive().default(750),
  replyIdleTimeoutMs: z.number().int().nonnegative().default(1000),
  trustedOrigins: z.preprocess(parseJsonConfigField, z.array(z.string().min(1)).optional()),
  channelData: z.preprocess(parseJsonConfigField, z.record(z.string(), z.unknown()).optional()),
});

type CopilotStudioDirectLineConfig = z.infer<typeof CopilotStudioDirectLineConfigSchema>;

interface DirectLineTokenResponse {
  conversationId?: string;
  token: string;
  expires_in: number;
}

interface DirectLineConversationResponse extends DirectLineTokenResponse {
  conversationId: string;
  streamUrl?: string;
}

interface DirectLineActivity {
  id?: string;
  type?: string;
  text?: string;
  from?: {
    id?: string;
    name?: string;
  };
}

interface DirectLineActivitySet {
  activities?: DirectLineActivity[];
  watermark?: string;
}

interface DirectLineSession {
  conversationId: string;
  token: string;
  expiresAt: number;
  userId: string;
  userName?: string;
  watermark?: string;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function getEnvValue(env: EnvOverrides | undefined, name: string): string | undefined {
  return env?.[name] ?? getEnvString(name);
}

function getDirectLineSecret(config: CopilotStudioDirectLineConfig, env?: EnvOverrides): string {
  const secret =
    config.directLineSecret ??
    getEnvValue(env, 'COPILOT_STUDIO_DIRECT_LINE_SECRET') ??
    getEnvValue(env, 'COPILOT_DIRECT_LINE_SECRET');

  if (!secret) {
    throw new Error(
      'Microsoft Copilot Studio Direct Line provider requires config.directLineSecret or COPILOT_STUDIO_DIRECT_LINE_SECRET.',
    );
  }

  return secret;
}

function buildUserId(configuredUserId: string | undefined): string {
  if (!configuredUserId) {
    return `dl_${randomUUID()}`;
  }

  if (!configuredUserId.startsWith('dl_')) {
    throw new Error('Direct Line token user IDs must start with "dl_".');
  }

  return configuredUserId;
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class CopilotStudioDirectLineProvider implements ApiProvider {
  label = 'Microsoft Copilot Studio Direct Line';

  readonly config: CopilotStudioDirectLineConfig;
  private readonly directLineSecret: string;
  private readonly sessions = new Map<string, DirectLineSession>();
  private lastSessionKey?: string;

  constructor(
    options: { config?: ProviderOptions['config']; id?: string; env?: EnvOverrides } = {},
  ) {
    this.config = CopilotStudioDirectLineConfigSchema.parse(options.config ?? {});
    this.directLineSecret = getDirectLineSecret(this.config, options.env);
  }

  id(): string {
    return COPILOT_STUDIO_DIRECTLINE_PROVIDER_ID;
  }

  getSessionId(): string {
    return this.lastSessionKey ?? '';
  }

  cleanup(): void {
    this.sessions.clear();
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    options?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const startedAt = Date.now();
    const sessionKey = this.getSessionKey(context);
    this.lastSessionKey = sessionKey;

    try {
      const session = await this.getSession(sessionKey, options?.abortSignal);
      await this.sendActivity(session, prompt, options?.abortSignal);
      const reply = await this.pollForReply(session, options?.abortSignal);

      return {
        output: reply.output,
        raw: reply.raw,
        sessionId: sessionKey,
        latencyMs: Date.now() - startedAt,
        conversationEnded: reply.conversationEnded,
        conversationEndReason: reply.conversationEndReason,
        metadata: {
          directLine: {
            conversationId: session.conversationId,
            watermark: session.watermark,
            userId: session.userId,
          },
        },
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.warn(
        `[CopilotStudioDirectLineProvider] call failed for session ${sessionKey}: ${errorMessage}`,
      );

      return {
        error: errorMessage,
        output: undefined,
        sessionId: sessionKey,
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  private getSessionKey(context?: CallApiContextParams): string {
    const varsSessionId = context?.vars?.sessionId;
    if (typeof varsSessionId === 'string' && varsSessionId.trim()) {
      return varsSessionId;
    }

    const conversationId = context?.test?.metadata?.conversationId;
    if (typeof conversationId === 'string' && conversationId.trim()) {
      return conversationId;
    }

    return randomUUID();
  }

  private async getSession(
    sessionKey: string,
    abortSignal?: AbortSignal,
  ): Promise<DirectLineSession> {
    const existing = this.sessions.get(sessionKey);
    if (existing) {
      await this.refreshTokenIfNeeded(existing, abortSignal);
      return existing;
    }

    const session = await this.startSession(abortSignal);
    this.sessions.set(sessionKey, session);
    return session;
  }

  private async startSession(abortSignal?: AbortSignal): Promise<DirectLineSession> {
    const userId = buildUserId(this.config.userId);
    const tokenResponse = await this.generateToken(userId, abortSignal);
    const conversation = await this.startConversation(tokenResponse.token, abortSignal);

    const session: DirectLineSession = {
      conversationId: conversation.conversationId,
      token: conversation.token || tokenResponse.token,
      expiresAt: this.getExpiresAt(conversation.expires_in || tokenResponse.expires_in),
      userId,
      userName: this.config.userName,
    };

    await this.flushInitialActivities(session, abortSignal);
    return session;
  }

  private async generateToken(
    userId: string,
    abortSignal?: AbortSignal,
  ): Promise<DirectLineTokenResponse> {
    const body = {
      user: {
        id: userId,
        ...(this.config.userName ? { name: this.config.userName } : {}),
      },
      ...(this.config.trustedOrigins ? { trustedOrigins: this.config.trustedOrigins } : {}),
    };

    return this.fetchJson<DirectLineTokenResponse>('/v3/directline/tokens/generate', {
      method: 'POST',
      token: this.directLineSecret,
      body,
      abortSignal,
    });
  }

  private async startConversation(
    token: string,
    abortSignal?: AbortSignal,
  ): Promise<DirectLineConversationResponse> {
    return this.fetchJson<DirectLineConversationResponse>('/v3/directline/conversations', {
      method: 'POST',
      token,
      abortSignal,
    });
  }

  private async refreshTokenIfNeeded(
    session: DirectLineSession,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    const refreshAt = session.expiresAt - 60_000;
    if (Date.now() < refreshAt) {
      return;
    }

    const response = await this.fetchJson<DirectLineTokenResponse>(
      '/v3/directline/tokens/refresh',
      {
        method: 'POST',
        token: session.token,
        abortSignal,
      },
    );

    session.token = response.token;
    session.expiresAt = this.getExpiresAt(response.expires_in);
  }

  private getExpiresAt(expiresInSeconds: number): number {
    return Date.now() + expiresInSeconds * 1000;
  }

  private async flushInitialActivities(
    session: DirectLineSession,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    const activitySet = await this.getActivities(session, abortSignal);
    session.watermark = activitySet.watermark ?? session.watermark;
  }

  private async sendActivity(
    session: DirectLineSession,
    prompt: string,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    await this.fetchJson<{ id: string }>(
      `/v3/directline/conversations/${encodeURIComponent(session.conversationId)}/activities`,
      {
        method: 'POST',
        token: session.token,
        body: {
          type: 'message',
          locale: this.config.locale,
          from: {
            id: session.userId,
            ...(session.userName ? { name: session.userName } : {}),
          },
          text: prompt,
          ...(this.config.channelData ? { channelData: this.config.channelData } : {}),
        },
        abortSignal,
      },
    );
  }

  private async pollForReply(
    session: DirectLineSession,
    abortSignal?: AbortSignal,
  ): Promise<{
    output?: string;
    raw?: DirectLineActivity[];
    conversationEnded?: boolean;
    conversationEndReason?: string;
  }> {
    const deadline = Date.now() + this.config.pollTimeoutMs;
    const botMessages: DirectLineActivity[] = [];
    const rawActivities: DirectLineActivity[] = [];
    let lastBotMessageAt: number | undefined;

    while (Date.now() < deadline) {
      if (abortSignal?.aborted) {
        throw new Error('Direct Line request was aborted');
      }

      const activitySet = await this.getActivities(session, abortSignal);
      session.watermark = activitySet.watermark ?? session.watermark;

      const activities = activitySet.activities ?? [];
      rawActivities.push(...activities);
      const endActivity = activities.find((activity) => activity.type === 'endOfConversation');
      const newBotMessages = activities.filter(
        (activity) =>
          activity.type === 'message' &&
          activity.from?.id !== session.userId &&
          typeof activity.text === 'string' &&
          activity.text.trim().length > 0,
      );

      if (newBotMessages.length > 0) {
        botMessages.push(...newBotMessages);
        lastBotMessageAt = Date.now();
      }

      if (endActivity) {
        return {
          output: botMessages.map((activity) => activity.text).join('\n'),
          raw: rawActivities,
          conversationEnded: true,
          conversationEndReason: 'endOfConversation',
        };
      }

      if (
        botMessages.length > 0 &&
        lastBotMessageAt !== undefined &&
        Date.now() - lastBotMessageAt >= this.config.replyIdleTimeoutMs
      ) {
        return {
          output: botMessages.map((activity) => activity.text).join('\n'),
          raw: rawActivities,
        };
      }

      const timeUntilDeadline = deadline - Date.now();
      const timeUntilReplyIdle =
        lastBotMessageAt === undefined
          ? this.config.pollIntervalMs
          : this.config.replyIdleTimeoutMs - (Date.now() - lastBotMessageAt);
      const delayMs = Math.max(
        1,
        Math.min(this.config.pollIntervalMs, timeUntilDeadline, Math.max(0, timeUntilReplyIdle)),
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error(
      `Timed out waiting for Copilot Studio Direct Line response after ${this.config.pollTimeoutMs}ms.`,
    );
  }

  private async getActivities(
    session: DirectLineSession,
    abortSignal?: AbortSignal,
  ): Promise<DirectLineActivitySet> {
    const watermarkQuery = session.watermark
      ? `?watermark=${encodeURIComponent(session.watermark)}`
      : '';

    return this.fetchJson<DirectLineActivitySet>(
      `/v3/directline/conversations/${encodeURIComponent(session.conversationId)}/activities${watermarkQuery}`,
      {
        method: 'GET',
        token: session.token,
        abortSignal,
      },
    );
  }

  private async fetchJson<T>(
    path: string,
    {
      method,
      token,
      body,
      abortSignal,
    }: {
      method: 'GET' | 'POST';
      token: string;
      body?: Record<string, unknown>;
      abortSignal?: AbortSignal;
    },
  ): Promise<T> {
    const response = await fetchWithProxy(
      `${normalizeBaseUrl(this.config.baseUrl)}${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
      abortSignal,
    );

    const responseBody = await readResponseBody(response);
    if (!response.ok) {
      throw new Error(
        `Direct Line ${method} ${path} failed with ${response.status}: ${JSON.stringify(responseBody)}`,
      );
    }

    return responseBody as T;
  }
}
