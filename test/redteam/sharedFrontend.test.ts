import { afterEach, describe, expect, it, vi } from 'vitest';
import { Severity } from '../../src/redteam/constants';
import {
  getRiskCategorySeverityMap,
  getTargetForExecution,
  getUnifiedConfig,
} from '../../src/redteam/sharedFrontend';

import type { Plugin } from '../../src/redteam/constants';
import type { SavedRedteamConfig } from '../../src/redteam/types';

/** Extract the first target's config from a getUnifiedConfig result (always an array at runtime). */
function getFirstTargetConfig(
  result: ReturnType<typeof getUnifiedConfig>,
): Record<string, unknown> {
  const { targets } = result;
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error('Expected targets to be a non-empty array');
  }
  const target = targets[0];
  if (typeof target !== 'object' || target === null || !('config' in target)) {
    throw new Error('Expected first target to be an object with config');
  }
  return (target as { config: Record<string, unknown> }).config;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('getRiskCategorySeverityMap', () => {
  it('should return default severity map when no plugins provided', () => {
    const result = getRiskCategorySeverityMap();
    expect(result).toBeDefined();
    expect(result['contracts']).toBe(Severity.Medium);
  });

  it('should override default severities with plugin severities', () => {
    const plugins = [
      { id: 'contracts' as Plugin, severity: Severity.High },
      { id: 'politics' as Plugin, severity: Severity.Critical },
    ];

    const result = getRiskCategorySeverityMap(plugins);

    expect(result['contracts']).toBe(Severity.High);
    expect(result['politics']).toBe(Severity.Critical);
  });

  it('should handle plugins without severity override', () => {
    const plugins = [
      { id: 'contracts' as Plugin },
      { id: 'politics' as Plugin, severity: Severity.Critical },
    ];

    const result = getRiskCategorySeverityMap(plugins);

    expect(result['contracts']).toBe(Severity.Medium); // Default severity
    expect(result['politics']).toBe(Severity.Critical);
  });

  it('should add severity entry for specific policy ID when plugin is a custom policy', () => {
    const plugins = [
      {
        id: 'policy' as Plugin,
        severity: Severity.Low,
        config: { policy: { id: 'abc123', text: 'Do not discuss cats', name: 'No Cats' } },
      },
    ];

    const result = getRiskCategorySeverityMap(plugins);

    // Should have entry for both 'policy' and the specific policy ID
    expect(result['policy']).toBe(Severity.Low);
    expect(result['abc123' as Plugin]).toBe(Severity.Low);
  });

  it('should handle multiple custom policies with different severities', () => {
    const plugins = [
      {
        id: 'policy' as Plugin,
        severity: Severity.Low,
        config: { policy: { id: 'policy-1', text: 'Policy 1', name: 'Policy 1' } },
      },
      {
        id: 'policy' as Plugin,
        severity: Severity.Critical,
        config: { policy: { id: 'policy-2', text: 'Policy 2', name: 'Policy 2' } },
      },
    ];

    const result = getRiskCategorySeverityMap(plugins);

    // Each specific policy ID should have its own severity
    expect(result['policy-1' as Plugin]).toBe(Severity.Low);
    expect(result['policy-2' as Plugin]).toBe(Severity.Critical);
    // The generic 'policy' key gets the last value (Critical)
    expect(result['policy']).toBe(Severity.Critical);
  });

  it('should not add policy ID entry when policy config is missing', () => {
    const plugins = [
      {
        id: 'policy' as Plugin,
        severity: Severity.Low,
        // No config.policy.id
      },
    ];

    const result = getRiskCategorySeverityMap(plugins);

    expect(result['policy']).toBe(Severity.Low);
    // Should not throw or add undefined keys
    expect(Object.keys(result).filter((k) => k === 'undefined')).toHaveLength(0);
  });

  it('should not add policy ID entry for non-policy plugins', () => {
    const plugins = [
      {
        id: 'contracts' as Plugin,
        severity: Severity.High,
        config: { policy: { id: 'should-not-be-added' } },
      },
    ];

    const result = getRiskCategorySeverityMap(plugins);

    expect(result['contracts']).toBe(Severity.High);
    expect(result['should-not-be-added' as Plugin]).toBeUndefined();
  });
});

