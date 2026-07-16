import { mockBrowserProperty, restoreBrowserMocks } from '@app/tests/browserMocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRedTeamConfig } from './useRedTeamConfig';
import {
  getCurrentTargetConfigInvalidMarker,
  useRedTeamTargetConfigValidation,
} from './useRedTeamTargetConfigValidation';

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

  it('blocks an imported non-object foundation target before its config persist can fail', async () => {
    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: {
        id: 'openai:gpt-5',
        label: 'Foundation target',
        config: { temperature: 0.3 },
      },
    });
    const persisted = window.localStorage.getItem('redTeamConfig');
    const clearMarker = window.localStorage.getItem('redTeamTargetConfigValidation');
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
            label: 'Imported foundation target',
            config: [] as unknown as Config['target']['config'],
          },
        }),
      ).toThrow('The quota has been exceeded.');

      expect(useRedTeamConfig.getState().config.target.config).toEqual([]);
      expect(window.localStorage.getItem('redTeamConfig')).toBe(persisted);
      expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
        'Configuration must be a JSON object',
      );
      expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe('[]');
      const invalidMarker = window.localStorage.getItem('redTeamTargetConfigValidation');
      expect(invalidMarker).toMatch(/^non-object-json:[a-z0-9-]+$/);
      expect(invalidMarker).not.toBe(clearMarker);
    } finally {
      setItem.mockRestore();
    }

    vi.resetModules();
    const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
      './useRedTeamTargetConfigValidation'
    );
    expect(reloadedValidation.getState().targetConfigError).toBe(
      'Configuration must be a JSON object',
    );
  });

  it('rotates the durable marker for repeated non-object target imports', () => {
    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: {
        id: 'openai:gpt-5',
        label: 'Foundation target',
        config: [] as unknown as Config['target']['config'],
      },
    });
    const firstMarker = window.localStorage.getItem('redTeamTargetConfigValidation');
    expect(firstMarker).toMatch(/^non-object-json:[a-z0-9-]+$/);

    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: {
        id: 'openai:gpt-5',
        label: 'Second foundation target',
        config: null as unknown as Config['target']['config'],
      },
    });

    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Configuration must be a JSON object',
    );
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe('null');
    const secondMarker = window.localStorage.getItem('redTeamTargetConfigValidation');
    expect(secondMarker).toMatch(/^non-object-json:[a-z0-9-]+$/);
    expect(secondMarker).not.toBe(firstMarker);
  });

  it.each([
    'BigInt',
    'cyclic array',
  ] as const)('keeps an existing invalid target blocked when a new %s import cannot be serialized', (invalidType) => {
    const cyclicConfig: unknown[] = [];
    cyclicConfig.push(cyclicConfig);
    const invalidConfig = invalidType === 'BigInt' ? BigInt(1) : cyclicConfig;
    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: {
        id: 'openai:gpt-5',
        label: 'Foundation target',
        config: [] as unknown as Config['target']['config'],
      },
    });
    const invalidMarker = window.localStorage.getItem('redTeamTargetConfigValidation');

    expect(() =>
      useRedTeamConfig.getState().setFullConfig({
        ...useRedTeamConfig.getState().config,
        target: {
          id: 'openai:gpt-5',
          label: 'Unserializable foundation target',
          config: invalidConfig as unknown as Config['target']['config'],
        },
      }),
    ).toThrow(TypeError);

    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Configuration must be a JSON object',
    );
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe('[]');
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(invalidMarker);
  });

  it('only clears a blocked target after a valid full import successfully persists', () => {
    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: {
        id: 'openai:gpt-5',
        label: 'Foundation target',
        config: [] as unknown as Config['target']['config'],
      },
    });
    const persisted = window.localStorage.getItem('redTeamConfig');
    const invalidMarker = window.localStorage.getItem('redTeamTargetConfigValidation');
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
            label: 'Valid foundation target',
            config: { temperature: 0.3 },
          },
        }),
      ).toThrow('The quota has been exceeded.');
      expect(window.localStorage.getItem('redTeamConfig')).toBe(persisted);
      expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
        'Configuration must be a JSON object',
      );
      expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe('[]');
      expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(invalidMarker);
    } finally {
      setItem.mockRestore();
    }

    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: {
        id: 'openai:gpt-5',
        label: 'Valid foundation target',
        config: { temperature: 0.4 },
      },
    });

    expect(
      JSON.parse(window.localStorage.getItem('redTeamConfig')!).state.config.target.config,
    ).toEqual({ temperature: 0.4 });
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBeNull();
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toMatch(
      /^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/,
    );
  });

  it('clears an imported non-object foundation target only after a valid structured replacement persists', () => {
    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: {
        id: 'openai:gpt-5',
        label: 'Foundation target',
        config: null as unknown as Config['target']['config'],
      },
    });

    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Configuration must be a JSON object',
    );
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe('null');
    const invalidMarker = window.localStorage.getItem('redTeamTargetConfigValidation');
    expect(invalidMarker).toMatch(/^non-object-json:[a-z0-9-]+$/);

    useRedTeamConfig.getState().updateConfig('description', 'Unrelated edit');
    useRedTeamConfig.getState().updateConfig('target', {
      ...useRedTeamConfig.getState().config.target,
      config: null as unknown as Config['target']['config'],
    });

    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Configuration must be a JSON object',
    );
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(invalidMarker);

    useRedTeamConfig.getState().updateConfig('target', {
      ...useRedTeamConfig.getState().config.target,
      config: { temperature: 0.4 },
    });

    expect(useRedTeamConfig.getState().config.target.config).toEqual({ temperature: 0.4 });
    expect(
      JSON.parse(window.localStorage.getItem('redTeamConfig')!).state.config.target.config,
    ).toEqual({ temperature: 0.4 });
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBeNull();
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toMatch(
      /^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/,
    );
  });

  it('keeps an imported non-object target blocked when its structured replacement cannot persist', () => {
    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: {
        id: 'openai:gpt-5',
        label: 'Foundation target',
        config: null as unknown as Config['target']['config'],
      },
    });
    const invalidMarker = window.localStorage.getItem('redTeamTargetConfigValidation');
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
        useRedTeamConfig.getState().updateConfig('target', {
          ...useRedTeamConfig.getState().config.target,
          config: { temperature: 0.4 },
        }),
      ).toThrow('The quota has been exceeded.');
      expect(window.localStorage.getItem('redTeamConfig')).toBe(persisted);
      expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(invalidMarker);
      expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
        'Configuration must be a JSON object',
      );
      expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe('null');
    } finally {
      setItem.mockRestore();
    }
  });

  it('clears an imported non-object foundation target when a later structured replacement persists after quota recovers', () => {
    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: {
        id: 'openai:gpt-5',
        label: 'Foundation target',
        config: null as unknown as Config['target']['config'],
      },
    });
    const invalidMarker = window.localStorage.getItem('redTeamTargetConfigValidation');
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
        useRedTeamConfig.getState().updateConfig('target', {
          ...useRedTeamConfig.getState().config.target,
          config: { temperature: 0.3 },
        }),
      ).toThrow('The quota has been exceeded.');
      expect(useRedTeamConfig.getState().config.target.config).toEqual({ temperature: 0.3 });
      expect(window.localStorage.getItem('redTeamConfig')).toBe(persisted);
      expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(invalidMarker);
    } finally {
      setItem.mockRestore();
    }

    useRedTeamConfig.getState().updateConfig('target', {
      ...useRedTeamConfig.getState().config.target,
      config: { temperature: 0.4 },
    });

    expect(useRedTeamConfig.getState().config.target.config).toEqual({ temperature: 0.4 });
    expect(
      JSON.parse(window.localStorage.getItem('redTeamConfig')!).state.config.target.config,
    ).toEqual({ temperature: 0.4 });
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBeNull();
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toMatch(
      /^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/,
    );
  });

  it.each([
    'description',
    'plugins',
    'application definition',
    'provider type',
  ] as const)('clears an imported non-object foundation target when an unrelated %s update persists its corrected in-memory target after quota recovers', (update) => {
    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: {
        id: 'openai:gpt-5',
        label: 'Foundation target',
        config: null as unknown as Config['target']['config'],
      },
    });
    const invalidMarker = window.localStorage.getItem('redTeamTargetConfigValidation');
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
        useRedTeamConfig.getState().updateConfig('target', {
          ...useRedTeamConfig.getState().config.target,
          config: { temperature: 0.3 },
        }),
      ).toThrow('The quota has been exceeded.');
      expect(useRedTeamConfig.getState().config.target.config).toEqual({ temperature: 0.3 });
      expect(window.localStorage.getItem('redTeamConfig')).toBe(persisted);
      expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(invalidMarker);
    } finally {
      setItem.mockRestore();
    }

    const configState = useRedTeamConfig.getState();
    switch (update) {
      case 'description':
        configState.updateConfig('description', 'retry after freeing storage');
        break;
      case 'plugins':
        configState.updatePlugins(['harmful:privacy']);
        break;
      case 'application definition':
        configState.updateApplicationDefinition('purpose', 'retry after freeing storage');
        break;
      case 'provider type':
        configState.setProviderType('openai');
        break;
    }

    const durableConfig = JSON.parse(window.localStorage.getItem('redTeamConfig')!).state.config;
    expect(durableConfig.target.config).toEqual({ temperature: 0.3 });
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBeNull();
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toMatch(
      /^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/,
    );
  });

  it('clears a failed non-object full import when a later structured target replacement successfully persists', () => {
    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: {
        id: 'openai:gpt-5',
        label: 'Foundation target',
        config: { temperature: 0.3 },
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
            label: 'Invalid foundation target',
            config: [] as unknown as Config['target']['config'],
          },
        }),
      ).toThrow('The quota has been exceeded.');
      expect(useRedTeamConfig.getState().config.target.config).toEqual([]);
      expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
        'Configuration must be a JSON object',
      );
      expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe('[]');
    } finally {
      setItem.mockRestore();
    }

    useRedTeamConfig.getState().updateConfig('target', {
      ...useRedTeamConfig.getState().config.target,
      config: { temperature: 0.4 },
    });

    expect(
      JSON.parse(window.localStorage.getItem('redTeamConfig')!).state.config.target.config,
    ).toEqual({ temperature: 0.4 });
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBeNull();
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBeNull();
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toMatch(
      /^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/,
    );
  });

  it.each([
    ['newer raw draft', 'draft'],
    ['cross-tab persisted target', 'persisted-target'],
    ['cross-tab invalid marker during persist', 'marker'],
  ] as const)('does not clear a %s when an unrelated update persists a corrected in-memory target', (_case, interference) => {
    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: {
        id: 'openai:gpt-5',
        label: 'Foundation target',
        config: null as unknown as Config['target']['config'],
      },
    });
    const originalSetItem = Storage.prototype.setItem;
    const quotaSetItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
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
        useRedTeamConfig.getState().updateConfig('target', {
          ...useRedTeamConfig.getState().config.target,
          config: { temperature: 0.3 },
        }),
      ).toThrow('The quota has been exceeded.');
    } finally {
      quotaSetItem.mockRestore();
    }

    if (interference === 'draft') {
      useRedTeamTargetConfigValidation.getState().setTargetConfigDraft('[]');
    }
    if (interference === 'persisted-target') {
      const persistedConfig = JSON.parse(window.localStorage.getItem('redTeamConfig')!);
      persistedConfig.state.config.target.config = { temperature: 0.9 };
      window.localStorage.setItem('redTeamConfig', JSON.stringify(persistedConfig));
    }
    const expectedDraft = interference === 'draft' ? '[]' : 'null';
    let expectedMarker = window.localStorage.getItem('redTeamTargetConfigValidation');
    const racingSetItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      const result = originalSetItem.call(this, key, value);
      if (interference === 'marker' && this === window.localStorage && key === 'redTeamConfig') {
        useRedTeamTargetConfigValidation.getState().setTargetConfigDraft('["other-tab"]');
        useRedTeamTargetConfigValidation.getState().setTargetConfigDraft('null');
        expectedMarker = window.localStorage.getItem('redTeamTargetConfigValidation');
      }
      return result;
    });
    try {
      useRedTeamConfig.getState().updateConfig('description', 'retry after freeing storage');
    } finally {
      racingSetItem.mockRestore();
    }

    const durableConfig = JSON.parse(window.localStorage.getItem('redTeamConfig')!).state.config;
    expect(durableConfig.description).toBe('retry after freeing storage');
    expect(durableConfig.target.config).toEqual({ temperature: 0.3 });
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Configuration must be a JSON object',
    );
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe(expectedDraft);
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(expectedMarker);
  });

  it.each([
    'valid full import',
    'reset',
  ] as const)('does not clear a newer invalid marker that arrives while a %s persists', async (update) => {
    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: {
        id: 'openai:gpt-5',
        label: 'Foundation target',
        config: { temperature: 0.3 },
      },
    });
    useRedTeamTargetConfigValidation.getState().setTargetConfigDraft('[]');
    useRedTeamTargetConfigValidation
      .getState()
      .setTargetConfigError('Configuration must be a JSON object');
    const originalMarker = window.localStorage.getItem('redTeamTargetConfigValidation');
    let newerMarker: string | null = null;
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      const result = originalSetItem.call(this, key, value);
      if (this === window.localStorage && key === 'redTeamConfig') {
        useRedTeamTargetConfigValidation.getState().setTargetConfigDraft('["other-tab"]');
        useRedTeamTargetConfigValidation.getState().setTargetConfigDraft('[]');
        newerMarker = window.localStorage.getItem('redTeamTargetConfigValidation');
      }
      return result;
    });
    try {
      if (update === 'valid full import') {
        useRedTeamConfig.getState().setFullConfig({
          ...useRedTeamConfig.getState().config,
          target: {
            id: 'openai:gpt-5',
            label: 'Valid foundation target',
            config: { temperature: 0.4 },
          },
        });
      } else {
        useRedTeamConfig.getState().resetConfig();
      }
    } finally {
      setItem.mockRestore();
    }

    expect(newerMarker).toMatch(/^non-object-json:[a-z0-9-]+$/);
    expect(newerMarker).not.toBe(originalMarker);
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Configuration must be a JSON object',
    );
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe('[]');
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(newerMarker);
    vi.resetModules();
    const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
      './useRedTeamTargetConfigValidation'
    );
    expect(reloadedValidation.getState().targetConfigError).toBe(
      'Configuration must be a JSON object',
    );
  });

  it('does not clear a newer invalid marker that arrives while a target-config clear reconciles', async () => {
    vi.resetModules();
    const { useRedTeamConfig: tabConfig } = await import('./useRedTeamConfig');
    const { useRedTeamTargetConfigValidation: tabValidation } = await import(
      './useRedTeamTargetConfigValidation'
    );
    tabConfig.getState().setFullConfig({
      ...tabConfig.getState().config,
      target: {
        id: 'openai:gpt-5',
        label: 'Foundation target',
        config: { temperature: 0.3 },
      },
    });
    tabValidation.getState().setTargetConfigDraft('{"temperature":,}');
    tabValidation.getState().setTargetConfigError('Invalid JSON configuration');
    tabValidation.getState().clearTargetConfigValidation();
    const clearMarker = window.localStorage.getItem('redTeamTargetConfigValidation');
    expect(clearMarker).toMatch(/^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/);
    tabValidation.setState({
      targetConfigError: 'Invalid JSON configuration',
      targetConfigDraft: '{"temperature":,}',
    });
    const originalSetItem = Storage.prototype.setItem;
    let newerMarker: string | null = null;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      const result = originalSetItem.call(this, key, value);
      if (this === window.localStorage && key === 'redTeamConfig') {
        tabValidation.getState().setTargetConfigDraft('{"temperature":"other-tab",}');
        tabValidation.getState().setTargetConfigDraft('{"temperature":,}');
        newerMarker = window.localStorage.getItem('redTeamTargetConfigValidation');
      }
      return result;
    });
    try {
      dispatchStorageEvent('redTeamTargetConfigValidation', clearMarker);
    } finally {
      setItem.mockRestore();
    }

    expect(newerMarker).toMatch(/^invalid-json:[a-z0-9-]+$/);
    expect(tabValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
    expect(tabValidation.getState().targetConfigDraft).toBe('{"temperature":,}');
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(newerMarker);
    vi.resetModules();
    const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
      './useRedTeamTargetConfigValidation'
    );
    expect(reloadedValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
  });

  it.each([
    'valid full import',
    'reset',
  ] as const)('does not authenticate an overwritten persisted target when a %s races with an invalid draft', (update) => {
    const staleTarget = {
      id: 'openinterpreter',
      label: 'Coding target',
      config: { sandbox_mode: 'danger-full-access' },
    };
    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: staleTarget,
    });
    useRedTeamTargetConfigValidation
      .getState()
      .setTargetConfigDraft('{"sandbox_mode":"read-only",}');
    useRedTeamTargetConfigValidation.getState().setTargetConfigError('Invalid JSON configuration');
    const invalidMarker = window.localStorage.getItem('redTeamTargetConfigValidation');
    const originalSetItem = Storage.prototype.setItem;
    let raced = false;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      const result = originalSetItem.call(this, key, value);
      if (!raced && this === window.localStorage && key === 'redTeamConfig') {
        raced = true;
        const overwrittenConfig = JSON.parse(value);
        overwrittenConfig.state.config.target = staleTarget;
        originalSetItem.call(this, key, JSON.stringify(overwrittenConfig));
      }
      return result;
    });
    try {
      if (update === 'valid full import') {
        useRedTeamConfig.getState().setFullConfig({
          ...useRedTeamConfig.getState().config,
          target: {
            ...staleTarget,
            config: { sandbox_mode: 'read-only' },
          },
        });
      } else {
        useRedTeamConfig.getState().resetConfig();
      }
    } finally {
      setItem.mockRestore();
    }

    expect(raced).toBe(true);
    expect(
      JSON.parse(window.localStorage.getItem('redTeamConfig')!).state.config.target.config,
    ).toEqual({ sandbox_mode: 'danger-full-access' });
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Invalid JSON configuration',
    );
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe(
      '{"sandbox_mode":"read-only",}',
    );
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(invalidMarker);
  });

  it.each([
    'structured target update',
    'description recovery update',
    'plugins recovery update',
    'application-definition recovery update',
    'provider-type recovery update',
  ] as const)('does not authenticate an overwritten persisted target during a %s', (update) => {
    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: {
        id: 'openai:gpt-5',
        label: 'Foundation target',
        config: null as unknown as Config['target']['config'],
      },
    });
    const originalSetItem = Storage.prototype.setItem;
    if (update !== 'structured target update') {
      const quotaSetItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
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
          useRedTeamConfig.getState().updateConfig('target', {
            ...useRedTeamConfig.getState().config.target,
            config: { temperature: 0.3 },
          }),
        ).toThrow('The quota has been exceeded.');
      } finally {
        quotaSetItem.mockRestore();
      }
    }
    const invalidMarker = window.localStorage.getItem('redTeamTargetConfigValidation');
    let raced = false;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      const result = originalSetItem.call(this, key, value);
      if (!raced && this === window.localStorage && key === 'redTeamConfig') {
        raced = true;
        const overwrittenConfig = JSON.parse(value);
        overwrittenConfig.state.config.target = {
          id: 'openinterpreter',
          label: 'Stale coding target',
          config: { sandbox_mode: 'danger-full-access' },
        };
        originalSetItem.call(this, key, JSON.stringify(overwrittenConfig));
      }
      return result;
    });
    try {
      if (update === 'structured target update') {
        useRedTeamConfig.getState().updateConfig('target', {
          ...useRedTeamConfig.getState().config.target,
          config: { temperature: 0.4 },
        });
      } else if (update === 'description recovery update') {
        useRedTeamConfig.getState().updateConfig('description', 'retry after freeing storage');
      } else if (update === 'plugins recovery update') {
        useRedTeamConfig.getState().updatePlugins(['harmful:privacy']);
      } else if (update === 'application-definition recovery update') {
        useRedTeamConfig
          .getState()
          .updateApplicationDefinition('purpose', 'retry after freeing storage');
      } else {
        useRedTeamConfig.getState().setProviderType('openai');
      }
    } finally {
      setItem.mockRestore();
    }

    expect(raced).toBe(true);
    expect(
      JSON.parse(window.localStorage.getItem('redTeamConfig')!).state.config.target.config,
    ).toEqual({ sandbox_mode: 'danger-full-access' });
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Configuration must be a JSON object',
    );
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe('null');
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(invalidMarker);
  });

  it.each([
    'storage',
    'broadcast',
  ] as const)('does not authenticate an overwritten persisted target while a %s clear reconciles', async (delivery) => {
    const peers = new Set<MockBroadcastChannel>();
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
      const staleTarget = {
        id: 'openinterpreter',
        label: 'Coding target',
        config: { sandbox_mode: 'danger-full-access' },
      };
      const correctedTarget = {
        ...staleTarget,
        config: { sandbox_mode: 'read-only' },
      };
      tabConfig.getState().setFullConfig({
        ...tabConfig.getState().config,
        target: staleTarget,
      });
      tabValidation.getState().setTargetConfigDraft('{"sandbox_mode":"read-only",}');
      tabValidation.getState().setTargetConfigError('Invalid JSON configuration');
      const persistedConfig = JSON.parse(window.localStorage.getItem('redTeamConfig')!);
      persistedConfig.state.config.target = correctedTarget;
      window.localStorage.setItem('redTeamConfig', JSON.stringify(persistedConfig));
      tabValidation.getState().clearTargetConfigValidation();
      const clearMarker = window.localStorage.getItem('redTeamTargetConfigValidation');
      expect(clearMarker).toMatch(/^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/);
      tabValidation.setState({
        targetConfigError: 'Invalid JSON configuration',
        targetConfigDraft: '{"sandbox_mode":"read-only",}',
      });
      const originalSetItem = Storage.prototype.setItem;
      let raced = false;
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
        this: Storage,
        key: string,
        value: string,
      ) {
        const result = originalSetItem.call(this, key, value);
        if (!raced && this === window.localStorage && key === 'redTeamConfig') {
          raced = true;
          const overwrittenConfig = JSON.parse(value);
          overwrittenConfig.state.config.target = staleTarget;
          originalSetItem.call(this, key, JSON.stringify(overwrittenConfig));
        }
        return result;
      });
      try {
        if (delivery === 'storage') {
          dispatchStorageEvent('redTeamTargetConfigValidation', clearMarker);
        } else {
          new MockBroadcastChannel('redTeamTargetConfigValidation').postMessage(clearMarker);
        }
      } finally {
        setItem.mockRestore();
      }

      expect(raced).toBe(true);
      expect(
        JSON.parse(window.localStorage.getItem('redTeamConfig')!).state.config.target.config,
      ).toEqual({ sandbox_mode: 'danger-full-access' });
      expect(tabValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
      expect(tabValidation.getState().targetConfigDraft).toBe('{"sandbox_mode":"read-only",}');
      expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toMatch(
        /^invalid-json:[a-z0-9-]+$/,
      );
    } finally {
      restoreBrowserMocks();
    }
  });

  it.each([
    ['valid full import', 1],
    ['reset', 1],
    ['structured target update', 1],
    ['description recovery update', 2],
    ['plugins recovery update', 2],
    ['application-definition recovery update', 2],
    ['provider-type recovery update', 2],
  ] as const)('does not authenticate a target overwritten on the clear-time read during a %s', (update, clearRead) => {
    const staleTarget = {
      id: 'openinterpreter',
      label: 'Stale coding target',
      config: { sandbox_mode: 'danger-full-access' },
    };
    const usesNonObjectRecovery = update !== 'valid full import' && update !== 'reset';
    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: usesNonObjectRecovery
        ? {
            id: 'openai:gpt-5',
            label: 'Foundation target',
            config: null as unknown as Config['target']['config'],
          }
        : staleTarget,
    });
    if (!usesNonObjectRecovery) {
      useRedTeamTargetConfigValidation
        .getState()
        .setTargetConfigDraft('{"sandbox_mode":"read-only",}');
      useRedTeamTargetConfigValidation
        .getState()
        .setTargetConfigError('Invalid JSON configuration');
    }
    const originalSetItem = Storage.prototype.setItem;
    if (usesNonObjectRecovery && update !== 'structured target update') {
      const quotaSetItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
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
          useRedTeamConfig.getState().updateConfig('target', {
            ...useRedTeamConfig.getState().config.target,
            config: { temperature: 0.3 },
          }),
        ).toThrow('The quota has been exceeded.');
      } finally {
        quotaSetItem.mockRestore();
      }
    }
    const invalidMarker = window.localStorage.getItem('redTeamTargetConfigValidation');
    const originalGetItem = Storage.prototype.getItem;
    let targetReads = 0;
    let raced = false;
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      const result = originalGetItem.call(this, key);
      if (this === window.localStorage && key === 'redTeamConfig' && ++targetReads === clearRead) {
        raced = true;
        const overwrittenConfig = JSON.parse(result!);
        overwrittenConfig.state.config.target = staleTarget;
        originalSetItem.call(this, key, JSON.stringify(overwrittenConfig));
        return originalGetItem.call(this, key);
      }
      return result;
    });
    try {
      switch (update) {
        case 'valid full import':
          useRedTeamConfig.getState().setFullConfig({
            ...useRedTeamConfig.getState().config,
            target: {
              ...staleTarget,
              config: { sandbox_mode: 'read-only' },
            },
          });
          break;
        case 'reset':
          useRedTeamConfig.getState().resetConfig();
          break;
        case 'structured target update':
          useRedTeamConfig.getState().updateConfig('target', {
            ...useRedTeamConfig.getState().config.target,
            config: { temperature: 0.4 },
          });
          break;
        case 'description recovery update':
          useRedTeamConfig.getState().updateConfig('description', 'retry after freeing storage');
          break;
        case 'plugins recovery update':
          useRedTeamConfig.getState().updatePlugins(['harmful:privacy']);
          break;
        case 'application-definition recovery update':
          useRedTeamConfig
            .getState()
            .updateApplicationDefinition('purpose', 'retry after freeing storage');
          break;
        case 'provider-type recovery update':
          useRedTeamConfig.getState().setProviderType('openai');
          break;
      }
    } finally {
      getItem.mockRestore();
    }

    expect(raced).toBe(true);
    expect(
      JSON.parse(window.localStorage.getItem('redTeamConfig')!).state.config.target.config,
    ).toEqual({ sandbox_mode: 'danger-full-access' });
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      usesNonObjectRecovery ? 'Configuration must be a JSON object' : 'Invalid JSON configuration',
    );
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe(
      usesNonObjectRecovery ? 'null' : '{"sandbox_mode":"read-only",}',
    );
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(invalidMarker);
  });

  it.each([
    ['storage', 3],
    ['broadcast', 2],
  ] as const)('does not authenticate a target overwritten on the clear-time read while a %s clear reconciles', async (delivery, clearRead) => {
    const peers = new Set<MockBroadcastChannel>();
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
      const staleTarget = {
        id: 'openinterpreter',
        label: 'Coding target',
        config: { sandbox_mode: 'danger-full-access' },
      };
      tabConfig.getState().setFullConfig({
        ...tabConfig.getState().config,
        target: staleTarget,
      });
      tabValidation.getState().setTargetConfigDraft('{"sandbox_mode":"read-only",}');
      tabValidation.getState().setTargetConfigError('Invalid JSON configuration');
      const persistedConfig = JSON.parse(window.localStorage.getItem('redTeamConfig')!);
      persistedConfig.state.config.target = {
        ...staleTarget,
        config: { sandbox_mode: 'read-only' },
      };
      window.localStorage.setItem('redTeamConfig', JSON.stringify(persistedConfig));
      tabValidation.getState().clearTargetConfigValidation();
      const clearMarker = window.localStorage.getItem('redTeamTargetConfigValidation');
      tabValidation.setState({
        targetConfigError: 'Invalid JSON configuration',
        targetConfigDraft: '{"sandbox_mode":"read-only",}',
      });
      const originalSetItem = Storage.prototype.setItem;
      const originalGetItem = Storage.prototype.getItem;
      let targetReads = 0;
      let raced = false;
      const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (
        this: Storage,
        key: string,
      ) {
        const result = originalGetItem.call(this, key);
        if (
          this === window.localStorage &&
          key === 'redTeamConfig' &&
          ++targetReads === clearRead
        ) {
          raced = true;
          const overwrittenConfig = JSON.parse(result!);
          overwrittenConfig.state.config.target = staleTarget;
          originalSetItem.call(this, key, JSON.stringify(overwrittenConfig));
          return originalGetItem.call(this, key);
        }
        return result;
      });
      try {
        if (delivery === 'storage') {
          dispatchStorageEvent('redTeamTargetConfigValidation', clearMarker);
        } else {
          new MockBroadcastChannel('redTeamTargetConfigValidation').postMessage(clearMarker);
        }
      } finally {
        getItem.mockRestore();
      }

      expect(raced).toBe(true);
      expect(
        JSON.parse(window.localStorage.getItem('redTeamConfig')!).state.config.target.config,
      ).toEqual({ sandbox_mode: 'danger-full-access' });
      expect(tabValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
      expect(tabValidation.getState().targetConfigDraft).toBe('{"sandbox_mode":"read-only",}');
      expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toMatch(
        /^invalid-json:[a-z0-9-]+$/,
      );
    } finally {
      restoreBrowserMocks();
    }
  });

  it('refuses to clear an invalid target when the expected corrected target is not durable', () => {
    const staleTarget = {
      id: 'openinterpreter',
      label: 'Coding target',
      config: { sandbox_mode: 'danger-full-access' },
    };
    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: staleTarget,
    });
    useRedTeamTargetConfigValidation
      .getState()
      .setTargetConfigDraft('{"sandbox_mode":"read-only",}');
    useRedTeamTargetConfigValidation.getState().setTargetConfigError('Invalid JSON configuration');
    const invalidMarker = window.localStorage.getItem('redTeamTargetConfigValidation');

    expect(
      useRedTeamTargetConfigValidation.getState().clearTargetConfigValidation(
        JSON.stringify({
          ...staleTarget,
          config: { sandbox_mode: 'read-only' },
        }),
      ),
    ).toBe(false);
    useRedTeamTargetConfigValidation.getState().setTargetConfigError(null);

    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Invalid JSON configuration',
    );
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe(
      '{"sandbox_mode":"read-only",}',
    );
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(invalidMarker);
  });

  it.each([
    'local',
    'quota-fallback',
  ] as const)('refuses to clear an invalid target when the persisted target changes during a %s clear write', (storage) => {
    const staleTarget = {
      id: 'openinterpreter',
      label: 'Coding target',
      config: { sandbox_mode: 'danger-full-access' },
    };
    const correctedTarget = {
      ...staleTarget,
      config: { sandbox_mode: 'read-only' },
    };
    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: staleTarget,
    });
    useRedTeamTargetConfigValidation
      .getState()
      .replaceTargetConfigValidation('Invalid JSON configuration', '{"sandbox_mode":"read-only",}');
    const invalidMarker = window.localStorage.getItem('redTeamTargetConfigValidation');

    const originalSetItem = Storage.prototype.setItem;
    const persistedConfig = JSON.parse(window.localStorage.getItem('redTeamConfig')!);
    persistedConfig.state.config.target = correctedTarget;
    originalSetItem.call(window.localStorage, 'redTeamConfig', JSON.stringify(persistedConfig));

    let raced = false;
    let activeMarkerDuringWrite: string | null = null;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (
        storage === 'quota-fallback' &&
        this === window.localStorage &&
        key === 'redTeamTargetConfigValidation'
      ) {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      }
      if (
        !raced &&
        this === (storage === 'local' ? window.localStorage : window.sessionStorage) &&
        key === 'redTeamTargetConfigValidation' &&
        value.startsWith('clear:')
      ) {
        raced = true;
        activeMarkerDuringWrite = getCurrentTargetConfigInvalidMarker();
        const overwrittenConfig = JSON.parse(window.localStorage.getItem('redTeamConfig')!);
        overwrittenConfig.state.config.target = staleTarget;
        originalSetItem.call(
          window.localStorage,
          'redTeamConfig',
          JSON.stringify(overwrittenConfig),
        );
      }
      return originalSetItem.call(this, key, value);
    });

    let cleared: boolean;
    try {
      cleared = useRedTeamTargetConfigValidation
        .getState()
        .clearTargetConfigValidation(JSON.stringify(correctedTarget));
    } finally {
      setItem.mockRestore();
    }

    expect(raced).toBe(true);
    expect(activeMarkerDuringWrite).toBe(invalidMarker);
    expect(cleared).toBe(false);
    expect(
      JSON.parse(window.localStorage.getItem('redTeamConfig')!).state.config.target.config,
    ).toEqual({ sandbox_mode: 'danger-full-access' });
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Invalid JSON configuration',
    );
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe(
      '{"sandbox_mode":"read-only",}',
    );
    expect(
      storage === 'local'
        ? window.localStorage.getItem('redTeamTargetConfigValidation')
        : window.sessionStorage.getItem('redTeamTargetConfigValidation'),
    ).toMatch(/^invalid-json:[a-z0-9-]+$/);
  });

  it('does not clear a newer raw non-object draft when a structured replacement persists after quota recovers', () => {
    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: {
        id: 'openai:gpt-5',
        label: 'Foundation target',
        config: null as unknown as Config['target']['config'],
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
        useRedTeamConfig.getState().updateConfig('target', {
          ...useRedTeamConfig.getState().config.target,
          config: { temperature: 0.3 },
        }),
      ).toThrow('The quota has been exceeded.');
    } finally {
      setItem.mockRestore();
    }
    useRedTeamTargetConfigValidation.getState().setTargetConfigDraft('[]');
    const newerInvalidMarker = window.localStorage.getItem('redTeamTargetConfigValidation');

    useRedTeamConfig.getState().updateConfig('target', {
      ...useRedTeamConfig.getState().config.target,
      config: { temperature: 0.4 },
    });

    expect(
      JSON.parse(window.localStorage.getItem('redTeamConfig')!).state.config.target.config,
    ).toEqual({ temperature: 0.4 });
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Configuration must be a JSON object',
    );
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe('[]');
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(newerInvalidMarker);
  });

  it('does not clear a raw non-object draft when a structured edit updates an already-plain persisted target', () => {
    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: {
        id: 'openai:gpt-5',
        label: 'Foundation target',
        config: { temperature: 0.3 },
      },
    });
    useRedTeamTargetConfigValidation.getState().setTargetConfigDraft('[]');
    useRedTeamTargetConfigValidation
      .getState()
      .setTargetConfigError('Configuration must be a JSON object');
    const invalidMarker = window.localStorage.getItem('redTeamTargetConfigValidation');

    useRedTeamConfig.getState().updateConfig('target', {
      ...useRedTeamConfig.getState().config.target,
      config: { temperature: 0.4 },
    });

    expect(
      JSON.parse(window.localStorage.getItem('redTeamConfig')!).state.config.target.config,
    ).toEqual({ temperature: 0.4 });
    expect(useRedTeamTargetConfigValidation.getState().targetConfigError).toBe(
      'Configuration must be a JSON object',
    );
    expect(useRedTeamTargetConfigValidation.getState().targetConfigDraft).toBe('[]');
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(invalidMarker);
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

  it('does not let a delayed storage clear erase a newer malformed draft', async () => {
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
    dispatchStorageEvent('redTeamTargetConfigValidation', oldClear);

    expect(tabValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
    expect(tabValidation.getState().targetConfigDraft).toBe('{"sandbox_mode":"read-only",}');
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toMatch(
      /^invalid-json:[a-z0-9-]+$/,
    );
    expect(tabConfig.getState().config.target.config.sandbox_mode).toBe('danger-full-access');
  });

  it.each([
    ['matching', false],
    ['mismatched', true],
  ])('restores a newer invalid marker when a %s stale storage clear actually overwrites local storage', async (_case, changePersistedTarget) => {
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
    tabValidation.getState().setTargetConfigDraft('{"sandbox_mode":"read-only",}');
    tabValidation.getState().setTargetConfigError('Invalid JSON configuration');
    const firstInvalid = window.localStorage.getItem('redTeamTargetConfigValidation');
    expect(firstInvalid).toMatch(/^invalid-json:[a-z0-9-]+$/);

    tabValidation.getState().clearTargetConfigValidation();
    const oldClear = window.localStorage.getItem('redTeamTargetConfigValidation');
    expect(oldClear).toMatch(/^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/);
    tabValidation.getState().setTargetConfigDraft('{"sandbox_mode":"danger-full-access",}');
    tabValidation.getState().setTargetConfigError('Invalid JSON configuration');
    const secondInvalid = window.localStorage.getItem('redTeamTargetConfigValidation');
    expect(secondInvalid).toMatch(/^invalid-json:[a-z0-9-]+$/);
    expect(secondInvalid).not.toBe(firstInvalid);

    if (changePersistedTarget) {
      const persistedConfig = JSON.parse(window.localStorage.getItem('redTeamConfig')!);
      persistedConfig.state.config.target.config.sandbox_mode = 'read-only';
      window.localStorage.setItem('redTeamConfig', JSON.stringify(persistedConfig));
    }

    window.localStorage.setItem('redTeamTargetConfigValidation', oldClear!);
    dispatchStorageEvent('redTeamTargetConfigValidation', oldClear);

    expect(tabValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
    expect(tabValidation.getState().targetConfigDraft).toBe(
      '{"sandbox_mode":"danger-full-access",}',
    );
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(secondInvalid);

    vi.resetModules();
    const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
      './useRedTeamTargetConfigValidation'
    );
    expect(reloadedValidation.getState().targetConfigError).toBe('Invalid JSON configuration');

    window.localStorage.setItem('redTeamTargetConfigValidation', oldClear!);
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
      dispatchStorageEvent('redTeamTargetConfigValidation', oldClear);
      expect(window.sessionStorage.getItem('redTeamTargetConfigValidation')).toBe(secondInvalid);
      vi.resetModules();
      const { useRedTeamTargetConfigValidation: quotaReloadedValidation } = await import(
        './useRedTeamTargetConfigValidation'
      );
      expect(quotaReloadedValidation.getState().targetConfigError).toBe(
        'Invalid JSON configuration',
      );
    } finally {
      setItem.mockRestore();
    }
  });

  it.each([
    ['deletion', null],
    ['non-marker', 'corrupt'],
  ])('restores a newer invalid marker when a queued %s storage event follows a stale clear overwrite', async (_case, queuedValue) => {
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
    tabValidation.getState().setTargetConfigDraft('{"sandbox_mode":"read-only",}');
    tabValidation.getState().setTargetConfigError('Invalid JSON configuration');
    tabValidation.getState().clearTargetConfigValidation();
    const oldClear = window.localStorage.getItem('redTeamTargetConfigValidation');
    expect(oldClear).toMatch(/^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/);
    tabValidation.getState().setTargetConfigDraft('{"sandbox_mode":"danger-full-access",}');
    tabValidation.getState().setTargetConfigError('Invalid JSON configuration');
    const secondInvalid = window.localStorage.getItem('redTeamTargetConfigValidation');
    expect(secondInvalid).toMatch(/^invalid-json:[a-z0-9-]+$/);
    window.localStorage.setItem('redTeamTargetConfigValidation', oldClear!);

    dispatchStorageEvent('redTeamTargetConfigValidation', queuedValue);

    expect(tabValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
    expect(tabValidation.getState().targetConfigDraft).toBe(
      '{"sandbox_mode":"danger-full-access",}',
    );
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(secondInvalid);
    vi.resetModules();
    const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
      './useRedTeamTargetConfigValidation'
    );
    expect(reloadedValidation.getState().targetConfigError).toBe('Invalid JSON configuration');

    window.localStorage.setItem('redTeamTargetConfigValidation', oldClear!);
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
      dispatchStorageEvent('redTeamTargetConfigValidation', queuedValue);
      expect(window.sessionStorage.getItem('redTeamTargetConfigValidation')).toBe(secondInvalid);
      vi.resetModules();
      const { useRedTeamTargetConfigValidation: quotaReloadedValidation } = await import(
        './useRedTeamTargetConfigValidation'
      );
      expect(quotaReloadedValidation.getState().targetConfigError).toBe(
        'Invalid JSON configuration',
      );
    } finally {
      setItem.mockRestore();
    }
  });

  it.each([
    ['tokened malformed', 'invalid-json:i1-delayed-token', 'Invalid JSON configuration'],
    ['legacy malformed', 'invalid-json', 'Invalid JSON configuration'],
    ['legacy non-object', 'non-object-json', 'Configuration must be a JSON object'],
  ])('restores a queued %s storage marker when a clean tab has already written clear:none', async (_case, queuedInvalid, expectedError) => {
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
    const cleanClear = window.localStorage.getItem('redTeamTargetConfigValidation');
    expect(cleanClear).toMatch(/^clear:none:[a-z0-9]+:[a-f0-9]{64}$/);
    dispatchStorageEvent('redTeamTargetConfigValidation', queuedInvalid);

    expect(tabValidation.getState().targetConfigError).toBe(expectedError);
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(queuedInvalid);
    vi.resetModules();
    const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
      './useRedTeamTargetConfigValidation'
    );
    expect(reloadedValidation.getState().targetConfigError).toBe(expectedError);
  });

  it('restores a queued invalid storage marker when the local clear fingerprint no longer matches the persisted target', async () => {
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
    expect(oldClear).toMatch(/^clear:none:[a-z0-9]+:[a-f0-9]{64}$/);
    const persistedConfig = JSON.parse(window.localStorage.getItem('redTeamConfig')!);
    persistedConfig.state.config.target.config.sandbox_mode = 'read-only';
    window.localStorage.setItem('redTeamConfig', JSON.stringify(persistedConfig));
    const queuedInvalid = 'invalid-json:i1-delayed-token';

    dispatchStorageEvent('redTeamTargetConfigValidation', queuedInvalid);

    expect(tabValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(queuedInvalid);
    vi.resetModules();
    const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
      './useRedTeamTargetConfigValidation'
    );
    expect(reloadedValidation.getState().targetConfigError).toBe('Invalid JSON configuration');

    window.localStorage.setItem('redTeamTargetConfigValidation', oldClear!);
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
      dispatchStorageEvent('redTeamTargetConfigValidation', queuedInvalid);
      expect(window.sessionStorage.getItem('redTeamTargetConfigValidation')).toBe(queuedInvalid);
      vi.resetModules();
      const { useRedTeamTargetConfigValidation: quotaReloadedValidation } = await import(
        './useRedTeamTargetConfigValidation'
      );
      expect(quotaReloadedValidation.getState().targetConfigError).toBe(
        'Invalid JSON configuration',
      );
    } finally {
      setItem.mockRestore();
    }
  });

  it('restores a token-matched invalid storage marker when the config reconciler is not registered yet', async () => {
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
    tabValidation.getState().setTargetConfigDraft('{"sandbox_mode":"read-only",}');
    tabValidation.getState().setTargetConfigError('Invalid JSON configuration');
    const matchedInvalid = window.localStorage.getItem('redTeamTargetConfigValidation');
    expect(matchedInvalid).toMatch(/^invalid-json:[a-z0-9-]+$/);
    tabValidation.getState().clearTargetConfigValidation();
    const matchedClear = window.localStorage.getItem('redTeamTargetConfigValidation');
    expect(matchedClear).toMatch(/^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/);

    vi.resetModules();
    const { useRedTeamTargetConfigValidation: validationWithoutReconciler } = await import(
      './useRedTeamTargetConfigValidation'
    );
    expect(validationWithoutReconciler.getState().targetConfigError).toBeNull();

    dispatchStorageEvent('redTeamTargetConfigValidation', matchedInvalid);

    expect(validationWithoutReconciler.getState().targetConfigError).toBe(
      'Invalid JSON configuration',
    );
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(matchedInvalid);
    vi.resetModules();
    const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
      './useRedTeamTargetConfigValidation'
    );
    expect(reloadedValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
  });

  it('restores a token-matched broadcast invalid marker when the config reconciler is not registered yet', async () => {
    const peers = new Set<MockBroadcastChannel>();
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
      postMessage(_data: unknown) {}
      emit(data: unknown) {
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
      tabValidation.getState().setTargetConfigDraft('{"sandbox_mode":"read-only",}');
      tabValidation.getState().setTargetConfigError('Invalid JSON configuration');
      const matchedInvalid = window.localStorage.getItem('redTeamTargetConfigValidation');
      expect(matchedInvalid).toMatch(/^invalid-json:[a-z0-9-]+$/);
      tabValidation.getState().clearTargetConfigValidation();
      const matchedClear = window.localStorage.getItem('redTeamTargetConfigValidation');
      expect(matchedClear).toMatch(/^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/);

      vi.resetModules();
      const { useRedTeamTargetConfigValidation: validationWithoutReconciler } = await import(
        './useRedTeamTargetConfigValidation'
      );
      expect(validationWithoutReconciler.getState().targetConfigError).toBeNull();

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
        new MockBroadcastChannel('redTeamTargetConfigValidation').emit(matchedInvalid);

        expect(validationWithoutReconciler.getState().targetConfigError).toBe(
          'Invalid JSON configuration',
        );
        expect(window.sessionStorage.getItem('redTeamTargetConfigValidation')).toBe(matchedInvalid);
        vi.resetModules();
        const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
          './useRedTeamTargetConfigValidation'
        );
        expect(reloadedValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
      } finally {
        setItem.mockRestore();
      }
    } finally {
      restoreBrowserMocks();
      useRedTeamTargetConfigValidation.getState().clearTargetConfigValidation();
    }
  });

  it.each([
    ['legacy malformed', 'invalid-json', 'Invalid JSON configuration'],
    ['legacy non-object', 'non-object-json', 'Configuration must be a JSON object'],
  ])('keeps a queued %s marker blocked across clear:legacy and reload', async (_case, marker, error) => {
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
    window.localStorage.setItem('redTeamTargetConfigValidation', 'invalid-json');
    dispatchStorageEvent('redTeamTargetConfigValidation', 'invalid-json');
    tabValidation.getState().clearTargetConfigValidation();
    const legacyClear = window.localStorage.getItem('redTeamTargetConfigValidation');
    expect(legacyClear).toMatch(/^clear:legacy:[a-z0-9]+:[a-f0-9]{64}$/);

    dispatchStorageEvent('redTeamTargetConfigValidation', marker);
    expect(tabValidation.getState().targetConfigError).toBe(error);
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(marker);

    window.localStorage.setItem('redTeamTargetConfigValidation', legacyClear!);
    dispatchStorageEvent('redTeamTargetConfigValidation', legacyClear);

    expect(tabValidation.getState().targetConfigError).toBe(error);
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(marker);
    vi.resetModules();
    const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
      './useRedTeamTargetConfigValidation'
    );
    expect(reloadedValidation.getState().targetConfigError).toBe(error);
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

  it('restores a newer invalid marker when a stale broadcast clear has already overwritten local storage', async () => {
    const peers = new Set<MockBroadcastChannel>();
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
      postMessage(_data: unknown) {}
      emit(data: unknown) {
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
      tabValidation.getState().setTargetConfigDraft('{"sandbox_mode":"read-only",}');
      tabValidation.getState().setTargetConfigError('Invalid JSON configuration');
      tabValidation.getState().clearTargetConfigValidation();
      const oldClear = window.localStorage.getItem('redTeamTargetConfigValidation');
      expect(oldClear).toMatch(/^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/);
      tabValidation.getState().setTargetConfigDraft('{"sandbox_mode":"danger-full-access",}');
      tabValidation.getState().setTargetConfigError('Invalid JSON configuration');
      const secondInvalid = window.localStorage.getItem('redTeamTargetConfigValidation');
      expect(secondInvalid).toMatch(/^invalid-json:[a-z0-9-]+$/);
      window.localStorage.setItem('redTeamTargetConfigValidation', oldClear!);

      new MockBroadcastChannel('redTeamTargetConfigValidation').emit(oldClear);

      expect(tabValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
      expect(tabValidation.getState().targetConfigDraft).toBe(
        '{"sandbox_mode":"danger-full-access",}',
      );
      expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(secondInvalid);
      vi.resetModules();
      const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
        './useRedTeamTargetConfigValidation'
      );
      expect(reloadedValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
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

      senderValidation.getState().clearTargetConfigValidation();

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
      expect(staleTabValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
      expect(staleTabValidation.getState().targetConfigDraft).toBeNull();

      staleTabConfig.getState().setFullConfig(persistedConfig.state.config);

      expect(staleTabValidation.getState().targetConfigError).toBeNull();
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

  it('ignores a delayed invalid broadcast whose token has already been cleared', async () => {
    const peers = new Set<MockBroadcastChannel>();
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
      postMessage(_data: unknown) {}
      emit(data: unknown) {
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
      tabValidation.getState().setTargetConfigDraft('{"sandbox_mode":"read-only",}');
      tabValidation.getState().setTargetConfigError('Invalid JSON configuration');
      const oldInvalid = window.localStorage.getItem('redTeamTargetConfigValidation');
      expect(oldInvalid).toMatch(/^invalid-json:[a-z0-9-]+$/);

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
      expect(tabValidation.getState().targetConfigError).toBeNull();

      new MockBroadcastChannel('redTeamTargetConfigValidation').emit(oldInvalid);

      expect(tabValidation.getState().targetConfigError).toBeNull();
      expect(tabValidation.getState().targetConfigDraft).toBeNull();
      expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(clearMarker);
    } finally {
      restoreBrowserMocks();
      useRedTeamTargetConfigValidation.getState().clearTargetConfigValidation();
    }
  });

  it('keeps a token-matched broadcast invalid marker blocked when a quota-fallback tab reloads before its reconciler', async () => {
    const peers = new Set<MockBroadcastChannel>();
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
      postMessage(_data: unknown) {}
      emit(data: unknown) {
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
      tabValidation.getState().setTargetConfigDraft('{"sandbox_mode":"read-only",}');
      tabValidation.getState().setTargetConfigError('Invalid JSON configuration');
      const oldInvalid = window.sessionStorage.getItem('redTeamTargetConfigValidation');
      expect(oldInvalid).toMatch(/^invalid-json:[a-z0-9-]+$/);

      tabConfig.getState().setFullConfig({
        ...tabConfig.getState().config,
        target: {
          id: 'openinterpreter',
          label: 'Coding target',
          config: { sandbox_mode: 'read-only' },
        },
      });
      const clearMarker = window.sessionStorage.getItem('redTeamTargetConfigValidation');
      expect(clearMarker).toMatch(/^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/);

      vi.resetModules();
      const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
        './useRedTeamTargetConfigValidation'
      );
      expect(reloadedValidation.getState().targetConfigError).toBeNull();

      new MockBroadcastChannel('redTeamTargetConfigValidation').emit(oldInvalid);

      expect(reloadedValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
      expect(window.sessionStorage.getItem('redTeamTargetConfigValidation')).toBe(oldInvalid);
      vi.resetModules();
      const { useRedTeamTargetConfigValidation: blockedValidation } = await import(
        './useRedTeamTargetConfigValidation'
      );
      expect(blockedValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
    } finally {
      setItem.mockRestore();
      restoreBrowserMocks();
      useRedTeamTargetConfigValidation.getState().clearTargetConfigValidation();
    }
  });

  it('does not consume an invalid token when a stale clear no longer matches the persisted target', async () => {
    const peers = new Set<MockBroadcastChannel>();
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
      postMessage(_data: unknown) {}
      emit(data: unknown) {
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
      tabValidation.getState().setTargetConfigDraft('{"sandbox_mode":"read-only",}');
      tabValidation.getState().setTargetConfigError('Invalid JSON configuration');
      const oldInvalid = window.localStorage.getItem('redTeamTargetConfigValidation');
      expect(oldInvalid).toMatch(/^invalid-json:[a-z0-9-]+$/);
      tabConfig.getState().setFullConfig({
        ...tabConfig.getState().config,
        target: {
          id: 'openinterpreter',
          label: 'Coding target',
          config: { sandbox_mode: 'read-only' },
        },
      });
      const staleClear = window.localStorage.getItem('redTeamTargetConfigValidation');
      expect(staleClear).toMatch(/^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/);
      const persistedConfig = JSON.parse(window.localStorage.getItem('redTeamConfig')!);
      persistedConfig.state.config.target.config.sandbox_mode = 'danger-full-access';
      window.localStorage.setItem('redTeamConfig', JSON.stringify(persistedConfig));

      new MockBroadcastChannel('redTeamTargetConfigValidation').emit(oldInvalid);

      expect(tabValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
      expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(oldInvalid);
      window.localStorage.setItem('redTeamTargetConfigValidation', staleClear!);

      vi.resetModules();
      const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
        './useRedTeamTargetConfigValidation'
      );
      expect(reloadedValidation.getState().targetConfigError).toBeNull();

      new MockBroadcastChannel('redTeamTargetConfigValidation').emit(oldInvalid);

      expect(reloadedValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
      expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(oldInvalid);

      const unsafePersistedConfig = JSON.parse(window.localStorage.getItem('redTeamConfig')!);
      unsafePersistedConfig.state.config.target.config = null;
      window.localStorage.setItem('redTeamConfig', JSON.stringify(unsafePersistedConfig));
      reloadedValidation.getState().clearTargetConfigValidation();
      expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBeNull();

      new MockBroadcastChannel('redTeamTargetConfigValidation').emit(oldInvalid);

      expect(reloadedValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
      expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(oldInvalid);
    } finally {
      restoreBrowserMocks();
      useRedTeamTargetConfigValidation.getState().clearTargetConfigValidation();
    }
  });

  it.each([
    'session',
    'cookie',
  ] as const)('does not restore a stale local invalid marker when an authenticated %s clear consumed its token', async (fallback) => {
    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: {
        id: 'openai:gpt-5',
        label: 'Foundation target',
        config: { temperature: 0.3 },
      },
    });
    useRedTeamTargetConfigValidation.getState().setTargetConfigDraft('{"temperature":,}');
    useRedTeamTargetConfigValidation.getState().setTargetConfigError('Invalid JSON configuration');
    const invalidMarker = window.localStorage.getItem('redTeamTargetConfigValidation');
    expect(invalidMarker).toMatch(/^invalid-json:[a-z0-9-]+$/);
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
      useRedTeamTargetConfigValidation.getState().clearTargetConfigValidation();
      expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(invalidMarker);
      const fallbackClear = window.sessionStorage.getItem('redTeamTargetConfigValidation');
      expect(fallbackClear).toMatch(/^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/);
      expect(fallbackClear?.split(':')[1]).toBe(invalidMarker?.split(':')[1]);
    } finally {
      setItem.mockRestore();
    }
    if (fallback === 'cookie') {
      window.sessionStorage.removeItem('redTeamTargetConfigValidation');
    }

    vi.resetModules();
    const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
      './useRedTeamTargetConfigValidation'
    );
    expect(reloadedValidation.getState().targetConfigError).toBeNull();
  });

  it.each([
    ['newer session invalid', 'session-invalid'],
    ['newer cookie invalid', 'cookie-invalid'],
    ['mismatched fallback clear token', 'mismatched-clear'],
    ['mismatched fallback clear fingerprint', 'mismatched-fingerprint'],
    ['legacy local invalid', 'legacy-invalid'],
  ] as const)('keeps a %s blocked when local storage still contains an older invalid marker', async (_case, interference) => {
    useRedTeamConfig.getState().setFullConfig({
      ...useRedTeamConfig.getState().config,
      target: {
        id: 'openai:gpt-5',
        label: 'Foundation target',
        config: { temperature: 0.3 },
      },
    });
    useRedTeamTargetConfigValidation.getState().setTargetConfigDraft('{"temperature":,}');
    useRedTeamTargetConfigValidation.getState().setTargetConfigError('Invalid JSON configuration');
    const oldInvalid = window.localStorage.getItem('redTeamTargetConfigValidation');
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
      useRedTeamTargetConfigValidation.getState().clearTargetConfigValidation();
    } finally {
      setItem.mockRestore();
    }
    const fallbackClear = window.sessionStorage.getItem('redTeamTargetConfigValidation')!;
    expect(fallbackClear).toMatch(/^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/);
    const newerInvalid = 'invalid-json:newer-tab-token';
    let expectedLocalInvalid = oldInvalid;
    if (interference === 'session-invalid') {
      window.sessionStorage.setItem('redTeamTargetConfigValidation', newerInvalid);
    } else if (interference === 'cookie-invalid') {
      document.cookie = `redTeamTargetConfigValidation=${newerInvalid}; Path=/; SameSite=Lax`;
    } else if (interference === 'mismatched-clear') {
      window.sessionStorage.setItem(
        'redTeamTargetConfigValidation',
        fallbackClear.replace(/^clear:[a-z0-9-]+:/, 'clear:other-tab-token:'),
      );
      document.cookie = `redTeamTargetConfigValidation=${fallbackClear.replace(/^clear:[a-z0-9-]+:/, 'clear:other-tab-token:')}; Path=/; SameSite=Lax`;
    } else if (interference === 'mismatched-fingerprint') {
      const corruptedClear = `${fallbackClear.slice(0, -1)}${fallbackClear.endsWith('0') ? '1' : '0'}`;
      window.sessionStorage.setItem('redTeamTargetConfigValidation', corruptedClear);
      document.cookie = `redTeamTargetConfigValidation=${corruptedClear}; Path=/; SameSite=Lax`;
    } else {
      expectedLocalInvalid = 'invalid-json';
      window.localStorage.setItem('redTeamTargetConfigValidation', expectedLocalInvalid);
      const legacyClear = fallbackClear.replace(/^clear:[a-z0-9-]+:/, 'clear:legacy:');
      window.sessionStorage.setItem('redTeamTargetConfigValidation', legacyClear);
      document.cookie = `redTeamTargetConfigValidation=${legacyClear}; Path=/; SameSite=Lax`;
    }

    vi.resetModules();
    const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
      './useRedTeamTargetConfigValidation'
    );

    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(expectedLocalInvalid);
    expect(reloadedValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
  });

  it('does not clear a newer quota-fallback draft on a queued older invalid event', async () => {
    vi.resetModules();
    const { useRedTeamConfig: tabConfig } = await import('./useRedTeamConfig');
    const { useRedTeamTargetConfigValidation: tabValidation } = await import(
      './useRedTeamTargetConfigValidation'
    );
    tabConfig.getState().setFullConfig({
      ...tabConfig.getState().config,
      target: {
        id: 'openai:gpt-5',
        label: 'Foundation target',
        config: { temperature: 0.3 },
      },
    });
    tabValidation.getState().setTargetConfigDraft('{"temperature":,}');
    tabValidation.getState().setTargetConfigError('Invalid JSON configuration');
    const olderInvalid = window.localStorage.getItem('redTeamTargetConfigValidation');
    expect(olderInvalid).toMatch(/^invalid-json:[a-z0-9-]+$/);
    tabValidation.getState().clearTargetConfigValidation();
    const olderClear = window.localStorage.getItem('redTeamTargetConfigValidation');
    expect(olderClear).toMatch(/^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/);
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
      tabValidation.getState().setTargetConfigDraft('{"temperature":"newer",}');
      tabValidation.getState().setTargetConfigError('Invalid JSON configuration');
      const newerInvalid = window.sessionStorage.getItem('redTeamTargetConfigValidation');
      expect(newerInvalid).toMatch(/^invalid-json:[a-z0-9-]+$/);
      expect(newerInvalid).not.toBe(olderInvalid);
      expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(olderClear);

      dispatchStorageEvent('redTeamTargetConfigValidation', olderInvalid);

      expect(tabValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
      expect(tabValidation.getState().targetConfigDraft).toBe('{"temperature":"newer",}');
      expect(window.sessionStorage.getItem('redTeamTargetConfigValidation')).toBe(newerInvalid);
      vi.resetModules();
      const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
        './useRedTeamTargetConfigValidation'
      );
      expect(reloadedValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
    } finally {
      setItem.mockRestore();
    }
  });

  it('does not clear a newer quota-fallback draft on a queued older broadcast invalid event', async () => {
    const peers = new Set<MockBroadcastChannel>();
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
          id: 'openai:gpt-5',
          label: 'Foundation target',
          config: { temperature: 0.3 },
        },
      });
      tabValidation.getState().setTargetConfigDraft('{"temperature":,}');
      tabValidation.getState().setTargetConfigError('Invalid JSON configuration');
      const olderInvalid = window.localStorage.getItem('redTeamTargetConfigValidation');
      expect(olderInvalid).toMatch(/^invalid-json:[a-z0-9-]+$/);
      tabValidation.getState().clearTargetConfigValidation();
      const olderClear = window.localStorage.getItem('redTeamTargetConfigValidation');
      expect(olderClear).toMatch(/^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/);
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
        tabValidation.getState().setTargetConfigDraft('{"temperature":"newer",}');
        tabValidation.getState().setTargetConfigError('Invalid JSON configuration');
        const newerInvalid = window.sessionStorage.getItem('redTeamTargetConfigValidation');
        expect(newerInvalid).toMatch(/^invalid-json:[a-z0-9-]+$/);
        expect(newerInvalid).not.toBe(olderInvalid);
        expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe(olderClear);

        new MockBroadcastChannel('redTeamTargetConfigValidation').postMessage(olderInvalid);

        expect(tabValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
        expect(tabValidation.getState().targetConfigDraft).toBe('{"temperature":"newer",}');
        expect(window.sessionStorage.getItem('redTeamTargetConfigValidation')).toBe(newerInvalid);
        vi.resetModules();
        const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
          './useRedTeamTargetConfigValidation'
        );
        expect(reloadedValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
      } finally {
        setItem.mockRestore();
      }
    } finally {
      restoreBrowserMocks();
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
    const queuedInvalid = window.localStorage.getItem('redTeamTargetConfigValidation');
    expect(queuedInvalid).toMatch(/^invalid-json:[a-z0-9-]+$/);
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
    correctingTabListener(createStorageEvent('redTeamTargetConfigValidation', queuedInvalid));
    staleTabListener(createStorageEvent('redTeamTargetConfigValidation', queuedInvalid));
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
