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
import { NovaSonicProvider } from '../../src/providers/bedrock/nova-sonic';
import { SageMakerCompletionProvider } from '../../src/providers/sagemaker';
import { mockProcessEnv } from '../util/utils';

import type { EnvOverrides } from '../../src/contracts/env';

let directory: string;
let restore: () => void;
let destinations: string[];

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
  const handle = async (request: { hostname: string }) => {
    destinations.push(request.hostname);
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
});
