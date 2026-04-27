const { randomUUID } = require('node:crypto');

// Configurable Direct Line settings.
const DIRECT_LINE_SECRET =
  process.env.COPILOT_STUDIO_DIRECT_LINE_SECRET || process.env.COPILOT_DIRECT_LINE_SECRET;
const DIRECT_LINE_BASE_URL =
  process.env.COPILOT_STUDIO_DIRECT_LINE_BASE_URL || 'https://directline.botframework.com';
const USER_ID = process.env.COPILOT_STUDIO_DIRECT_LINE_USER_ID || 'dl_promptfoo_custom_provider';
const USER_NAME = process.env.COPILOT_STUDIO_DIRECT_LINE_USER_NAME || 'Promptfoo';
const LOCALE = process.env.COPILOT_STUDIO_DIRECT_LINE_LOCALE || 'en-US';
const POLL_TIMEOUT_MS = Number.parseInt(
  process.env.COPILOT_STUDIO_DIRECT_LINE_POLL_TIMEOUT_MS || '30000',
  10,
);
const POLL_INTERVAL_MS = Number.parseInt(
  process.env.COPILOT_STUDIO_DIRECT_LINE_POLL_INTERVAL_MS || '750',
  10,
);
const REPLY_IDLE_TIMEOUT_MS = Number.parseInt(
  process.env.COPILOT_STUDIO_DIRECT_LINE_REPLY_IDLE_TIMEOUT_MS || '1000',
  10,
);
const TRUSTED_ORIGINS = parseJsonEnv('COPILOT_STUDIO_DIRECT_LINE_TRUSTED_ORIGINS');
const CHANNEL_DATA = parseJsonEnv('COPILOT_STUDIO_DIRECT_LINE_CHANNEL_DATA') || {
  source: 'promptfoo-custom-provider',
};

function parseJsonEnv(name) {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }
  return JSON.parse(value);
}

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, '');
}

async function readResponseBody(response) {
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

class CopilotStudioDirectLineCustomProvider {
  constructor(options) {
    this.providerId = options.id || 'copilot-studio-directline-custom-provider';
    this.sessions = new Map();
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context) {
    if (!DIRECT_LINE_SECRET) {
      return {
        error:
          'Missing Direct Line secret. Set COPILOT_STUDIO_DIRECT_LINE_SECRET or COPILOT_DIRECT_LINE_SECRET.',
      };
    }

    if (!USER_ID.startsWith('dl_')) {
      return {
        error: 'Direct Line user IDs used for generated tokens must start with "dl_".',
      };
    }

    const startedAt = Date.now();
    const sessionKey = this.getSessionKey(context);

    try {
      const session = await this.getSession(sessionKey);
      await this.sendActivity(session, prompt);
      const reply = await this.pollForReply(session);

      return {
        output: reply.output,
        raw: reply.raw,
        sessionId: sessionKey,
        latencyMs: Date.now() - startedAt,
        metadata: {
          directLine: {
            conversationId: session.conversationId,
            watermark: session.watermark,
            userId: session.userId,
          },
        },
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        sessionId: sessionKey,
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  getSessionKey(context) {
    const sessionId = context?.vars?.sessionId;
    if (typeof sessionId === 'string' && sessionId.trim()) {
      return sessionId;
    }
    return randomUUID();
  }

  async getSession(sessionKey) {
    const existing = this.sessions.get(sessionKey);
    if (existing) {
      await this.refreshTokenIfNeeded(existing);
      return existing;
    }

    const tokenResponse = await this.generateToken();
    const conversation = await this.startConversation(tokenResponse.token);
    const session = {
      conversationId: conversation.conversationId,
      token: conversation.token || tokenResponse.token,
      expiresAt: this.getExpiresAt(conversation.expires_in || tokenResponse.expires_in),
      userId: USER_ID,
      userName: USER_NAME,
    };

    await this.flushInitialActivities(session);
    this.sessions.set(sessionKey, session);
    return session;
  }

  async generateToken() {
    return this.fetchJson('/v3/directline/tokens/generate', {
      method: 'POST',
      token: DIRECT_LINE_SECRET,
      body: {
        user: {
          id: USER_ID,
          name: USER_NAME,
        },
        ...(TRUSTED_ORIGINS ? { trustedOrigins: TRUSTED_ORIGINS } : {}),
      },
    });
  }

  async startConversation(token) {
    return this.fetchJson('/v3/directline/conversations', {
      method: 'POST',
      token,
    });
  }

  async refreshTokenIfNeeded(session) {
    const refreshAt = session.expiresAt - 60_000;
    if (Date.now() < refreshAt) {
      return;
    }

    const response = await this.fetchJson('/v3/directline/tokens/refresh', {
      method: 'POST',
      token: session.token,
    });

    session.token = response.token;
    session.expiresAt = this.getExpiresAt(response.expires_in);
  }

  getExpiresAt(expiresInSeconds) {
    return Date.now() + expiresInSeconds * 1000;
  }

  async flushInitialActivities(session) {
    const activitySet = await this.getActivities(session);
    session.watermark = activitySet.watermark || session.watermark;
  }

  async sendActivity(session, prompt) {
    await this.fetchJson(
      `/v3/directline/conversations/${encodeURIComponent(session.conversationId)}/activities`,
      {
        method: 'POST',
        token: session.token,
        body: {
          type: 'message',
          locale: LOCALE,
          from: {
            id: session.userId,
            name: session.userName,
          },
          text: prompt,
          channelData: CHANNEL_DATA,
        },
      },
    );
  }

  async pollForReply(session) {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    const botMessages = [];
    const rawActivities = [];
    let lastBotMessageAt;

    while (Date.now() < deadline) {
      const activitySet = await this.getActivities(session);
      session.watermark = activitySet.watermark || session.watermark;

      const activities = activitySet.activities || [];
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
        };
      }

      if (
        botMessages.length > 0 &&
        lastBotMessageAt !== undefined &&
        Date.now() - lastBotMessageAt >= REPLY_IDLE_TIMEOUT_MS
      ) {
        return {
          output: botMessages.map((activity) => activity.text).join('\n'),
          raw: rawActivities,
        };
      }

      const timeUntilDeadline = deadline - Date.now();
      const timeUntilReplyIdle =
        lastBotMessageAt === undefined
          ? POLL_INTERVAL_MS
          : REPLY_IDLE_TIMEOUT_MS - (Date.now() - lastBotMessageAt);
      const delayMs = Math.max(
        1,
        Math.min(POLL_INTERVAL_MS, timeUntilDeadline, Math.max(0, timeUntilReplyIdle)),
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error(`Timed out waiting for Direct Line response after ${POLL_TIMEOUT_MS}ms.`);
  }

  async getActivities(session) {
    const watermarkQuery = session.watermark
      ? `?watermark=${encodeURIComponent(session.watermark)}`
      : '';

    return this.fetchJson(
      `/v3/directline/conversations/${encodeURIComponent(session.conversationId)}/activities${watermarkQuery}`,
      {
        method: 'GET',
        token: session.token,
      },
    );
  }

  async fetchJson(path, { method, token, body }) {
    const response = await fetch(`${normalizeBaseUrl(DIRECT_LINE_BASE_URL)}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const responseBody = await readResponseBody(response);
    if (!response.ok) {
      throw new Error(
        `Direct Line ${method} ${path} failed with ${response.status}: ${JSON.stringify(responseBody)}`,
      );
    }

    return responseBody;
  }
}

module.exports = CopilotStudioDirectLineCustomProvider;
