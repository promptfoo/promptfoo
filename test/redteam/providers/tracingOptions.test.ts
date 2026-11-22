import { afterEach, describe, expect, it } from 'vitest';
import cliState from '../../../src/cliState';
import { resolveTracingOptions } from '../../../src/redteam/providers/tracingOptions';

import type { TracingConfig } from '../../../src/redteam/types';
import type { AtomicTestCase, UnifiedConfig } from '../../../src/types/index';

const previousConfig = cliState.config;

afterEach(() => {
  cliState.config = previousConfig;
});

describe('resolveTracingOptions', () => {
  it('prefers request-scoped tracing configuration to stale process-global configuration', async () => {
    cliState.config = {
      tracing: {
        enabled: true,
        provider: { id: 'tempo', endpoint: 'http://stale-tempo:3200' },
        queryDelay: 9000,
      },
    } as UnifiedConfig;

    const requestTracingConfig = {
      enabled: true,
      provider: { id: 'tempo' as const, endpoint: 'http://request-tempo:3200' },
      queryDelay: 1200,
      otlp: { http: { enabled: true, port: 4318, redactAttributes: ['customer_email'] } },
    };

    const options = await cliState.withRequestTracingConfig(requestTracingConfig, async () =>
      resolveTracingOptions({ strategyId: 'jailbreak' }),
    );

    expect(options).toMatchObject({
      provider: requestTracingConfig.provider,
      queryDelay: 1200,
      redactAttributes: ['customer_email'],
    });
  });

  it('isolates simultaneous evaluations without passing credentials through provider context', async () => {
    const firstTracingConfig = {
      enabled: true,
      provider: {
        id: 'tempo' as const,
        endpoint: 'http://first-tempo:3200',
        auth: { token: 'first-secret' },
      },
    };
    const secondTracingConfig = {
      enabled: true,
      provider: {
        id: 'tempo' as const,
        endpoint: 'http://second-tempo:3200',
        auth: { token: 'second-secret' },
      },
    };

    const [first, second] = await Promise.all([
      cliState.withRequestTracingConfig(firstTracingConfig, async () => {
        await Promise.resolve();
        return resolveTracingOptions({ strategyId: 'jailbreak' });
      }),
      cliState.withRequestTracingConfig(secondTracingConfig, async () => {
        await Promise.resolve();
        return resolveTracingOptions({ strategyId: 'jailbreak' });
      }),
    ]);

    expect(first.provider).toEqual(firstTracingConfig.provider);
    expect(second.provider).toEqual(secondTracingConfig.provider);
  });

  describe('strategy overrides', () => {
    const test = { vars: {} } as AtomicTestCase;

    function setRedteamTracing(tracing: TracingConfig) {
      cliState.config = { redteam: { tracing } } as UnifiedConfig;
    }

    it.each([
      { providerStrategyId: 'iterative-meta', configuredStrategyId: 'jailbreak:meta' },
      { providerStrategyId: 'hydra', configuredStrategyId: 'jailbreak:hydra' },
      { providerStrategyId: 'goblin', configuredStrategyId: 'jailbreak:goblin' },
    ])(
      'applies a $configuredStrategyId override to the $providerStrategyId provider',
      ({ providerStrategyId, configuredStrategyId }) => {
        setRedteamTracing({
          enabled: true,
          maxSpans: 50,
          strategies: { [configuredStrategyId]: { maxSpans: 100 } },
        });

        const options = resolveTracingOptions({ strategyId: providerStrategyId, test });

        expect(options.maxSpans).toBe(100);
      },
    );

    it.each([
      {
        source: 'test metadata tracing',
        test: {
          vars: {},
          metadata: { tracing: { strategies: { 'jailbreak:hydra': { maxSpans: 100 } } } },
        } as AtomicTestCase,
        config: undefined,
      },
      {
        source: 'test strategyConfig tracing',
        test: {
          vars: {},
          metadata: {
            strategyConfig: { tracing: { strategies: { 'jailbreak:hydra': { maxSpans: 100 } } } },
          },
        } as AtomicTestCase,
        config: undefined,
      },
      {
        source: 'provider config tracing',
        test,
        config: { tracing: { strategies: { 'jailbreak:hydra': { maxSpans: 100 } } } },
      },
    ])('applies a configured strategy override from $source', ({ test, config }) => {
      setRedteamTracing({ enabled: true, maxSpans: 50 });

      const options = resolveTracingOptions({ strategyId: 'hydra', test, config });

      expect(options).toMatchObject({ enabled: true, maxSpans: 100 });
    });

    it('still applies an override keyed by the provider strategy id', () => {
      setRedteamTracing({ enabled: true, strategies: { 'iterative-meta': { maxSpans: 75 } } });

      const options = resolveTracingOptions({ strategyId: 'iterative-meta', test });

      expect(options.maxSpans).toBe(75);
    });

    it('prefers the configured strategy id over the provider id at the same level', () => {
      setRedteamTracing({
        enabled: true,
        strategies: {
          'iterative-meta': { maxSpans: 75, maxDepth: 3 },
          'jailbreak:meta': { maxSpans: 100 },
        },
      });

      const options = resolveTracingOptions({ strategyId: 'iterative-meta', test });

      expect(options).toMatchObject({ maxSpans: 100, maxDepth: 3 });
    });

    it('keeps a test-level override by provider id ahead of a global one by strategy id', () => {
      setRedteamTracing({ enabled: true, strategies: { 'jailbreak:meta': { maxSpans: 100 } } });
      const testWithOverride = {
        vars: {},
        metadata: { tracing: { strategies: { 'iterative-meta': { maxSpans: 75 } } } },
      } as AtomicTestCase;

      const options = resolveTracingOptions({
        strategyId: 'iterative-meta',
        test: testWithOverride,
      });

      expect(options.maxSpans).toBe(75);
    });

    it("ignores other strategies' overrides, whatever strategy id the test case carries", () => {
      setRedteamTracing({
        enabled: true,
        maxSpans: 60,
        strategies: { 'jailbreak:hydra': { maxSpans: 100 }, crescendo: { maxSpans: 10 } },
      });
      const staleTest = { vars: {}, metadata: { strategyId: 'jailbreak:hydra' } } as AtomicTestCase;

      expect(resolveTracingOptions({ strategyId: 'goat', test: staleTest }).maxSpans).toBe(60);
      expect(resolveTracingOptions({ strategyId: 'iterative-meta', test }).maxSpans).toBe(60);
    });

    it('follows the running provider when the test case carries another strategy id', () => {
      setRedteamTracing({
        enabled: true,
        strategies: { 'jailbreak:hydra': { maxSpans: 100 }, 'jailbreak:meta': { maxSpans: 80 } },
      });
      const staleTest = { vars: {}, metadata: { strategyId: 'jailbreak:hydra' } } as AtomicTestCase;

      const options = resolveTracingOptions({ strategyId: 'iterative-meta', test: staleTest });

      expect(options.maxSpans).toBe(80);
    });
  });
});
