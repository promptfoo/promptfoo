import { Severity } from '../../src/redteam/constants';
import type {
  RedteamPluginObject,
  RedteamPlugin,
  RedteamStrategyObject,
  PluginActionParams,
  RedteamCliGenerateOptions,
  RedteamFileConfig,
  SynthesizeOptions,
  RedteamRunOptions,
  SavedRedteamConfig,
  BaseRedteamMetadata,
} from '../../src/redteam/types';
import type { ApiProvider } from '../../src/types/providers';

describe('redteam types', () => {
  it('should create valid RedteamPluginObject', () => {
    const pluginObj: RedteamPluginObject = {
      id: 'test-plugin',
      config: {
        examples: ['example1', 'example2'],
        graderExamples: [
          {
            output: 'test output',
            pass: true,
            score: 1,
            reason: 'test reason',
          },
        ],
        severity: Severity.Low,
      },
      severity: Severity.Medium,
      numTests: 5,
    };

    expect(pluginObj.id).toBe('test-plugin');
    expect(pluginObj.severity).toBe(Severity.Medium);
    expect(pluginObj.numTests).toBe(5);
  });

  it('should create valid RedteamPlugin string or object', () => {
    const pluginStr: RedteamPlugin = 'test-plugin';
    const pluginObj: RedteamPlugin = {
      id: 'test-plugin',
      severity: Severity.Low,
    };

    expect(typeof pluginStr).toBe('string');
    expect(typeof pluginObj).toBe('object');
  });

  it('should create valid RedteamStrategyObject', () => {
    const strategyObj: RedteamStrategyObject = {
      id: 'test-strategy',
      config: {
        enabled: true,
        plugins: ['plugin1', 'plugin2'],
        customField: 'value',
      },
    };

    expect(strategyObj.id).toBe('test-strategy');
    expect(strategyObj.config?.enabled).toBe(true);
    expect(strategyObj.config?.plugins).toEqual(['plugin1', 'plugin2']);
  });

  it('should create valid PluginActionParams', () => {
    const provider: ApiProvider = {
      id: () => 'test-provider',
      callApi: async () => ({ output: 'test' }),
    };

    const params: PluginActionParams = {
      provider,
      purpose: 'test purpose',
      injectVar: 'test_var',
      n: 5,
      delayMs: 1000,
      config: {
        examples: ['example'],
      },
    };

    expect(params.provider.id()).toBe('test-provider');
    expect(params.purpose).toBe('test purpose');
    expect(params.n).toBe(5);
  });

  it('should create valid RedteamCliGenerateOptions', () => {
    const options: RedteamCliGenerateOptions = {
      cache: true,
      write: true,
      defaultConfig: {},
      plugins: [
        {
          id: 'test-plugin',
          numTests: 5,
        },
      ],
      strategies: ['test-strategy'],
      injectVar: 'test_var',
      maxConcurrency: 5,
    };

    expect(options.cache).toBe(true);
    expect(options.write).toBe(true);
    expect(options.plugins?.length).toBe(1);
  });

  it('should create valid RedteamFileConfig', () => {
    const pluginKey = 'agentic' as keyof NonNullable<RedteamFileConfig['severity']>;
    const config: RedteamFileConfig = {
      entities: ['entity1', 'entity2'],
      severity: {
        [pluginKey]: Severity.High,
      } as Record<string, Severity>,
      language: 'en',
      numTests: 10,
    };

    expect(config.entities).toEqual(['entity1', 'entity2']);
    expect(config.severity?.[pluginKey]).toBe(Severity.High);
  });

  it('should create valid SynthesizeOptions', () => {
    const options: SynthesizeOptions = {
      language: 'en',
      numTests: 5,
      plugins: [
        {
          id: 'test-plugin',
          numTests: 3,
        },
      ],
      prompts: ['prompt1', 'prompt2'],
      strategies: [
        {
          id: 'test-strategy',
        },
      ],
      targetLabels: ['label1', 'label2'],
      maxConcurrency: 3,
    };

    expect(options.language).toBe('en');
    expect(options.numTests).toBe(5);
    expect(options.plugins).toHaveLength(1);
  });

  it('should create valid RedteamRunOptions', () => {
    const options: RedteamRunOptions = {
      id: 'test-run',
      target: 'test-target',
      cache: true,
      maxConcurrency: 5,
      delay: 1000,
      remote: false,
      progressBar: true,
    };

    expect(options.id).toBe('test-run');
    expect(options.target).toBe('test-target');
    expect(options.maxConcurrency).toBe(5);
  });

  it('should create valid SavedRedteamConfig', () => {
    const config: SavedRedteamConfig = {
      description: 'Test config',
      prompts: ['prompt1', 'prompt2'],
      target: {
        id: 'test-target',
      },
      plugins: ['plugin1', { id: 'plugin2' }],
      strategies: ['strategy1'],
      entities: ['entity1'],
      applicationDefinition: {
        purpose: 'test purpose',
        features: 'key app features',
        hasAccessTo: 'allowed data and systems',
        doesNotHaveAccessTo: 'restricted data',
        userTypes: 'admin, regular users',
        securityRequirements: 'security controls',
        exampleIdentifiers: 'sample IDs',
        industry: 'healthcare',
        sensitiveDataTypes: 'PHI, PII',
        criticalActions: 'data deletion',
        forbiddenTopics: 'restricted topics',
        competitors: 'competitor list',
        systemPrompt: 'test prompt',
        redteamUser: 'test user',
        accessToData: 'accessible data',
        forbiddenData: 'restricted data',
        accessToActions: 'allowed actions',
        forbiddenActions: 'restricted actions',
        connectedSystems: 'integrated systems',
      },
    };

    expect(config.description).toBe('Test config');
    expect(config.prompts).toHaveLength(2);
    expect(config.plugins).toHaveLength(2);
    expect(config.applicationDefinition.features).toBe('key app features');
    expect(config.applicationDefinition.hasAccessTo).toBe('allowed data and systems');
    expect(config.applicationDefinition.doesNotHaveAccessTo).toBe('restricted data');
    expect(config.applicationDefinition.userTypes).toBe('admin, regular users');
    expect(config.applicationDefinition.securityRequirements).toBe('security controls');
    expect(config.applicationDefinition.exampleIdentifiers).toBe('sample IDs');
    expect(config.applicationDefinition.industry).toBe('healthcare');
    expect(config.applicationDefinition.sensitiveDataTypes).toBe('PHI, PII');
    expect(config.applicationDefinition.criticalActions).toBe('data deletion');
    expect(config.applicationDefinition.forbiddenTopics).toBe('restricted topics');
    expect(config.applicationDefinition.competitors).toBe('competitor list');
  });

  it('should create valid BaseRedteamMetadata', () => {
    const metadata: BaseRedteamMetadata = {
      redteamFinalPrompt: 'final prompt',
      messages: [{ role: 'user', content: 'test' }],
      stopReason: 'complete',
      redteamHistory: [{ prompt: 'test prompt', output: 'test output' }],
    };

    expect(metadata.redteamFinalPrompt).toBe('final prompt');
    expect(metadata.messages).toHaveLength(1);
    expect(metadata.stopReason).toBe('complete');
  });
});
