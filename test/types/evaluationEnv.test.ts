import { describe, expect, it } from 'vitest';
import cliState from '../../src/cliState';
import { getEnvBool } from '../../src/envars';
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

describe.each(parsers)('%s telemetry settings', (_name, parse) => {
  it.each(['true', 'false', ''])('preserves the opt-out flag and explicit mask %j', (value) => {
    const env = { PROMPTFOO_DISABLE_TELEMETRY: value };
    const parsed = parse(env);
    expect(parsed).toEqual(env);
    cliState.withEnvFileOverrides({ PROMPTFOO_DISABLE_TELEMETRY: 'true' }, () =>
      cliState.withEnv(parsed, () => {
        expect(getEnvBool('PROMPTFOO_DISABLE_TELEMETRY')).toBe(value === 'true');
      }),
    );
  });

  it('does not accept the internal host test-mode switch', () => {
    expect(parse({ IS_TESTING: 'true', PROMPTFOO_DISABLE_TELEMETRY: 'true' })).toEqual({
      PROMPTFOO_DISABLE_TELEMETRY: 'true',
    });
  });
});

it.each([TestSuiteConfigSchema, CreateJobRequestSchema])(
  'strips internal test mode from converted env values',
  (schema) => {
    expect(
      schema.parse({
        providers: ['echo'],
        prompts: ['fixture'],
        env: { IS_TESTING: true, PROMPTFOO_DISABLE_TELEMETRY: false },
      }).env,
    ).toEqual({
      PROMPTFOO_DISABLE_TELEMETRY: 'false',
    });
  },
);

it('keeps telemetry and internal test mode out of provider overrides', () => {
  const provider = ProviderOptionsSchema.parse({
    id: 'echo',
    env: { IS_TESTING: 'true', PROMPTFOO_DISABLE_TELEMETRY: 'true', OPENAI_API_KEY: 'fixture' },
  });
  expect(provider.env).toEqual({ OPENAI_API_KEY: 'fixture' });
});
