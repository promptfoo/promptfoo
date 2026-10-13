import { describe, expect, expectTypeOf, it } from 'vitest';
import { Severity } from '../../src/redteam/constants';
import { StrategyConfigSchema } from '../../src/redteam/types';
import { createMockProvider } from '../factories/provider';

import type {
  BaseRedteamMetadata,
  PluginActionParams,
  RedteamCliGenerateOptions,
  RedteamFileConfig,
  RedteamGenerateOptions,
  RedteamPlugin,
  RedteamPluginObject,
  RedteamRunOptions,
  RedteamStrategyObject,
  SavedRedteamConfig,
  SynthesizeOptions,
} from '../../src/redteam/types';

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

    expectTypeOf(pluginObj).toExtend<RedteamPluginObject>();
  });

  it('should create valid RedteamPlugin string or object', () => {
    const pluginStr: RedteamPlugin = 'test-plugin';
    const pluginObj: RedteamPlugin = {
      id: 'test-plugin',
      severity: Severity.Low,
    };

    expectTypeOf(pluginStr).toExtend<RedteamPlugin>();
    expectTypeOf(pluginObj).toExtend<RedteamPlugin>();
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

    expectTypeOf(strategyObj).toExtend<RedteamStrategyObject>();
  });

  it('should create valid PluginActionParams', () => {
    const provider = createMockProvider({ response: { output: 'test' } });

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

    expectTypeOf(params).toExtend<PluginActionParams>();
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

    expectTypeOf(options).toExtend<RedteamCliGenerateOptions>();
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

    expectTypeOf(config).toExtend<RedteamFileConfig>();
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
      targetIds: ['label1', 'label2'],
      maxConcurrency: 3,
    };

    expectTypeOf(options).toExtend<SynthesizeOptions>();
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

    expectTypeOf(options).toExtend<RedteamRunOptions>();
  });

  it('should create RedteamRunOptions with description for custom scan names', () => {
    const options: RedteamRunOptions = {
      id: 'test-run',
      config: 'config-uuid',
      target: 'target-uuid',
      description: 'My Custom Scan Name',
      maxConcurrency: 5,
    };

    expectTypeOf(options).toExtend<RedteamRunOptions>();
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
      maxConcurrency: 5,
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

    expectTypeOf(config).toExtend<SavedRedteamConfig>();
  });

  it('should create valid BaseRedteamMetadata', () => {
    const metadata: BaseRedteamMetadata = {
      redteamFinalPrompt: 'final prompt',
      messages: [{ role: 'user', content: 'test' }],
      stopReason: 'complete',
      redteamHistory: [{ prompt: 'test prompt', output: 'test output' }],
    };

    expectTypeOf(metadata).toExtend<BaseRedteamMetadata>();
  });

  it('should create valid RedteamGenerateOptions', () => {
    const emptyOptions: RedteamGenerateOptions = {};
    const partialOptions: RedteamGenerateOptions = {
      cache: true,
      plugins: [
        {
          id: 'test-plugin',
          numTests: 5,
        },
      ],
      maxConcurrency: 3,
      injectVar: 'test_var',
      language: 'en',
      purpose: 'test purpose',
      remote: false,
      sharing: true,
      testGenerationInstructions: 'test instructions',
    };

    expectTypeOf(emptyOptions).toExtend<RedteamGenerateOptions>();
    expectTypeOf(partialOptions).toExtend<RedteamGenerateOptions>();
  });

  describe('StrategyConfigSchema numTests validation', () => {
    it('should accept valid positive numTests', () => {
      const result = StrategyConfigSchema.safeParse({ numTests: 5 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.numTests).toBe(5);
      }
    });

    it('should accept numTests: 0', () => {
      const result = StrategyConfigSchema.safeParse({ numTests: 0 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.numTests).toBe(0);
      }
    });

    it('should accept missing numTests (undefined)', () => {
      const result = StrategyConfigSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.numTests).toBeUndefined();
      }
    });

    it('should reject negative numTests', () => {
      const result = StrategyConfigSchema.safeParse({ numTests: -1 });
      expect(result.success).toBe(false);
    });

    it('should reject non-integer numTests', () => {
      const result = StrategyConfigSchema.safeParse({ numTests: 1.5 });
      expect(result.success).toBe(false);
    });

    it('should reject string numTests', () => {
      const result = StrategyConfigSchema.safeParse({ numTests: '5' });
      expect(result.success).toBe(false);
    });

    it('should accept numTests with other strategy config fields', () => {
      const result = StrategyConfigSchema.safeParse({
        enabled: true,
        plugins: ['plugin1', 'plugin2'],
        numTests: 10,
        customField: 'value',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.numTests).toBe(10);
        expect(result.data.enabled).toBe(true);
        expect(result.data.plugins).toEqual(['plugin1', 'plugin2']);
      }
    });

    it('should reject Infinity numTests', () => {
      const result = StrategyConfigSchema.safeParse({ numTests: Infinity });
      expect(result.success).toBe(false);
    });

    it('should reject -Infinity numTests', () => {
      const result = StrategyConfigSchema.safeParse({ numTests: -Infinity });
      expect(result.success).toBe(false);
    });

    it('should reject NaN numTests', () => {
      const result = StrategyConfigSchema.safeParse({ numTests: NaN });
      expect(result.success).toBe(false);
    });

    it('should accept large but finite numTests', () => {
      const result = StrategyConfigSchema.safeParse({ numTests: 10000 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.numTests).toBe(10000);
      }
    });
  });
});
