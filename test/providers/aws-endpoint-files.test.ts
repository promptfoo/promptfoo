import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  InvokeAgentCommand,
  RetrieveAndGenerateCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { InvokeEndpointCommand } from '@aws-sdk/client-sagemaker-runtime';
import { NodeHttp2Handler, NodeHttpHandler } from '@smithy/node-http-handler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { AwsBedrockCompletionProvider } from '../../src/providers/bedrock';
import { AwsBedrockAgentsProvider } from '../../src/providers/bedrock/agents';
import { AwsBedrockKnowledgeBaseProvider } from '../../src/providers/bedrock/knowledgeBase';
import { LumaRayVideoProvider } from '../../src/providers/bedrock/luma-ray';
import { NovaReelVideoProvider } from '../../src/providers/bedrock/nova-reel';
import { NovaSonicProvider } from '../../src/providers/bedrock/nova-sonic';
import { SageMakerCompletionProvider } from '../../src/providers/sagemaker';
import { mockProcessEnv } from '../util/utils';

import type { EnvOverrides } from '../../src/contracts/env';

vi.mock('@aws-sdk/credential-provider-sso', () => ({
  fromSSO: (options: { profile: string }) => async () => ({
    accessKeyId: `sso-${options.profile}`,
    secretAccessKey: 'fixture-sso-secret',
  }),
}));

let directory: string;
let restore: () => void;
let destinations: string[];
let authorizations: string[];

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-sdk-endpoint-files-'));
  fs.writeFileSync(path.join(directory, 'credentials'), '');
  fs.writeFileSync(
    path.join(directory, 'host-config'),
    '[profile host]\naws_access_key_id=host-access\naws_secret_access_key=host-secret\nendpoint_url=https://host.invalid\nuse_fips_endpoint=false\nuse_dualstack_endpoint=false\n',
  );
  restore = mockProcessEnv(
    {
      AWS_CONFIG_FILE: path.join(directory, 'host-config'),
      AWS_SHARED_CREDENTIALS_FILE: path.join(directory, 'credentials'),
      AWS_PROFILE: 'host',
      AWS_EC2_METADATA_DISABLED: 'true',
    },
    { clear: true },
  );
  destinations = [];
  authorizations = [];
  const handle = async (request: { hostname: string; headers: Record<string, string> }) => {
    destinations.push(request.hostname);
    authorizations.push(request.headers.authorization);
    throw new Error('Stopped after SDK endpoint resolution');
  };
  vi.spyOn(NodeHttpHandler.prototype, 'handle').mockImplementation(handle);
  vi.spyOn(NodeHttp2Handler.prototype, 'handle').mockImplementation(handle);
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network access'));
});

afterEach(() => {
  vi.restoreAllMocks();
  restore();
  fs.rmSync(directory, { recursive: true, force: true });
});

const runtimeCommand = () =>
  new InvokeModelCommand({ modelId: 'fixture', body: Buffer.from('{}') });
const providers = [
  [
    'bedrock',
    (config, env) => new AwsBedrockCompletionProvider('fixture', { config, env }),
    'getBedrockInstance',
    runtimeCommand,
  ],
  [
    'agent',
    (config, env) =>
      new AwsBedrockAgentsProvider('fixture', {
        config: { agentId: 'fixture', agentAliasId: 'fixture', ...config },
        env,
      }),
    'getAgentRuntimeClient',
    () =>
      new InvokeAgentCommand({
        agentId: 'fixture',
        agentAliasId: 'fixture',
        sessionId: 'fixture',
        inputText: 'fixture',
      }),
  ],
  [
    'knowledge-base',
    (config, env) =>
      new AwsBedrockKnowledgeBaseProvider('fixture', {
        config: { knowledgeBaseId: 'fixture', ...config },
        env,
      }),
    'getKnowledgeBaseClient',
    () =>
      new RetrieveAndGenerateCommand({
        input: { text: 'fixture' },
        retrieveAndGenerateConfiguration: {
          type: 'KNOWLEDGE_BASE',
          knowledgeBaseConfiguration: { knowledgeBaseId: 'fixture', modelArn: 'fixture' },
        },
      }),
  ],
  [
    'sonic',
    (config, env) => new NovaSonicProvider('fixture', { config, env }),
    'getBedrockClient',
    runtimeCommand,
  ],
  [
    'sagemaker',
    (config, env) =>
      new SageMakerCompletionProvider('fixture', {
        config: { modelType: 'custom', ...config },
        env,
      }),
    'getSageMakerRuntimeInstance',
    () => new InvokeEndpointCommand({ EndpointName: 'fixture', Body: Buffer.from('{}') }),
  ],
] satisfies Array<
  [string, (config: Record<string, unknown>, env?: EnvOverrides) => object, string, () => object]
>;

