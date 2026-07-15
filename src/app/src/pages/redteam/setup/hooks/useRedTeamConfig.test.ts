import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRedTeamConfig } from './useRedTeamConfig';
import { useRedTeamTargetConfigValidation } from './useRedTeamTargetConfigValidation';

import type { Config } from '../types';

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
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBeNull();
    expect(window.sessionStorage.getItem('redTeamTargetConfigValidation')).toBeNull();
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
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe('invalid-json');
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledWith('redTeamTargetConfigValidation', 'invalid-json');
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
    expect(window.localStorage.getItem('redTeamTargetConfigValidation')).toBe('invalid-json');

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
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      },
    });

    try {
      expect(() => {
        useRedTeamTargetConfigValidation
          .getState()
          .setTargetConfigError('Configuration must be a JSON object');
      }).not.toThrow();
      expect(window.sessionStorage.getItem('redTeamTargetConfigValidation')).toBe(
        'non-object-json',
      );

      vi.resetModules();
      const { useRedTeamTargetConfigValidation: reloadedValidation } = await import(
        './useRedTeamTargetConfigValidation'
      );
      expect(reloadedValidation.getState().targetConfigError).toBe(
        'Configuration must be a JSON object',
      );
    } finally {
      if (descriptor) {
        Object.defineProperty(window, 'localStorage', descriptor);
      }
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
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'redTeamTargetConfigValidation',
        newValue: 'invalid-json',
      }),
    );

    expect(existingTabValidation.getState().targetConfigError).toBe('Invalid JSON configuration');

    window.dispatchEvent(
      new StorageEvent('storage', { key: 'redTeamTargetConfigValidation', newValue: null }),
    );
    expect(existingTabValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
  });

  it('broadcasts a validation marker to an already-open tab when local storage is full', async () => {
    const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
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

    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      },
    });

    try {
      vi.resetModules();
      const { useRedTeamTargetConfigValidation: senderValidation } = await import(
        './useRedTeamTargetConfigValidation'
      );
      const existingTab = new MockBroadcastChannel('redTeamTargetConfigValidation');
      const received: unknown[] = [];
      existingTab.addEventListener('message', (event) => received.push(event.data));

      senderValidation.getState().setTargetConfigError('Invalid JSON configuration');

      expect(window.sessionStorage.getItem('redTeamTargetConfigValidation')).toBe('invalid-json');
      expect(received).toEqual(['invalid-json']);

      senderValidation.setState({ targetConfigError: null });
      window.sessionStorage.removeItem('redTeamTargetConfigValidation');
      existingTab.postMessage('invalid-json');
      expect(senderValidation.getState().targetConfigError).toBe('Invalid JSON configuration');
      expect(window.sessionStorage.getItem('redTeamTargetConfigValidation')).toBe('invalid-json');
      expect(received).toEqual(['invalid-json']);

      vi.resetModules();
      const { useRedTeamTargetConfigValidation: reloadedReceiverValidation } = await import(
        './useRedTeamTargetConfigValidation'
      );
      expect(reloadedReceiverValidation.getState().targetConfigError).toBe(
        'Invalid JSON configuration',
      );

      existingTab.postMessage(null);
      existingTab.postMessage('{"apiKey":"should-not-be-accepted"}');
      expect(reloadedReceiverValidation.getState().targetConfigError).toBe(
        'Invalid JSON configuration',
      );
      existingTab.close();
    } finally {
      vi.unstubAllGlobals();
      if (localStorageDescriptor) {
        Object.defineProperty(window, 'localStorage', localStorageDescriptor);
      }
      useRedTeamTargetConfigValidation.getState().clearTargetConfigValidation();
    }
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
