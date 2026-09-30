import { describe, expect, it } from 'vitest';
import cliState from '../../src/cliState';
import { getEnvString } from '../../src/envars';
import { CreateJobRequestSchema } from '../../src/types/api/eval';
import { TestSuiteConfigSchema, TestSuiteSchema } from '../../src/types/index';
import { ProviderOptionsSchema } from '../../src/validators/providers';
import { createMockProvider } from '../factories/provider';

const parsers = [
  [
    'configuration',
    (env: Record<string, string>) =>
      TestSuiteConfigSchema.parse({ providers: ['echo'], prompts: ['fixture'], env }).env,
  ],
  [
    'runtime suite',
    (env: Record<string, string>) =>
      TestSuiteSchema.parse({
        providers: [createMockProvider()],
        prompts: [{ raw: 'fixture', label: 'fixture' }],
        env,
      }).env,
  ],
  [
    'API job',
    (env: Record<string, string>) =>
      CreateJobRequestSchema.parse({ providers: ['echo'], prompts: ['fixture'], env }).env,
  ],
] as const;

describe.each(parsers)('%s evaluation settings', (_name, parse) => {
  it.each(['fixture-connection-string', ''])('preserves scoped blob credentials: %j', (value) => {
    const env = { AZURE_STORAGE_CONNECTION_STRING: value };
    const parsed = parse(env);
    expect(parsed).toEqual(env);
    cliState.withEnv(parsed, () => {
      expect(getEnvString('AZURE_STORAGE_CONNECTION_STRING')).toBe(value);
    });
  });

  it('does not accept the internal test-process switch', () => {
    expect(parse({ IS_TESTING: 'true', OPENAI_API_KEY: 'fixture' })).toEqual({
      OPENAI_API_KEY: 'fixture',
    });
  });
});

it.each(['fixture', ''])('keeps blob credentials out of provider overrides: %j', (value) => {
  const provider = ProviderOptionsSchema.parse({
    id: 'echo',
    env: { AZURE_STORAGE_CONNECTION_STRING: value, IS_TESTING: 'true', OPENAI_API_KEY: 'fixture' },
  });
  expect(provider.env).toEqual({ OPENAI_API_KEY: 'fixture' });
});
