import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { initialContext, initMachine } from '../../../../src/ui/init/machines/initMachine';

describe('initMachine', () => {
  describe('initial state', () => {
    it('should start in idle state', () => {
      const actor = createActor(initMachine);
      actor.start();
      expect(actor.getSnapshot().value).toBe('idle');
      actor.stop();
    });

    it('should have correct initial context', () => {
      const actor = createActor(initMachine);
      actor.start();
      const ctx = actor.getSnapshot().context;
      expect(ctx.path).toBeNull();
      expect(ctx.useCase).toBeNull();
      expect(ctx.language).toBeNull();
      expect(ctx.providers).toEqual([]);
      expect(ctx.prompts).toEqual([]);
      expect(ctx.outputDirectory).toBe('.');
      expect(ctx.currentStep).toBe(0);
      expect(ctx.totalSteps).toBe(5);
      expect(ctx.error).toBeNull();
      actor.stop();
    });
  });

  describe('START event', () => {
    it('should transition from idle to selectingPath', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      expect(actor.getSnapshot().value).toBe('selectingPath');
      expect(actor.getSnapshot().context.currentStep).toBe(1);
      actor.stop();
    });
  });

  describe('SELECT_PATH event', () => {
    it('should transition to example.selecting when path is example', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SELECT_PATH', path: 'example' });

      expect(actor.getSnapshot().value).toEqual({ example: 'selecting' });
      expect(actor.getSnapshot().context.path).toBe('example');
      expect(actor.getSnapshot().context.totalSteps).toBe(3);
      actor.stop();
    });

    it('should transition to project.selectingUseCase when path is new', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SELECT_PATH', path: 'new' });

      expect(actor.getSnapshot().value).toEqual({ project: 'selectingUseCase' });
      expect(actor.getSnapshot().context.path).toBe('new');
      actor.stop();
    });
  });

  describe('CANCEL event', () => {
    it('should transition to cancelled from selectingPath', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'CANCEL' });

      expect(actor.getSnapshot().value).toBe('cancelled');
      actor.stop();
    });

    it('should transition to cancelled from example.selecting', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SELECT_PATH', path: 'example' });
      actor.send({ type: 'CANCEL' });

      expect(actor.getSnapshot().value).toBe('cancelled');
      actor.stop();
    });
  });

  describe('Example flow', () => {
    it('should handle SELECT_EXAMPLE and transition to downloading', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SELECT_PATH', path: 'example' });
      actor.send({ type: 'SELECT_EXAMPLE', example: 'openai-chat' });

      expect(actor.getSnapshot().value).toEqual({ example: 'downloading' });
      expect(actor.getSnapshot().context.exampleName).toBe('openai-chat');
      expect(actor.getSnapshot().context.outputDirectory).toBe('openai-chat');
      actor.stop();
    });

    it('should track download progress', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SELECT_PATH', path: 'example' });
      actor.send({ type: 'SELECT_EXAMPLE', example: 'test-example' });
      actor.send({ type: 'DOWNLOAD_PROGRESS', progress: 50, file: 'README.md' });

      const ctx = actor.getSnapshot().context;
      expect(ctx.downloadProgress).toBe(50);
      expect(ctx.downloadedFiles).toContain('README.md');
      actor.stop();
    });

    it('should complete download and transition to complete', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SELECT_PATH', path: 'example' });
      actor.send({ type: 'SELECT_EXAMPLE', example: 'test-example' });
      actor.send({
        type: 'DOWNLOAD_COMPLETE',
        files: ['README.md', 'promptfooconfig.yaml'],
      });

      expect(actor.getSnapshot().value).toEqual({ example: 'complete' });
      expect(actor.getSnapshot().context.filesWritten).toEqual([
        'README.md',
        'promptfooconfig.yaml',
      ]);
      expect(actor.getSnapshot().context.downloadProgress).toBe(100);
      actor.stop();
    });

    it('should handle download error', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SELECT_PATH', path: 'example' });
      actor.send({ type: 'SELECT_EXAMPLE', example: 'test-example' });
      actor.send({ type: 'DOWNLOAD_ERROR', error: 'Network error' });

      expect(actor.getSnapshot().value).toEqual({ example: 'error' });
      expect(actor.getSnapshot().context.error).toBe('Network error');
      actor.stop();
    });

    it('should allow retry after error', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SELECT_PATH', path: 'example' });
      actor.send({ type: 'SELECT_EXAMPLE', example: 'test-example' });
      actor.send({ type: 'DOWNLOAD_ERROR', error: 'Network error' });
      actor.send({ type: 'RETRY' });

      expect(actor.getSnapshot().value).toEqual({ example: 'selecting' });
      expect(actor.getSnapshot().context.error).toBeNull();
      expect(actor.getSnapshot().context.downloadProgress).toBe(0);
      actor.stop();
    });

    it('should allow back navigation from example selecting', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SELECT_PATH', path: 'example' });
      actor.send({ type: 'BACK' });

      expect(actor.getSnapshot().value).toBe('selectingPath');
      expect(actor.getSnapshot().context.currentStep).toBe(1);
      actor.stop();
    });
  });

  describe('Project flow - Use case selection', () => {
    it('should handle compare use case and skip language step', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SELECT_PATH', path: 'new' });
      actor.send({ type: 'SELECT_USECASE', useCase: 'compare' });

      expect(actor.getSnapshot().value).toEqual({ project: 'selectingProviders' });
      expect(actor.getSnapshot().context.useCase).toBe('compare');
      expect(actor.getSnapshot().context.totalSteps).toBe(4);
      actor.stop();
    });

    it('should handle rag use case and go to language step', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SELECT_PATH', path: 'new' });
      actor.send({ type: 'SELECT_USECASE', useCase: 'rag' });

      expect(actor.getSnapshot().value).toEqual({ project: 'selectingLanguage' });
      expect(actor.getSnapshot().context.useCase).toBe('rag');
      expect(actor.getSnapshot().context.totalSteps).toBe(5);
      actor.stop();
    });

    it('should handle agent use case and go to language step', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SELECT_PATH', path: 'new' });
      actor.send({ type: 'SELECT_USECASE', useCase: 'agent' });

      expect(actor.getSnapshot().value).toEqual({ project: 'selectingLanguage' });
      expect(actor.getSnapshot().context.useCase).toBe('agent');
      actor.stop();
    });

    it('should transition to redteam flow when redteam use case is selected', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SELECT_PATH', path: 'new' });
      actor.send({ type: 'SELECT_USECASE', useCase: 'redteam' });

      expect(actor.getSnapshot().value).toEqual({ redteam: 'enteringLabel' });
      expect(actor.getSnapshot().context.useCase).toBe('redteam');
      expect(actor.getSnapshot().context.totalSteps).toBe(8);
      actor.stop();
    });

    it('should generate prompts based on use case', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SELECT_PATH', path: 'new' });
      actor.send({ type: 'SELECT_USECASE', useCase: 'compare' });

      expect(actor.getSnapshot().context.prompts.length).toBeGreaterThan(0);
      actor.stop();
    });
  });

  describe('Project flow - Language selection', () => {
    it('should set language and advance to providers', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SELECT_PATH', path: 'new' });
      actor.send({ type: 'SELECT_USECASE', useCase: 'rag' });
      actor.send({ type: 'SELECT_LANGUAGE', language: 'python' });

      expect(actor.getSnapshot().value).toEqual({ project: 'selectingProviders' });
      expect(actor.getSnapshot().context.language).toBe('python');
      actor.stop();
    });

    it('should allow back navigation to use case', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SELECT_PATH', path: 'new' });
      actor.send({ type: 'SELECT_USECASE', useCase: 'rag' });
      actor.send({ type: 'BACK' });

      expect(actor.getSnapshot().value).toEqual({ project: 'selectingUseCase' });
      actor.stop();
    });
  });

  describe('Project flow - Provider selection', () => {
    it('should update providers in context', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SELECT_PATH', path: 'new' });
      actor.send({ type: 'SELECT_USECASE', useCase: 'compare' });
      actor.send({
        type: 'SELECT_PROVIDERS',
        providers: [{ family: 'openai', models: ['openai:gpt-4'] }],
      });

      expect(actor.getSnapshot().context.providers).toHaveLength(1);
      expect(actor.getSnapshot().context.providers[0].family).toBe('openai');
      actor.stop();
    });

    it('should handle PREVIEW_READY and transition to previewing', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SELECT_PATH', path: 'new' });
      actor.send({ type: 'SELECT_USECASE', useCase: 'compare' });
      actor.send({
        type: 'PREVIEW_READY',
        files: [
          {
            path: './promptfooconfig.yaml',
            relativePath: 'promptfooconfig.yaml',
            content: 'description: test',
            exists: false,
            overwrite: true,
          },
        ],
      });

      expect(actor.getSnapshot().value).toEqual({ project: 'previewing' });
      expect(actor.getSnapshot().context.filesToWrite).toHaveLength(1);
      actor.stop();
    });

    it('should allow back navigation from compare use case', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SELECT_PATH', path: 'new' });
      actor.send({ type: 'SELECT_USECASE', useCase: 'compare' });
      actor.send({ type: 'BACK' });

      expect(actor.getSnapshot().value).toEqual({ project: 'selectingUseCase' });
      actor.stop();
    });

    it('should allow back navigation from rag use case to language', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SELECT_PATH', path: 'new' });
      actor.send({ type: 'SELECT_USECASE', useCase: 'rag' });
      actor.send({ type: 'SELECT_LANGUAGE', language: 'python' });
      actor.send({ type: 'BACK' });

      expect(actor.getSnapshot().value).toEqual({ project: 'selectingLanguage' });
      actor.stop();
    });
  });

  describe('Project flow - Preview and writing', () => {
    it('should toggle file overwrite status', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SELECT_PATH', path: 'new' });
      actor.send({ type: 'SELECT_USECASE', useCase: 'compare' });
      actor.send({
        type: 'PREVIEW_READY',
        files: [
          {
            path: './promptfooconfig.yaml',
            relativePath: 'promptfooconfig.yaml',
            content: 'test',
            exists: true,
            overwrite: true,
          },
        ],
      });
      actor.send({ type: 'TOGGLE_FILE_OVERWRITE', path: './promptfooconfig.yaml' });

      expect(actor.getSnapshot().context.filesToWrite[0].overwrite).toBe(false);
      actor.stop();
    });

    it('should transition to writing on CONFIRM', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SELECT_PATH', path: 'new' });
      actor.send({ type: 'SELECT_USECASE', useCase: 'compare' });
      actor.send({
        type: 'PREVIEW_READY',
        files: [
          {
            path: './promptfooconfig.yaml',
            relativePath: 'promptfooconfig.yaml',
            content: 'test',
            exists: false,
            overwrite: true,
          },
        ],
      });
      actor.send({ type: 'CONFIRM' });

      expect(actor.getSnapshot().value).toEqual({ project: 'writing' });
      actor.stop();
    });

    it('should track write progress', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SELECT_PATH', path: 'new' });
      actor.send({ type: 'SELECT_USECASE', useCase: 'compare' });
      actor.send({
        type: 'PREVIEW_READY',
        files: [
          {
            path: './promptfooconfig.yaml',
            relativePath: 'promptfooconfig.yaml',
            content: 'test',
            exists: false,
            overwrite: true,
          },
        ],
      });
      actor.send({ type: 'CONFIRM' });
      actor.send({ type: 'WRITE_PROGRESS', file: 'promptfooconfig.yaml' });

      expect(actor.getSnapshot().context.filesWritten).toContain('promptfooconfig.yaml');
      actor.stop();
    });

    it('should complete and transition to complete state', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SELECT_PATH', path: 'new' });
      actor.send({ type: 'SELECT_USECASE', useCase: 'compare' });
      actor.send({
        type: 'PREVIEW_READY',
        files: [
          {
            path: './promptfooconfig.yaml',
            relativePath: 'promptfooconfig.yaml',
            content: 'test',
            exists: false,
            overwrite: true,
          },
        ],
      });
      actor.send({ type: 'CONFIRM' });
      actor.send({ type: 'WRITE_COMPLETE', files: ['promptfooconfig.yaml'] });

      expect(actor.getSnapshot().value).toEqual({ project: 'complete' });
      expect(actor.getSnapshot().context.filesWritten).toEqual(['promptfooconfig.yaml']);
      actor.stop();
    });

    it('should handle write error', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SELECT_PATH', path: 'new' });
      actor.send({ type: 'SELECT_USECASE', useCase: 'compare' });
      actor.send({
        type: 'PREVIEW_READY',
        files: [
          {
            path: './promptfooconfig.yaml',
            relativePath: 'promptfooconfig.yaml',
            content: 'test',
            exists: false,
            overwrite: true,
          },
        ],
      });
      actor.send({ type: 'CONFIRM' });
      actor.send({ type: 'WRITE_ERROR', error: 'Permission denied' });

      expect(actor.getSnapshot().value).toEqual({ project: 'error' });
      expect(actor.getSnapshot().context.error).toBe('Permission denied');
      actor.stop();
    });

    it('should allow retry after write error', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SELECT_PATH', path: 'new' });
      actor.send({ type: 'SELECT_USECASE', useCase: 'compare' });
      actor.send({
        type: 'PREVIEW_READY',
        files: [
          {
            path: './promptfooconfig.yaml',
            relativePath: 'promptfooconfig.yaml',
            content: 'test',
            exists: false,
            overwrite: true,
          },
        ],
      });
      actor.send({ type: 'CONFIRM' });
      actor.send({ type: 'WRITE_ERROR', error: 'Permission denied' });
      actor.send({ type: 'RETRY' });

      expect(actor.getSnapshot().value).toEqual({ project: 'previewing' });
      expect(actor.getSnapshot().context.error).toBeNull();
      actor.stop();
    });

    it('should allow back navigation from preview', () => {
      const actor = createActor(initMachine);
      actor.start();
      actor.send({ type: 'START' });
      actor.send({ type: 'SELECT_PATH', path: 'new' });
      actor.send({ type: 'SELECT_USECASE', useCase: 'compare' });
      actor.send({
        type: 'PREVIEW_READY',
        files: [],
      });
      actor.send({ type: 'BACK' });

      expect(actor.getSnapshot().value).toEqual({ project: 'selectingProviders' });
      actor.stop();
    });
  });
});

