import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import cliState from '../../src/cliState';
import { AwsBedrockCompletionProvider } from '../../src/providers/bedrock';
import { AwsBedrockAgentsProvider } from '../../src/providers/bedrock/agents';
import { AwsBedrockKnowledgeBaseProvider } from '../../src/providers/bedrock/knowledgeBase';
import { NovaSonicProvider } from '../../src/providers/bedrock/nova-sonic';
import { SageMakerCompletionProvider } from '../../src/providers/sagemaker';
import { mockProcessEnv } from '../util/utils';

import type { EnvOverrides } from '../../src/contracts/env';

let directory: string;
let restore: () => void;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-profile-endpoints-'));
  const configFile = path.join(directory, 'config');
  const credentialsFile = path.join(directory, 'credentials');
  fs.writeFileSync(
    configFile,
    '[default]\nuse_fips_endpoint=false\n' +
      '[profile configured]\nuse_fips_endpoint=true\n' +
      '[profile ambient]\nuse_fips_endpoint=true\n' +
      '[profile selected]\nuse_fips_endpoint=false\n',
  );
  fs.writeFileSync(
    credentialsFile,
    '[configured]\naws_access_key_id=profile-access\naws_secret_access_key=profile-secret\n',
  );
  restore = mockProcessEnv(
    {
      AWS_CONFIG_FILE: configFile,
      AWS_SHARED_CREDENTIALS_FILE: credentialsFile,
      AWS_EC2_METADATA_DISABLED: 'true',
    },
    { clear: true },
  );
});

afterEach(() => {
  restore();
  fs.rmSync(directory, { recursive: true, force: true });
});

const providers = [
  [
    'bedrock',
    (config, env) => new AwsBedrockCompletionProvider('fixture', { config, env }),
    'getBedrockInstance',
  ],
  [
    'agent',
    (config, env) =>
      new AwsBedrockAgentsProvider('fixture', {
        config: { agentId: 'fixture', agentAliasId: 'fixture', ...config },
        env,
      }),
    'getAgentRuntimeClient',
  ],
  [
    'knowledge-base',
    (config, env) =>
      new AwsBedrockKnowledgeBaseProvider('fixture', {
        config: { knowledgeBaseId: 'fixture', ...config },
        env,
      }),
    'getKnowledgeBaseClient',
  ],
  ['sonic', (config, env) => new NovaSonicProvider('fixture', { config, env }), 'getBedrockClient'],
  [
    'sagemaker',
    (config, env) =>
      new SageMakerCompletionProvider('fixture', {
        config: { modelType: 'custom', ...config },
        env,
      }),
    'getSageMakerRuntimeInstance',
  ],
] satisfies Array<
  [string, (config: Record<string, unknown>, env?: EnvOverrides) => object, string]
>;

describe.each(providers)('%s SDK profile endpoint selection', (_name, createProvider, method) => {
  async function useFips(config: Record<string, unknown>, env?: EnvOverrides) {
    const provider = createProvider({ region: 'us-east-1', ...config }, env);
    const client = await Reflect.get(provider, method).call(provider);
    try {
      if (config.accessKeyId || process.env.AWS_ACCESS_KEY_ID) {
        expect(await client.config.credentials()).toMatchObject({
          accessKeyId: config.accessKeyId ?? process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: config.secretAccessKey ?? process.env.AWS_SECRET_ACCESS_KEY,
        });
      }
      return await client.config.useFipsEndpoint();
    } finally {
      client.destroy();
    }
  }

  const explicitKeys = { accessKeyId: 'explicit-access', secretAccessKey: 'explicit-secret' };

  it('does not apply endpoint settings from a profile bypassed by configured keys', async () => {
    expect(await useFips({ ...explicitKeys, profile: 'configured' })).toBe(false);
  });

  it('retains ambient endpoint profile settings with explicit keys', async () => {
    mockProcessEnv({ AWS_PROFILE: 'ambient' });
    expect(await useFips({ ...explicitKeys, profile: 'configured' })).toBe(true);
  });

  it.each(
    ['provider', 'suite', 'file'].flatMap((scope) =>
      ['configured', 'selected', ''].map((profile) => ({ scope, profile })),
    ),
  )(
    'retains the $scope endpoint profile $profile with explicit keys',
    async ({ scope, profile }) => {
      mockProcessEnv({ AWS_PROFILE: 'ambient' });
      const env = { AWS_PROFILE: profile };
      const call = () =>
        useFips({ ...explicitKeys, profile: 'configured' }, scope === 'provider' ? env : undefined);
      const result =
        scope === 'suite'
          ? await cliState.withEnv(env, call)
          : scope === 'file'
            ? await cliState.withEnvFileOverrides(env, call)
            : await call();
      expect(result).toBe(profile === 'configured');
    },
  );

  it.each(['provider', 'suite', 'file'])(
    'masks the ambient profile with $0 empty profile and environment keys',
    async (scope) => {
      mockProcessEnv({
        AWS_PROFILE: 'ambient',
        AWS_ACCESS_KEY_ID: 'environment-access',
        AWS_SECRET_ACCESS_KEY: 'environment-secret',
      });
      const env = { AWS_PROFILE: '' };
      const call = () => useFips({}, scope === 'provider' ? env : undefined);
      const result =
        scope === 'suite'
          ? await cliState.withEnv(env, call)
          : scope === 'file'
            ? await cliState.withEnvFileOverrides(env, call)
            : await call();
      expect(result).toBe(false);
    },
  );

  it('retains an explicitly selected profile when no configured key pair bypasses it', async () => {
    expect(await useFips({ profile: 'configured' })).toBe(true);
  });

  it('retains a scoped profile as both the credential and endpoint source', async () => {
    expect(await cliState.withEnv({ AWS_PROFILE: 'configured' }, () => useFips({}))).toBe(true);
  });
});

