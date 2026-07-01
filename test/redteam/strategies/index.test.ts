import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { importModule } from '../../../src/esm';
import logger from '../../../src/logger';
import {
  getStrategyCompatibilityError,
  isStrategyApplicable,
  loadStrategy,
  validateStrategies,
} from '../../../src/redteam/strategies/index';
import { RedteamConfigSchema } from '../../../src/validators/redteam';

import type { RedteamStrategyObject, TestCaseWithPlugin } from '../../../src/types/index';

vi.mock('../../../src/cliState');
vi.mock('../../../src/esm', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    importModule: vi.fn(),
  };
});
vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  getLogLevel: vi.fn().mockReturnValue('info'),
}));

describe('validateStrategies', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should validate valid strategies', async () => {
    const validStrategies: RedteamStrategyObject[] = [
      { id: 'basic' },
      { id: 'base64' },
      { id: 'video' },
      { id: 'morse' },
      { id: 'piglatin' },
      { id: 'camelcase' },
      { id: 'emoji' },
      { id: 'mischievous-user' },
    ];
    await expect(validateStrategies(validStrategies)).resolves.toBeUndefined();
  });

  it('should validate basic strategy with enabled config', async () => {
    const strategies: RedteamStrategyObject[] = [{ id: 'basic', config: { enabled: true } }];
    await expect(validateStrategies(strategies)).resolves.toBeUndefined();
  });

  it('should throw error for invalid basic strategy config', async () => {
    const strategies: RedteamStrategyObject[] = [
      { id: 'basic', config: { enabled: 'not-a-boolean' as any } },
    ];
    await expect(validateStrategies(strategies)).rejects.toThrow(
      'Basic strategy enabled config must be a boolean',
    );
  });

  it('should skip validation for file:// strategies', async () => {
    const strategies: RedteamStrategyObject[] = [{ id: 'file://custom.js' }];
    await expect(validateStrategies(strategies)).resolves.toBeUndefined();
  });

  it.each([
    {
      label: 'direct attack provider config',
      strategies: [{ id: 'jailbreak:hydra', config: { _perTurnLayers: ['posterior'] } }],
    },
    {
      label: 'nested layer step config',
      strategies: [
        {
          id: 'layer',
          config: {
            steps: [{ id: 'jailbreak:hydra', config: { _perTurnLayers: ['posterior'] } }],
          },
        },
      ],
    },
  ])('rejects user-configured internal per-turn layers in $label', async ({ strategies }) => {
    await expect(validateStrategies(strategies)).rejects.toThrow(
      'Strategy config field "_perTurnLayers" is reserved for internal layer composition',
    );
  });

  it('should throw error for invalid strategies', async () => {
    const invalidStrategies: RedteamStrategyObject[] = [{ id: 'invalid-strategy' }];

    await expect(validateStrategies(invalidStrategies)).rejects.toThrow('Invalid strategy(s)');
  });
});

