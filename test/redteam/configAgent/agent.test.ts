import { lookup } from 'node:dns/promises';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigurationAgent } from '../../../src/redteam/configAgent/agent';
import { fetchWithProxy } from '../../../src/util/fetch';

// Mock fetchWithProxy to avoid actual HTTP calls
vi.mock('../../../src/util/fetch', () => ({
  fetchWithProxy: vi.fn(),
}));
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

const mockedFetchWithProxy = vi.mocked(fetchWithProxy);
const mockedLookup = vi.mocked(lookup);

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
}

function textResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/plain', ...init?.headers },
    ...init,
  });
}

describe('ConfigurationAgent', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as any);
  });

  describe('URL Validation (SSRF Protection)', () => {
    it('should accept valid HTTPS URLs', () => {
      const agent = new ConfigurationAgent('https://api.example.com');
      const session = agent.getSession();
      expect(session.baseUrl).toBe('https://api.example.com');
    });

    it('should accept valid HTTP URLs', () => {
      const agent = new ConfigurationAgent('http://api.example.com');
      const session = agent.getSession();
      expect(session.baseUrl).toBe('http://api.example.com');
    });

    it('should add https:// if no protocol specified', () => {
      const agent = new ConfigurationAgent('api.example.com');
      const session = agent.getSession();
      expect(session.baseUrl).toBe('https://api.example.com');
    });

    it('should remove trailing slashes', () => {
      const agent = new ConfigurationAgent('https://api.example.com/v1/');
      const session = agent.getSession();
      expect(session.baseUrl).toBe('https://api.example.com/v1');
    });

    describe('SSRF Protection - Blocked URLs', () => {
      it('should block localhost', () => {
        expect(() => new ConfigurationAgent('http://localhost')).toThrow(
          'Access to localhost is not allowed',
        );
      });

      it('should block localhost with port', () => {
        expect(() => new ConfigurationAgent('http://localhost:8080')).toThrow(
          'Access to localhost is not allowed',
        );
      });

      it('should block 127.0.0.1', () => {
        // 127.0.0.1 is caught by the explicit localhost check
        expect(() => new ConfigurationAgent('http://127.0.0.1')).toThrow(
          'Access to localhost is not allowed',
        );
      });

      it('should block other loopback addresses', () => {
        // Other 127.x.x.x addresses are caught by the loopback range check
        expect(() => new ConfigurationAgent('http://127.0.0.2')).toThrow(
          'Access to loopback addresses is not allowed',
        );
      });

      it('should block 0.0.0.0', () => {
        expect(() => new ConfigurationAgent('http://0.0.0.0')).toThrow();
      });

      it('should block IPv6 localhost and private ranges', () => {
        expect(() => new ConfigurationAgent('http://[::1]')).toThrow(
          'Access to localhost is not allowed',
        );
        expect(() => new ConfigurationAgent('http://[fd00::1]')).toThrow(
          'Access to private IP addresses is not allowed',
        );
        expect(() => new ConfigurationAgent('http://[fe80::1]')).toThrow(
          'Access to link-local addresses is not allowed',
        );
      });

      it('should block .localhost subdomains', () => {
        expect(() => new ConfigurationAgent('http://api.localhost')).toThrow(
          'Access to localhost is not allowed',
        );
      });

      // Private IP ranges
      it('should block 10.x.x.x (private class A)', () => {
        expect(() => new ConfigurationAgent('http://10.0.0.1')).toThrow(
          'Access to private IP addresses is not allowed',
        );
        expect(() => new ConfigurationAgent('http://10.255.255.255')).toThrow(
          'Access to private IP addresses is not allowed',
        );
      });

      it('should block 172.16-31.x.x (private class B)', () => {
        expect(() => new ConfigurationAgent('http://172.16.0.1')).toThrow(
          'Access to private IP addresses is not allowed',
        );
        expect(() => new ConfigurationAgent('http://172.31.255.255')).toThrow(
          'Access to private IP addresses is not allowed',
        );
      });

      it('should allow 172.15.x.x (not private)', () => {
        // This should NOT throw - 172.15.x.x is not in the private range
        const agent = new ConfigurationAgent('http://172.15.0.1');
        expect(agent.getSession().baseUrl).toBe('http://172.15.0.1');
      });

      it('should block 192.168.x.x (private class C)', () => {
        expect(() => new ConfigurationAgent('http://192.168.0.1')).toThrow(
          'Access to private IP addresses is not allowed',
        );
        expect(() => new ConfigurationAgent('http://192.168.1.100')).toThrow(
          'Access to private IP addresses is not allowed',
        );
      });

      it('should block 169.254.x.x (link-local)', () => {
        expect(() => new ConfigurationAgent('http://169.254.0.1')).toThrow(
          'Access to link-local addresses is not allowed',
        );
      });

      // Cloud metadata endpoints
      it('should block AWS metadata endpoint', () => {
        expect(() => new ConfigurationAgent('http://169.254.169.254')).toThrow(
          'Access to link-local addresses is not allowed',
        );
      });

      it('should block common cloud metadata hostnames', () => {
        expect(() => new ConfigurationAgent('http://metadata.google.internal')).toThrow(
          'Access to cloud metadata endpoints is not allowed',
        );
        expect(() => new ConfigurationAgent('http://metadata')).toThrow(
          'Access to cloud metadata endpoints is not allowed',
        );
      });

      it('should block non-HTTP protocols', () => {
        expect(() => new ConfigurationAgent('ftp://api.example.com')).toThrow(
          'Only HTTP and HTTPS protocols are allowed',
        );
      });
    });

    it('should reject hostnames that resolve to private addresses', async () => {
      mockedLookup.mockResolvedValue([{ address: '10.0.0.1', family: 4 }] as any);

      const agent = new ConfigurationAgent('https://api.example.com');
      await agent.startDiscovery();

      expect(mockedFetchWithProxy).not.toHaveBeenCalled();
      expect(agent.getSession().phase).toBe('error');
      expect(agent.getMessages().some((message) => message.content.includes('private IP'))).toBe(
        true,
      );
    });

    it('should not follow redirects while probing', async () => {
      mockedFetchWithProxy.mockImplementation(() =>
        Promise.resolve(
          new Response('', {
            status: 302,
            headers: { Location: 'http://127.0.0.1/admin' },
          }),
        ),
      );

      const agent = new ConfigurationAgent('https://api.example.com');
      await agent.startDiscovery();

      expect(mockedFetchWithProxy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ dispatcher: expect.any(Object), redirect: 'manual' }),
      );
    });
  });

  describe('Session Management', () => {
    it('should create a session with unique ID', () => {
      const agent = new ConfigurationAgent('https://api.example.com');
      const session = agent.getSession();

      expect(session.id).toBeDefined();
      expect(session.id.length).toBeGreaterThan(0);
      expect(session.baseUrl).toBe('https://api.example.com');
      expect(session.phase).toBe('initializing');
      expect(session.messages).toEqual([]);
    });

    it('should return a copy of session to prevent mutation', () => {
      const agent = new ConfigurationAgent('https://api.example.com');
      const session1 = agent.getSession();
      const session2 = agent.getSession();

      expect(session1).not.toBe(session2);
      expect(session1).toEqual(session2);
    });

    it('should return a copy of messages to prevent mutation', () => {
      const agent = new ConfigurationAgent('https://api.example.com');
      const messages1 = agent.getMessages();
      const messages2 = agent.getMessages();

      expect(messages1).not.toBe(messages2);
      expect(messages1).toEqual(messages2);
    });
  });

  describe('Cancel', () => {
    it('should add a cancellation message', () => {
      const agent = new ConfigurationAgent('https://api.example.com');
      agent.cancel();

      const messages = agent.getMessages();
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('info');
      expect(messages[0].content).toBe('Discovery cancelled.');
    });
  });

  describe('Authentication', () => {
    it('keeps API key input out of messages and previous discovery metadata', async () => {
      mockedFetchWithProxy.mockImplementation(async (_url, options) => {
        const headers = options?.headers as Record<string, string> | undefined;
        if (options?.method === 'HEAD') {
          return new Response('', { status: 200 });
        }
        if (headers?.Authorization === 'Bearer sk-test-secret') {
          return jsonResponse({
            choices: [{ message: { content: 'hello' } }],
          });
        }
        return jsonResponse({ error: { message: 'API key required' } }, { status: 401 });
      });

      const agent = new ConfigurationAgent('https://api.example.com');
      await agent.startDiscovery();
      await agent.handleUserInput({
        sessionId: agent.getSession().id,
        type: 'api_key',
        value: 'sk-test-secret',
        field: 'apiKey',
      });

      expect(JSON.stringify(agent.getMessages())).not.toContain('sk-test-secret');
      expect(JSON.stringify(agent.getMessages())).toContain('••••••••cret');
      expect(Object.values(agent.getFinalConfig()?.headers ?? {})).toContain(
        'Bearer sk-test-secret',
      );
    });
  });

  describe('Discovery flow', () => {
    it('discovers and verifies an OpenAI-compatible endpoint', async () => {
      mockedFetchWithProxy.mockImplementation(async (url, options) => {
        if (options?.method === 'HEAD') {
          return new Response('', { status: 204 });
        }
        if (String(url).endsWith('/v1/models')) {
          return jsonResponse({ data: [{ id: 'gpt-test' }, { id: 'gpt-next' }] });
        }
        if (String(url).endsWith('/v1/chat/completions')) {
          return jsonResponse({ choices: [{ message: { content: 'hello' } }] });
        }
        return jsonResponse({ error: 'not found' }, { status: 404 });
      });

      const agent = new ConfigurationAgent('https://api.example.com');
      await agent.startDiscovery();

      expect(agent.isComplete()).toBe(true);
      expect(agent.getSession()).toMatchObject({
        phase: 'complete',
        verified: true,
        triedStrategies: ['openai_compatible'],
      });
      expect(agent.getFinalConfig()).toMatchObject({
        apiType: 'openai_compatible',
        path: '/v1/chat/completions',
        defaultModel: 'gpt-test',
      });
      expect(agent.getMessages().some((message) => message.content.includes('Found a match'))).toBe(
        true,
      );
    });

    it('falls back from HEAD to GET before probing and asks for manual help when nothing matches', async () => {
      mockedFetchWithProxy.mockImplementation(async (url, options) => {
        if (String(url) === 'https://api.example.com' && options?.method === 'HEAD') {
          throw new Error('HEAD not supported');
        }
        if (String(url) === 'https://api.example.com' && options?.method === 'GET') {
          return textResponse('ok');
        }
        return jsonResponse({ error: 'not found' }, { status: 404 });
      });

      const agent = new ConfigurationAgent('https://api.example.com');
      await agent.startDiscovery();

      expect(mockedFetchWithProxy).toHaveBeenCalledWith(
        'https://api.example.com',
        expect.objectContaining({ method: 'HEAD', redirect: 'manual' }),
      );
      expect(mockedFetchWithProxy).toHaveBeenCalledWith(
        'https://api.example.com',
        expect.objectContaining({ method: 'GET', redirect: 'manual' }),
      );
      expect(agent.getSession().phase).toBe('analyzing');
      expect(
        agent
          .getMessages()
          .at(-1)
          ?.metadata?.options?.map((option) => option.id),
      ).toEqual(['example', 'openai', 'anthropic', 'custom']);
    });

    it('handles auth-required discovery and verifies the provided bearer token', async () => {
      mockedFetchWithProxy.mockImplementation(async (url, options) => {
        const headers = options?.headers as Record<string, string> | undefined;
        if (options?.method === 'HEAD') {
          return new Response('', { status: 200 });
        }
        if (headers?.Authorization === 'Bearer sk-live-secret') {
          return jsonResponse({ choices: [{ message: { content: 'hello' } }] });
        }
        if (String(url).endsWith('/v1/chat/completions')) {
          return jsonResponse(
            { error: { message: 'Bearer token required' } },
            { status: 401, headers: { 'www-authenticate': 'Bearer realm="api"' } },
          );
        }
        return jsonResponse({ error: 'not found' }, { status: 404 });
      });

      const agent = new ConfigurationAgent('https://api.example.com');
      await agent.startDiscovery();

      expect(agent.getSession().phase).toBe('analyzing');
      expect(agent.getMessages().at(-1)?.metadata?.inputRequest).toMatchObject({
        type: 'api_key',
        sensitive: true,
      });

      await agent.handleUserInput({
        sessionId: agent.getSession().id,
        type: 'api_key',
        value: 'sk-live-secret',
        field: 'apiKey',
      });

      expect(agent.isComplete()).toBe(true);
      expect(agent.getFinalConfig()).toMatchObject({
        headers: { Authorization: 'Bearer sk-live-secret' },
        auth: { type: 'bearer', location: 'header', headerName: 'Authorization' },
      });
      expect(JSON.stringify(agent.getMessages())).not.toContain('sk-live-secret');
      expect(JSON.stringify(agent.getMessages())).toContain('••••••••cret');
    });

    it('reports connectivity errors without probing', async () => {
      mockedFetchWithProxy.mockRejectedValue(new Error('network down'));

      const agent = new ConfigurationAgent('https://api.example.com');
      await agent.startDiscovery();

      expect(agent.getSession().phase).toBe('error');
      expect(agent.getMessages().some((message) => message.content.includes('network down'))).toBe(
        true,
      );
      expect(mockedFetchWithProxy).toHaveBeenCalledTimes(2);
    });
  });

  describe('User interaction flows', () => {
    it('supports manual OpenAI selection and no-auth verification', async () => {
      mockedFetchWithProxy.mockResolvedValue(
        jsonResponse({ choices: [{ message: { content: 'hello' } }] }),
      );

      const agent = new ConfigurationAgent('https://api.example.com');
      await agent.handleUserInput({
        sessionId: agent.getSession().id,
        type: 'option',
        value: 'openai',
      });
      await agent.handleUserInput({
        sessionId: agent.getSession().id,
        type: 'option',
        value: 'no_auth',
      });

      expect(agent.isComplete()).toBe(true);
      expect(agent.getFinalConfig()?.apiType).toBe('openai_compatible');
    });

    it('supports manual Anthropic selection and skip-after-failed-verification', async () => {
      mockedFetchWithProxy.mockResolvedValue(
        jsonResponse({ error: 'bad request' }, { status: 400 }),
      );

      const agent = new ConfigurationAgent('https://api.example.com');
      await agent.handleUserInput({
        sessionId: agent.getSession().id,
        type: 'option',
        value: 'anthropic',
      });
      await agent.handleUserInput({
        sessionId: agent.getSession().id,
        type: 'option',
        value: 'no_auth',
      });
      await agent.handleUserInput({
        sessionId: agent.getSession().id,
        type: 'option',
        value: 'skip',
      });

      expect(agent.getSession()).toMatchObject({
        phase: 'complete',
        verified: false,
      });
      expect(agent.getFinalConfig()?.apiType).toBe('anthropic_compatible');
      expect(agent.isComplete()).toBe(false);
    });

    it('handles custom, edit, no-key, and unknown options', async () => {
      const agent = new ConfigurationAgent('https://api.example.com');

      await agent.handleUserInput({
        sessionId: agent.getSession().id,
        type: 'option',
        value: 'custom',
      });
      expect(agent.getMessages().at(-1)?.metadata?.inputRequest).toMatchObject({
        type: 'text',
        field: 'customFormat',
      });

      await agent.handleUserInput({
        sessionId: agent.getSession().id,
        type: 'option',
        value: 'edit',
      });
      expect(agent.getMessages().at(-1)?.metadata?.inputRequest).toMatchObject({
        type: 'text',
        field: 'editRequest',
      });

      await agent.handleUserInput({
        sessionId: agent.getSession().id,
        type: 'option',
        value: 'no_key',
      });
      await agent.handleUserInput({
        sessionId: agent.getSession().id,
        type: 'option',
        value: 'unknown_option',
      });

      const contents = agent.getMessages().map((message) => message.content);
      expect(contents).toContain(
        "You'll need an API key to use this endpoint. Check the service's documentation for how to obtain one.",
      );
      expect(contents).toContain("I'll help you with that. What would you like to do next?");
    });

    it('handles freeform auth, help, retry, and generic hints', async () => {
      mockedFetchWithProxy.mockImplementation(async (url, options) => {
        if (String(url) === 'https://api.example.com' && options?.method === 'HEAD') {
          return new Response('', { status: 200 });
        }
        return jsonResponse({ error: 'not found' }, { status: 404 });
      });

      const agent = new ConfigurationAgent('https://api.example.com');

      await agent.handleUserInput({
        sessionId: agent.getSession().id,
        type: 'message',
        value: 'auth please',
      });
      expect(agent.getMessages().at(-1)?.metadata?.inputRequest?.type).toBe('api_key');

      await agent.handleUserInput({
        sessionId: agent.getSession().id,
        type: 'message',
        value: 'help',
      });
      expect(agent.getMessages().at(-1)?.content).toContain('I can help you configure');

      await agent.handleUserInput({
        sessionId: agent.getSession().id,
        type: 'message',
        value: 'try again',
      });
      expect(agent.getSession().triedStrategies).toContain('generic_json');

      await agent.handleUserInput({
        sessionId: agent.getSession().id,
        type: 'message',
        value: 'it returns XML sometimes',
      });
      expect(agent.getSession().userInputs.userHint).toBe('it returns XML sometimes');
      expect(
        agent
          .getMessages()
          .at(-1)
          ?.metadata?.options?.map((option) => option.id),
      ).toEqual(['retry', 'manual']);
    });

    it('handles invalid API keys, confirmation, apply, and skip without a match', async () => {
      mockedFetchWithProxy.mockResolvedValue(
        jsonResponse({ error: 'unauthorized' }, { status: 401 }),
      );

      const agent = new ConfigurationAgent('https://api.example.com');

      await agent.handleUserInput({
        sessionId: agent.getSession().id,
        type: 'api_key',
        value: '',
        field: 'apiKey',
      });
      expect(agent.getMessages().at(-1)?.content).toBe('Please provide a valid API key.');

      await agent.handleUserInput({
        sessionId: agent.getSession().id,
        type: 'option',
        value: 'openai',
      });
      await agent.handleUserInput({
        sessionId: agent.getSession().id,
        type: 'api_key',
        value: 'bad-key',
        field: 'apiKey',
      });
      expect(
        agent.getMessages().some((message) => message.content.includes('Authentication failed')),
      ).toBe(true);

      await agent.handleUserInput({
        sessionId: agent.getSession().id,
        type: 'option',
        value: 'apply',
      });
      expect(
        agent.getMessages().some((message) => message.content === 'No configuration to apply.'),
      ).toBe(true);

      const emptyAgent = new ConfigurationAgent('https://api.example.com');
      await emptyAgent.handleUserInput({
        sessionId: emptyAgent.getSession().id,
        type: 'option',
        value: 'skip',
      });
      expect(emptyAgent.getMessages().at(-1)?.content).toBe('No configuration to skip to.');

      await emptyAgent.handleUserInput({
        sessionId: emptyAgent.getSession().id,
        type: 'confirmation',
        value: true,
      });
      expect(emptyAgent.getFinalConfig()).toBeNull();
    });
  });
});