describe('Bedrock runtime bearer endpoint profile selection', () => {
  it.each(['configured', 'provider', 'suite', 'file', 'ambient'])(
    'does not activate a bypassed configured profile with a %s bearer',
    async (source) => {
      const env = { AWS_BEARER_TOKEN_BEDROCK: 'fixture-bearer' };
      if (source === 'ambient') {
        mockProcessEnv(env);
      }
      const call = async () => {
        const provider = new AwsBedrockCompletionProvider('fixture', {
          config: {
            region: 'us-east-1',
            profile: 'configured',
            ...(source === 'configured' ? { apiKey: 'fixture-bearer' } : {}),
          },
          env: source === 'provider' ? env : undefined,
        });
        const client = await provider.getBedrockInstance();
        try {
          expect(await client.config.useFipsEndpoint()).toBe(false);
          expect(await client.config.authSchemePreference()).toEqual(['httpBearerAuth']);
        } finally {
          client.destroy();
        }
      };
      if (source === 'suite') {
        await cliState.withEnv(env, call);
      } else if (source === 'file') {
        await cliState.withEnvFileOverrides(env, call);
      } else {
        await call();
      }
    },
  );

  it.each(
    ['provider', 'suite', 'file'].flatMap((scope) =>
      ['configured', 'selected', ''].map((profile) => ({ scope, profile })),
    ),
  )('preserves $scope profile $profile with a configured bearer', async ({ scope, profile }) => {
    mockProcessEnv({ AWS_PROFILE: 'ambient' });
    const env = { AWS_PROFILE: profile };
    const call = async () => {
      const provider = new AwsBedrockCompletionProvider('fixture', {
        config: { region: 'us-east-1', profile: 'configured', apiKey: 'fixture-bearer' },
        env: scope === 'provider' ? env : undefined,
      });
      const client = await provider.getBedrockInstance();
      try {
        expect(await client.config.useFipsEndpoint()).toBe(profile === 'configured');
        expect(await client.config.authSchemePreference()).toEqual(['httpBearerAuth']);
      } finally {
        client.destroy();
      }
    };
    if (scope === 'suite') {
      await cliState.withEnv(env, call);
    } else if (scope === 'file') {
      await cliState.withEnvFileOverrides(env, call);
    } else {
      await call();
    }
  });

  it('preserves ambient endpoint settings with a configured bearer', async () => {
    mockProcessEnv({ AWS_PROFILE: 'ambient' });
    const provider = new AwsBedrockCompletionProvider('fixture', {
      config: { region: 'us-east-1', profile: 'selected', apiKey: 'fixture-bearer' },
    });
    const client = await provider.getBedrockInstance();
    try {
      expect(await client.config.useFipsEndpoint()).toBe(true);
    } finally {
      client.destroy();
    }
  });
});