describe.each(providers)('%s scoped endpoint files', (_name, createProvider, method, command) => {
  async function inspect(env?: EnvOverrides, config = {}) {
    const provider = createProvider({ region: 'us-east-1', ...config }, env);
    const client = await Reflect.get(provider, method).call(provider);
    try {
      const credentials = await client.config.credentials();
      const fips = await client.config.useFipsEndpoint();
      const dualstack = await client.config.useDualstackEndpoint();
      await expect(client.send(command())).rejects.toThrow('Stopped after SDK endpoint resolution');
      return {
        accessKeyId: credentials.accessKeyId,
        fips,
        dualstack,
        destination: destinations.at(-1),
      };
    } finally {
      client.destroy();
    }
  }

  it.each(
    ['provider', 'suite', 'file'].flatMap((scope) =>
      [
        'global',
        'service',
        'fips',
        'dualstack',
        'none',
        'ignore',
        'service-fallback',
        'env-global',
        'env-service',
        'env-empty',
        'env-ignore',
      ].map((mode) => ({ scope, mode })),
    ),
  )('matches released environment loading for $scope $mode settings', async ({ scope, mode }) => {
    const configFile = path.join(directory, 'scoped-config');
    const endpoint =
      mode === 'fips'
        ? 'use_fips_endpoint=true\n'
        : mode === 'dualstack'
          ? 'use_dualstack_endpoint=true\n'
          : mode === 'none'
            ? ''
            : mode === 'service'
              ? 'services=fixture-services\n'
              : mode === 'service-fallback'
                ? 'services=empty-services\nendpoint_url=https://scoped.invalid\n'
                : mode === 'ignore'
                  ? 'ignore_configured_endpoint_urls=true\nendpoint_url=https://scoped.invalid\n'
                  : 'endpoint_url=https://scoped.invalid\n';
    fs.writeFileSync(
      configFile,
      '[profile selected]\naws_access_key_id=scoped-access\naws_secret_access_key=scoped-secret\n' +
        endpoint +
        '\n[services fixture-services]\nbedrock_runtime =\n  endpoint_url=https://bedrock.invalid\nbedrock_agent_runtime =\n  endpoint_url=https://agent.invalid\nsagemaker_runtime =\n  endpoint_url=https://sagemaker.invalid\n[services empty-services]\nother =\n  endpoint_url=https://other.invalid\n',
    );
    const env: EnvOverrides = {
      AWS_CONFIG_FILE: configFile,
      AWS_PROFILE: 'selected',
      ...(mode === 'env-global' ? { AWS_ENDPOINT_URL: 'https://env-global.invalid' } : {}),
      ...(mode === 'env-service'
        ? {
            AWS_ENDPOINT_URL: 'https://env-global.invalid',
            AWS_ENDPOINT_URL_BEDROCK_RUNTIME: 'https://env-service.invalid',
            AWS_ENDPOINT_URL_BEDROCK_AGENT_RUNTIME: 'https://env-service.invalid',
            AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME: 'https://env-service.invalid',
          }
        : {}),
      ...(mode === 'env-empty'
        ? {
            AWS_ENDPOINT_URL: '',
            AWS_ENDPOINT_URL_BEDROCK_RUNTIME: '',
            AWS_ENDPOINT_URL_BEDROCK_AGENT_RUNTIME: '',
            AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME: '',
          }
        : {}),
      ...(mode === 'env-ignore' ? { AWS_IGNORE_CONFIGURED_ENDPOINT_URLS: 'true' } : {}),
    };
    if (mode === 'env-empty') {
      mockProcessEnv({ AWS_ENDPOINT_URL: 'https://masked.invalid' });
    }
    const reset = mockProcessEnv(env);
    let expected;
    try {
      expected = await inspect();
    } finally {
      reset();
    }
    const run = () => inspect(scope === 'provider' ? env : undefined);
    const actual =
      scope === 'suite'
        ? await cliState.withEnv(env, run)
        : scope === 'file'
          ? await cliState.withEnvFileOverrides(env, run)
          : await run();
    expect(actual).toEqual(expected);
    expect(actual.accessKeyId).toBe('scoped-access');
    expect(actual.destination).not.toBe('host.invalid');
  });
  it('retains ambient SDK routing without scoped settings', async () => {
    const result = await inspect();
    expect(result).toEqual({
      accessKeyId: 'host-access',
      fips: false,
      dualstack: false,
      destination: 'host.invalid',
    });
  });

  if (_name === 'bedrock' || _name === 'sonic') {
    it('keeps an explicit endpoint ahead of invalid shared-file endpoint sections', async () => {
      const configFile = path.join(directory, 'invalid-service-config');
      fs.writeFileSync(configFile, '[profile selected]\nservices=missing\n');
      const env = { AWS_CONFIG_FILE: configFile, AWS_PROFILE: 'selected' };
      const config = {
        accessKeyId: 'explicit-access',
        secretAccessKey: 'explicit-secret',
        endpoint: 'https://explicit.invalid',
      };
      const reset = mockProcessEnv(env);
      let expected;
      try {
        expected = await inspect(undefined, config);
      } finally {
        reset();
      }
      expect(await inspect(env, config)).toEqual(expected);
      expect(expected.destination).toBe('explicit.invalid');
    });
  }
  it.each(
    ['flags', 'endpoint'].flatMap((dimension) =>
      ['none', 'provider', 'suite', 'file'].flatMap((scope) =>
        (scope === 'none' ? ['ambient'] : ['selected', 'configured', 'clear', 'config-file']).map(
          (selection) => ({ dimension, scope, selection }),
        ),
      ),
    ),
  )(
    'keeps configured SSO identity with $scope $selection $dimension settings',
    async ({ dimension, scope, selection }) => {
      const profileText = (prefix: string, configuredFlags: boolean) =>
        ['default', 'host', 'configured', 'selected']
          .map((name) => {
            const flags =
              dimension === 'flags' && (name === 'configured' ? configuredFlags : !configuredFlags);
            return `${name === 'default' ? '[default]' : `[profile ${name}]`}\nuse_fips_endpoint=${flags}\nuse_dualstack_endpoint=${flags}\n${dimension === 'endpoint' ? `endpoint_url=https://${prefix}-${name}.invalid\n` : ''}`;
          })
          .join('');
      fs.writeFileSync(path.join(directory, 'host-config'), profileText('host', true));
      const selectedFile = path.join(directory, 'configured-sso-endpoints');
      fs.writeFileSync(selectedFile, profileText('scoped', false));
      const env =
        selection === 'config-file'
          ? { AWS_CONFIG_FILE: selectedFile }
          : selection === 'ambient'
            ? {}
            : { AWS_PROFILE: selection === 'clear' ? '' : selection };
      const run = () => inspect(scope === 'provider' ? env : undefined, { profile: 'configured' });
      const actual = await (scope === 'suite'
        ? cliState.withEnv(env, run)
        : scope === 'file'
          ? cliState.withEnvFileOverrides(env, run)
          : run());
      const selectedProfile =
        selection === 'ambient' || selection === 'config-file'
          ? 'host'
          : selection === 'clear'
            ? 'default'
            : selection;
      const flags =
        dimension === 'flags' && (selection === 'config-file' || selectedProfile === 'configured');
      expect(actual).toMatchObject({
        accessKeyId: 'sso-configured',
        fips: flags,
        dualstack: flags,
      });
      if (dimension === 'endpoint') {
        expect(actual.destination).toBe(
          `${selection === 'config-file' ? 'scoped' : 'host'}-${selectedProfile}.invalid`,
        );
      } else if (flags) {
        expect(actual.destination).toContain('-fips.');
        expect(actual.destination).toContain('.api.aws');
      } else {
        expect(actual.destination).not.toContain('-fips.');
        expect(actual.destination).toContain('.amazonaws.com');
      }
    },
  );
});