describe('getStrategyCompatibilityError', () => {
  const inputs = {
    context: 'Reference context',
    question: 'User question',
  };

  it('handles cyclic layer aliases without overflowing the stack', () => {
    const cyclicLayer: { id: string; config: { steps: unknown[] } } = {
      id: 'layer',
      config: { steps: [] },
    };
    cyclicLayer.config.steps.push(cyclicLayer);

    expect(getStrategyCompatibilityError([cyclicLayer], undefined)).toBeUndefined();
  });

  it('handles deeply nested layer aliases without overflowing the stack', () => {
    let strategy: unknown = 'posterior';
    for (let i = 0; i < 5000; i++) {
      strategy = { id: 'layer', config: { steps: [strategy] } };
    }

    expect(
      getStrategyCompatibilityError([strategy], {
        context: 'Reference context',
        question: 'User question',
      }),
    ).toBe('Posterior strategy does not support multi-input targets');
  });

  it('handles wide layer aliases without spreading the step array', () => {
    const strategy = { id: 'layer', config: { steps: Array(150_000).fill('base64') } };

    expect(getStrategyCompatibilityError([strategy], undefined)).toBeUndefined();
  });

  it('deduplicates repeated layer aliases during compatibility traversal', () => {
    let repeatedLayer: unknown = { id: 'layer', config: { steps: ['base64'] } };
    for (let i = 0; i < 25; i++) {
      repeatedLayer = { id: 'layer', config: { steps: [repeatedLayer, repeatedLayer] } };
    }
    const strategy = {
      id: 'layer',
      config: { steps: ['jailbreak:hydra', repeatedLayer, 'posterior'] },
    };

    expect(getStrategyCompatibilityError([strategy], inputs, { plugins: ['harmful:hate'] })).toBe(
      'Posterior strategy does not support multi-input targets',
    );
  });

  it('deduplicates aliased and expanded layer steps using the same structural key', () => {
    const aliasedPosterior = { id: 'posterior' };
    const strategies = [
      {
        id: 'layer',
        config: { numTests: 0, steps: [aliasedPosterior, aliasedPosterior] },
      },
      {
        id: 'layer',
        config: { steps: [{ id: 'posterior' }, { id: 'posterior' }] },
      },
    ];

    expect(getStrategyCompatibilityError(strategies, inputs, { plugins: ['harmful:hate'] })).toBe(
      'Posterior strategy does not support multi-input targets',
    );
  });

  it.each([
    [{ id: 'posterior', config: { numTests: 0 } }],
    [{ id: 'layer', config: { numTests: 0, steps: ['posterior'] } }],
  ])('allows multi-input targets when Posterior is disabled', (strategy) => {
    expect(
      getStrategyCompatibilityError([strategy], {
        context: 'Reference context',
        question: 'User question',
      }),
    ).toBeUndefined();
  });

  it('keeps first-wins runtime deduplication for differently configured direct strategies', () => {
    const strategies = [{ id: 'posterior', config: { numTests: 0 } }, { id: 'posterior' }];

    expect(
      getStrategyCompatibilityError(strategies, {
        context: 'Reference context',
        question: 'User question',
      }),
    ).toBeUndefined();
  });

  it.each([
    [
      'unlabelled layer',
      [
        { id: 'layer', config: { numTests: 0, steps: ['posterior'] } },
        { id: 'layer', config: { steps: ['posterior'] } },
      ],
      'Posterior strategy does not support multi-input targets',
    ],
    [
      'labelled layer',
      [
        { id: 'layer', config: { label: 'same', numTests: 0, steps: ['base64'] } },
        { id: 'layer', config: { label: 'same', steps: ['posterior'] } },
      ],
      'Posterior strategy does not support multi-input targets',
    ],
    [
      'labelled layer disabled last',
      [
        { id: 'layer', config: { label: 'same', steps: ['posterior'] } },
        { id: 'layer', config: { label: 'same', numTests: 0, steps: ['posterior'] } },
      ],
      undefined,
    ],
  ])('matches config-schema last-wins deduplication for duplicate %s', (_label, strategies, expected) => {
    expect(
      getStrategyCompatibilityError(
        strategies,
        { context: 'Reference context', question: 'User question' },
        { plugins: ['harmful:hate'] },
      ),
    ).toBe(expected);
  });

  it.each([
    {
      label: 'direct Posterior for an ordinary plugin',
      strategies: ['posterior'],
      plugins: ['harmful:hate'],
      expected: 'Posterior strategy does not support multi-input targets',
    },
    {
      label: 'direct Posterior excluded by plugin config',
      strategies: ['posterior'],
      plugins: [{ id: 'harmful:hate', config: { excludeStrategies: ['posterior'] } }],
      expected: undefined,
    },
    {
      label: 'direct Posterior with sequence-only intents',
      strategies: ['posterior'],
      plugins: [{ id: 'intent', config: { intent: [['first turn', 'second turn']] } }],
      expected: undefined,
    },
    {
      label: 'layered Posterior for an ordinary plugin',
      strategies: [{ id: 'layer', config: { steps: ['jailbreak:hydra', 'posterior'] } }],
      plugins: ['harmful:hate'],
      expected: 'Posterior strategy does not support multi-input targets',
    },
    {
      label: 'layered Posterior implicitly excluded from coding-agent plugins',
      strategies: [{ id: 'layer', config: { steps: ['jailbreak:hydra', 'posterior'] } }],
      plugins: ['coding-agent:secret-env-read'],
      expected: undefined,
    },
    {
      label: 'layered Posterior implicitly excluded from a coding-agent collection',
      strategies: [{ id: 'layer', config: { steps: ['jailbreak:hydra', 'posterior'] } }],
      plugins: ['coding-agent:core'],
      expected: undefined,
    },
    {
      label: 'Posterior excluded from every child of a plugin collection',
      strategies: ['posterior'],
      plugins: [{ id: 'harmful', config: { excludeStrategies: ['posterior'] } }],
      expected: undefined,
    },
    {
      label: 'Posterior targeted away from every child of a plugin collection',
      strategies: [{ id: 'posterior', config: { plugins: ['harmful'] } }],
      plugins: ['pii'],
      expected: undefined,
    },
    {
      label: 'Posterior targeted to a child of a plugin collection',
      strategies: [{ id: 'posterior', config: { plugins: ['pii:direct'] } }],
      plugins: ['pii'],
      expected: 'Posterior strategy does not support multi-input targets',
    },
    {
      label: 'Posterior targeted to a child of an aliased plugin collection',
      strategies: [{ id: 'posterior', config: { plugins: ['politics'] } }],
      plugins: ['bias'],
      expected: 'Posterior strategy does not support multi-input targets',
    },
    {
      label: 'plugins skipped entirely in multi-input mode',
      strategies: ['posterior'],
      plugins: ['cca', { id: 'harmful:hate', config: { excludeStrategies: ['posterior'] } }],
      expected: undefined,
    },
    {
      label: 'unreachable Posterior after an excluded pre-attack step',
      strategies: [
        {
          id: 'layer',
          config: {
            steps: [{ id: 'base64', config: { plugins: ['policy'] } }, 'posterior'],
          },
        },
      ],
      plugins: ['harmful:hate'],
      expected: undefined,
    },
    {
      label: 'Posterior after an excluded per-turn sibling',
      strategies: [
        {
          id: 'layer',
          config: {
            steps: [
              'jailbreak:hydra',
              { id: 'base64', config: { plugins: ['policy'] } },
              'posterior',
            ],
          },
        },
      ],
      plugins: ['harmful:hate'],
      expected: 'Posterior strategy does not support multi-input targets',
    },
  ])('accounts for plugin applicability with $label', ({ strategies, plugins, expected }) => {
    expect(getStrategyCompatibilityError(strategies, inputs, { plugins })).toBe(expected);
  });

  it.each([
    'ecommerce',
    'telecom',
    'realestate',
  ])('matches runtime expansion for the %s collection', (collection) => {
    const config = {
      plugins: [collection],
      strategies: ['posterior'],
    };
    const parsed = RedteamConfigSchema.parse(config);

    expect(
      getStrategyCompatibilityError(config.strategies, inputs, { plugins: config.plugins }),
    ).toBe('Posterior strategy does not support multi-input targets');
    expect(
      getStrategyCompatibilityError(parsed.strategies ?? [], inputs, {
        plugins: parsed.plugins,
      }),
    ).toBe('Posterior strategy does not support multi-input targets');
  });

  it('accounts for plugin-level multi-input configuration', () => {
    expect(
      getStrategyCompatibilityError(['posterior'], undefined, {
        plugins: [
          {
            id: 'policy',
            config: { inputs: { context: 'Reference context', question: 'User question' } },
          },
        ],
      }),
    ).toBe('Posterior strategy does not support multi-input targets');
  });

  it('ignores plugin-local inputs when generation uses the first target inputs', () => {
    expect(
      getStrategyCompatibilityError(['posterior'], undefined, {
        plugins: [{ id: 'cca', config: { inputs } }],
        pluginsUseTargetInputs: true,
      }),
    ).toBeUndefined();
  });

  it('checks plugins retained by a single-input first target against later multi-input targets', () => {
    expect(
      getStrategyCompatibilityError(['posterior'], inputs, {
        plugins: ['cca'],
        pluginsUseTargetInputs: false,
      }),
    ).toBe('Posterior strategy does not support multi-input targets');
  });

  it('does not apply target-wide plugin exclusions to plugin-level inputs', () => {
    expect(
      getStrategyCompatibilityError(['posterior'], undefined, {
        plugins: [{ id: 'cca', config: { inputs } }],
      }),
    ).toBe('Posterior strategy does not support multi-input targets');
  });

  it('does not reintroduce target-excluded plugins through their local inputs', () => {
    expect(
      getStrategyCompatibilityError([{ id: 'posterior', config: { plugins: ['cca'] } }], inputs, {
        plugins: [
          { id: 'cca', config: { inputs: { plugin: 'Local plugin input' } } },
          { id: 'harmful:hate', config: { excludeStrategies: ['posterior'] } },
        ],
      }),
    ).toBeUndefined();
  });

  it('resolves file-backed sequence-only intents for compatibility checks', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-posterior-intents-'));
    const intentPath = path.join(tempDir, 'intents.json');
    fs.writeFileSync(intentPath, JSON.stringify([['first turn', 'second turn']]));

    try {
      expect(
        getStrategyCompatibilityError(['posterior'], inputs, {
          plugins: [{ id: 'intent', config: { intent: `file://${intentPath}` } }],
        }),
      ).toBeUndefined();
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('resolves file-backed strategy exclusions for compatibility checks', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-posterior-exclusions-'));
    const exclusionsPath = path.join(tempDir, 'exclusions.yaml');
    fs.writeFileSync(exclusionsPath, '- posterior\n');

    try {
      expect(
        getStrategyCompatibilityError(['posterior'], inputs, {
          plugins: [
            {
              id: 'harmful:hate',
              config: { excludeStrategies: `file://${exclusionsPath}` },
            },
          ],
        }),
      ).toBeUndefined();
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('resolves file-backed plugin inputs before compatibility checks', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-posterior-inputs-'));
    const inputsPath = path.join(tempDir, 'inputs.json');
    fs.writeFileSync(inputsPath, JSON.stringify(inputs));

    try {
      expect(
        getStrategyCompatibilityError(['posterior'], undefined, {
          plugins: [{ id: 'policy', config: { inputs: `file://${inputsPath}` } }],
        }),
      ).toBe('Posterior strategy does not support multi-input targets');
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('does not resolve compatibility files when Posterior is not configured', () => {
    expect(
      getStrategyCompatibilityError(['basic'], undefined, {
        plugins: [
          {
            id: 'policy',
            config: { inputs: 'file:///missing/posterior-inputs.json' },
          },
        ],
      }),
    ).toBeUndefined();
  });

  it('does not resolve compatibility files for plugins skipped by target inputs', () => {
    expect(
      getStrategyCompatibilityError([{ id: 'posterior', config: { plugins: ['cca'] } }], inputs, {
        plugins: [
          {
            id: 'cca',
            config: { inputs: 'file:///missing/posterior-inputs.json' },
          },
          { id: 'policy', config: { excludeStrategies: ['posterior'] } },
        ],
        pluginsUseTargetInputs: true,
      }),
    ).toBeUndefined();
  });

  it('defers probe-time file errors until target applicability is known', () => {
    expect(
      getStrategyCompatibilityError(
        [{ id: 'posterior', config: { plugins: ['cca'] } }],
        { compatibilityProbe: true },
        {
          plugins: [
            {
              id: 'cca',
              config: { excludeStrategies: 'file:///missing/posterior-exclusions.yaml' },
            },
          ],
          pluginsUseTargetInputs: false,
        },
      ),
    ).toBe('Posterior strategy does not support multi-input targets');

    expect(() =>
      getStrategyCompatibilityError(['posterior'], undefined, {
        plugins: [
          {
            id: 'policy',
            config: { inputs: 'file:///missing/posterior-inputs.json' },
          },
        ],
      }),
    ).toThrow('File not found');
  });

  it('matches runtime raw-text semantics for yml strategy exclusions', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-posterior-exclusions-'));
    const exclusionsPath = path.join(tempDir, 'exclusions.yml');
    fs.writeFileSync(exclusionsPath, '- posterior\n');

    try {
      expect(
        getStrategyCompatibilityError(['posterior'], inputs, {
          plugins: [
            {
              id: 'harmful:hate',
              config: { excludeStrategies: `file://${exclusionsPath}` },
            },
          ],
        }),
      ).toBe('Posterior strategy does not support multi-input targets');
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('normalizes generated plugin IDs before applying strategy targets', () => {
    expect(
      isStrategyApplicable(
        {
          vars: { query: 'test' },
          metadata: { pluginId: 'promptfoo:redteam:intent', pluginConfig: {} },
        },
        { id: 'layer', config: { plugins: ['intent'], steps: ['base64'] } },
      ),
    ).toBe(true);
  });

  it('handles cyclic per-turn layers while finding an applicable Posterior sibling', () => {
    const cyclicLayer = { id: 'layer', config: { steps: [] as unknown[] } };
    cyclicLayer.config.steps.push(cyclicLayer);

    expect(
      getStrategyCompatibilityError(
        [
          {
            id: 'layer',
            config: { steps: ['jailbreak:hydra', cyclicLayer, 'posterior'] },
          },
        ],
        inputs,
        { plugins: ['harmful:hate'] },
      ),
    ).toBe('Posterior strategy does not support multi-input targets');
  });
});

describe('loadStrategy', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should load predefined strategy', async () => {
    const strategy = await loadStrategy('basic');
    expect(strategy).toBeDefined();
    expect(strategy.id).toBe('basic');
  });

  it('should load video strategy', async () => {
    const strategy = await loadStrategy('video');
    expect(strategy).toBeDefined();
    expect(strategy.id).toBe('video');
    expect(typeof strategy.action).toBe('function');
  });

  it('should call video strategy action with correct parameters', async () => {
    const strategy = await loadStrategy('video');
    const testCases: TestCaseWithPlugin[] = [
      { vars: { test: 'value' }, metadata: { pluginId: 'test' } },
    ];
    const injectVar = 'inject';
    const config = {};

    await strategy.action(testCases, injectVar, config);

    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Adding video encoding'));
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Added'));
  });

  it('should load morse strategy', async () => {
    const strategy = await loadStrategy('morse');
    expect(strategy).toBeDefined();
    expect(strategy.id).toBe('morse');
  });

  it('should load piglatin strategy', async () => {
    const strategy = await loadStrategy('piglatin');
    expect(strategy).toBeDefined();
    expect(strategy.id).toBe('piglatin');
  });

  it('should load camelcase strategy', async () => {
    const strategy = await loadStrategy('camelcase');
    expect(strategy).toBeDefined();
    expect(strategy.id).toBe('camelcase');
  });

  it('should load emoji strategy', async () => {
    const strategy = await loadStrategy('emoji');
    expect(strategy).toBeDefined();
    expect(strategy.id).toBe('emoji');
  });

  it('should call emoji strategy action with correct parameters', async () => {
    const strategy = await loadStrategy('emoji');
    const testCases: TestCaseWithPlugin[] = [
      { vars: { test: 'value' }, metadata: { pluginId: 'test' } },
    ];
    const injectVar = 'inject';
    const config = {};

    await strategy.action(testCases, injectVar, config);

    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Adding emoji encoding'));
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Added'));
  });

  it('should load posterior strategy', async () => {
    const strategy = await loadStrategy('posterior');
    expect(strategy).toBeDefined();
    expect(strategy.id).toBe('posterior');
    expect(typeof strategy.action).toBe('function');
  });

  it('should call posterior strategy action with correct parameters', async () => {
    const strategy = await loadStrategy('posterior');
    const testCases: TestCaseWithPlugin[] = [
      { vars: { inject: 'value' }, metadata: { pluginId: 'test' } },
    ];
    const injectVar = 'inject';
    const config = {};

    const result = await strategy.action(testCases, injectVar, config);

    expect(result).toHaveLength(1);
    expect(result[0].metadata?.strategyId).toBe('posterior');
    expect(logger.debug).toHaveBeenCalledWith('Adding Posterior Attack test cases', {
      testCaseCount: 1,
    });
    expect(logger.debug).toHaveBeenCalledWith('Added Posterior Attack test cases', {
      testCaseCount: 1,
    });
  });

  it('should load mischievous user strategy', async () => {
    const strategy = await loadStrategy('mischievous-user');
    expect(strategy).toBeDefined();
    expect(strategy.id).toBe('mischievous-user');
    expect(typeof strategy.action).toBe('function');
  });

  it('should call mischievous user strategy action with correct parameters', async () => {
    const strategy = await loadStrategy('mischievous-user');
    const testCases: TestCaseWithPlugin[] = [
      { vars: { test: 'value' }, metadata: { pluginId: 'test' } },
    ];
    const injectVar = 'inject';
    const config = {};

    await strategy.action(testCases, injectVar, config);

    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Adding mischievous user test cases'),
    );
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Added'));
  });

  it('should throw error for non-existent strategy', async () => {
    await expect(loadStrategy('non-existent')).rejects.toThrow('Strategy not found: non-existent');
  });

  it('should load custom file strategy', async () => {
    const customStrategy = {
      id: 'custom',
      action: vi.fn(),
    };
    vi.mocked(importModule).mockResolvedValue(customStrategy);
    (cliState as any).basePath = '/test/path';

    const strategy = await loadStrategy('file://custom.js');
    expect(strategy).toEqual(customStrategy);
  });

  it('should throw error for non-js custom file', async () => {
    await expect(loadStrategy('file://custom.txt')).rejects.toThrow(
      'Custom strategy file must be a JavaScript file',
    );
  });

  it('should throw error for invalid custom strategy', async () => {
    vi.mocked(importModule).mockResolvedValue({});

    await expect(loadStrategy('file://invalid.js')).rejects.toThrow(
      "Custom strategy in invalid.js must export an object with 'key' and 'action' properties",
    );
  });

  it('should use absolute path for custom strategy', async () => {
    const customStrategy = {
      id: 'custom',
      action: vi.fn(),
    };
    vi.mocked(importModule).mockResolvedValue(customStrategy);

    await loadStrategy('file:///absolute/path/custom.js');
    expect(importModule).toHaveBeenCalledWith('/absolute/path/custom.js');
  });

  it('should use relative path from basePath for custom strategy', async () => {
    const customStrategy = {
      id: 'custom',
      action: vi.fn(),
    };
    vi.mocked(importModule).mockResolvedValue(customStrategy);
    (cliState as any).basePath = '/base/path';

    await loadStrategy('file://relative/custom.js');
    expect(importModule).toHaveBeenCalledWith(path.join('/base/path', 'relative/custom.js'));
  });
});

describe('custom strategy validation', () => {
  it('should reject custom strategy without strategyText', async () => {
    const strategies: RedteamStrategyObject[] = [{ id: 'custom' }];
    await expect(validateStrategies(strategies)).rejects.toThrow(
      'Custom strategy requires strategyText in config',
    );
  });

  it('should reject custom strategy variant without strategyText', async () => {
    const strategies: RedteamStrategyObject[] = [{ id: 'custom:aggressive' }];
    await expect(validateStrategies(strategies)).rejects.toThrow(
      'Custom strategy requires strategyText in config',
    );
  });

  it('should validate custom strategy with strategyText', async () => {
    const strategies: RedteamStrategyObject[] = [
      { id: 'custom', config: { strategyText: 'Test strategy' } },
    ];
    await expect(validateStrategies(strategies)).resolves.toBeUndefined();
  });

  it('should validate custom strategy variants with compound IDs', async () => {
    const strategies: RedteamStrategyObject[] = [
      { id: 'custom:aggressive', config: { strategyText: 'Aggressive strategy' } },
      { id: 'custom:greeting-strategy', config: { strategyText: 'Greeting strategy' } },
      { id: 'custom:multi-word-variant', config: { strategyText: 'Multi-word variant' } },
      { id: 'custom:snake_case_variant', config: { strategyText: 'Snake case variant' } },
    ];
    await expect(validateStrategies(strategies)).resolves.toBeUndefined();
  });

  it('should validate custom strategies with config', async () => {
    const strategies: RedteamStrategyObject[] = [
      {
        id: 'custom:configured',
        config: {
          strategyText: 'Custom strategy text',
          stateful: true,
          temperature: 0.8,
        },
      },
    ];
    await expect(validateStrategies(strategies)).resolves.toBeUndefined();
  });

  it('should validate mixed strategies including custom variants', async () => {
    const strategies: RedteamStrategyObject[] = [
      { id: 'basic' },
      { id: 'custom', config: { strategyText: 'Custom strategy' } },
      { id: 'custom:variant1', config: { strategyText: 'Variant 1' } },
      { id: 'crescendo' },
      { id: 'custom:variant2', config: { strategyText: 'Custom text' } },
    ];
    await expect(validateStrategies(strategies)).resolves.toBeUndefined();
  });

  it('should validate custom strategies with complex variant names', async () => {
    const strategies: RedteamStrategyObject[] = [
      {
        id: 'custom:very-long-complex-variant-name-with-many-hyphens',
        config: { strategyText: 'Long variant' },
      },
      {
        id: 'custom:variant_with_underscores_and_numbers_123',
        config: { strategyText: 'Underscore variant' },
      },
      { id: 'custom:CamelCaseVariant', config: { strategyText: 'CamelCase variant' } },
      { id: 'custom:variant.with.dots', config: { strategyText: 'Dot variant' } },
    ];
    await expect(validateStrategies(strategies)).resolves.toBeUndefined();
  });

  it('should throw error for invalid custom-like strategy patterns', async () => {
    const strategies: RedteamStrategyObject[] = [
      { id: 'invalid-strategy' },
      { id: 'custom-invalid' },
      { id: 'custom_invalid' },
      { id: 'notcustom:variant' },
    ];

    await expect(validateStrategies(strategies)).rejects.toThrow('Invalid strategy(s)');
  });
});

describe('custom strategy loading', () => {
  it('should load simple custom strategy', async () => {
    const strategy = await loadStrategy('custom');
    expect(strategy).toBeDefined();
    expect(strategy.id).toBe('custom');
  });

  it('should call custom strategy action with correct parameters including strategyId', async () => {
    const strategy = await loadStrategy('custom');
    const testCases: TestCaseWithPlugin[] = [
      { vars: { test: 'value' }, metadata: { pluginId: 'test' } },
    ];
    const injectVar = 'inject';
    const config = { strategyText: 'Test strategy' };

    await strategy.action(testCases, injectVar, config, 'custom:test');

    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Adding Custom'));
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Added'));
  });
});
