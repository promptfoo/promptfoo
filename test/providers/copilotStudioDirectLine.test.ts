import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadApiProvider } from '../../src/providers';
import {
  COPILOT_STUDIO_DIRECTLINE_PROVIDER_ID,
  CopilotStudioDirectLineProvider,
} from '../../src/providers/copilotStudioDirectLine';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('CopilotStudioDirectLineProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('starts a Direct Line conversation, sends an activity, and polls for the reply', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'generated-token', expires_in: 1800 }))
      .mockResolvedValueOnce(
        jsonResponse({
          conversationId: 'conversation-1',
          token: 'conversation-token',
          expires_in: 1800,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ activities: [], watermark: '0' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'activity-1' }))
      .mockResolvedValueOnce(
        jsonResponse({
          activities: [
            {
              type: 'message',
              from: { id: 'copilot' },
              text: 'Hello from Copilot Studio',
            },
          ],
          watermark: '1',
        }),
      );

    vi.stubGlobal('fetch', fetchMock);

    const provider = new CopilotStudioDirectLineProvider({
      config: {
        directLineSecret: 'direct-line-secret',
        pollTimeoutMs: 1000,
        pollIntervalMs: 1,
        replyIdleTimeoutMs: 0,
        userId: 'dl_test_user',
      },
    });

    const response = await provider.callApi('Hello', {
      prompt: {
        raw: 'Hello',
        label: 'Hello',
      },
      vars: { sessionId: 'session-1' },
    });

    expect(response).toMatchObject({
      output: 'Hello from Copilot Studio',
      sessionId: 'session-1',
      metadata: {
        directLine: {
          conversationId: 'conversation-1',
          watermark: '1',
          userId: 'dl_test_user',
        },
      },
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://directline.botframework.com/v3/directline/tokens/generate',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer direct-line-secret' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://directline.botframework.com/v3/directline/conversations/conversation-1/activities',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer conversation-token' }),
        body: expect.stringContaining('"text":"Hello"'),
      }),
    );
  });

  it('registers with promptfoo provider loading', async () => {
    const provider = await loadApiProvider(COPILOT_STUDIO_DIRECTLINE_PROVIDER_ID, {
      options: {
        id: COPILOT_STUDIO_DIRECTLINE_PROVIDER_ID,
        config: {
          directLineSecret: 'direct-line-secret',
        },
      },
    });

    expect(provider.id()).toBe(COPILOT_STUDIO_DIRECTLINE_PROVIDER_ID);
  });

  it('falls back to the Copilot Studio Direct Line env var when the config field is blank', async () => {
    vi.stubEnv('COPILOT_STUDIO_DIRECT_LINE_SECRET', 'env-direct-line-secret');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'generated-token', expires_in: 1800 }))
      .mockResolvedValueOnce(
        jsonResponse({
          conversationId: 'conversation-1',
          token: 'conversation-token',
          expires_in: 1800,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ activities: [], watermark: '0' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'activity-1' }))
      .mockResolvedValueOnce(
        jsonResponse({
          activities: [
            {
              type: 'message',
              from: { id: 'copilot' },
              text: 'Hello from env secret',
            },
          ],
          watermark: '1',
        }),
      );

    vi.stubGlobal('fetch', fetchMock);

    const provider = new CopilotStudioDirectLineProvider({
      config: {
        directLineSecret: '',
        pollTimeoutMs: 1000,
        pollIntervalMs: 1,
        replyIdleTimeoutMs: 0,
        userId: 'dl_test_user',
      },
    });

    const response = await provider.callApi('Hello', {
      prompt: {
        raw: 'Hello',
        label: 'Hello',
      },
      vars: { sessionId: 'session-1' },
    });

    expect(response.output).toBe('Hello from env secret');
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://directline.botframework.com/v3/directline/tokens/generate',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer env-direct-line-secret' }),
      }),
    );
  });

  it('collects bot messages across polls until the reply is idle', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ token: 'generated-token', expires_in: 1800 }))
      .mockResolvedValueOnce(
        jsonResponse({
          conversationId: 'conversation-1',
          token: 'conversation-token',
          expires_in: 1800,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ activities: [], watermark: '0' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'activity-1' }))
      .mockResolvedValueOnce(
        jsonResponse({
          activities: [
            {
              type: 'message',
              from: { id: 'copilot' },
              text: 'First reply',
            },
          ],
          watermark: '1',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          activities: [
            {
              type: 'message',
              from: { id: 'copilot' },
              text: 'Second reply',
            },
          ],
          watermark: '2',
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ activities: [], watermark: '3' }));

    vi.stubGlobal('fetch', fetchMock);

    const provider = new CopilotStudioDirectLineProvider({
      config: {
        directLineSecret: 'direct-line-secret',
        pollTimeoutMs: 1000,
        pollIntervalMs: 1,
        replyIdleTimeoutMs: 1,
        userId: 'dl_test_user',
      },
    });

    const response = await provider.callApi('Hello', {
      prompt: {
        raw: 'Hello',
        label: 'Hello',
      },
      vars: { sessionId: 'session-1' },
    });

    expect(response).toMatchObject({
      output: 'First reply\nSecond reply',
      metadata: {
        directLine: {
          watermark: '3',
        },
      },
    });
    expect(response.raw).toHaveLength(2);
  });
});