describe('getTargetForExecution', () => {
  it('removes cleared form values without creating a verification override', () => {
    const provider = {
      id: 'http',
      config: { tls: { caPath: '', certPath: '', keyPath: '', caInputType: 'path' } },
    };
    expect(getTargetForExecution(provider)).toEqual({ id: 'http', config: {} });
    expect(provider.config.tls.caPath).toBe('');
  });

  it('preserves provider options while removing TLS form fields', () => {
    const provider = {
      id: 'http',
      config: {
        stateful: true,
        sessionSource: 'provider-owned',
        tls: { rejectUnauthorized: true, ca: 'test-ca', caInputType: 'upload' },
      },
    };

    expect(getTargetForExecution(provider)).toEqual({
      ...provider,
      config: { ...provider.config, tls: { rejectUnauthorized: true, ca: 'test-ca' } },
    });
    expect(provider.config.tls.caInputType).toBe('upload');
  });
  it.each(['http', 'https', 'http://example.test', 'https://example.test'])(
    'removes cleared certificate arrays for %s without changing the saved form',
    (id) => {
      const tls = { ca: ['', '  '], cert: [], key: [''], caInputType: 'inline' };
      const provider = { id, config: { tls } };

      expect(getTargetForExecution(provider)).toEqual({ id, config: {} });
      expect(tls.ca).toEqual(['', '  ']);
      expect(tls.key).toEqual(['']);
    },
  );

  it('preserves nonblank certificate array entries without trimming their contents', () => {
    const tls = { ca: ['', ' CA ', ''], cert: ['CERT', ''], key: [' ', 'KEY'] };
    expect(getTargetForExecution({ id: 'http', config: { tls } }).config.tls).toEqual({
      ca: [' CA '],
      cert: ['CERT'],
      key: ['KEY'],
    });
    expect(tls.cert).toEqual(['CERT', '']);
  });

  it.each([true, 'custom-policy', { enabled: true, ca: [''], certificateType: 'custom' }, null])(
    'preserves custom provider TLS options: %j',
    (tls) => {
      const provider = { id: 'file://provider.js', config: { tls } };
      expect(getTargetForExecution(provider)).toEqual(provider);
    },
  );

  it.each(['openai:chatkit', 'http-custom', undefined])(
    'leaves TLS object fields opaque for provider %s',
    (id) => {
      const provider = { id, config: { tls: { enabled: true, ca: '', certificateType: 'none' } } };
      expect(getTargetForExecution(provider)).toEqual(provider);
    },
  );

  it.each([true, 'custom-policy', ['CA']])(
    'leaves invalid HTTP TLS shapes for validation: %j',
    (tls) => {
      const provider = { id: 'http', config: { tls } };
      expect(getTargetForExecution(provider)).toEqual(provider);
    },
  );
});

