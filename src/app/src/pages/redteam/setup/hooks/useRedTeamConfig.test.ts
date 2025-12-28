import { beforeEach, describe, expect, it } from 'vitest';
import { useRedTeamConfig } from './useRedTeamConfig';
import type { Config, ReconContext } from '../types';

describe('useRedTeamConfig', () => {
  beforeEach(() => {
    useRedTeamConfig.setState(useRedTeamConfig.getInitialState());
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

    it('should set reconContext when provided with setFullConfig', () => {
      const reconContext: ReconContext = {
        source: 'recon-cli',
        timestamp: Date.now(),
        codebaseDirectory: '/path/to/project',
        keyFilesAnalyzed: 150,
        fieldsPopulated: 12,
      };

      const newConfig: Config = {
        description: 'Recon-generated config',
        prompts: ['{{prompt}}'],
        target: {
          id: 'http',
          config: { url: 'http://localhost:3000' },
        },
        plugins: ['bola', 'bfla'],
        strategies: ['jailbreak'],
        purpose: 'Healthcare app',
        entities: [],
        numTests: 50,
        maxConcurrency: 10,
        applicationDefinition: {
          purpose: 'Healthcare patient portal',
          industry: 'Healthcare',
        },
      };

      useRedTeamConfig.getState().setFullConfig(newConfig, reconContext);

      const state = useRedTeamConfig.getState();
      expect(state.config).toEqual(newConfig);
      expect(state.reconContext).toEqual(reconContext);
    });

    it('should clear reconContext when setFullConfig is called without reconContext', () => {
      // First set a reconContext
      useRedTeamConfig.getState().setReconContext({
        source: 'recon-cli',
        timestamp: Date.now(),
      });

      expect(useRedTeamConfig.getState().reconContext).not.toBeNull();

      // Now call setFullConfig without reconContext
      const newConfig: Config = {
        description: 'Manual config',
        prompts: ['{{prompt}}'],
        target: { id: 'http', config: {} },
        plugins: [],
        strategies: ['basic'],
        purpose: '',
        entities: [],
        applicationDefinition: {},
      };

      useRedTeamConfig.getState().setFullConfig(newConfig);

      expect(useRedTeamConfig.getState().reconContext).toBeNull();
    });
  });

  describe('reconContext management', () => {
    it('should initialize with null reconContext', () => {
      const state = useRedTeamConfig.getState();
      expect(state.reconContext).toBeNull();
    });

    it('should set reconContext with setReconContext', () => {
      const reconContext: ReconContext = {
        source: 'in-app-recon',
        timestamp: 1703692800000,
        codebaseDirectory: '/Users/dev/my-app',
        keyFilesAnalyzed: 847,
        fieldsPopulated: 14,
      };

      useRedTeamConfig.getState().setReconContext(reconContext);

      expect(useRedTeamConfig.getState().reconContext).toEqual(reconContext);
    });

    it('should clear reconContext with clearReconContext', () => {
      // Set a context first
      useRedTeamConfig.getState().setReconContext({
        source: 'recon-cli',
        timestamp: Date.now(),
      });

      expect(useRedTeamConfig.getState().reconContext).not.toBeNull();

      // Clear it
      useRedTeamConfig.getState().clearReconContext();

      expect(useRedTeamConfig.getState().reconContext).toBeNull();
    });

    it('should allow setting reconContext to null with setReconContext', () => {
      useRedTeamConfig.getState().setReconContext({
        source: 'recon-cli',
        timestamp: Date.now(),
      });

      useRedTeamConfig.getState().setReconContext(null);

      expect(useRedTeamConfig.getState().reconContext).toBeNull();
    });
  });
});
