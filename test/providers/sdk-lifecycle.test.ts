import { BedrockRuntime } from '@aws-sdk/client-bedrock-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { AwsBedrockCompletionProvider } from '../../src/providers/bedrock';
import { AwsBedrockAgentsProvider } from '../../src/providers/bedrock/agents';
import { AwsBedrockKnowledgeBaseProvider } from '../../src/providers/bedrock/knowledgeBase';
import { NovaSonicProvider } from '../../src/providers/bedrock/nova-sonic';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { SageMakerCompletionProvider } from '../../src/providers/sagemaker';
import { createDeferred, mockProcessEnv } from '../util/utils';

let restore: () => void;
beforeEach(() => {
  restore = mockProcessEnv({
    AWS_ACCESS_KEY_ID: 'fixture-access',
    AWS_SECRET_ACCESS_KEY: 'fixture-secret',
    AWS_BEARER_TOKEN_BEDROCK: undefined,
    AWS_PROFILE: undefined,
  });
});
afterEach(async () => {
  await providerRegistry.shutdownAll();
  vi.restoreAllMocks();
  restore();
});

const providers = [
  ['bedrock', () => new AwsBedrockCompletionProvider('fixture'), 'getBedrockInstance'],
  [
    'sagemaker',
    () => new SageMakerCompletionProvider('fixture', { config: { modelType: 'custom' } }),
    'getSageMakerRuntimeInstance',
  ],
  ['agent', () => new AwsBedrockAgentsProvider('fixture'), 'getAgentRuntimeClient'],
  [
    'knowledge-base',
    () =>
      new AwsBedrockKnowledgeBaseProvider('fixture', { config: { knowledgeBaseId: 'fixture' } }),
    'getKnowledgeBaseClient',
  ],
  ['sonic', () => new NovaSonicProvider(), 'getBedrockClient'],
] as const;

describe('SDK client lifecycle', () => {
  it('does not register unused state or close standalone clients during an evaluation', async () => {
    const register = vi.spyOn(providerRegistry, 'register');
    const provider = new AwsBedrockCompletionProvider('fixture');
    expect(register).not.toHaveBeenCalled();
    const client = await provider.getBedrockInstance();
    const destroy = vi.spyOn(client, 'destroy');
    await cliState.withEnv({}, async () => {
      await provider.getBedrockInstance();
      await providerRegistry.shutdownAll(cliState.envScope);
    });
    expect(destroy).not.toHaveBeenCalled();
    await providerRegistry.shutdownAll();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it.each(providers)(
    'releases only the completed %s scope and supports reuse',
    async (_name, create, method) => {
      const provider = create();
      const getClient = () => Reflect.get(provider, method).call(provider);
      const ready = createDeferred<void>();
      const released = createDeferred<void>();
      let firstDestroy: ReturnType<typeof vi.spyOn>;
      const first = cliState.withEnv({}, async () => {
        const client = await getClient();
        firstDestroy = vi.spyOn(client, 'destroy');
        ready.resolve();
        await released.promise;
        expect(firstDestroy).not.toHaveBeenCalled();
        await providerRegistry.shutdownAll(cliState.envScope);
        expect(firstDestroy).toHaveBeenCalledOnce();
        const next = await getClient();
        expect(next).not.toBe(client);
        const nextDestroy = vi.spyOn(next, 'destroy');
        await providerRegistry.shutdownAll(cliState.envScope);
        expect(nextDestroy).toHaveBeenCalledOnce();
      });
      const second = cliState.withEnv({}, async () => {
        await ready.promise;
        const client = await getClient();
        const destroy = vi.spyOn(client, 'destroy');
        try {
          await providerRegistry.shutdownAll(cliState.envScope);
          expect(destroy).toHaveBeenCalledOnce();
          expect(firstDestroy!).not.toHaveBeenCalled();
        } finally {
          released.resolve();
        }
      });
      await Promise.all([first, second]);
    },
  );

  it('waits for pending construction, releases it, and permits a new lifecycle', async () => {
    const provider = new AwsBedrockCompletionProvider('fixture');
    const destroy = vi.spyOn(BedrockRuntime.prototype, 'destroy');
    const credentials = createDeferred<{ accessKeyId: string; secretAccessKey: string }>();
    vi.spyOn(provider, 'getCredentials').mockReturnValueOnce(credentials.promise);
    await cliState.withEnv({}, async () => {
      const pending = provider.getBedrockInstance();
      const shutdown = providerRegistry.shutdownAll(cliState.envScope);
      let stopped = false;
      void shutdown.then(() => {
        stopped = true;
      });
      await Promise.resolve();
      expect(stopped).toBe(false);
      const next = await provider.getBedrockInstance();
      credentials.resolve({ accessKeyId: 'fixture', secretAccessKey: 'fixture' });
      const client = await pending;
      await shutdown;
      expect(destroy).toHaveBeenCalledOnce();
      expect(next).not.toBe(client);
      expect(await provider.getBedrockInstance()).toBe(next);
      await providerRegistry.shutdownAll(cliState.envScope);
      expect(destroy).toHaveBeenCalledTimes(2);
      expect(stopped).toBe(true);
    });
  });

  it('preserves caller-owned injected clients', async () => {
    const bedrock = new AwsBedrockCompletionProvider('fixture');
    const sageMaker = new SageMakerCompletionProvider('fixture', {
      config: { modelType: 'custom' },
    });
    const kb = new AwsBedrockKnowledgeBaseProvider('fixture', {
      config: { knowledgeBaseId: 'fixture' },
    });
    const client = { destroy: vi.fn() };
    bedrock.bedrock = client as never;
    sageMaker.sagemakerRuntime = client;
    kb.knowledgeBaseClient = client as never;
    await cliState.withEnv({}, async () => {
      expect(await bedrock.getBedrockInstance()).toBe(client);
      expect(await sageMaker.getSageMakerRuntimeInstance()).toBe(client);
      expect(await kb.getKnowledgeBaseClient()).toBe(client);
      await providerRegistry.shutdownAll(cliState.envScope);
    });
    expect(client.destroy).not.toHaveBeenCalled();
  });

  it('destroys every SageMaker region client', async () => {
    await cliState.withEnv({}, async () => {
      const provider = new SageMakerCompletionProvider('fixture', {
        config: { modelType: 'custom' },
      });
      const clients = await Promise.all(
        ['us-east-1', 'us-west-2'].map((region) => provider.getSageMakerRuntimeInstance(region)),
      );
      const destroy = clients.map((client) => vi.spyOn(client, 'destroy'));
      await providerRegistry.shutdownAll(cliState.envScope);
      destroy.forEach((spy) => expect(spy).toHaveBeenCalledOnce());
    });
  });
});
