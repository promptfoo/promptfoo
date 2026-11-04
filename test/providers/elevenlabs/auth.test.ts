import { describe, expect, it, vi } from 'vitest';
import { getElevenLabsApiKey } from '../../../src/providers/elevenlabs/auth';
import { mockProcessEnv } from '../../util/utils';

import type { ElevenLabsBaseConfig } from '../../../src/providers/elevenlabs/types';
import type { EnvOverrides } from '../../../src/types/env';

type CredentialCase = {
  name: string;
  config: ElevenLabsBaseConfig;
  env?: EnvOverrides;
  processEnv?: Record<string, string>;
  expected?: string;
};

const cases: CredentialCase[] = [
  {
    name: 'explicit config before all environment sources',
    config: { apiKey: 'explicit-key', apiKeyEnvar: 'OPENAI_API_KEY' },
    env: { OPENAI_API_KEY: 'named-provider', ELEVENLABS_API_KEY: 'default-provider' },
    processEnv: { OPENAI_API_KEY: 'named-process', ELEVENLABS_API_KEY: 'default-process' },
    expected: 'explicit-key',
  },
  {
    name: 'named provider environment before named process environment',
    config: { apiKeyEnvar: 'OPENAI_API_KEY' },
    env: { OPENAI_API_KEY: 'named-provider', ELEVENLABS_API_KEY: 'default-provider' },
    processEnv: { OPENAI_API_KEY: 'named-process', ELEVENLABS_API_KEY: 'default-process' },
    expected: 'named-provider',
  },
  {
    name: 'named process environment before default provider environment',
    config: { apiKeyEnvar: 'OPENAI_API_KEY' },
    env: { ELEVENLABS_API_KEY: 'default-provider' },
    processEnv: { OPENAI_API_KEY: 'named-process', ELEVENLABS_API_KEY: 'default-process' },
    expected: 'named-process',
  },
  {
    name: 'default provider environment before default process environment',
    config: { apiKeyEnvar: 'OPENAI_API_KEY' },
    env: { ELEVENLABS_API_KEY: 'default-provider' },
    processEnv: { ELEVENLABS_API_KEY: 'default-process' },
    expected: 'default-provider',
  },
  {
    name: 'default process environment when provider credentials are missing',
    config: { apiKeyEnvar: 'OPENAI_API_KEY' },
    processEnv: { ELEVENLABS_API_KEY: 'default-process' },
    expected: 'default-process',
  },
  {
    name: 'missing credentials',
    config: { apiKeyEnvar: 'OPENAI_API_KEY' },
  },
  {
    name: 'empty config key falls through to provider environment',
    config: { apiKey: '' },
    env: { ELEVENLABS_API_KEY: 'default-provider' },
    expected: 'default-provider',
  },
  {
    name: 'empty named provider key falls through to named process environment',
    config: { apiKeyEnvar: 'OPENAI_API_KEY' },
    env: { OPENAI_API_KEY: '', ELEVENLABS_API_KEY: 'default-provider' },
    processEnv: { OPENAI_API_KEY: 'named-process' },
    expected: 'named-process',
  },
  {
    name: 'empty default provider key falls through to process environment',
    config: {},
    env: { ELEVENLABS_API_KEY: '' },
    processEnv: { ELEVENLABS_API_KEY: 'default-process' },
    expected: 'default-process',
  },
];

describe('getElevenLabsApiKey', () => {
  it.each(cases)('resolves $name', ({ config, env, processEnv, expected }) => {
    const restoreEnv = mockProcessEnv({
      OPENAI_API_KEY: undefined,
      ELEVENLABS_API_KEY: undefined,
      ...processEnv,
    });
    try {
      expect(getElevenLabsApiKey({ config }, () => env)).toBe(expected);
    } finally {
      restoreEnv();
    }
  });

  it('does not read the private environment when config supplies a key', () => {
    const readEnv = vi.fn(() => ({ ELEVENLABS_API_KEY: 'unused-key' }));
    expect(getElevenLabsApiKey({ config: { apiKey: 'explicit-key' } }, readEnv)).toBe(
      'explicit-key',
    );
    expect(readEnv).not.toHaveBeenCalled();
  });
});
