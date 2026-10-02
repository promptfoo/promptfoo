import { describe, expect, it } from 'vitest';
import cliState from '../../src/cliState';
import { EnvOverridesSchema } from '../../src/contracts';
import { getEnvBool, getEnvInt, getEnvString } from '../../src/envars';
import { CreateJobRequestSchema } from '../../src/types/api/eval';
import { TestSuiteConfigSchema, TestSuiteSchema } from '../../src/types/index';
import { ProviderOptionsSchema } from '../../src/validators/providers';
import { createMockProvider } from '../factories/provider';

const parsers = [
  [
    'configuration',
    (env: Record<string, unknown>) =>
      TestSuiteConfigSchema.parse({ providers: ['echo'], prompts: ['fixture'], env }).env,
  ],
  [
    'runtime suite',
    (env: Record<string, unknown>) =>
      TestSuiteSchema.parse({
        providers: [createMockProvider()],
        prompts: [{ raw: 'fixture', label: 'fixture' }],
        env,
      }).env,
  ],
  [
    'API job',
    (env: Record<string, unknown>) =>
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
  it.each(['true', true])('strips the internal test flag: %j', (flag) => {
    expect(parse({ ...cacheSettings, IS_TESTING: flag })).toEqual(cacheSettings);
  });
});

it.each(parsers.filter(([name]) => name !== 'runtime suite'))(
  '%s normalizes scalar values without enabling the internal test mode',
  (_name, parse) => {
    expect(
      parse({ PROMPTFOO_CACHE_ENABLED: false, PROMPTFOO_CACHE_TTL: 0, IS_TESTING: true }),
    ).toEqual({
      PROMPTFOO_CACHE_ENABLED: 'false',
      PROMPTFOO_CACHE_TTL: '0',
    });
  },
);

it('exposes evaluation settings through the portable contracts entry', () => {
  expect(EnvOverridesSchema.parse(cacheSettings)).toEqual(cacheSettings);
});

it('keeps cache settings out of provider overrides', () => {
  const provider = ProviderOptionsSchema.parse({ id: 'echo', env: cacheSettings });
  expect(provider.env).toEqual({});
});
