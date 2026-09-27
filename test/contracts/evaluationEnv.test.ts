import { describe, expect, it } from 'vitest';
import cliState from '../../src/cliState';
import { getEnvBool, getEnvInt, getEnvString } from '../../src/envars';
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

const cacheSettings = {
  PROMPTFOO_CACHE_PATH: 'fixture/cache',
  PROMPTFOO_CACHE_TYPE: 'disk',
  PROMPTFOO_CACHE_TTL: '30',
  PROMPTFOO_CACHE_ENABLED: 'true',
  PROMPTFOO_CONFIG_DIR: 'fixture/config',
};

describe.each(parsers)('%s evaluation settings', (_name, parse) => {
  it.each([
    cacheSettings,
    {
      PROMPTFOO_CACHE_PATH: '',
      PROMPTFOO_CACHE_TYPE: 'memory',
      PROMPTFOO_CACHE_TTL: '0',
      PROMPTFOO_CACHE_ENABLED: 'false',
      PROMPTFOO_CONFIG_DIR: '',
    },
  ])('preserves parsed cache values and explicit masks: %j', (env) => {
    const parsed = parse(env);
    expect(parsed).toEqual(env);
    cliState.withEnvFileOverrides(cacheSettings, () =>
      cliState.withEnv(parsed, () => {
        expect(getEnvString('PROMPTFOO_CACHE_PATH')).toBe(env.PROMPTFOO_CACHE_PATH);
        expect(getEnvString('PROMPTFOO_CACHE_TYPE')).toBe(env.PROMPTFOO_CACHE_TYPE);
        expect(getEnvInt('PROMPTFOO_CACHE_TTL')).toBe(Number(env.PROMPTFOO_CACHE_TTL));
        expect(getEnvBool('PROMPTFOO_CACHE_ENABLED')).toBe(env.PROMPTFOO_CACHE_ENABLED === 'true');
        expect(getEnvString('PROMPTFOO_CONFIG_DIR')).toBe(env.PROMPTFOO_CONFIG_DIR);
      }),
    );
  });

  it.each(['true', 'false', ''])('preserves parsed telemetry controls %j', (value) => {
    const env = { IS_TESTING: value, PROMPTFOO_DISABLE_TELEMETRY: value };
    const parsed = parse(env);
    expect(parsed).toEqual(env);
    cliState.withEnvFileOverrides({ IS_TESTING: 'true', PROMPTFOO_DISABLE_TELEMETRY: 'true' }, () =>
      cliState.withEnv(parsed, () => {
        expect(getEnvBool('IS_TESTING')).toBe(value === 'true');
        expect(getEnvBool('PROMPTFOO_DISABLE_TELEMETRY')).toBe(value === 'true');
      }),
    );
  });
});

it.each(['fixture', ''])(
  'does not advertise evaluation settings as provider overrides: %j',
  (value) => {
    const keys = [...Object.keys(cacheSettings), 'IS_TESTING', 'PROMPTFOO_DISABLE_TELEMETRY'];
    const provider = ProviderOptionsSchema.parse({
      id: 'echo',
      env: { ...Object.fromEntries(keys.map((key) => [key, value])), OPENAI_API_KEY: 'fixture' },
    });
    expect(provider.env).toEqual({ OPENAI_API_KEY: 'fixture' });
  },
);
