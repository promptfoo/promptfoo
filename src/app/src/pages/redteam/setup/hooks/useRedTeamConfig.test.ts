import { mockBrowserProperty, restoreBrowserMocks } from '@app/tests/browserMocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRedTeamConfig } from './useRedTeamConfig';
import { useRedTeamTargetConfigValidation } from './useRedTeamTargetConfigValidation';

import type { Config } from '../types';

const createStorageEvent = (key: string | null, newValue: string | null): StorageEvent => {
  const event = new Event('storage');
  Object.defineProperties(event, {
    key: { value: key },
    newValue: { value: newValue },
  });
  return event as StorageEvent;
};

const dispatchStorageEvent = (key: string | null, newValue: string | null) =>
  window.dispatchEvent(createStorageEvent(key, newValue));

describe('useRedTeamConfig', () => {
  beforeEach(() => {
    useRedTeamConfig.setState(useRedTeamConfig.getInitialState());
    useRedTeamTargetConfigValidation.setState(useRedTeamTargetConfigValidation.getInitialState());
    useRedTeamTargetConfigValidation.getState().clearTargetConfigValidation();
  });

  it('tracks a target configuration error and clears it when loading a full configuration', () => {
    const config = useRedTeamConfig.getState().config;

    useRedTeamTargetConfigValidation.getState().setTargetConfigError('Invalid JSON configuration');
    useRedTeamTargetConfigValidation
      .getState()
      .setTargetConfigDraft('{"sandbox_mode":"read-only",}');
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Invalid JSON configuration',
    );
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe(
      '{"sandbox_mode":"read-only",}',
    );

    useRedTeamConfig.getState().setFullConfig(config);
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBeNull();
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toMatch(
      /^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/,
    );
    expect(window.sessionStorage.getItem('redTeamTargetConfigValidation')).toBeNull();
  });

  it('normalizes an imported target with no configuration to an empty object', () => {
    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: {
        id: 'openai:gpt-5',
        label: 'customer-service-agent',
      } as Config['target'],
    });

    expect(useRedTeamConfig.getState().config.target.config).toEqual({});
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBeNull();
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toMatch(
      /^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/,
    );
    expect(
      JSON.parse(window.localStorage.getItem('redTeamConfig')!).state.config.target.config,
    ).toEqual({});
  });

  it.each([
    ['array', [], '[]'],
    ['null', null, 'null'],
    ['scalar', 'invalid-config', '"invalid-config"'],
    ['YAML timestamp', new Date('2024-01-01T00:00:00.000Z'), '"2024-01-01T00:00:00.000Z"'],
  ])('keeps an imported %s target configuration blocked', (_case, invalidConfig, draft) => {
    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: {
        id: 'openinterpreter',
        label: 'Imported coding target',
        config: invalidConfig as unknown as Config['target']['config'],
      },
    });

    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Configuration must be a JSON object',
    );
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe(draft);
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toMatch(
      /^non-object-json:[a-z0-9-]+$/,
    );
  });

  it.each([
    ['missing', undefined, {}, null, null],
    ['array', [], [], 'Configuration must be a JSON object', '[]'],
    ['null', null, null, 'Configuration must be a JSON object', 'null'],
    [
      'scalar',
      'invalid-config',
      'invalid-config',
      'Configuration must be a JSON object',
      '"invalid-config"',
    ],
  ])('normalizes or blocks a pre-upgrade %s target configuration after rehydration', async (_case, persistedConfig, expectedConfig, expectedError, expectedDraft) => {
    window.localStorage.setItem(
      'redTeamConfig',
      JSON.stringify({
        state: {
          config: {
            ...useRedTeamConfig.getState().config,
            target: {
              id: 'openinterpreter',
              label: 'Coding target',
              ...(persistedConfig === undefined ? {} : { config: persistedConfig }),
            },
          },
          providerType: 'openinterpreter',
        },
        version: 0,
      }),
    );
    window.localStorage.removeItem('redTeamTargetConfigValidation');
    window.sessionStorage.removeItem('redTeamTargetConfigValidation');

    vi.resetModules();
    const { useRedTeamConfig: rehydratedConfig } = await import('./useRedTeamConfig');
    const { useRedTeamTargetConfigValidation: rehydratedValidation } = await import(
      './useRedTeamTargetConfigValidation'
    );

    expect(rehydratedConfig.getState().config.target.config).toEqual(expectedConfig);
    expect(rehydratedValidation.getState().targetConfigError).toBe(expectedError);
    expect(rehydratedValidation.getState().targetConfigDraft).toBe(expectedDraft);
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toEqual(
      expectedError
        ? expect.stringMatching(/^non-object-json:[a-z0-9-]+$/)
        : expect.stringMatching(/^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/),
    );
  });

  it('does not let a delayed storage clear erase a newer malformed draft', () => {
    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: {
        id: 'openinterpreter',
        label: 'Coding target',
        config: { sandbox_mode: 'danger-full-access' },
      },
    });
    const oldClear = window.localStorage.getItem('redTeamTargetConfigValidation');
    expect(oldClear).toMatch(/^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/);

    useRedTeamTargetConfigValidation
      .getState()
      .setTargetConfigDraft('{"sandbox_mode":"read-only",}');
    useRedTeamTargetConfigValidation.getState().setTargetConfigError('Invalid JSON configuration');
    dispatchStorageEvent('redTeamTargetConfigValidation', oldClear);

    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Invalid JSON configuration',
    );
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe(
      '{"sandbox_mode":"read-only",}',
    );
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toMatch(
      /^invalid-json:[a-z0-9-]+$/,
    );
    expect(useRedTeamConfig.getState().config.target.config.sandbox_mode).toBe(
      'danger-full-access',
    );
  });

  it('does not let a delayed broadcast clear erase a newer malformed draft', async () => {
    const peers = new Set<MockBroadcastChannel>();
    class MockBroadcastChannel {
      readonly name: string;
      private readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();

      constructor(name: string) {
        this.name = name;
        peers.add(this);
      }
      addEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void) {
        this.listeners.add(listener);
      }
      postMessage(data: unknown) {
        for (const peer of peers) {
          if (peer !== this && peer.name === this.name) {
            for (const listener of peer.listeners) {
              listener({ data } as MessageEvent<unknown>);
            }
          }
        }
      }
      close() {
        peers.delete(this);
      }
    }
    mockBrowserProperty(
      globalThis,
      'BroadcastChannel',
      MockBroadcastChannel as unknown as typeof BroadcastChannel,
    );

    try {
      vi.resetModules();
      const { useRedTeamConfig: tabConfig } = await import('./useRedTeamConfig');
      const { useRedTeamTargetConfigValidation: tabValidation } = await import(
        './useRedTeamTargetConfigValidation'
      );
      tabConfig.getState().setFullConfig({
        ...tabConfig.getState().config,
        target: {
          id: 'openinterpreter',
          label: 'Coding target',
          config: { sandbox_mode: 'danger-full-access' },
        },
      });
      const oldClear = window.localStorage.getItem('redTeamTargetConfigValidation');
      expect(oldClear).toMatch(/^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/);
      tabValidation.getState().setTargetConfigDraft('{"sandbox_mode":"read-only",}');
      tabValidation.getState().setTargetConfigError('Invalid JSON configuration');

      const otherTab = new MockBroadcastChannel('redTeamTargetConfigValidation');
      otherTab.postMessage(oldClear);

      expect(tabValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
      expect(tabValidation.getState().targetConfigDraft).toBe('{"sandbox_mode":"read-only",}');
      expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toMatch(
        /^invalid-json:[a-z0-9-]+$/,
      );
      otherTab.close();
    } finally {
      restoreBrowserMocks();
      useRedTeamTargetConfigValidation.getState().clearTargetConfigValidation();
    }
  });

  it('broadcasts a clear synchronously when SubtleCrypto is unavailable', async () => {
    const sent: unknown[] = [];
    class MockBroadcastChannel {
      addEventListener(_type: 'message', _listener: (event: MessageEvent<unknown>) => void) {}
      postMessage(data: unknown) {
        sent.push(data);
      }
      close() {}
    }

    mockBrowserProperty(globalThis, 'crypto', undefined as unknown as Crypto);
    mockBrowserProperty(
      globalThis,
      'BroadcastChannel',
      MockBroadcastChannel as unknown as typeof BroadcastChannel,
    );

    try {
      vi.resetModules();
      const { useRedTeamConfig: senderConfig } = await import('./useRedTeamConfig');
      const { useRedTeamTargetConfigValidation: senderValidation } = await import(
        './useRedTeamTargetConfigValidation'
      );
      senderConfig.getState().setFullConfig({
        ...senderConfig.getState().config,
        target: {
          id: 'openinterpreter',
          label: 'Coding target',
          config: { sandbox_mode: 'read-only', apiKey: 'should-not-be-broadcast' },
        },
      });
      sent.length = 0;
      senderValidation.getState().setTargetConfigDraft('{"sandbox_mode":"read-only",}');
      senderValidation.getState().setTargetConfigError('Invalid JSON configuration');
      sent.length = 0;

      senderValidation.getState().setTargetConfigDraft(null);
      senderValidation.getState().setTargetConfigError(null);

      expect(sent).toEqual([expect.stringMatching(/^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/)]);
      expect(sent[0]).not.toContain('should-not-be-broadcast');
      expect(sent[0]).not.toContain('sandbox_mode');
    } finally {
      restoreBrowserMocks();
      useRedTeamTargetConfigValidation.getState().clearTargetConfigValidation();
    }
  });

  it('persists only a small validation marker for repeated malformed target edits', () => {
    const malformedSecret = '{"apiKey":"should-not-be-persisted",}';
    const config = useRedTeamConfig.getState().config;
    useRedTeamConfig.setState({
      config: {
        ...config,
        target: {
          id: 'openinterpreter',
          config: { sandbox_mode: 'danger-full-access', instructions: 'x'.repeat(2_000_000) },
        },
      },
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    setItem.mockClear();

    for (let edit = 0; edit < 100; edit++) {
      useRedTeamTargetConfigValidation.getState().setTargetConfigDraft(`${malformedSecret}${edit}`);
      useRedTeamTargetConfigValidation
        .getState()
        .setTargetConfigError('Invalid JSON configuration');
    }

    const persisted = window.localStorage.getItem('redTeamConfig');
    expect(persisted).not.toBeNull();
    expect(persisted).not.toContain('should-not-be-persisted');
    expect(JSON.parse(persisted!).state).not.toHaveProperty('targetConfigDraft');
    expect(JSON.parse(persisted!).state).not.toHaveProperty('targetConfigError');
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toMatch(
      /^invalid-json:[a-z0-9-]+$/,
    );
    expect(setItem).toHaveBeenCalledTimes(100);
    expect(setItem).toHaveBeenCalledWith(
      'redTeamTargetConfigValidation',
      expect.stringMatching(/^invalid-json:[a-z0-9-]+$/),
    );
    for (const [key, value] of setItem.mock.calls) {
      expect(key).toBe('redTeamTargetConfigValidation');
      expect(value).toMatch(/^invalid-json:[a-z0-9-]+$/);
      expect(value.length).toBeLessThan(128);
      expect(value).not.toContain('should-not-be-persisted');
    }
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe(
      `${malformedSecret}99`,
    );
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Invalid JSON configuration',
    );
  });

  it('keeps a preserved unsafe target blocked after the validation store is recreated', async () => {
    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: {
        id: 'openinterpreter',
        label: 'Coding target',
        config: { sandbox_mode: 'danger-full-access', approval_policy: 'never' },
      },
    });
    useRedTeamTargetConfigValidation
      .getState()
      .setTargetConfigDraft('{"sandbox_mode":"read-only","apiKey":"should-not-be-persisted",}');
    useRedTeamTargetConfigValidation.getState().setTargetConfigError('Invalid JSON configuration');

    const persisted = window.localStorage.getItem('redTeamConfig');
    expect(persisted).toContain('danger-full-access');
    expect(persisted).not.toContain('should-not-be-persisted');
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toMatch(
      /^invalid-json:[a-z0-9-]+$/,
    );

    vi.resetModules();
    const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
      './useRedTeamTargetConfigValidation'
    );

    expect(reloadedValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
    expect(reloadedValidation.getState().targetConfigDraft).toBeNull();
    expect(JSON.parse(persisted!).state.config.target.config).toEqual({
      sandbox_mode: 'danger-full-access',
      approval_policy: 'never',
    });
  });

  it('falls back to session storage when the local validation marker cannot be written', async () => {
    mockBrowserProperty(window, 'localStorage', {
      getItem: () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      },
      setItem: () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      },
      removeItem: () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      },
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    } as Storage);

    try {
      expect(() => {
        useRedTeamTargetConfigValidation
          .getState()
          .setTargetConfigError('Configuration must be a JSON object');
      }).not.toThrow();
      expect(window.sessionStorage.getItem('redTeamTargetConfigValidation')).toMatch(
        /^non-object-json:[a-z0-9-]+$/,
      );

      vi.resetModules();
      const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
        './useRedTeamTargetConfigValidation'
      );
      expect(reloadedValidation.getState().targetConfigError).toBe(
        'Configuration must be a JSON object',
      );
    } finally {
      restoreBrowserMocks();
      useRedTeamTargetConfigValidation.getState().clearTargetConfigValidation();
    }
  });

  it('blocks an already-open tab when another tab marks the target configuration invalid', async () => {
    vi.resetModules();
    const { useRedTeamTargetConfigValidation: existingTabValidation } = await import(
      './useRedTeamTargetConfigValidation'
    );
    existingTabValidation.setState(existingTabValidation.getInitialState());
    expect(existingTabValidation.getState().targetConfigError).toBeNull();

    window.localStorage.setItem('redTeamTargetConfigValidation', 'invalid-json');
    dispatchStorageEvent('redTeamTargetConfigValidation', 'invalid-json');

    expect(existingTabValidation.getState().targetConfigError).toBe('Invalid JSON configuration');

    dispatchStorageEvent('redTeamTargetConfigValidation', null);
    expect(existingTabValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
  });

  it('reasserts the invalid marker when another tab clears it before a stale config edit', async () => {
    vi.resetModules();
    const { useRedTeamConfig: activeTabConfig } = await import('./useRedTeamConfig');
    const { useRedTeamTargetConfigValidation: activeTabValidation } = await import(
      './useRedTeamTargetConfigValidation'
    );
    activeTabConfig.getState().setFullConfig({
      ...activeTabConfig.getState().config,
      target: {
        id: 'openinterpreter',
        label: 'Unsafe target',
        config: { sandbox_mode: 'danger-full-access' },
      },
    });
    activeTabValidation.getState().setTargetConfigDraft('{"sandbox_mode":"read-only",}');
    activeTabValidation.getState().setTargetConfigError('Invalid JSON configuration');
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toMatch(
      /^invalid-json:[a-z0-9-]+$/,
    );

    window.localStorage.removeItem('redTeamTargetConfigValidation');
    dispatchStorageEvent('redTeamTargetConfigValidation', null);
    activeTabConfig.getState().updateApplicationDefinition('purpose', 'An unrelated edit');

    expect(window.localStorage.getItem('redTeamConfig')).toContain('danger-full-access');
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toMatch(
      /^invalid-json:[a-z0-9-]+$/,
    );

    vi.resetModules();
    const { useRedTeamConfig: reloadedConfig } = await import('./useRedTeamConfig');
    const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
      './useRedTeamTargetConfigValidation'
    );
    expect(reloadedConfig.getState().config.target.config.sandbox_mode).toBe('danger-full-access');
    expect(reloadedValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
  });

  it('reasserts the invalid marker after another tab clears all local storage', async () => {
    vi.resetModules();
    const { useRedTeamConfig: activeTabConfig } = await import('./useRedTeamConfig');
    const { useRedTeamTargetConfigValidation: activeTabValidation } = await import(
      './useRedTeamTargetConfigValidation'
    );
    activeTabConfig.getState().setFullConfig({
      ...activeTabConfig.getState().config,
      target: {
        id: 'openinterpreter',
        label: 'Unsafe target',
        config: { sandbox_mode: 'danger-full-access' },
      },
    });
    activeTabValidation.getState().setTargetConfigError('Invalid JSON configuration');

    window.localStorage.clear();
    dispatchStorageEvent(null, null);
    activeTabConfig.getState().updateApplicationDefinition('purpose', 'An unrelated edit');

    expect(window.localStorage.getItem('redTeamConfig')).toContain('danger-full-access');
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toMatch(
      /^invalid-json:[a-z0-9-]+$/,
    );

    vi.resetModules();
    const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
      './useRedTeamTargetConfigValidation'
    );
    expect(reloadedValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
  });

  it.each([
    'local',
    'session',
  ] as const)('restores a valid fallback cookie when the %s marker is corrupt', async (storage) => {
    window.localStorage.removeItem('redTeamTargetConfigValidation');
    window.sessionStorage.removeItem('redTeamTargetConfigValidation');
    if (storage === 'local') {
      window.localStorage.setItem('redTeamTargetConfigValidation', 'corrupt');
    } else {
      window.sessionStorage.setItem('redTeamTargetConfigValidation', 'corrupt');
    }
    document.cookie = 'redTeamTargetConfigValidation=invalid-json; Path=/; SameSite=Lax';

    try {
      vi.resetModules();
      const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
        './useRedTeamTargetConfigValidation'
      );
      expect(reloadedValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
    } finally {
      useRedTeamTargetConfigValidation.getState().clearTargetConfigValidation();
    }
  });

  it('keeps the invalid marker after a quota-fallback tab is closed and reopened', async () => {
    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: {
        id: 'openinterpreter',
        label: 'Unsafe target',
        config: { sandbox_mode: 'danger-full-access' },
      },
    });
    const originalSetItem = Storage.prototype.setItem;
    const originalCookieDescriptor = Object.getOwnPropertyDescriptor(document, 'cookie');
    let persistentCookie = '';
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => persistentCookie,
      set: (value: string) => {
        if (value.includes('Max-Age=0')) {
          persistentCookie = '';
        } else if (/Max-Age=[1-9]\d*/.test(value)) {
          persistentCookie = value.split(';')[0];
        }
      },
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (this === window.localStorage && key === 'redTeamTargetConfigValidation') {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    });

    try {
      useRedTeamTargetConfigValidation
        .getState()
        .setTargetConfigError('Invalid JSON configuration');
      expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toMatch(
        /^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/,
      );
      expect(window.sessionStorage.getItem('redTeamTargetConfigValidation')).toMatch(
        /^invalid-json:[a-z0-9-]+$/,
      );
      expect(document.cookie).toContain('redTeamTargetConfigValidation=invalid-json');

      window.sessionStorage.clear();
      setItem.mockRestore();
      vi.resetModules();
      const { useRedTeamConfig: reopenedConfig } = await import('./useRedTeamConfig');
      const { useRedTeamTargetConfigValidation: reopenedValidation } = await import(
        './useRedTeamTargetConfigValidation'
      );

      expect(reopenedConfig.getState().config.target.config.sandbox_mode).toBe(
        'danger-full-access',
      );
      expect(reopenedValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
    } finally {
      setItem.mockRestore();
      if (originalCookieDescriptor) {
        Object.defineProperty(document, 'cookie', originalCookieDescriptor);
      } else {
        Reflect.deleteProperty(document, 'cookie');
      }
      useRedTeamTargetConfigValidation.getState().clearTargetConfigValidation();
    }
  });

  it('reasserts a quota-fallback cookie before a stale config edit is persisted', async () => {
    vi.resetModules();
    const { useRedTeamConfig: activeTabConfig } = await import('./useRedTeamConfig');
    const { useRedTeamTargetConfigValidation: activeTabValidation } = await import(
      './useRedTeamTargetConfigValidation'
    );
    activeTabConfig.getState().setFullConfig({
      ...activeTabConfig.getState().config,
      target: {
        id: 'openinterpreter',
        label: 'Unsafe target',
        config: { sandbox_mode: 'danger-full-access' },
      },
    });
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (this === window.localStorage && key === 'redTeamTargetConfigValidation') {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    });

    try {
      activeTabValidation.getState().setTargetConfigError('Invalid JSON configuration');
      expect(document.cookie).toContain('redTeamTargetConfigValidation=invalid-json');

      document.cookie = 'redTeamTargetConfigValidation=; Max-Age=0; Path=/; SameSite=Lax';
      activeTabConfig.getState().updateApplicationDefinition('purpose', 'An unrelated edit');
      expect(window.localStorage.getItem('redTeamConfig')).toContain('danger-full-access');
      expect(document.cookie).toContain('redTeamTargetConfigValidation=invalid-json');

      window.sessionStorage.clear();
      setItem.mockRestore();
      vi.resetModules();
      const { useRedTeamTargetConfigValidation: reopenedValidation } = await import(
        './useRedTeamTargetConfigValidation'
      );
      expect(reopenedValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
    } finally {
      setItem.mockRestore();
      activeTabValidation.getState().clearTargetConfigValidation();
    }
  });

  it('broadcasts a validation marker to an already-open tab when local storage is full', async () => {
    const peers = new Set<MockBroadcastChannel>();

    class MockBroadcastChannel {
      readonly name: string;
      private readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();

      constructor(name: string) {
        this.name = name;
        peers.add(this);
      }

      addEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void) {
        this.listeners.add(listener);
      }

      postMessage(data: unknown) {
        for (const peer of peers) {
          if (peer !== this && peer.name === this.name) {
            for (const listener of peer.listeners) {
              listener({ data } as MessageEvent<unknown>);
            }
          }
        }
      }

      close() {
        peers.delete(this);
      }
    }

    mockBrowserProperty(
      globalThis,
      'BroadcastChannel',
      MockBroadcastChannel as unknown as typeof BroadcastChannel,
    );
    mockBrowserProperty(window, 'localStorage', {
      getItem: () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      },
      setItem: () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      },
      removeItem: () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      },
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    } as Storage);

    try {
      vi.resetModules();
      const { useRedTeamTargetConfigValidation: senderValidation } = await import(
        './useRedTeamTargetConfigValidation'
      );
      const existingTab = new MockBroadcastChannel('redTeamTargetConfigValidation');
      const received: unknown[] = [];
      existingTab.addEventListener('message', (event) => received.push(event.data));

      senderValidation.getState().setTargetConfigError('Invalid JSON configuration');

      expect(window.sessionStorage.getItem('redTeamTargetConfigValidation')).toMatch(
        /^invalid-json:[a-z0-9-]+$/,
      );
      expect(received).toEqual([expect.stringMatching(/^invalid-json:[a-z0-9-]+$/)]);

      senderValidation.setState({ targetConfigError: null });
      window.sessionStorage.removeItem('redTeamTargetConfigValidation');
      existingTab.postMessage('invalid-json');
      expect(senderValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
      expect(window.sessionStorage.getItem('redTeamTargetConfigValidation')).toBe('invalid-json');
      expect(received).toEqual([expect.stringMatching(/^invalid-json:[a-z0-9-]+$/)]);

      vi.resetModules();
      const { useRedTeamTargetConfigValidation: reloadedReceiverValidation } = await import(
        './useRedTeamTargetConfigValidation'
      );
      expect(reloadedReceiverValidation.getState().targetConfigError).toBe(
        'Invalid JSON configuration',
      );

      existingTab.postMessage(null);
      existingTab.postMessage('{"apiKey":"should-not-be-accepted"}');
      existingTab.postMessage(`clear:1:${'0'.repeat(64)}`);
      expect(reloadedReceiverValidation.getState().targetConfigError).toBe(
        'Invalid JSON configuration',
      );
      existingTab.close();
    } finally {
      restoreBrowserMocks();
      useRedTeamTargetConfigValidation.getState().clearTargetConfigValidation();
    }
  });

  it('broadcasts a credential-free clear marker and reconciles a stale target before unblocking', async () => {
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (this === window.localStorage && key === 'redTeamTargetConfigValidation') {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    });
    const peers = new Set<MockBroadcastChannel>();

    class MockBroadcastChannel {
      readonly name: string;
      private readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();

      constructor(name: string) {
        this.name = name;
        peers.add(this);
      }

      addEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void) {
        this.listeners.add(listener);
      }

      postMessage(data: unknown) {
        for (const peer of peers) {
          if (peer !== this && peer.name === this.name) {
            for (const listener of peer.listeners) {
              listener({ data } as MessageEvent<unknown>);
            }
          }
        }
      }

      close() {
        peers.delete(this);
      }
    }

    mockBrowserProperty(
      globalThis,
      'BroadcastChannel',
      MockBroadcastChannel as unknown as typeof BroadcastChannel,
    );

    try {
      vi.resetModules();
      const { useRedTeamConfig: staleTabConfig } = await import('./useRedTeamConfig');
      const { useRedTeamTargetConfigValidation: staleTabValidation } = await import(
        './useRedTeamTargetConfigValidation'
      );
      staleTabConfig.getState().setFullConfig({
        ...staleTabConfig.getState().config,
        target: {
          id: 'openinterpreter',
          label: 'Coding target',
          config: { sandbox_mode: 'danger-full-access', apiKey: 'should-not-be-broadcast' },
        },
      });
      staleTabValidation.getState().setTargetConfigError('Invalid JSON configuration');

      const persistedConfig = JSON.parse(window.localStorage.getItem('redTeamConfig')!);
      persistedConfig.state.config.description = 'Corrected tab description';
      persistedConfig.state.config.target.config = {
        sandbox_mode: 'read-only',
        apiKey: 'should-not-be-broadcast',
      };
      originalSetItem.call(window.localStorage, 'redTeamConfig', JSON.stringify(persistedConfig));

      const correctedTab = new MockBroadcastChannel('redTeamTargetConfigValidation');
      const received: unknown[] = [];
      correctedTab.addEventListener('message', (event) => received.push(event.data));

      staleTabValidation.getState().clearTargetConfigValidation();
      expect(received).toEqual([
        expect.stringMatching(/^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/),
      ]);
      expect(received[0]).not.toContain('should-not-be-broadcast');
      expect(received[0]).not.toContain('sandbox_mode');

      staleTabValidation.getState().setTargetConfigError('Invalid JSON configuration');
      persistedConfig.state.config.target.config = {
        sandbox_mode: 'danger-full-access',
        apiKey: 'should-not-be-broadcast',
      };
      originalSetItem.call(window.localStorage, 'redTeamConfig', JSON.stringify(persistedConfig));
      correctedTab.postMessage(received[0]);
      expect(staleTabValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
      expect(staleTabConfig.getState().config.target.config.sandbox_mode).toBe(
        'danger-full-access',
      );

      persistedConfig.state.config.target.config = {
        sandbox_mode: 'read-only',
        apiKey: 'should-not-be-broadcast',
      };
      originalSetItem.call(window.localStorage, 'redTeamConfig', JSON.stringify(persistedConfig));

      correctedTab.postMessage(received[0]);
      dispatchStorageEvent('redTeamTargetConfigValidation', 'invalid-json');
      correctedTab.postMessage('invalid-json');
      expect(staleTabValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
      const legacyClear = (received[0] as string).replace(/^clear:[a-z0-9-]+:/, 'clear:legacy:');
      correctedTab.postMessage(legacyClear);
      expect(staleTabValidation.getState().targetConfigError).toBeNull();
      expect(staleTabValidation.getState().targetConfigDraft).toBeNull();
      expect(staleTabConfig.getState().config.target.config).toEqual({
        sandbox_mode: 'read-only',
        apiKey: 'should-not-be-broadcast',
      });
      expect(staleTabConfig.getState().config.description).toBe('Corrected tab description');
      correctedTab.close();
    } finally {
      setItem.mockRestore();
      restoreBrowserMocks();
      useRedTeamTargetConfigValidation.getState().clearTargetConfigValidation();
    }
  });

  it('keeps a new invalid draft blocked when quota prevents replacing an older clear marker', async () => {
    const peers = new Set<MockBroadcastChannel>();
    class MockBroadcastChannel {
      readonly name: string;
      private readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();

      constructor(name: string) {
        this.name = name;
        peers.add(this);
      }
      addEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void) {
        this.listeners.add(listener);
      }
      postMessage(data: unknown) {
        for (const peer of peers) {
          if (peer !== this && peer.name === this.name) {
            for (const listener of peer.listeners) {
              listener({ data } as MessageEvent<unknown>);
            }
          }
        }
      }
      close() {
        peers.delete(this);
      }
    }
    mockBrowserProperty(
      globalThis,
      'BroadcastChannel',
      MockBroadcastChannel as unknown as typeof BroadcastChannel,
    );

    const originalSetItem = Storage.prototype.setItem;
    let setItem: ReturnType<typeof vi.spyOn> | undefined;
    try {
      vi.resetModules();
      const { useRedTeamConfig: tabConfig } = await import('./useRedTeamConfig');
      const { useRedTeamTargetConfigValidation: tabValidation } = await import(
        './useRedTeamTargetConfigValidation'
      );
      tabConfig.getState().setFullConfig({
        ...tabConfig.getState().config,
        target: {
          id: 'openinterpreter',
          label: 'Coding target',
          config: { sandbox_mode: 'read-only' },
        },
      });
      const clearMarker = window.localStorage.getItem('redTeamTargetConfigValidation');
      expect(clearMarker).toMatch(/^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/);

      setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
        this: Storage,
        key: string,
        value: string,
      ) {
        if (this === window.localStorage && key === 'redTeamTargetConfigValidation') {
          throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        }
        return originalSetItem.call(this, key, value);
      });
      const otherTab = new MockBroadcastChannel('redTeamTargetConfigValidation');
      const received: unknown[] = [];
      otherTab.addEventListener('message', (event) => received.push(event.data));
      tabValidation.getState().setTargetConfigDraft('{"sandbox_mode":"danger-full-access",}');
      tabValidation.getState().setTargetConfigError('Invalid JSON configuration');

      expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(clearMarker);
      expect(window.sessionStorage.getItem('redTeamTargetConfigValidation')).toMatch(
        /^invalid-json:[a-z0-9-]+$/,
      );
      expect(received).toEqual([expect.stringMatching(/^invalid-json:[a-z0-9-]+$/)]);

      otherTab.postMessage('invalid-json');
      expect(tabValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
      expect(tabValidation.getState().targetConfigDraft).toBe(
        '{"sandbox_mode":"danger-full-access",}',
      );
      otherTab.close();
    } finally {
      setItem?.mockRestore();
      restoreBrowserMocks();
      useRedTeamTargetConfigValidation.getState().clearTargetConfigValidation();
    }
  });

  it.each([
    [
      'malformed JSON',
      'Invalid JSON configuration',
      '{"sandbox_mode":"read-only",}',
      '{"sandbox_mode":"danger-full-access",}',
      'invalid-json',
    ],
    ['non-object JSON', 'Configuration must be a JSON object', '[]', 'null', 'non-object-json'],
  ])('ignores a delayed quota broadcast clear after a newer %s draft and converges on its correction', async (_case, error, firstDraft, secondDraft, kind) => {
    const peers = new Set<MockBroadcastChannel>();
    const sent: unknown[] = [];
    class MockBroadcastChannel {
      readonly name: string;
      readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();

      constructor(name: string) {
        this.name = name;
        peers.add(this);
      }
      addEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void) {
        this.listeners.add(listener);
      }
      postMessage(data: unknown) {
        sent.push(data);
      }
      close() {}
    }
    mockBrowserProperty(
      globalThis,
      'BroadcastChannel',
      MockBroadcastChannel as unknown as typeof BroadcastChannel,
    );
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (this === window.localStorage && key === 'redTeamTargetConfigValidation') {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    });
    const deliver = (data: unknown) => {
      for (const peer of peers) {
        for (const listener of peer.listeners) {
          listener({ data } as MessageEvent<unknown>);
        }
      }
    };

    try {
      vi.resetModules();
      const { useRedTeamConfig: originConfig } = await import('./useRedTeamConfig');
      const { useRedTeamTargetConfigValidation: originValidation } = await import(
        './useRedTeamTargetConfigValidation'
      );
      originConfig.getState().setFullConfig({
        ...originConfig.getState().config,
        target: {
          id: 'openinterpreter',
          label: 'Coding target',
          config: { sandbox_mode: 'danger-full-access' },
        },
      });
      const clearFingerprint = sent.find(
        (message): message is string =>
          typeof message === 'string' && message.startsWith('clear:none:'),
      );
      expect(clearFingerprint).toMatch(/^clear:none:[a-z0-9]+:[a-f0-9]{64}$/);

      originValidation.getState().setTargetConfigDraft(firstDraft);
      originValidation.getState().setTargetConfigError(error);
      const firstMarker = window.sessionStorage.getItem('redTeamTargetConfigValidation')!;
      expect(firstMarker).toMatch(new RegExp(`^${kind}:[a-z0-9-]+$`));
      const firstToken = firstMarker.slice(kind.length + 1);
      const oldClear = clearFingerprint!.replace('clear:none:', `clear:${firstToken}:`);

      originValidation.getState().setTargetConfigDraft(secondDraft);
      const secondMarker = window.sessionStorage.getItem('redTeamTargetConfigValidation')!;
      expect(secondMarker).toMatch(new RegExp(`^${kind}:[a-z0-9-]+$`));
      expect(secondMarker).not.toBe(firstMarker);
      expect(sent).toContain(secondMarker);

      vi.resetModules();
      const { useRedTeamConfig: peerConfig } = await import('./useRedTeamConfig');
      const { useRedTeamTargetConfigValidation: peerValidation } = await import(
        './useRedTeamTargetConfigValidation'
      );
      expect(peerValidation.getState().targetConfigError).toBe(error);
      expect(peerValidation.getState().targetConfigDraft).toBeNull();

      deliver(oldClear);

      expect(originValidation.getState().targetConfigError).toBe(error);
      expect(originValidation.getState().targetConfigDraft).toBe(secondDraft);
      expect(peerValidation.getState().targetConfigError).toBe(error);
      expect(peerValidation.getState().targetConfigDraft).toBeNull();

      originConfig.getState().setFullConfig({
        ...originConfig.getState().config,
        description: 'Corrected configuration',
        target: {
          id: 'openinterpreter',
          label: 'Coding target',
          config: { sandbox_mode: 'read-only' },
        },
      });
      const secondToken = secondMarker.slice(kind.length + 1);
      const newClear = sent.find(
        (message): message is string =>
          typeof message === 'string' && message.startsWith(`clear:${secondToken}:`),
      );
      expect(newClear).toMatch(/^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/);

      deliver(newClear);

      expect(originValidation.getState().targetConfigError).toBeNull();
      expect(peerValidation.getState().targetConfigError).toBeNull();
      expect(peerValidation.getState().targetConfigDraft).toBeNull();
      expect(peerConfig.getState().config.target.config.sandbox_mode).toBe('read-only');
      expect(peerConfig.getState().config.description).toBe('Corrected configuration');
    } finally {
      setItem.mockRestore();
      restoreBrowserMocks();
      useRedTeamTargetConfigValidation.getState().clearTargetConfigValidation();
    }
  });

  it('converges two local-storage tabs when stale invalid events arrive around a corrected target', async () => {
    type TargetConfigWindow = Window & {
      __promptfooTargetConfigValidationStorageListener?: (event: StorageEvent) => void;
    };

    vi.resetModules();
    const { useRedTeamConfig: staleTabConfig } = await import('./useRedTeamConfig');
    const { useRedTeamTargetConfigValidation: staleTabValidation } = await import(
      './useRedTeamTargetConfigValidation'
    );
    staleTabConfig.getState().setFullConfig({
      ...staleTabConfig.getState().config,
      target: {
        id: 'openinterpreter',
        label: 'Coding target',
        config: { sandbox_mode: 'danger-full-access' },
      },
    });
    staleTabValidation.getState().setTargetConfigError('Invalid JSON configuration');
    const staleTabListener = (window as TargetConfigWindow)
      .__promptfooTargetConfigValidationStorageListener!;

    vi.resetModules();
    const { useRedTeamConfig: correctingTabConfig } = await import('./useRedTeamConfig');
    const { useRedTeamTargetConfigValidation: correctingTabValidation } = await import(
      './useRedTeamTargetConfigValidation'
    );
    const correctingTabListener = (window as TargetConfigWindow)
      .__promptfooTargetConfigValidationStorageListener!;
    expect(correctingTabValidation.getState().targetConfigError).toBe('Invalid JSON configuration');

    correctingTabConfig.getState().setFullConfig({
      ...correctingTabConfig.getState().config,
      description: 'Corrected configuration',
      target: {
        id: 'openinterpreter',
        label: 'Coding target',
        config: { sandbox_mode: 'read-only' },
      },
    });
    const clearMarker = window.localStorage.getItem('redTeamTargetConfigValidation');
    expect(clearMarker).toMatch(/^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/);

    staleTabListener(createStorageEvent('redTeamTargetConfigValidation', null));
    correctingTabListener(createStorageEvent('redTeamTargetConfigValidation', 'invalid-json'));
    staleTabListener(createStorageEvent('redTeamTargetConfigValidation', 'invalid-json'));
    staleTabListener(createStorageEvent('redTeamTargetConfigValidation', clearMarker));

    expect(staleTabValidation.getState().targetConfigError).toBeNull();
    expect(correctingTabValidation.getState().targetConfigError).toBeNull();
    expect(staleTabConfig.getState().config.target.config.sandbox_mode).toBe('read-only');
    expect(correctingTabConfig.getState().config.target.config.sandbox_mode).toBe('read-only');
    expect(staleTabConfig.getState().config.description).toBe('Corrected configuration');
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(clearMarker);
  });

  it('converges when a queued newer invalid storage event arrives after its clear is already current', async () => {
    type TargetConfigWindow = Window & {
      __promptfooTargetConfigValidationStorageListener?: (event: StorageEvent) => void;
    };

    vi.resetModules();
    const { useRedTeamConfig: staleTabConfig } = await import('./useRedTeamConfig');
    const { useRedTeamTargetConfigValidation: staleTabValidation } = await import(
      './useRedTeamTargetConfigValidation'
    );
    staleTabConfig.getState().setFullConfig({
      ...staleTabConfig.getState().config,
      target: {
        id: 'openinterpreter',
        label: 'Coding target',
        config: { sandbox_mode: 'danger-full-access' },
      },
    });
    staleTabValidation.getState().setTargetConfigDraft('{"sandbox_mode":"read-only",}');
    staleTabValidation.getState().setTargetConfigError('Invalid JSON configuration');
    const firstMarker = window.localStorage.getItem('redTeamTargetConfigValidation');
    expect(firstMarker).toMatch(/^invalid-json:[a-z0-9-]+$/);
    const staleTabListener = (window as TargetConfigWindow)
      .__promptfooTargetConfigValidationStorageListener!;

    vi.resetModules();
    const { useRedTeamConfig: correctingTabConfig } = await import('./useRedTeamConfig');
    const { useRedTeamTargetConfigValidation: correctingTabValidation } = await import(
      './useRedTeamTargetConfigValidation'
    );
    correctingTabValidation
      .getState()
      .setTargetConfigDraft('{"sandbox_mode":"danger-full-access",}');
    const secondMarker = window.localStorage.getItem('redTeamTargetConfigValidation');
    expect(secondMarker).toMatch(/^invalid-json:[a-z0-9-]+$/);
    expect(secondMarker).not.toBe(firstMarker);

    correctingTabConfig.getState().setFullConfig({
      ...correctingTabConfig.getState().config,
      description: 'Fast corrected configuration',
      target: {
        id: 'openinterpreter',
        label: 'Coding target',
        config: { sandbox_mode: 'read-only' },
      },
    });
    const clearMarker = window.localStorage.getItem('redTeamTargetConfigValidation');
    expect(clearMarker).toMatch(/^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/);

    staleTabListener(createStorageEvent('redTeamTargetConfigValidation', secondMarker));
    staleTabListener(createStorageEvent('redTeamTargetConfigValidation', clearMarker));

    expect(staleTabValidation.getState().targetConfigError).toBeNull();
    expect(staleTabValidation.getState().targetConfigDraft).toBeNull();
    expect(staleTabConfig.getState().config.target.config.sandbox_mode).toBe('read-only');
    expect(staleTabConfig.getState().config.description).toBe('Fast corrected configuration');
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(clearMarker);
  });

  it('preserves a target configuration error when the provider type changes', () => {
    useRedTeamConfig.setState({ providerType: 'openinterpreter' });
    useRedTeamTargetConfigValidation.getState().setTargetConfigError('Invalid JSON configuration');

    useRedTeamConfig.getState().setProviderType('openinterpreter');
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Invalid JSON configuration',
    );

    useRedTeamConfig.getState().setProviderType('openai');
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Invalid JSON configuration',
    );
  });

  describe('updatePlugins', () => {
    it('should update plugins when they are different', () => {
      const { updatePlugins, config } = useRedTeamConfig.getState();
      expect(config.plugins).toEqual([]);

      updatePlugins(['harmful:hate', 'bola']);

      const newState = useRedTeamConfig.getState();
      expect(newState.config.plugins).toEqual(['harmful:hate', 'bola']);
    });

    it('should not update state when merged output equals current state', () => {
      // Set initial state with a plugin that has extra properties (like numTests)
      const initialPlugins = [{ id: 'bola', config: { targetSystems: ['sys1'] }, numTests: 10 }];
      useRedTeamConfig.setState({
        config: { ...useRedTeamConfig.getState().config, plugins: initialPlugins },
      });

      const stateBefore = useRedTeamConfig.getState();
      const pluginsBefore = stateBefore.config.plugins;

      // Call updatePlugins with the same plugin but without numTests
      // The merge logic will add numTests back, making output equal to current state
      stateBefore.updatePlugins([{ id: 'bola', config: { targetSystems: ['sys1'] } }]);

      const stateAfter = useRedTeamConfig.getState();
      // State reference should be the same (no update occurred)
      expect(stateAfter.config.plugins).toBe(pluginsBefore);
    });

    it('should preserve extra properties from existing plugins during merge', () => {
      // Set initial state with a plugin that has numTests
      const initialPlugins = [{ id: 'bola', config: { targetSystems: ['sys1'] }, numTests: 10 }];
      useRedTeamConfig.setState({
        config: { ...useRedTeamConfig.getState().config, plugins: initialPlugins },
      });

      // Update with different config but same plugin id
      const { updatePlugins } = useRedTeamConfig.getState();
      updatePlugins([{ id: 'bola', config: { targetSystems: ['sys1', 'sys2'] } }]);

      const newState = useRedTeamConfig.getState();
      // numTests should be preserved from the existing plugin
      expect(newState.config.plugins).toEqual([
        { id: 'bola', config: { targetSystems: ['sys1', 'sys2'] }, numTests: 10 },
      ]);
    });

    it('should handle string plugins correctly', () => {
      const { updatePlugins } = useRedTeamConfig.getState();
      updatePlugins(['harmful:hate', 'bola', 'bfla']);

      const newState = useRedTeamConfig.getState();
      expect(newState.config.plugins).toEqual(['harmful:hate', 'bola', 'bfla']);
    });

    it('should handle mixed string and object plugins', () => {
      const { updatePlugins } = useRedTeamConfig.getState();
      updatePlugins(['harmful:hate', { id: 'bola', config: { targetSystems: ['sys1'] } }]);

      const newState = useRedTeamConfig.getState();
      expect(newState.config.plugins).toEqual([
        'harmful:hate',
        { id: 'bola', config: { targetSystems: ['sys1'] } },
      ]);
    });

    it('should merge configs when updating existing object plugin', () => {
      // Set initial state with a plugin that has some config
      const initialPlugins = [
        { id: 'bola', config: { targetSystems: ['sys1'], severity: 'high' as const } },
      ];
      useRedTeamConfig.setState({
        config: { ...useRedTeamConfig.getState().config, plugins: initialPlugins },
      });

      // Update with new config property
      const { updatePlugins } = useRedTeamConfig.getState();
      updatePlugins([{ id: 'bola', config: { targetSystems: ['sys2'] } }]);

      const newState = useRedTeamConfig.getState();
      // Both old (severity) and new (targetSystems) config should be present
      // New targetSystems overwrites old one
      expect(newState.config.plugins).toEqual([
        { id: 'bola', config: { targetSystems: ['sys2'], severity: 'high' as const } },
      ]);
    });

    it('should prevent infinite loop scenario - repeated calls with same semantic content', () => {
      // This test simulates the infinite loop bug scenario:
      // 1. State has plugin with extra props (numTests)
      // 2. Effect calls updatePlugins without numTests
      // 3. Merge preserves numTests, making output equal to current
      // 4. Without the fix, state would change -> effect runs again -> loop
      // 5. With the fix, output equals current, so state doesn't change

      const initialPlugins = [
        { id: 'intent', config: { intent: ['test'] } },
        { id: 'bola', config: { targetSystems: ['sys1'] }, numTests: 5 },
      ];
      useRedTeamConfig.setState({
        config: { ...useRedTeamConfig.getState().config, plugins: initialPlugins },
      });

      const stateBefore = useRedTeamConfig.getState();

      // Simulate what the effect does: call updatePlugins with plugins without extra props
      // This should NOT cause a state change because merged output equals current
      for (let i = 0; i < 10; i++) {
        stateBefore.updatePlugins([
          { id: 'intent', config: { intent: ['test'] } },
          { id: 'bola', config: { targetSystems: ['sys1'] } },
        ]);
      }

      const stateAfter = useRedTeamConfig.getState();
      // Plugins should still have the original values with numTests preserved
      expect(stateAfter.config.plugins).toEqual(initialPlugins);
    });
  });

  describe('setFullConfig', () => {
    it('should set providerType to the result of getProviderType when called with a config that has a target with an id', () => {
      const newConfig: Config = {
        description: 'Test config with an OpenAI target',
        prompts: ['{{prompt}}'],
        target: {
          id: 'openai:chat',
          config: {
            model: 'gpt-4o',
          },
        },
        plugins: [],
        strategies: ['basic'],
        purpose: 'A test purpose',
        entities: [],
        numTests: 50,
        maxConcurrency: 10,
        applicationDefinition: {
          purpose: '',
          features: '',
          hasAccessTo: '',
          doesNotHaveAccessTo: '',
          userTypes: '',
          securityRequirements: '',
          exampleIdentifiers: '',
          industry: '',
          sensitiveDataTypes: '',
          criticalActions: '',
          forbiddenTopics: '',
          competitors: '',
          redteamUser: '',
          accessToData: '',
          forbiddenData: '',
          accessToActions: '',
          forbiddenActions: '',
          connectedSystems: '',
          attackConstraints: '',
        },
      };

      useRedTeamConfig.getState().setFullConfig(newConfig);

      const state = useRedTeamConfig.getState();
      expect(state.config).toEqual(newConfig);
      expect(state.providerType).toBe('openai');
    });

    it("should correctly set providerType to 'go' even with incomplete Go provider configuration", () => {
      const incompleteGoConfig: Config = {
        description: 'Incomplete Go provider config',
        prompts: ['{{prompt}}'],
        target: {
          id: 'go:path/to/my/go/script.go',
          config: {},
        },
        plugins: [],
        strategies: ['basic'],
        purpose: 'Test Go provider',
        entities: [],
        numTests: 10,
        maxConcurrency: 5,
        applicationDefinition: {
          purpose: '',
          features: '',
          hasAccessTo: '',
          doesNotHaveAccessTo: '',
          userTypes: '',
          securityRequirements: '',
          exampleIdentifiers: '',
          industry: '',
          sensitiveDataTypes: '',
          criticalActions: '',
          forbiddenTopics: '',
          competitors: '',
          redteamUser: '',
          accessToData: '',
          forbiddenData: '',
          accessToActions: '',
          forbiddenActions: '',
          connectedSystems: '',
          attackConstraints: '',
        },
      };

      useRedTeamConfig.getState().setFullConfig(incompleteGoConfig);

      const state = useRedTeamConfig.getState();
      expect(state.providerType).toBe('go');
    });

    it('should set providerType to the target ID when the target ID has an unrecognized format', () => {
      const unrecognizedId = 'unknown-provider';
      const newConfig: Config = {
        description: 'Test config with an unknown provider target',
        prompts: ['{{prompt}}'],
        target: {
          id: unrecognizedId,
          config: {},
        },
        plugins: [],
        strategies: ['basic'],
        purpose: 'A test purpose',
        entities: [],
        numTests: 50,
        maxConcurrency: 10,
        applicationDefinition: {
          purpose: '',
          features: '',
          hasAccessTo: '',
          doesNotHaveAccessTo: '',
          userTypes: '',
          securityRequirements: '',
          exampleIdentifiers: '',
          industry: '',
          sensitiveDataTypes: '',
          criticalActions: '',
          forbiddenTopics: '',
          competitors: '',
          redteamUser: '',
          accessToData: '',
          forbiddenData: '',
          accessToActions: '',
          forbiddenActions: '',
          connectedSystems: '',
          attackConstraints: '',
        },
      };

      useRedTeamConfig.getState().setFullConfig(newConfig);

      const state = useRedTeamConfig.getState();
      expect(state.providerType).toBe(unrecognizedId);
    });
  });
});
