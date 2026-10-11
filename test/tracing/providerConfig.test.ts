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

  it('accepts ordinary reverse-proxy path prefixes', () => {
    expect(
      schema.safeParse(
        config({
          provider: { id: 'tempo', endpoint: 'https://tempo.example.com/team-west/tempo' },
        }),
      ).success,
    ).toBe(true);
  });

  it('accepts a Braintrust endpoint, project ID, and API token', () => {
    expect(
      schema.safeParse(
        config({
          provider: {
            id: 'braintrust',
            endpoint: 'https://api.braintrust.dev',
            projectId: '12345678-1234-4123-8123-123456789abc',
            auth: { token: 'braintrust-token' },
          },
        }),
      ).success,
    ).toBe(true);
  });

  it('accepts a Langfuse endpoint and public and secret keys', () => {
    expect(
      schema.safeParse(
        config({
          provider: {
            id: 'langfuse',
            endpoint: 'https://cloud.langfuse.com',
            auth: { username: 'public-key', password: 'secret-key' },
          },
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
    { id: 'tempo', endpoint: 'https://tempo.example.com/tempo/token-privateTenantCredential123' },
    { id: 'tempo', endpoint: 'https://tempo.example.com/tempo/%74oken-privateTenantCredential123' },
    {
      id: 'tempo',
      endpoint: 'https://tempo.example.com/tempo/2e163f4d-28e2-4f84-b6d2-05e13058d6aa',
    },
    { id: 'tempo', endpoint: 'https://tempo.example.com/tempo/2e163f4d28e24f84b6d205e13058d6aa' },
    { id: 'tempo', endpoint: 'https://tempo.example.com/tempo/eyJheader.payload.signature' },
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

  it.each([
    { id: 'braintrust', endpoint: 'https://api.braintrust.dev' },
    {
      id: 'braintrust',
      endpoint: 'https://api.braintrust.dev',
      projectId: 'not-a-project-id',
      auth: { token: 'token' },
    },
    {
      id: 'braintrust',
      endpoint: 'https://api.braintrust.dev',
      projectId: '12345678-1234-4123-8123-123456789abc',
    },
  ])('rejects invalid Braintrust provider configuration: %o', (provider) => {
    expect(schema.safeParse(config({ provider })).success).toBe(false);
  });

  it.each([
    { id: 'langfuse', endpoint: 'https://cloud.langfuse.com' },
    {
      id: 'langfuse',
      endpoint: 'https://cloud.langfuse.com',
      auth: { username: 'public-key' },
    },
    {
      id: 'langfuse',
      endpoint: 'https://cloud.langfuse.com',
      auth: { password: 'secret-key' },
    },
    {
      id: 'langfuse',
      endpoint: 'https://cloud.langfuse.com',
      auth: { username: 'public-key', password: 'secret-key', token: 'token' },
    },
  ])('rejects invalid Langfuse provider configuration: %o', (provider) => {
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
