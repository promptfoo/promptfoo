import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { HttpResponse } from '@smithy/core/transport';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SageMakerCompletionProvider,
  SageMakerEmbeddingProvider,
} from '../../src/providers/sagemaker';
import { mockProcessEnv } from '../util/utils';
import type { SageMakerRuntimeClient } from '@aws-sdk/client-sagemaker-runtime';
import type { HttpRequest } from '@smithy/core/transport';

const parsing = vi.hoisted(() => ({
  pause: undefined as undefined | (() => Promise<void>),
  defaultsPause: undefined as undefined | (() => Promise<void>),
  credentialsPause: undefined as undefined | (() => Promise<void>),
}));
vi.mock('@smithy/core/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@smithy/core/config')>();
  return {
    ...actual,
    parseKnownFiles: async (...args: Parameters<typeof actual.parseKnownFiles>) => {
      const result = await actual.parseKnownFiles(...args);
      const pause = parsing.pause;
      parsing.pause = undefined;
      await pause?.();
      return result;
    },
    resolveDefaultsModeConfig: (...args: Parameters<typeof actual.resolveDefaultsModeConfig>) => {
      const provider = actual.resolveDefaultsModeConfig(...args);
      return (...options: Parameters<typeof provider>) => {
        const pause = parsing.defaultsPause;
        parsing.defaultsPause = undefined;
        return pause ? pause().then(() => provider(...options)) : provider(...options);
      };
    },
  };
});
vi.mock('@aws-sdk/credential-provider-ini', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/credential-provider-ini')>();
  return {
    ...actual,
    fromIni: (...args: Parameters<typeof actual.fromIni>) => {
      const provider = actual.fromIni(...args);
      return async (...options: Parameters<typeof provider>) => {
        const pause = parsing.credentialsPause;
        parsing.credentialsPause = undefined;
        await pause?.();
        return provider(...options);
      };
    },
  };
});
vi.mock('../../src/cache', () => ({ isCacheEnabled: () => false, getCache: vi.fn() }));
vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('SageMaker initialization policy snapshot', () => {
  let directory: string;
  let restoreEnv: () => void;
  const providers = new Set<SageMakerCompletionProvider | SageMakerEmbeddingProvider>();
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'promptfoo-sage-snapshot-'));
    const config = path.join(directory, 'config');
    const credentials = path.join(directory, 'credentials');
    await writeFile(
      config,
      '[profile runtime-before]\nendpoint_url = https://profile-before.invalid\ndefaults_mode = legacy\n[profile runtime-after]\nendpoint_url = https://profile-after.invalid\ndefaults_mode = standard\n',
    );
    await writeFile(
      credentials,
      '[request-auth]\naws_access_key_id = OFFLINE_KEY\naws_secret_access_key = offline-secret\n',
    );
    restoreEnv = mockProcessEnv({
      AWS_CONFIG_FILE: config,
      AWS_SHARED_CREDENTIALS_FILE: credentials,
      AWS_PROFILE: 'runtime-before',
      AWS_REGION: 'us-east-1',
      AWS_DEFAULTS_MODE: undefined,
      AWS_EC2_METADATA_DISABLED: 'true',
      AWS_SAGEMAKER_MAX_RETRIES: '1',
      AWS_USE_FIPS_ENDPOINT: 'false',
      AWS_USE_DUALSTACK_ENDPOINT: 'false',
      AWS_IGNORE_CONFIGURED_ENDPOINT_URLS: 'false',
      AWS_ENDPOINT_URL: undefined,
      AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME: undefined,
    });
    for (const transport of [http, https]) {
      vi.spyOn(transport, 'request').mockImplementation(() => {
        throw new Error('Unexpected external request');
      });
    }
  });
  afterEach(async () => {
    for (const provider of providers) {
      provider.cleanup();
    }
    providers.clear();
    parsing.pause = undefined;
    parsing.defaultsPause = undefined;
    parsing.credentialsPause = undefined;
    vi.resetAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    restoreEnv();
    await rm(directory, { recursive: true, force: true });
  });

  function interceptSageMaker(provider: SageMakerCompletionProvider | SageMakerEmbeddingProvider) {
    const requests: HttpRequest[] = [];
    const clients = new Set<SageMakerRuntimeClient>();
    const initialize = provider.getSageMakerRuntimeInstance.bind(provider);
    vi.spyOn(provider, 'getSageMakerRuntimeInstance').mockImplementation(async (...args) => {
      const client: SageMakerRuntimeClient = await initialize(...args);
      if (!clients.has(client)) {
        clients.add(client);
        vi.spyOn(client.config.requestHandler, 'handle').mockImplementation(async (request) => {
          requests.push(request);
          return {
            response: new HttpResponse({
              statusCode: 200,
              headers: { 'content-type': 'application/json' },
              body: Buffer.from('{"output":"offline response","embedding":[1,0]}'),
            }),
          };
        });
      }
      return client;
    });
    return requests;
  }

  function selectFileCredentials(profile: 'named' | 'default') {
    vi.stubEnv('AWS_PROFILE', profile === 'named' ? 'request-auth' : undefined);
    vi.stubEnv('AWS_ACCESS_KEY_ID', undefined);
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', undefined);
    vi.stubEnv('AWS_SESSION_TOKEN', undefined);
    const configSection = profile === 'named' ? 'profile request-auth' : 'default';
    const credentialsSection = profile === 'named' ? 'request-auth' : 'default';
    return {
      config: (stage: string) =>
        writeFile(
          path.join(directory, 'config'),
          `[${configSection}]\nendpoint_url = https://file-${stage}.invalid\ndefaults_mode = legacy\n`,
        ),
      credentials: (stage: string) =>
        writeFile(
          path.join(directory, 'credentials'),
          `[${credentialsSection}]\naws_access_key_id = ${stage.toUpperCase()}_KEY\naws_secret_access_key = ${stage}-secret\n`,
        ),
    };
  }

  describe.each(['completion', 'embedding'] as const)('%s shared profile files', (kind) => {
    function createProvider(
      profile: 'named' | 'default',
      transform?: (input: unknown) => Promise<unknown>,
    ) {
      const Provider =
        kind === 'completion' ? SageMakerCompletionProvider : SageMakerEmbeddingProvider;
      const provider = new Provider('deployment', {
        config: { modelType: 'custom', profile: profile === 'named' ? 'request-auth' : undefined },
        transform,
      });
      providers.add(provider);
      return provider;
    }

    function invoke(
      provider: SageMakerCompletionProvider | SageMakerEmbeddingProvider,
      input: string,
    ) {
      return provider instanceof SageMakerEmbeddingProvider
        ? provider.callEmbeddingApi(input)
        : provider.callApi(input);
    }

    const expected = kind === 'completion' ? { output: 'offline response' } : { embedding: [1, 0] };
    const drift = 'SageMaker shared AWS profile files changed during initialization';

    it.each([
      ['named', 'config'],
      ['named', 'credentials'],
      ['default', 'config'],
      ['default', 'credentials'],
    ] as const)(
      'rejects a %s %s edit during a user transform before any send',
      async (profile, file) => {
        const files = selectFileCredentials(profile);
        await Promise.all([files.config('before'), files.credentials('before')]);
        const entered = deferred();
        const release = deferred();
        const provider = createProvider(profile, async (input) => {
          if (input === 'first') {
            entered.resolve();
            await release.promise;
          }
          return input;
        });
        const requests = interceptSageMaker(provider);
        const pending = invoke(provider, 'first');
        void pending.catch(() => {});
        try {
          await entered.promise;
          await files[file]('after');
          release.resolve();
          await expect(pending).rejects.toThrow(drift);
          expect(requests).toHaveLength(0);

          expect(await invoke(provider, 'later')).toMatchObject(expected);
          expect(requests).toHaveLength(1);
          expect(requests[0].hostname).toBe(
            `file-${file === 'config' ? 'after' : 'before'}.invalid`,
          );
          expect(requests[0].headers.authorization).toContain(
            `Credential=${file === 'credentials' ? 'AFTER' : 'BEFORE'}_KEY/`,
          );
        } finally {
          release.resolve();
          await Promise.allSettled([pending]);
        }
      },
    );

    it.each([
      ['configured', 'credentials only'],
      ['configured', 'runtime endpoint'],
      ['environment', 'credentials only'],
      ['environment', 'runtime endpoint'],
    ] as const)(
      'isolates %s static authentication from a %s edit during a transform',
      async (source, change) => {
        vi.stubEnv('AWS_PROFILE', undefined);
        vi.stubEnv('AWS_ACCESS_KEY_ID', source === 'environment' ? 'ENV_STATIC' : undefined);
        vi.stubEnv(
          'AWS_SECRET_ACCESS_KEY',
          source === 'environment' ? 'env-static-secret' : undefined,
        );
        vi.stubEnv('AWS_SESSION_TOKEN', undefined);
        const configFile = path.join(directory, 'config');
        const credentialsFile = path.join(directory, 'credentials');
        await writeFile(configFile, '[default]\ndefaults_mode = legacy\n');
        const credentialFile = (keys: string, endpoint: string) => `[default]
aws_access_key_id = UNUSED_${keys}
aws_secret_access_key = unused-${keys}-secret
endpoint_url = https://static-${endpoint}.invalid
`;
        await writeFile(credentialsFile, credentialFile('before', 'before'));
        const entered = deferred();
        const release = deferred();
        const Provider =
          kind === 'completion' ? SageMakerCompletionProvider : SageMakerEmbeddingProvider;
        const provider = new Provider('deployment', {
          config: {
            modelType: 'custom',
            ...(source === 'configured'
              ? { accessKeyId: 'CONFIG_STATIC', secretAccessKey: 'config-static-secret' }
              : {}),
          },
          transform: async (input) => {
            if (input === 'first') {
              entered.resolve();
              await release.promise;
            }
            return input;
          },
        });
        providers.add(provider);
        const requests = interceptSageMaker(provider);
        const pending = invoke(provider, 'first');
        void pending.catch(() => {});
        try {
          await entered.promise;
          const nextEndpoint = change === 'runtime endpoint' ? 'after' : 'before';
          await writeFile(credentialsFile, credentialFile('after', nextEndpoint));
          release.resolve();
          if (change === 'runtime endpoint') {
            await expect(pending).rejects.toThrow(drift);
            expect(requests).toHaveLength(0);
          } else {
            expect(await pending).toMatchObject(expected);
            expect(requests).toHaveLength(1);
            expect(requests[0].hostname).toBe('static-before.invalid');
          }
          expect(await invoke(provider, 'later')).toMatchObject(expected);
          expect(requests.at(-1)?.hostname).toBe(`static-${nextEndpoint}.invalid`);
          expect(
            requests.every((request) =>
              request.headers.authorization.includes(
                `Credential=${source === 'configured' ? 'CONFIG_STATIC' : 'ENV_STATIC'}/`,
              ),
            ),
          ).toBe(true);
        } finally {
          release.resolve();
          await Promise.allSettled([pending]);
        }
      },
    );

    it('rejects an edit while the SDK is resolving signing credentials before any send', async () => {
      const files = selectFileCredentials('named');
      await Promise.all([files.config('before'), files.credentials('before')]);
      const provider = createProvider('named');
      const requests = interceptSageMaker(provider);
      const entered = deferred();
      const release = deferred();
      parsing.credentialsPause = async () => {
        entered.resolve();
        await release.promise;
      };
      const pending = invoke(provider, 'first');
      try {
        await Promise.race([
          entered.promise,
          pending.then(() => {
            throw new Error('Request completed before signing credentials were resolved');
          }),
        ]);
        await files.credentials('after');
        release.resolve();
        expect(await pending).toMatchObject({
          error: expect.stringContaining(
            'SageMaker credential inputs changed during initialization',
          ),
        });
        expect(requests).toHaveLength(0);

        expect(await invoke(provider, 'later')).toMatchObject(expected);
        expect(requests).toHaveLength(1);
        expect(requests[0].headers.authorization).toContain('Credential=AFTER_KEY/');
      } finally {
        release.resolve();
        await Promise.allSettled([pending]);
      }
    });
  });

  it.each([false, true])(
    'rejects stale auto defaults without discarding a newer initialization (overlap: %s)',
    async (overlap) => {
      vi.stubEnv('AWS_DEFAULTS_MODE', 'AUTO');
      vi.stubEnv('AWS_EXECUTION_ENV', 'AWS_Lambda_nodejs24.x');
      const provider = new SageMakerCompletionProvider('deployment', {
        config: {
          modelType: 'custom',
          region: 'us-east-1',
          accessKeyId: 'OFFLINE',
          secretAccessKey: 'offline-secret',
        },
      });
      providers.add(provider);
      const entered = deferred();
      const release = deferred();
      parsing.defaultsPause = async () => {
        entered.resolve();
        await release.promise;
      };
      const first = provider.getSageMakerRuntimeInstance().catch((error: unknown) => error);
      try {
        await entered.promise;
        vi.stubEnv('AWS_REGION', 'us-west-2');
        const overlapping = overlap ? await provider.getSageMakerRuntimeInstance() : undefined;
        release.resolve();
        const stale = await first;
        expect(stale).toBeInstanceOf(Error);
        expect((stale as Error).message).toBe(
          'SageMaker defaults inputs changed during initialization; retry with stable inputs',
        );
        const retry = await provider.getSageMakerRuntimeInstance();
        expect(await retry.config.defaultsMode()).toBe('cross-region');
        if (overlapping) {
          expect(retry).toBe(overlapping);
        }
      } finally {
        release.resolve();
        await first;
      }
    },
  );

  it.each(['completion', 'embedding'] as const)(
    'captures %s settings before an asynchronous user transform',
    async (kind) => {
      vi.stubEnv('AWS_PROFILE', undefined);
      vi.stubEnv('AWS_ACCESS_KEY_ID', 'BEFORE_KEY');
      vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'before-secret');
      vi.stubEnv('AWS_SESSION_TOKEN', 'before-token');
      vi.stubEnv('AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME', 'https://service-before.invalid');
      vi.stubEnv('AWS_SAGEMAKER_MAX_TOKENS', '32');
      const entered = deferred();
      const release = deferred();
      const Provider =
        kind === 'completion' ? SageMakerCompletionProvider : SageMakerEmbeddingProvider;
      const provider = new Provider('deployment-before', {
        config: { modelType: 'openai', stopSequences: ['before'] },
        transform: async (input) => {
          if (input === 'first') {
            entered.resolve();
            await release.promise;
          }
          return input;
        },
      });
      providers.add(provider);
      const invoke = (input: string) =>
        provider instanceof SageMakerEmbeddingProvider
          ? provider.callEmbeddingApi(input)
          : provider.callApi(input);
      const expected =
        kind === 'embedding' ? { embedding: [1, 0] } : { output: 'offline response' };
      const requests: HttpRequest[] = [];
      const initialize = provider.getSageMakerRuntimeInstance.bind(provider);
      vi.spyOn(provider, 'getSageMakerRuntimeInstance').mockImplementation(async (...args) => {
        const client: SageMakerRuntimeClient = await initialize(...args);
        vi.spyOn(client.config.requestHandler, 'handle').mockImplementation(async (request) => {
          requests.push(request);
          return {
            response: new HttpResponse({
              statusCode: 200,
              headers: { 'content-type': 'application/json' },
              body: Buffer.from(
                JSON.stringify({ choices: [{ text: 'offline response' }], embedding: [1, 0] }),
              ),
            }),
          };
        });
        return client;
      });
      const pending = invoke('first');
      try {
        await entered.promise;
        vi.stubEnv('AWS_ACCESS_KEY_ID', 'AFTER_KEY');
        vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'after-secret');
        vi.stubEnv('AWS_SESSION_TOKEN', 'after-token');
        vi.stubEnv('AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME', 'https://service-after.invalid');
        vi.stubEnv('AWS_REGION', 'us-west-2');
        vi.stubEnv('AWS_SAGEMAKER_MAX_TOKENS', '64');
        provider.config.endpoint = 'deployment-after';
        provider.config.stopSequences!.push('after');
        release.resolve();

        expect(await pending).toMatchObject(expected);
        expect(await invoke('later')).toMatchObject(expected);
        expect(requests).toHaveLength(2);
        for (const [index, stage, region] of [
          [0, 'before', 'us-east-1'],
          [1, 'after', 'us-west-2'],
        ] as const) {
          const request = requests[index];
          expect(request.hostname).toBe(`service-${stage}.invalid`);
          expect(request.path).toContain(`/endpoints/deployment-${stage}/invocations`);
          expect(request.headers.authorization).toContain(`Credential=${stage.toUpperCase()}_KEY/`);
          expect(request.headers.authorization).toContain(`/${region}/sagemaker/aws4_request`);
          expect(request.headers['x-amz-security-token']).toBe(`${stage}-token`);
        }
        if (kind === 'completion') {
          expect(JSON.parse(String(requests[0].body))).toMatchObject({
            max_tokens: 32,
            stop: ['before'],
          });
          expect(JSON.parse(String(requests[1].body))).toMatchObject({
            max_tokens: 64,
            stop: ['before', 'after'],
          });
        }
      } finally {
        release.resolve();
        await pending;
      }
    },
  );

  it.each(['service', 'profile'] as const)(
    'keeps the initial %s policy across delayed credential scope resolution',
    async (mode) => {
      if (mode === 'service') {
        vi.stubEnv('AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME', 'https://service-before.invalid');
      }
      const provider = new SageMakerCompletionProvider('deployment', {
        config: { modelType: 'custom', profile: 'request-auth' },
      });
      providers.add(provider);
      const clients: SageMakerRuntimeClient[] = [];
      const requests: HttpRequest[] = [];
      const initialize = provider.getSageMakerRuntimeInstance.bind(provider);
      vi.spyOn(provider, 'getSageMakerRuntimeInstance').mockImplementation(async (...args) => {
        const client: SageMakerRuntimeClient = await initialize(...args);
        if (!clients.includes(client)) {
          clients.push(client);
          vi.spyOn(client.config.requestHandler, 'handle').mockImplementation(async (request) => {
            requests.push(request);
            return {
              response: new HttpResponse({
                statusCode: 200,
                headers: { 'content-type': 'application/json' },
                body: Buffer.from('{"output":"offline response"}'),
              }),
            };
          });
        }
        return client;
      });
      const entered = deferred();
      const release = deferred();
      parsing.pause = async () => {
        entered.resolve();
        await release.promise;
      };
      const pending = provider.callApi('first request');
      try {
        await entered.promise;
        vi.stubEnv('AWS_PROFILE', 'runtime-after');
        vi.stubEnv('AWS_DEFAULTS_MODE', 'standard');
        vi.stubEnv('AWS_USE_FIPS_ENDPOINT', 'true');
        vi.stubEnv('AWS_SAGEMAKER_MAX_RETRIES', '5');
        vi.stubEnv('AWS_REGION', 'us-west-2');
        if (mode === 'service') {
          vi.stubEnv('AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME', 'https://service-after.invalid');
        }
        release.resolve();
        expect(await pending).toMatchObject({ output: 'offline response' });
        expect(requests[0].hostname).toBe(`${mode}-before.invalid`);
        expect(requests[0].headers.authorization).toContain('Credential=OFFLINE_KEY/');
        expect(requests[0].headers.authorization).toContain('/us-east-1/sagemaker/aws4_request');
        const initialDefaultsMode = clients[0].config.defaultsMode;
        expect(
          await (typeof initialDefaultsMode === 'function'
            ? initialDefaultsMode()
            : initialDefaultsMode),
        ).toBe('legacy');
        expect(await clients[0].config.maxAttempts()).toBe(1);
        expect(await clients[0].config.useFipsEndpoint()).toBe(false);
        // A later request must observe the now-invalid policy, without forwarding it.
        expect(await provider.callApi('invalid later policy')).toMatchObject({
          error: expect.stringContaining('FIPS'),
        });
        expect(requests).toHaveLength(1);
        vi.stubEnv('AWS_USE_FIPS_ENDPOINT', 'false');
        expect(await provider.callApi('later request')).toMatchObject({
          output: 'offline response',
        });
        expect(requests[1].hostname).toBe(`${mode}-after.invalid`);
        expect(requests[1].headers.authorization).toContain('/us-west-2/sagemaker/aws4_request');
        const laterDefaultsMode = clients.at(-1)!.config.defaultsMode;
        expect(
          await (typeof laterDefaultsMode === 'function' ? laterDefaultsMode() : laterDefaultsMode),
        ).toBe('standard');
        expect(await clients.at(-1)!.config.maxAttempts()).toBe(5);
        expect(await clients.at(-1)!.config.useFipsEndpoint()).toBe(false);
      } finally {
        release.resolve();
        await pending;
      }
    },
  );

  it('keeps captured environment credentials when signing starts after another request changes them', async () => {
    vi.stubEnv('AWS_PROFILE', undefined);
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'BEFORE_KEY');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'before-secret');
    vi.stubEnv('AWS_SESSION_TOKEN', 'before-token');
    vi.stubEnv('AWS_ENDPOINT_URL_SAGEMAKER_RUNTIME', 'https://service-before.invalid');
    const provider = new SageMakerCompletionProvider('deployment', {
      config: { modelType: 'custom' },
    });
    providers.add(provider);
    const entered = deferred();
    const release = deferred();
    const requests: HttpRequest[] = [];
    const initialize = provider.getSageMakerRuntimeInstance.bind(provider);
    vi.spyOn(provider, 'getSageMakerRuntimeInstance').mockImplementation(async (...args) => {
      const client: SageMakerRuntimeClient = await initialize(...args);
      vi.spyOn(client.config.requestHandler, 'handle').mockImplementation(async (request) => {
        requests.push(request);
        return {
          response: new HttpResponse({
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: Buffer.from('{"output":"offline response"}'),
          }),
        };
      });
      entered.resolve();
      await release.promise;
      return client;
    });
    const pending = provider.callApi('first request');
    try {
      await entered.promise;
      vi.stubEnv('AWS_ACCESS_KEY_ID', 'AFTER_KEY');
      vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'after-secret');
      vi.stubEnv('AWS_SESSION_TOKEN', 'after-token');
      vi.stubEnv('AWS_REGION', 'us-west-2');
      release.resolve();
      expect(await pending).toMatchObject({ output: 'offline response' });
      expect(requests[0].headers.authorization).toContain('Credential=BEFORE_KEY/');
      expect(requests[0].headers.authorization).toContain('/us-east-1/sagemaker/aws4_request');
      expect(requests[0].headers['x-amz-security-token']).toBe('before-token');
      expect(await provider.callApi('later request')).toMatchObject({ output: 'offline response' });
      expect(requests[1].headers.authorization).toContain('Credential=AFTER_KEY/');
      expect(requests[1].headers.authorization).toContain('/us-west-2/sagemaker/aws4_request');
      expect(requests[1].headers['x-amz-security-token']).toBe('after-token');
    } finally {
      release.resolve();
      await pending;
    }
  });
});
