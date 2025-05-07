import { Severity } from '../../src/redteam/constants';
import type {
  PluginConfig,
  RedteamFileConfig,
  RedteamPluginObject,
  RedteamRunOptions,
  RedteamStrategyObject,
  SavedRedteamConfig,
  SynthesizeOptions,
  RedteamAssertionTypes,
  RedteamPlugin,
  RedteamStrategy,
  PluginActionParams,
  BaseRedteamMetadata,
} from '../../src/redteam/types';
import type { ApiProvider } from '../../src/types/providers';

describe('redteam types', () => {
  it('should allow valid plugin config', () => {
    const config: PluginConfig = {
      examples: ['example1', 'example2'],
      graderExamples: [
        {
          output: 'test output',
          pass: true,
          score: 1,
          reason: 'test reason',
        },
      ],
      graderTemplate: 'test template {{var}}',
      severity: Severity.High,
    };

    expect(config.examples).toHaveLength(2);
    expect(config.graderExamples).toHaveLength(1);
    expect(config.graderTemplate).toBeDefined();
    expect(config.severity).toBe(Severity.High);
  });

  it('should allow valid redteam plugin object', () => {
    const plugin: RedteamPluginObject = {
      id: 'test-plugin',
      config: {
        key: 'value',
      },
      numTests: 5,
      severity: Severity.Medium,
    };

    expect(plugin.id).toBe('test-plugin');
    expect(plugin.config).toBeDefined();
    expect(plugin.numTests).toBe(5);
    expect(plugin.severity).toBe(Severity.Medium);
  });

  it('should allow valid redteam strategy object', () => {
    const strategy: RedteamStrategyObject = {
      id: 'test-strategy',
      config: {
        enabled: true,
        plugins: ['plugin1', 'plugin2'],
        customKey: 'value',
      },
    };

    expect(strategy.id).toBe('test-strategy');
    expect(strategy.config?.enabled).toBe(true);
    expect(strategy.config?.plugins).toHaveLength(2);
  });

  it('should allow valid synthesize options', () => {
    const options: SynthesizeOptions = {
      language: 'en',
      numTests: 10,
      plugins: [
        {
          id: 'plugin1',
          numTests: 5,
        },
      ],
      prompts: ['prompt1', 'prompt2'],
      strategies: [
        {
          id: 'strategy1',
        },
      ],
      targetLabels: ['label1'],
      abortSignal: new AbortController().signal,
      maxConcurrency: 4,
      showProgressBar: true,
      entities: ['entity1'],
    };

    expect(options.language).toBe('en');
    expect(options.numTests).toBe(10);
    expect(options.plugins).toHaveLength(1);
    expect(options.prompts).toHaveLength(2);
    expect(options.strategies).toHaveLength(1);
    expect(options.targetLabels).toHaveLength(1);
    expect(options.entities).toHaveLength(1);
    expect(options.showProgressBar).toBe(true);
  });

  it('should allow valid redteam file config', () => {
    // Fill all required Plugin keys for severity to satisfy type

    const allPlugins: string[] = [
      'ascii-smuggling',
      'beavertails',
      'contracts',
      'cyberseceval',
      'donotanswer',
      'divergent-repetition',
      'excessive-agency',
      'hallucination',
      'harmful:chemical-biological-weapons',
      'harmful:child-exploitation',
      'harmful:copyright-violations',
      'harmful:cybercrime',
      'harmful:cybercrime:malicious-code',
      'harmful:graphic-content',
      'harmful:harassment-bullying',
      'harmful:hate',
      'harmful:illegal-activities',
      'harmful:illegal-drugs',
      'harmful:illegal-drugs:meth',
      'harmful:indiscriminate-weapons',
      'harmful:insults',
      'harmful:intellectual-property',
      'harmful:misinformation-disinformation',
      'harmful:non-violent-crime',
      'harmful:profanity',
      'harmful:radicalization',
      'harmful:self-harm',
      'harmful:sex-crime',
      'harmful:sexual-content',
      'harmful:specialized-advice',
      'harmful:unsafe-practices',
      'harmful:violent-crime',
      'harmful:weapons:ied',
      'hijacking',
      'imitation',
      'overreliance',
      'pii:direct',
      'pliny',
      'politics',
      'religion',
      'agentic:memory-poisoning',
      'pii:api-db',
      'pii:session',
      'pii:social',
      'bfla',
      'bola',
      'cca',
      'competitors',
      'cross-session-leak',
      'debug-access',
      'harmbench',
      'xstest',
      'indirect-prompt-injection',
      'prompt-extraction',
      'rag-document-exfiltration',
      'rag-poisoning',
      'rbac',
      'reasoning-dos',
      'shell-injection',
      'sql-injection',
      'ssrf',
      'system-prompt-override',
      'tool-discovery',
      'tool-discovery:multi-turn',
      'unsafebench',
      'intent',
      'policy',
    ];
    const severityRecord = Object.fromEntries(
      allPlugins.map((plugin, i) => [
        plugin,
        i % 3 === 0 ? Severity.Low : i % 3 === 1 ? Severity.Medium : Severity.High,
      ]),
    ) as Record<any, Severity>;

    const config: RedteamFileConfig = {
      entities: ['entity1', 'entity2'],
      severity: severityRecord,
      language: 'en',
      numTests: 5,
      plugins: [
        {
          id: 'plugin1',
        },
      ],
      strategies: ['strategy1'],
      excludeTargetOutputFromAgenticAttackGeneration: true,
    };

    expect(config.entities).toHaveLength(2);
    expect(config.severity?.['harmful:hate']).toBeDefined();
    expect(config.plugins).toHaveLength(1);
    expect(config.strategies).toHaveLength(1);
    expect(config.excludeTargetOutputFromAgenticAttackGeneration).toBe(true);
  });

  it('should allow valid saved redteam config', () => {
    const config: SavedRedteamConfig = {
      description: 'Test config',
      prompts: ['prompt1'],
      target: {
        id: 'target1',
      },
      plugins: ['plugin1'],
      strategies: ['strategy1'],
      purpose: 'testing',
      extensions: ['ext1'],
      numTests: 5,
      applicationDefinition: {
        purpose: 'test purpose',
        systemPrompt: 'test prompt',
        redteamUser: 'test user',
        accessToData: 'test data',
        forbiddenData: 'forbidden data',
        accessToActions: 'test actions',
        forbiddenActions: 'forbidden actions',
        connectedSystems: 'test systems',
      },
      entities: ['entity1'],
      defaultTest: {
        description: 'test case',
      },
    };

    expect(config.description).toBe('Test config');
    expect(config.prompts).toHaveLength(1);
    expect(config.plugins).toHaveLength(1);
    expect(config.strategies).toHaveLength(1);
    expect(config.applicationDefinition).toBeDefined();
    expect(config.entities).toHaveLength(1);
  });

  it('should allow valid redteam run options', () => {
    const options: RedteamRunOptions = {
      id: 'test-run',
      config: 'test-config',
      target: 'test-target',
      output: 'test-output',
      cache: true,
      envPath: 'test-env',
      maxConcurrency: 4,
      delay: 1000,
      remote: true,
      force: true,
      filterProviders: 'provider1',
      filterTargets: 'target1',
      verbose: true,
      progressBar: true,
      abortSignal: new AbortController().signal,
      loadedFromCloud: true,
    };

    expect(options.id).toBe('test-run');
    expect(options.config).toBe('test-config');
    expect(options.maxConcurrency).toBe(4);
    expect(options.delay).toBe(1000);
    expect(options.remote).toBe(true);
    expect(options.force).toBe(true);
    expect(options.progressBar).toBe(true);
    expect(options.loadedFromCloud).toBe(true);
  });

  it('should allow valid RedteamAssertionTypes', () => {
    const assertion: RedteamAssertionTypes = 'promptfoo:redteam:custom';
    expect(typeof assertion).toBe('string');
    expect(assertion.startsWith('promptfoo:redteam:')).toBe(true);
  });

  it('should allow valid RedteamPlugin (string and object)', () => {
    const pluginStr: RedteamPlugin = 'plugin1';
    const pluginObj: RedteamPlugin = {
      id: 'plugin2',
      numTests: 3,
      severity: Severity.Low,
    };
    expect(typeof pluginStr).toBe('string');
    expect((pluginObj as RedteamPluginObject).id).toBe('plugin2');
    expect((pluginObj as RedteamPluginObject).severity).toBe(Severity.Low);
  });

  it('should allow valid RedteamStrategy (string and object)', () => {
    const strategyStr: RedteamStrategy = 'strategy1';
    const strategyObj: RedteamStrategy = {
      id: 'strategy2',
      config: { enabled: false, plugins: ['plugin1'] },
    };
    expect(typeof strategyStr).toBe('string');
    expect((strategyObj as RedteamStrategyObject).id).toBe('strategy2');
    expect((strategyObj as RedteamStrategyObject).config?.enabled).toBe(false);
  });

  it('should allow valid PluginActionParams', () => {
    const provider: ApiProvider = {
      id: () => 'provider1',
      callApi: async () => ({ output: 'ok' }),
    };
    const params: PluginActionParams = {
      provider,
      purpose: 'purpose',
      injectVar: 'var',
      n: 2,
      delayMs: 100,
      config: {
        examples: [],
      },
    };
    expect(params.provider.id()).toBe('provider1');
    expect(params.n).toBe(2);
    expect(params.config?.examples).toEqual([]);
  });

  it('should allow valid BaseRedteamMetadata', () => {
    const meta: BaseRedteamMetadata = {
      redteamFinalPrompt: 'prompt',
      messages: [{ role: 'user', content: 'test' }],
      stopReason: 'done',
      redteamHistory: [{ prompt: 'p', output: 'o' }],
    };
    expect(meta.redteamFinalPrompt).toBe('prompt');
    expect(meta.messages[0].role).toBe('user');
    expect(meta.stopReason).toBe('done');
    expect(meta.redteamHistory?.[0].output).toBe('o');
  });
});
