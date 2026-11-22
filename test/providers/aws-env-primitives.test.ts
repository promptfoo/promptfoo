import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { getMergedEnvOverrides } from '../../src/envars';
import { AwsBedrockCompletionProvider } from '../../src/providers/bedrock';
import { TestProviderRequestSchema } from '../../src/types/api/providers';
import { readConfig } from '../../src/util/config/load';
import { ProviderOptionsSchema } from '../../src/validators/providers';
import { mockProcessEnv } from '../util/utils';

import type { EnvOverrides } from '../../src/contracts/env';

let directory: string;
let restore: () => void;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-env-primitives-'));
  fs.writeFileSync(path.join(directory, 'config'), '');
  fs.writeFileSync(path.join(directory, 'credentials'), '');
  restore = mockProcessEnv(
    {
      AWS_CONFIG_FILE: path.join(directory, 'config'),
      AWS_SHARED_CREDENTIALS_FILE: path.join(directory, 'credentials'),
      AWS_ACCESS_KEY_ID: 'fixture-access',
      AWS_SECRET_ACCESS_KEY: 'fixture-secret',
      AWS_USE_FIPS_ENDPOINT: 'true',
      AWS_USE_DUALSTACK_ENDPOINT: 'true',
      AWS_EC2_METADATA_DISABLED: 'true',
    },
    { clear: true },
  );
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network access'));
});

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
  restore();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('parsed provider SDK environments', () => {
  it.each(['saved-provider', 'test-provider-api'] as const)(
    'retains SDK routing settings through %s validation',
    async (kind) => {
      const input = {
        id: 'bedrock:fixture',
        env: {
          AWS_CONFIG_FILE: path.join(directory, 'config'),
          AWS_SHARED_CREDENTIALS_FILE: path.join(directory, 'credentials'),
          AWS_ENDPOINT_URL_BEDROCK_RUNTIME: 'https://scoped-bedrock.invalid',
          AWS_USE_FIPS_ENDPOINT: 'false',
          AWS_USE_DUALSTACK_ENDPOINT: 'false',
          AWS_IGNORE_CONFIGURED_ENDPOINT_URLS: 'false',
        },
      };
      const parsed =
        kind === 'saved-provider'
          ? ProviderOptionsSchema.parse(input)
          : TestProviderRequestSchema.parse({ providerOptions: input }).providerOptions;
      expect(parsed.env).toEqual(input.env);
      const provider = new AwsBedrockCompletionProvider('fixture', { env: parsed.env });
      const client = await provider.getBedrockInstance();
      try {
        expect(await client.config.endpoint!()).toMatchObject({
          hostname: 'scoped-bedrock.invalid',
        });
        expect(await client.config.useFipsEndpoint()).toBe(false);
        expect(await client.config.useDualstackEndpoint()).toBe(false);
      } finally {
        client.destroy();
      }
    },
  );
});

describe('primitive invocation environment values', () => {
  it.each([true, false])(
    'passes YAML boolean %s to native SDK endpoint selectors',
    async (value) => {
      const filename = path.join(directory, 'promptfooconfig.yaml');
      fs.writeFileSync(
        filename,
        `prompts: [fixture]\nproviders: [echo]\nenv:\n  AWS_USE_FIPS_ENDPOINT: ${value}\n  AWS_USE_DUALSTACK_ENDPOINT: ${value}\n`,
      );
      const config = await readConfig(filename);
      // Config loading preserves the original YAML values, so SDK handoff must
      // use the same string conversion as process.env and getEnvString.
      expect(config.env).toMatchObject({ AWS_USE_FIPS_ENDPOINT: value });
      await cliState.withEnv(config.env, async () => {
        const provider = new AwsBedrockCompletionProvider('fixture');
        const client = await provider.getBedrockInstance();
        try {
          expect(await client.config.useFipsEndpoint()).toBe(value);
          expect(await client.config.useDualstackEndpoint()).toBe(value);
          expect(await client.config.credentials()).toMatchObject({
            accessKeyId: 'fixture-access',
            secretAccessKey: 'fixture-secret',
          });
        } finally {
          client.destroy();
        }
      });
    },
  );

  it('normalizes primitives without changing layer precedence, empty masks, or source values', async () => {
    const suite = {
      ENABLED: true,
      DISABLED: false,
      COUNT: 0,
      FRACTION: 0.5,
      FALLTHROUGH: undefined,
      MASK: '',
    } as unknown as EnvOverrides;
    const provider = { ENABLED: false, COUNT: undefined } as unknown as EnvOverrides;
    await cliState.withEnvFileOverrides(
      { ENABLED: 'file', COUNT: 'file', FALLTHROUGH: 'file', MASK: 'file' },
      () =>
        cliState.withEnv(suite, () => {
          expect(getMergedEnvOverrides(provider)).toEqual({
            ENABLED: 'false',
            DISABLED: 'false',
            COUNT: '0',
            FRACTION: '0.5',
            FALLTHROUGH: 'file',
            MASK: '',
          });
        }),
    );
    expect(suite.ENABLED).toBe(true);
    expect(suite.COUNT).toBe(0);
    expect(provider.COUNT).toBeUndefined();
    expect(process.env.AWS_USE_FIPS_ENDPOINT).toBe('true');
  });
});
