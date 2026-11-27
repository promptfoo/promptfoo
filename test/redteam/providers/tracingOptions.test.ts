import { afterEach, describe, expect, it } from 'vitest';
import cliState from '../../../src/cliState';
import { resolveTracingOptions } from '../../../src/redteam/providers/tracingOptions';

import type { UnifiedConfig } from '../../../src/types/index';

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
});
