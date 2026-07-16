import { beforeEach, expect, it, vi } from 'vitest';
import { targetConfigSha256 } from './targetConfigSha256';

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
