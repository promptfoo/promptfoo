import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import {
  initialRedteamInitContext,
  redteamInitMachine,
} from '../../../../src/ui/init/machines/redteamInitMachine';

describe('redteamInitMachine', () => {
  describe('initial state', () => {
    it('starts in idle state', () => {
      const actor = createActor(redteamInitMachine);
      actor.start();
      expect(actor.getSnapshot().value).toBe('idle');
      actor.stop();
    });

    it('has correct initial context', () => {
      const actor = createActor(redteamInitMachine);
      actor.start();
      const context = actor.getSnapshot().context;
      expect(context.outputDirectory).toBe('.');
      expect(context.filesToWrite).toEqual([]);
      expect(context.filesWritten).toEqual([]);
      expect(context.currentStep).toBe(1);
      expect(context.totalSteps).toBe(6);
      expect(context.error).toBeNull();
      actor.stop();
    });
  });

  describe('START event', () => {
    it('transitions from idle to enteringLabel', () => {
      const actor = createActor(redteamInitMachine);
      actor.start();
      actor.send({ type: 'START' });
      expect(actor.getSnapshot().value).toBe('enteringLabel');
      actor.stop();
    });
  });

  describe('enteringLabel state', () => {
    it('transitions to selectingTargetType on SET_TARGET_LABEL', () => {
      const actor = createActor(redteamInitMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SET_TARGET_LABEL', label: 'my-chatbot' });

      expect(actor.getSnapshot().value).toBe('selectingTargetType');
      expect(actor.getSnapshot().context.redteam.targetLabel).toBe('my-chatbot');
      expect(actor.getSnapshot().context.currentStep).toBe(2);
      actor.stop();
    });

    it('transitions to cancelled on CANCEL', () => {
      const actor = createActor(redteamInitMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'CANCEL' });

      expect(actor.getSnapshot().value).toBe('cancelled');
      actor.stop();
    });
  });

  describe('selectingTargetType state', () => {
    it('transitions to enteringPurpose on SELECT_TARGET_TYPE', () => {
      const actor = createActor(redteamInitMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SET_TARGET_LABEL', label: 'my-chatbot' });
      actor.send({ type: 'SELECT_TARGET_TYPE', targetType: 'http_endpoint' });

      expect(actor.getSnapshot().value).toBe('enteringPurpose');
      expect(actor.getSnapshot().context.redteam.targetType).toBe('http_endpoint');
      expect(actor.getSnapshot().context.currentStep).toBe(3);
      actor.stop();
    });

    it('transitions back to enteringLabel on BACK', () => {
      const actor = createActor(redteamInitMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SET_TARGET_LABEL', label: 'my-chatbot' });
      actor.send({ type: 'BACK' });

      expect(actor.getSnapshot().value).toBe('enteringLabel');
      expect(actor.getSnapshot().context.currentStep).toBe(1);
      actor.stop();
    });
  });

  describe('enteringPurpose state', () => {
    it('transitions to selectingPluginMode on SET_PURPOSE', () => {
      const actor = createActor(redteamInitMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SET_TARGET_LABEL', label: 'my-chatbot' });
      actor.send({ type: 'SELECT_TARGET_TYPE', targetType: 'http_endpoint' });
      actor.send({ type: 'SET_PURPOSE', purpose: 'A helpful assistant' });

      expect(actor.getSnapshot().value).toBe('selectingPluginMode');
      expect(actor.getSnapshot().context.redteam.purpose).toBe('A helpful assistant');
      expect(actor.getSnapshot().context.currentStep).toBe(4);
      actor.stop();
    });
  });

  describe('plugin mode selection', () => {
    function goToPluginMode() {
      const actor = createActor(redteamInitMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SET_TARGET_LABEL', label: 'my-chatbot' });
      actor.send({ type: 'SELECT_TARGET_TYPE', targetType: 'http_endpoint' });
      actor.send({ type: 'SET_PURPOSE', purpose: 'A helpful assistant' });
      return actor;
    }

    it('skips to strategy mode when default is selected', () => {
      const actor = goToPluginMode();
      actor.send({ type: 'SELECT_PLUGIN_CONFIG_MODE', mode: 'default' });

      expect(actor.getSnapshot().value).toBe('selectingStrategyMode');
      expect(actor.getSnapshot().context.redteam.pluginConfigMode).toBe('default');
      expect(actor.getSnapshot().context.currentStep).toBe(5);
      actor.stop();
    });

    it('goes to plugin selection when manual is selected', () => {
      const actor = goToPluginMode();
      actor.send({ type: 'SELECT_PLUGIN_CONFIG_MODE', mode: 'manual' });

      expect(actor.getSnapshot().value).toBe('selectingPlugins');
      expect(actor.getSnapshot().context.redteam.pluginConfigMode).toBe('manual');
      actor.stop();
    });
  });

  describe('strategy mode selection', () => {
    function goToStrategyMode() {
      const actor = createActor(redteamInitMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SET_TARGET_LABEL', label: 'my-chatbot' });
      actor.send({ type: 'SELECT_TARGET_TYPE', targetType: 'http_endpoint' });
      actor.send({ type: 'SET_PURPOSE', purpose: 'A helpful assistant' });
      actor.send({ type: 'SELECT_PLUGIN_CONFIG_MODE', mode: 'default' });
      return actor;
    }

    it('goes to preview when default is selected', () => {
      const actor = goToStrategyMode();
      actor.send({ type: 'SELECT_STRATEGY_CONFIG_MODE', mode: 'default' });

      expect(actor.getSnapshot().value).toBe('previewing');
      expect(actor.getSnapshot().context.redteam.strategyConfigMode).toBe('default');
      expect(actor.getSnapshot().context.currentStep).toBe(6);
      actor.stop();
    });

    it('goes to strategy selection when manual is selected', () => {
      const actor = goToStrategyMode();
      actor.send({ type: 'SELECT_STRATEGY_CONFIG_MODE', mode: 'manual' });

      expect(actor.getSnapshot().value).toBe('selectingStrategies');
      expect(actor.getSnapshot().context.redteam.strategyConfigMode).toBe('manual');
      actor.stop();
    });
  });

  describe('full flow to completion', () => {
    it('completes the full default flow', () => {
      const actor = createActor(redteamInitMachine);
      actor.start();

      // Go through the flow with defaults
      actor.send({ type: 'START' });
      actor.send({ type: 'SET_TARGET_LABEL', label: 'my-chatbot' });
      actor.send({ type: 'SELECT_TARGET_TYPE', targetType: 'http_endpoint' });
      actor.send({ type: 'SET_PURPOSE', purpose: 'A helpful assistant' });
      actor.send({ type: 'SELECT_PLUGIN_CONFIG_MODE', mode: 'default' });
      actor.send({ type: 'SELECT_STRATEGY_CONFIG_MODE', mode: 'default' });

      expect(actor.getSnapshot().value).toBe('previewing');

      // Simulate file preview ready
      actor.send({
        type: 'PREVIEW_READY',
        files: [
          {
            path: 'promptfooconfig.yaml',
            relativePath: 'promptfooconfig.yaml',
            content: 'test',
            exists: false,
            overwrite: true,
          },
        ],
      });

      expect(actor.getSnapshot().context.filesToWrite).toHaveLength(1);

      // Confirm and write
      actor.send({ type: 'CONFIRM' });
      expect(actor.getSnapshot().value).toBe('writing');

      // Complete writing
      actor.send({ type: 'WRITE_COMPLETE', files: ['promptfooconfig.yaml'] });
      expect(actor.getSnapshot().value).toBe('complete');
      expect(actor.getSnapshot().context.filesWritten).toEqual(['promptfooconfig.yaml']);

      actor.stop();
    });

    it('handles write errors', () => {
      const actor = createActor(redteamInitMachine);
      actor.start();

      // Go through the flow
      actor.send({ type: 'START' });
      actor.send({ type: 'SET_TARGET_LABEL', label: 'my-chatbot' });
      actor.send({ type: 'SELECT_TARGET_TYPE', targetType: 'http_endpoint' });
      actor.send({ type: 'SET_PURPOSE', purpose: 'A helpful assistant' });
      actor.send({ type: 'SELECT_PLUGIN_CONFIG_MODE', mode: 'default' });
      actor.send({ type: 'SELECT_STRATEGY_CONFIG_MODE', mode: 'default' });
      actor.send({
        type: 'PREVIEW_READY',
        files: [
          {
            path: 'promptfooconfig.yaml',
            relativePath: 'promptfooconfig.yaml',
            content: 'test',
            exists: false,
            overwrite: true,
          },
        ],
      });
      actor.send({ type: 'CONFIRM' });

      // Simulate write error
      actor.send({ type: 'WRITE_ERROR', error: 'Permission denied' });
      expect(actor.getSnapshot().value).toBe('error');
      expect(actor.getSnapshot().context.error).toBe('Permission denied');

      // Retry should go back to previewing
      actor.send({ type: 'RETRY' });
      expect(actor.getSnapshot().value).toBe('previewing');
      expect(actor.getSnapshot().context.error).toBeNull();

      actor.stop();
    });
  });

  describe('initialRedteamInitContext', () => {
    it('has correct default values', () => {
      expect(initialRedteamInitContext.outputDirectory).toBe('.');
      expect(initialRedteamInitContext.filesToWrite).toEqual([]);
      expect(initialRedteamInitContext.filesWritten).toEqual([]);
      expect(initialRedteamInitContext.currentStep).toBe(1);
      expect(initialRedteamInitContext.totalSteps).toBe(6);
      expect(initialRedteamInitContext.error).toBeNull();
    });

    it('has correct redteam context defaults', () => {
      const { redteam } = initialRedteamInitContext;
      expect(redteam.targetLabel).toBe('');
      expect(redteam.targetType).toBeNull();
      expect(redteam.purpose).toBe('');
      expect(redteam.plugins).toEqual([]);
      expect(redteam.strategies).toEqual([]);
      expect(redteam.pluginConfigMode).toBe('default');
      expect(redteam.strategyConfigMode).toBe('default');
    });
  });
});
