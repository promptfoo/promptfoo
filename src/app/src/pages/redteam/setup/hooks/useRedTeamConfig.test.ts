import { beforeEach, describe, expect, it } from 'vitest';
import { useRedTeamConfig } from './useRedTeamConfig';

import type { Config } from '../types';

describe('useRedTeamConfig', () => {
  beforeEach(() => {
    useRedTeamConfig.setState(useRedTeamConfig.getInitialState());
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