describe('initialContext', () => {
  it('should have all required fields', () => {
    expect(initialContext).toHaveProperty('path');
    expect(initialContext).toHaveProperty('exampleName');
    expect(initialContext).toHaveProperty('exampleList');
    expect(initialContext).toHaveProperty('downloadProgress');
    expect(initialContext).toHaveProperty('downloadedFiles');
    expect(initialContext).toHaveProperty('useCase');
    expect(initialContext).toHaveProperty('language');
    expect(initialContext).toHaveProperty('providers');
    expect(initialContext).toHaveProperty('prompts');
    expect(initialContext).toHaveProperty('outputDirectory');
    expect(initialContext).toHaveProperty('filesToWrite');
    expect(initialContext).toHaveProperty('filesWritten');
    expect(initialContext).toHaveProperty('currentStep');
    expect(initialContext).toHaveProperty('totalSteps');
    expect(initialContext).toHaveProperty('error');
    expect(initialContext).toHaveProperty('redteam');
  });
});

describe('Redteam flow', () => {
  it('should navigate through redteam flow', () => {
    const actor = createActor(initMachine);
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'SELECT_PATH', path: 'new' });
    actor.send({ type: 'SELECT_USECASE', useCase: 'redteam' });

    expect(actor.getSnapshot().value).toEqual({ redteam: 'enteringLabel' });

    actor.send({ type: 'SET_TARGET_LABEL', label: 'my-chatbot' });
    expect(actor.getSnapshot().value).toEqual({ redteam: 'selectingTargetType' });
    expect(actor.getSnapshot().context.redteam.targetLabel).toBe('my-chatbot');

    actor.send({ type: 'SELECT_TARGET_TYPE', targetType: 'http_endpoint' });
    expect(actor.getSnapshot().value).toEqual({ redteam: 'enteringPurpose' });
    expect(actor.getSnapshot().context.redteam.targetType).toBe('http_endpoint');

    actor.send({ type: 'SET_PURPOSE', purpose: 'Customer service chatbot' });
    expect(actor.getSnapshot().value).toEqual({ redteam: 'selectingPluginMode' });
    expect(actor.getSnapshot().context.redteam.purpose).toBe('Customer service chatbot');

    actor.stop();
  });

  it('should allow back navigation in redteam flow', () => {
    const actor = createActor(initMachine);
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'SELECT_PATH', path: 'new' });
    actor.send({ type: 'SELECT_USECASE', useCase: 'redteam' });
    actor.send({ type: 'SET_TARGET_LABEL', label: 'test' });
    actor.send({ type: 'SELECT_TARGET_TYPE', targetType: 'not_sure' });

    expect(actor.getSnapshot().value).toEqual({ redteam: 'enteringPurpose' });

    actor.send({ type: 'BACK' });
    expect(actor.getSnapshot().value).toEqual({ redteam: 'selectingTargetType' });

    actor.send({ type: 'BACK' });
    expect(actor.getSnapshot().value).toEqual({ redteam: 'enteringLabel' });

    actor.send({ type: 'BACK' });
    expect(actor.getSnapshot().value).toEqual({ project: 'selectingUseCase' });

    actor.stop();
  });

  it('should skip plugin selection when default mode is chosen', () => {
    const actor = createActor(initMachine);
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'SELECT_PATH', path: 'new' });
    actor.send({ type: 'SELECT_USECASE', useCase: 'redteam' });
    actor.send({ type: 'SET_TARGET_LABEL', label: 'test' });
    actor.send({ type: 'SELECT_TARGET_TYPE', targetType: 'prompt_model_chatbot' });
    actor.send({ type: 'SET_PURPOSE', purpose: 'Test purpose' });

    expect(actor.getSnapshot().value).toEqual({ redteam: 'selectingPluginMode' });

    actor.send({ type: 'SELECT_PLUGIN_CONFIG_MODE', mode: 'default' });
    expect(actor.getSnapshot().value).toEqual({ redteam: 'selectingStrategyMode' });
    expect(actor.getSnapshot().context.redteam.pluginConfigMode).toBe('default');

    actor.stop();
  });

  it('should go to plugin selection when manual mode is chosen', () => {
    const actor = createActor(initMachine);
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'SELECT_PATH', path: 'new' });
    actor.send({ type: 'SELECT_USECASE', useCase: 'redteam' });
    actor.send({ type: 'SET_TARGET_LABEL', label: 'test' });
    actor.send({ type: 'SELECT_TARGET_TYPE', targetType: 'agent' });
    actor.send({ type: 'SET_PURPOSE', purpose: 'Test purpose' });
    actor.send({ type: 'SELECT_PLUGIN_CONFIG_MODE', mode: 'manual' });

    expect(actor.getSnapshot().value).toEqual({ redteam: 'selectingPlugins' });
    expect(actor.getSnapshot().context.redteam.pluginConfigMode).toBe('manual');

    actor.send({
      type: 'SELECT_PLUGINS',
      plugins: [{ id: 'pii:direct' }, { id: 'harmful:hate' }],
    });
    expect(actor.getSnapshot().value).toEqual({ redteam: 'selectingStrategyMode' });
    expect(actor.getSnapshot().context.redteam.plugins).toHaveLength(2);

    actor.stop();
  });

  it('should complete full redteam flow with default plugins and strategies', () => {
    const actor = createActor(initMachine);
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'SELECT_PATH', path: 'new' });
    actor.send({ type: 'SELECT_USECASE', useCase: 'redteam' });
    actor.send({ type: 'SET_TARGET_LABEL', label: 'my-app' });
    actor.send({ type: 'SELECT_TARGET_TYPE', targetType: 'rag' });
    actor.send({ type: 'SET_PURPOSE', purpose: 'RAG application' });
    actor.send({ type: 'SELECT_PLUGIN_CONFIG_MODE', mode: 'default' });
    actor.send({ type: 'SELECT_STRATEGY_CONFIG_MODE', mode: 'default' });

    expect(actor.getSnapshot().value).toEqual({ redteam: 'previewing' });
    expect(actor.getSnapshot().context.redteam.pluginConfigMode).toBe('default');
    expect(actor.getSnapshot().context.redteam.strategyConfigMode).toBe('default');

    actor.stop();
  });

  it('should handle full redteam flow with manual plugins and strategies', () => {
    const actor = createActor(initMachine);
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'SELECT_PATH', path: 'new' });
    actor.send({ type: 'SELECT_USECASE', useCase: 'redteam' });
    actor.send({ type: 'SET_TARGET_LABEL', label: 'my-app' });
    actor.send({ type: 'SELECT_TARGET_TYPE', targetType: 'agent' });
    actor.send({ type: 'SET_PURPOSE', purpose: 'Agent application' });
    actor.send({ type: 'SELECT_PLUGIN_CONFIG_MODE', mode: 'manual' });
    actor.send({
      type: 'SELECT_PLUGINS',
      plugins: [{ id: 'pii:direct' }, { id: 'sql-injection' }],
    });
    actor.send({ type: 'SELECT_STRATEGY_CONFIG_MODE', mode: 'manual' });
    actor.send({
      type: 'SELECT_STRATEGIES',
      strategies: ['jailbreak', 'base64'],
    });

    expect(actor.getSnapshot().value).toEqual({ redteam: 'previewing' });
    expect(actor.getSnapshot().context.redteam.plugins).toHaveLength(2);
    expect(actor.getSnapshot().context.redteam.strategies).toEqual(['jailbreak', 'base64']);

    actor.stop();
  });

  it('should handle PREVIEW_READY in redteam previewing state', () => {
    const actor = createActor(initMachine);
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'SELECT_PATH', path: 'new' });
    actor.send({ type: 'SELECT_USECASE', useCase: 'redteam' });
    actor.send({ type: 'SET_TARGET_LABEL', label: 'test' });
    actor.send({ type: 'SELECT_TARGET_TYPE', targetType: 'not_sure' });
    actor.send({ type: 'SET_PURPOSE', purpose: 'Test' });
    actor.send({ type: 'SELECT_PLUGIN_CONFIG_MODE', mode: 'default' });
    actor.send({ type: 'SELECT_STRATEGY_CONFIG_MODE', mode: 'default' });

    expect(actor.getSnapshot().value).toEqual({ redteam: 'previewing' });

    actor.send({
      type: 'PREVIEW_READY',
      files: [
        {
          path: './promptfooconfig.yaml',
          relativePath: 'promptfooconfig.yaml',
          content: 'description: redteam',
          exists: false,
          overwrite: true,
        },
      ],
    });

    expect(actor.getSnapshot().context.filesToWrite).toHaveLength(1);
    actor.stop();
  });

  it('should complete redteam writing flow', () => {
    const actor = createActor(initMachine);
    actor.start();
    actor.send({ type: 'START' });
    actor.send({ type: 'SELECT_PATH', path: 'new' });
    actor.send({ type: 'SELECT_USECASE', useCase: 'redteam' });
    actor.send({ type: 'SET_TARGET_LABEL', label: 'test' });
    actor.send({ type: 'SELECT_TARGET_TYPE', targetType: 'http_endpoint' });
    actor.send({ type: 'SET_PURPOSE', purpose: 'Test' });
    actor.send({ type: 'SELECT_PLUGIN_CONFIG_MODE', mode: 'default' });
    actor.send({ type: 'SELECT_STRATEGY_CONFIG_MODE', mode: 'default' });
    actor.send({
      type: 'PREVIEW_READY',
      files: [
        {
          path: './promptfooconfig.yaml',
          relativePath: 'promptfooconfig.yaml',
          content: 'test',
          exists: false,
          overwrite: true,
        },
      ],
    });
    actor.send({ type: 'CONFIRM' });

    expect(actor.getSnapshot().value).toEqual({ redteam: 'writing' });

    actor.send({ type: 'WRITE_COMPLETE', files: ['promptfooconfig.yaml'] });

    expect(actor.getSnapshot().value).toEqual({ redteam: 'complete' });
    actor.stop();
  });
});