describe('getUnifiedConfig', () => {
  const baseConfig: SavedRedteamConfig = {
    description: 'Test config',
    prompts: ['test prompt'],
    target: {
      id: 'test-target',
      config: {
        sessionSource: 'test-session',
        stateful: true,
        apiKey: 'test-key',
      },
    },
    plugins: ['test-plugin'],
    strategies: ['basic'],
    purpose: 'testing',
    applicationDefinition: {},
    entities: [],
  };

  it('should transform config correctly', () => {
    const result = getUnifiedConfig(baseConfig);

    expect(result.description).toBe('Test config');
    expect(result.prompts).toEqual(['test prompt']);
    const targetConfig = getFirstTargetConfig(result);
    expect(targetConfig.sessionSource).toBeUndefined();
    expect(targetConfig.stateful).toBeUndefined();
    expect(result.redteam.purpose).toBe('testing');
  });

  it('should handle defaultTest transformation', () => {
    const configWithDefaultTest: SavedRedteamConfig = {
      ...baseConfig,
      defaultTest: {
        vars: { test: 'value' },
        options: { someOption: true },
      },
    };

    const result = getUnifiedConfig(configWithDefaultTest);

    expect(typeof result.defaultTest).toBe('object');
    expect(result.defaultTest).toBeDefined();
    // Type assertion since we've verified it's an object above
    const defaultTest = result.defaultTest as Exclude<
      typeof result.defaultTest,
      string | undefined
    >;
    expect(defaultTest.vars).toEqual({ test: 'value' });
    expect(defaultTest.options!.transformVars).toBe('{ ...vars, sessionId: context.uuid }');
  });

  it('should transform plugins correctly', () => {
    const configWithPlugins: SavedRedteamConfig = {
      ...baseConfig,
      plugins: ['simple-plugin', { id: 'complex-plugin', config: { setting: true } }],
    };

    const result = getUnifiedConfig(configWithPlugins);

    expect(result.redteam.plugins).toEqual([
      { id: 'simple-plugin' },
      { id: 'complex-plugin', config: { setting: true } },
    ]);
  });

  it('should transform strategies with stateful config', () => {
    const configWithStrategies: SavedRedteamConfig = {
      ...baseConfig,
      strategies: ['basic', 'goat', { id: 'custom', config: { option: true } }],
    };

    const result = getUnifiedConfig(configWithStrategies);

    expect(result.redteam.strategies).toEqual([
      { id: 'basic' },
      { id: 'goat', config: { stateful: true } },
      { id: 'custom', config: { option: true, stateful: true } },
    ]);
  });

  it('should handle maxConcurrency configuration', () => {
    const configWithMaxConcurrency: SavedRedteamConfig = {
      ...baseConfig,
      maxConcurrency: 5,
    };

    const result = getUnifiedConfig(configWithMaxConcurrency);
    expect(result.redteam.maxConcurrency).toBe(5);

    const configWithoutMaxConcurrency = getUnifiedConfig(baseConfig);
    expect(configWithoutMaxConcurrency.redteam.maxConcurrency).toBeUndefined();
  });

  it('should include testGenerationInstructions if provided', () => {
    const configWithInstructions: SavedRedteamConfig = {
      ...baseConfig,
      testGenerationInstructions: 'Generate more tests',
    };

    const result = getUnifiedConfig(configWithInstructions);

    expect(result.redteam.testGenerationInstructions).toBe('Generate more tests');
  });

  it('should include maxCharsPerMessage if provided', () => {
    const configWithMaxChars: SavedRedteamConfig = {
      ...baseConfig,
      maxCharsPerMessage: 125,
    };

    const result = getUnifiedConfig(configWithMaxChars);

    expect(result.redteam.maxCharsPerMessage).toBe(125);
  });

  it('should omit plugin config if empty', () => {
    const configWithEmptyPluginConfig: SavedRedteamConfig = {
      ...baseConfig,
      plugins: [{ id: 'plugin-empty', config: {} }],
    };

    const result = getUnifiedConfig(configWithEmptyPluginConfig);

    expect(result.redteam.plugins).toEqual([{ id: 'plugin-empty' }]);
  });

  it('should omit strategy config if not needed', () => {
    const configWithSimpleStrategy: SavedRedteamConfig = {
      ...baseConfig,
      strategies: [{ id: 'basic', config: {} }],
    };

    const result = getUnifiedConfig(configWithSimpleStrategy);

    expect(result.redteam.strategies).toEqual([{ id: 'basic' }]);
  });

  it('should add stateful to multi-turn strategies if stateful is true', () => {
    const configWithMultiTurn: SavedRedteamConfig = {
      ...baseConfig,
      strategies: ['goat'],
      target: {
        ...baseConfig.target,
        config: {
          ...baseConfig.target.config,
          stateful: true,
        },
      },
    };

    const result = getUnifiedConfig(configWithMultiTurn);

    expect(result.redteam.strategies).toEqual([{ id: 'goat', config: { stateful: true } }]);
  });

  it('should not add stateful config for multi-turn strategies if stateful is false', () => {
    const configWithNonStateful: SavedRedteamConfig = {
      ...baseConfig,
      strategies: ['goat'],
      target: {
        ...baseConfig.target,
        config: {
          ...baseConfig.target.config,
          stateful: false,
        },
      },
    };

    const result = getUnifiedConfig(configWithNonStateful);

    expect(result.redteam.strategies).toEqual([{ id: 'goat' }]);
  });

  it('should handle multi-turn strategies when an imported target has a null config', () => {
    const configWithNullTarget: SavedRedteamConfig = {
      ...baseConfig,
      strategies: ['goat', { id: 'jailbreak:hydra' }],
      target: {
        ...baseConfig.target,
        config: null as unknown as SavedRedteamConfig['target']['config'],
      },
    };

    const result = getUnifiedConfig(configWithNullTarget);

    expect(result.targets).toEqual([expect.objectContaining({ config: {} })]);
    expect(result.redteam.strategies).toEqual([{ id: 'goat' }, { id: 'jailbreak:hydra' }]);
  });

  it('should include frameworks when provided', () => {
    const configWithFrameworks: SavedRedteamConfig = {
      ...baseConfig,
      frameworks: ['owasp:llm', 'nist:ai:measure'],
    };

    const result = getUnifiedConfig(configWithFrameworks);

    expect(result.redteam.frameworks).toEqual(['owasp:llm', 'nist:ai:measure']);
  });

  it('should include provider when provided as string', () => {
    const configWithProvider: SavedRedteamConfig = {
      ...baseConfig,
      provider: 'openai:chat:gpt-4',
    };

    const result = getUnifiedConfig(configWithProvider);

    expect(result.redteam.provider).toBe('openai:chat:gpt-4');
  });

  it('should include provider when provided as object', () => {
    const configWithProvider: SavedRedteamConfig = {
      ...baseConfig,
      provider: {
        id: 'openai:chat',
        config: {
          apiBaseUrl: 'http://192.168.1.1:1111/v1',
          apiKey: 'sk-test',
          model: 'Qwen3-test',
        },
      },
    };

    const result = getUnifiedConfig(configWithProvider);

    expect(result.redteam.provider).toEqual({
      id: 'openai:chat',
      config: {
        apiBaseUrl: 'http://192.168.1.1:1111/v1',
        apiKey: 'sk-test',
        model: 'Qwen3-test',
      },
    });
  });

  it('should not include provider when not provided', () => {
    const result = getUnifiedConfig(baseConfig);

    expect(result.redteam.provider).toBeUndefined();
  });

  describe('TLS UI field cleanup', () => {
    it('should strip all UI-only TLS fields from exported config', () => {
      const configWithTls: SavedRedteamConfig = {
        ...baseConfig,
        target: {
          ...baseConfig.target,
          id: 'http',
          config: {
            ...baseConfig.target.config,
            tls: {
              rejectUnauthorized: false,
              cert: 'my-cert',
              certPath: '/path/to/cert',
              enabled: true,
              certInputType: 'upload',
              keyInputType: 'path',
              jksInputType: 'upload',
              pfxInputType: 'base64',
              caInputType: 'inline',
              jksContent: 'base64-jks',
              jksFileName: 'keystore.jks',
              jksExtractConfigured: true,
              certificateType: 'pem',
            },
          },
        },
      };

      const result = getUnifiedConfig(configWithTls);
      const tls = getFirstTargetConfig(result).tls as Record<string, unknown>;

      // Backend fields preserved
      expect(tls.rejectUnauthorized).toBe(false);
      expect(tls.cert).toBe('my-cert');
      expect(tls.certPath).toBe('/path/to/cert');
      expect(tls.jksContent).toBeUndefined();

      // UI-only fields stripped
      expect(tls.enabled).toBeUndefined();
      expect(tls.certInputType).toBeUndefined();
      expect(tls.keyInputType).toBeUndefined();
      expect(tls.jksInputType).toBeUndefined();
      expect(tls.pfxInputType).toBeUndefined();
      expect(tls.caInputType).toBeUndefined();
      expect(tls.jksFileName).toBeUndefined();
      expect(tls.jksExtractConfigured).toBeUndefined();
      expect(tls.certificateType).toBeUndefined();
    });

    it.each([
      ['none', {}],
      [
        'pem',
        {
          cert: 'pem-cert',
          certPath: '/client.crt',
          key: 'pem-key',
          keyPath: '/client.key',
          passphrase: 'password',
        },
      ],
      ['pfx', { pfx: 'pfx-content', pfxPath: '/client.pfx', passphrase: 'password' }],
      ['pkcs12', { pfx: 'pfx-content', pfxPath: '/client.pfx', passphrase: 'password' }],
      [
        'jks',
        {
          jksContent: 'jks-content',
          jksPath: '/client.jks',
          keyAlias: 'client',
          passphrase: 'password',
        },
      ],
    ])(
      'exports only selected %s credentials from an imported form',
      (certificateType, credentials) => {
        const tls = {
          certificateType,
          rejectUnauthorized: true,
          ca: ['CA'],
          servername: 'example.test',
          jksContent: 'jks-content',
          jksPath: '/client.jks',
          keyAlias: 'client',
          cert: 'pem-cert',
          certPath: '/client.crt',
          key: 'pem-key',
          keyPath: '/client.key',
          pfx: 'pfx-content',
          pfxPath: '/client.pfx',
          passphrase: 'password',
        };
        const result = getUnifiedConfig({
          ...baseConfig,
          target: { id: 'http', config: { tls } },
        });

        expect(getFirstTargetConfig(result).tls).toEqual({
          rejectUnauthorized: true,
          ca: ['CA'],
          servername: 'example.test',
          ...credentials,
        });
        expect(tls.jksContent).toBe('jks-content');
        expect(tls.key).toBe('pem-key');
      },
    );

    it('should preserve backend-specific fields like keyAlias and jksPath', () => {
      const configWithTls: SavedRedteamConfig = {
        ...baseConfig,
        target: {
          ...baseConfig.target,
          id: 'http',
          config: {
            ...baseConfig.target.config,
            tls: {
              rejectUnauthorized: false,
              keyAlias: 'mykey',
              jksPath: '/path/to/keystore.jks',
            },
          },
        },
      };

      const result = getUnifiedConfig(configWithTls);
      const tls = getFirstTargetConfig(result).tls as Record<string, unknown>;

      expect(tls.keyAlias).toBe('mykey');
      expect(tls.jksPath).toBe('/path/to/keystore.jks');
    });

    it('leaves transport defaults unchanged after stripping UI fields', () => {
      const configWithTls: SavedRedteamConfig = {
        ...baseConfig,
        target: {
          ...baseConfig.target,
          id: 'http',
          config: {
            ...baseConfig.target.config,
            tls: {
              enabled: true,
              certInputType: 'upload',
              certificateType: 'none',
            },
          },
        },
      };

      const result = getUnifiedConfig(configWithTls);

      expect(getFirstTargetConfig(result).tls).toBeUndefined();
    });

    it('omits an empty TLS block before visiting the form', () => {
      const result = getUnifiedConfig({
        ...baseConfig,
        target: { ...baseConfig.target, id: 'http', config: { tls: {} } },
      });

      expect(getFirstTargetConfig(result).tls).toBeUndefined();
    });

    it('preserves explicit certificate verification without other TLS fields', () => {
      const configWithTls: SavedRedteamConfig = {
        ...baseConfig,
        target: {
          ...baseConfig.target,
          id: 'http',
          config: {
            ...baseConfig.target.config,
            tls: {
              rejectUnauthorized: true,
              enabled: true,
              certificateType: 'pem',
            },
          },
        },
      };

      const result = getUnifiedConfig(configWithTls);

      expect(getFirstTargetConfig(result).tls).toEqual({ rejectUnauthorized: true });
    });

    it('should keep tls object when rejectUnauthorized is false', () => {
      const configWithTls: SavedRedteamConfig = {
        ...baseConfig,
        target: {
          ...baseConfig.target,
          id: 'http',
          config: {
            ...baseConfig.target.config,
            tls: {
              rejectUnauthorized: false,
            },
          },
        },
      };

      const result = getUnifiedConfig(configWithTls);

      expect(getFirstTargetConfig(result).tls).toEqual({ rejectUnauthorized: false });
    });

    it('should keep tls object when rejectUnauthorized: true plus real backend fields remain', () => {
      const configWithTls: SavedRedteamConfig = {
        ...baseConfig,
        target: {
          ...baseConfig.target,
          id: 'http',
          config: {
            ...baseConfig.target.config,
            tls: {
              rejectUnauthorized: true,
              cert: 'my-cert',
              certificateType: 'pem',
            },
          },
        },
      };

      const result = getUnifiedConfig(configWithTls);
      const tls = getFirstTargetConfig(result).tls as Record<string, unknown>;

      // tls should be preserved because cert is a real backend field
      expect(tls).toBeDefined();
      expect(tls.rejectUnauthorized).toBe(true);
      expect(tls.cert).toBe('my-cert');
      // UI-only certificateType should still be stripped
      expect(tls.certificateType).toBeUndefined();
    });

    it('should not add tls when target has no tls config', () => {
      const result = getUnifiedConfig(baseConfig);

      expect(getFirstTargetConfig(result).tls).toBeUndefined();
    });
  });
});