describe.each([
  ['luma', LumaRayVideoProvider],
  ['reel', NovaReelVideoProvider],
] as const)('%s configured SSO media endpoint profiles', (_name, Provider) => {
  it.each(
    ['startVideoGeneration', 'pollForCompletion', 'downloadAndStoreVideo'].flatMap((method) =>
      [false, true].map((scoped) => ({ method, scoped })),
    ),
  )(
    'keeps IAM and endpoint profiles separate for $method scoped=$scoped',
    async ({ method, scoped }) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        fs.writeFileSync(
          path.join(directory, 'host-config'),
          '[profile host]\nuse_fips_endpoint=false\nuse_dualstack_endpoint=false\n[profile configured]\nuse_fips_endpoint=true\nuse_dualstack_endpoint=true\n',
        );
        const configFile = path.join(directory, 'media-config');
        fs.writeFileSync(
          configFile,
          '[profile host]\nuse_fips_endpoint=true\nuse_dualstack_endpoint=true\n[profile configured]\nuse_fips_endpoint=false\nuse_dualstack_endpoint=false\n',
        );
        const provider = new Provider('fixture', {
          config: {
            region: 'us-east-1',
            profile: 'configured',
            s3OutputUri: 's3://fixture-bucket/output',
          },
        });
        const args =
          method === 'startVideoGeneration'
            ? [{}, 's3://fixture-bucket/output']
            : method === 'pollForCompletion'
              ? ['arn:aws:bedrock:us-east-1:123456789012:async-invoke/fixture', 1, 100]
              : ['s3://fixture-bucket/output'];
        const invoke = () => Reflect.get(provider, method).apply(provider, args);
        const result = await (scoped
          ? cliState.withEnvFileOverrides({ AWS_CONFIG_FILE: configFile }, invoke)
          : invoke());
        expect(result.error).toContain('Stopped after SDK endpoint resolution');
        expect(authorizations).toHaveLength(1);
        expect(authorizations[0]).toContain('Credential=sso-configured/');
        expect(destinations).toHaveLength(1);
        if (scoped) {
          expect(destinations[0]).toContain('-fips.');
        } else {
          expect(destinations[0]).not.toContain('-fips.');
        }
      } finally {
        vi.useRealTimers();
      }
    },
  );
});
