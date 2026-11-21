import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadApiProvider } from '../../src/providers';
import { mockProcessEnv } from '../util/utils';

import type {
  SageMakerCompletionProvider,
  SageMakerEmbeddingProvider,
} from '../../src/providers/sagemaker';

vi.mock('../../src/cache', () => ({ isCacheEnabled: () => false, getCache: vi.fn() }));
vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));

const installMessage =
  'The @aws-sdk/client-sagemaker-runtime package is required. Please install it with: npm install @aws-sdk/client-sagemaker-runtime';

describe('SageMaker public optional-dependency errors', () => {
  let directory: string;
  let restoreEnv: () => void;
  let constructClient: ReturnType<typeof vi.fn<() => void>>;
  const providers = new Set<SageMakerCompletionProvider | SageMakerEmbeddingProvider>();

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'promptfoo-sage-optional-'));
    const config = path.join(directory, 'config');
    await writeFile(config, '');
    restoreEnv = mockProcessEnv({
      ...Object.fromEntries(
        Object.keys(process.env)
          .filter((name) => name.startsWith('AWS_'))
          .map((name) => [name, undefined]),
      ),
      AWS_CONFIG_FILE: config,
      AWS_SHARED_CREDENTIALS_FILE: config,
      AWS_REGION: 'us-east-1',
      AWS_DEFAULTS_MODE: 'legacy',
      AWS_EC2_METADATA_DISABLED: 'true',
    });
    constructClient = vi.fn();
    vi.doMock('@aws-sdk/client-sagemaker-runtime', () => ({
      SageMakerRuntimeClient: class {
        constructor() {
          constructClient();
          throw new Error('Unexpected owned SDK client');
        }
      },
      InvokeEndpointCommand: class {},
    }));
  });

  afterEach(async () => {
    for (const provider of providers) {
      provider.cleanup();
    }
    providers.clear();
    vi.doUnmock('@smithy/core/config');
    vi.doUnmock('@aws-sdk/client-sagemaker-runtime');
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    restoreEnv();
    await rm(directory, { recursive: true, force: true });
  });

  async function load(kind: 'completion' | 'embedding', profile = false) {
    const provider = (await loadApiProvider(
      kind === 'completion' ? 'sagemaker:custom:endpoint' : 'sagemaker:embedding:endpoint',
      {
        options: {
          config: {
            modelType: 'custom',
            region: 'us-east-1',
            ...(profile
              ? { profile: 'offline-profile' }
              : { accessKeyId: 'OFFLINE', secretAccessKey: 'offline-secret' }),
          },
        },
      },
    )) as SageMakerCompletionProvider | SageMakerEmbeddingProvider;
    providers.add(provider);
    return provider;
  }

  function call(
    provider: SageMakerCompletionProvider | SageMakerEmbeddingProvider,
    kind: 'completion' | 'embedding',
  ) {
    return kind === 'completion'
      ? provider.callApi('offline prompt')
      : (provider as SageMakerEmbeddingProvider).callEmbeddingApi('offline prompt');
  }

  it.each([
    ['completion', false],
    ['embedding', false],
    ['completion', true],
    ['embedding', true],
  ] as const)('reports SDK installation guidance for %s with profile=%s', async (kind, profile) => {
    const provider = await load(kind, profile);
    const cause = Object.assign(new Error('Cannot find package @smithy/core/config'), {
      code: 'ERR_MODULE_NOT_FOUND',
    });
    const configImport = vi.fn(() => {
      throw cause;
    });
    vi.doMock('@smithy/core/config', configImport);

    const result = call(provider, kind);
    // Vitest wraps a rejected mock factory; keep its original missing-module cause.
    await expect(result).rejects.toMatchObject({ message: installMessage, cause: { cause } });
    await expect(result).rejects.toHaveProperty('cause.cause', cause);
    expect(configImport).toHaveBeenCalledOnce();
    expect(constructClient).not.toHaveBeenCalled();
  });

  it.each(['completion', 'embedding'] as const)(
    'keeps a borrowed %s client usable without importing provider config helpers',
    async (kind) => {
      const provider = await load(kind);
      const configImport = vi.fn(() => {
        throw new Error('Provider config import must remain unused');
      });
      vi.doMock('@smithy/core/config', configImport);
      const borrowed = {
        send: vi.fn().mockResolvedValue({
          Body: new TextEncoder().encode(JSON.stringify({ output: 'offline', embedding: [1, 2] })),
        }),
        destroy: vi.fn(),
      };
      provider.sagemakerRuntime = borrowed;

      expect(await call(provider, kind)).toMatchObject(
        kind === 'completion' ? { output: 'offline' } : { embedding: [1, 2] },
      );
      provider.cleanup();
      expect(borrowed.send).toHaveBeenCalledOnce();
      expect(borrowed.destroy).not.toHaveBeenCalled();
      expect(configImport).not.toHaveBeenCalled();
      expect(constructClient).not.toHaveBeenCalled();
    },
  );

  it.each(['completion', 'embedding'] as const)(
    'preserves actual SDK defaults configuration errors for %s',
    async (kind) => {
      const provider = await load(kind);
      vi.stubEnv('AWS_DEFAULTS_MODE', 'invalid-defaults-mode');

      const result = call(provider, kind);
      await expect(result).rejects.toThrow('Invalid parameter for "defaultsMode"');
      await expect(result).rejects.not.toThrow('npm install');
      expect(constructClient).not.toHaveBeenCalled();
    },
  );

  it.each(['completion', 'embedding'] as const)(
    'preserves profile configuration failure identity for %s',
    async (kind) => {
      const provider = await load(kind, true);
      const cause = new Error('Invalid selected profile configuration');
      vi.doMock('@smithy/core/config', async (importOriginal) => ({
        ...(await importOriginal<typeof import('@smithy/core/config')>()),
        parseKnownFiles: vi.fn().mockRejectedValue(cause),
      }));

      await expect(call(provider, kind)).rejects.toBe(cause);
      expect(constructClient).not.toHaveBeenCalled();
    },
  );
});
