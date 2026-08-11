import { describe, expect, it } from 'vitest';
import { TestSuiteConfigSchema, TestSuiteSchema } from '../../src/types';

const schemas = [
  { name: 'resolved suite', schema: TestSuiteSchema },
  { name: 'configuration', schema: TestSuiteConfigSchema },
] as const;

describe.each(schemas)('$name tracing provider configuration', ({ schema }) => {
  const config = (tracing: Record<string, unknown>) => ({
    providers: [],
    prompts: [],
    tracing: { enabled: true, ...tracing },
  });

  it('accepts a supported Tempo endpoint and bounded retry settings', () => {
    expect(
      schema.safeParse(
        config({
          provider: {
            id: 'tempo',
            endpoint: 'https://tempo.example.com',
            auth: { token: 'secret' },
            timeout: 5000,
          },
          queryDelay: 1000,
        }),
      ).success,
    ).toBe(true);
  });

  it.each([
    { id: 'jaeger', endpoint: 'https://jaeger.example.com' },
    { id: 'tempo' },
    { id: 'tempo', endpoint: 'file:///tmp/traces' },
    { id: 'tempo', endpoint: 'https://user:secret@tempo.example.com' },
    { id: 'tempo', endpoint: 'https://tempo.example.com/tempo?token=secret' },
    { id: 'tempo', endpoint: 'https://tempo.example.com/tempo?opaque=secret' },
    { id: 'tempo', endpoint: 'https://tempo.example.com/tempo#token=secret' },
    { id: 'tempo', endpoint: 'https://tempo.example.com', timeout: -1 },
    { id: 'tempo', endpoint: 'https://tempo.example.com', timeout: 1.5 },
    { id: 'tempo', endpoint: 'https://tempo.example.com', auth: { username: 'user' } },
    {
      id: 'tempo',
      endpoint: 'https://tempo.example.com',
      auth: { token: 'token', username: 'user', password: 'password' },
    },
  ])('rejects invalid provider configuration: %o', (provider) => {
    expect(schema.safeParse(config({ provider })).success).toBe(false);
  });

  it.each([-1, 0.5, 300001])('rejects invalid query delays: %s', (queryDelay) => {
    expect(
      schema.safeParse(
        config({
          provider: { id: 'tempo', endpoint: 'https://tempo.example.com' },
          queryDelay,
        }),
      ).success,
    ).toBe(false);
  });
});
