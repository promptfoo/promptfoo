import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { SageMakerRuntimeClient } from '@aws-sdk/client-sagemaker-runtime';
import { HttpRequest } from '@smithy/core/transport';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SageMakerCompletionProvider } from '../../src/providers/sagemaker';
import type { NodeHttpHandler } from '@smithy/node-http-handler';

vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));

describe('SageMaker SDK transport configuration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.doUnmock('@smithy/core/client');
    vi.doUnmock('@aws-sdk/client-sagemaker-runtime');
    vi.doUnmock('@aws-sdk/credential-provider-node');
  });

  it.each([
    'legacy',
    'standard',
    'mobile',
    'in-region',
    'cross-region',
    'auto-same-region',
    'auto-cross-region',
    'profile',
  ])('shares and cleans up the HTTP agent with %s SDK defaults', async (defaultsMode) => {
    vi.useFakeTimers();
    vi.stubEnv(
      'AWS_DEFAULTS_MODE',
      defaultsMode === 'profile'
        ? undefined
        : defaultsMode.startsWith('auto')
          ? 'auto'
          : defaultsMode,
    );
    vi.stubEnv('AWS_EXECUTION_ENV', 'AWS_Lambda_nodejs24.x');
    vi.stubEnv('AWS_REGION', defaultsMode === 'auto-cross-region' ? 'us-west-2' : 'us-east-1');
    const configDirectory = await mkdtemp(path.join(tmpdir(), 'promptfoo-sagemaker-sdk-'));
    const configFile = path.join(configDirectory, 'config');
    const credentialsFile = path.join(configDirectory, 'credentials');
    await writeFile(configFile, '[profile sagemaker-proof]\ndefaults_mode = cross-region\n');
    await writeFile(credentialsFile, '');
    vi.stubEnv('AWS_CONFIG_FILE', configFile);
    vi.stubEnv('AWS_SHARED_CREDENTIALS_FILE', credentialsFile);
    vi.stubEnv('AWS_PROFILE', 'sagemaker-proof');
    const intercepted = new Error('Intercepted the HTTP request before any network connection');
    const request = vi.spyOn(http, 'request').mockImplementation(() => {
      throw intercepted;
    });
    const credentials = {
      accessKeyId: 'offline-placeholder',
      secretAccessKey: 'offline-placeholder',
    };
    const provider = new SageMakerCompletionProvider('endpoint', {
      config: { modelType: 'custom', region: 'us-east-1', ...credentials },
    });
    const reference = new SageMakerRuntimeClient({ region: 'us-east-1', credentials });
    try {
      const runtime = await provider.getSageMakerRuntimeInstance();
      const handler = runtime.config.requestHandler as NodeHttpHandler;
      const referenceHandler = reference.config.requestHandler as NodeHttpHandler;
      const requestInput = new HttpRequest({
        protocol: 'http:',
        hostname: '127.0.0.1',
        path: '/',
        method: 'POST',
        headers: {},
      });
      await Promise.all(
        [handler.handle(requestInput, {}), handler.handle(requestInput, {})].map((pending) =>
          expect(pending).rejects.toBe(intercepted),
        ),
      );
      expect(request).toHaveBeenCalledTimes(2);
      const firstAgent = (request.mock.calls[0][0] as http.RequestOptions).agent as http.Agent;
      const secondAgent = (request.mock.calls[1][0] as http.RequestOptions).agent;
      expect(firstAgent).toBeInstanceOf(http.Agent);
      expect(secondAgent, 'Concurrent first HTTP requests must share one agent').toBe(firstAgent);
      expect(handler.httpHandlerConfigs().httpAgent).toBe(firstAgent);

      await expect(referenceHandler.handle(requestInput, {})).rejects.toBe(intercepted);
      const actual = handler.httpHandlerConfigs();
      const expected = referenceHandler.httpHandlerConfigs();
      expect(actual.connectionTimeout).toBe(expected.connectionTimeout);
      expect(actual.httpsAgent).toMatchObject({
        keepAlive: true,
        maxSockets: 50,
      });
      expect(actual.httpAgent).toMatchObject({ keepAlive: true, maxSockets: 50 });
      expect(request).toHaveBeenCalledTimes(3);

      const destroyAgent = vi.spyOn(firstAgent, 'destroy');
      provider.cleanup();
      provider.cleanup();
      expect(destroyAgent).toHaveBeenCalledTimes(1);
    } finally {
      provider.cleanup();
      reference.destroy();
      await rm(configDirectory, { recursive: true });
    }
  });

  it.each([
    '@smithy/core/client',
    '@aws-sdk/client-sagemaker-runtime',
    '@aws-sdk/credential-provider-node',
  ])('loads the optional %s package only when creating an owned client', async (dependency) => {
    const loadPackage = vi.fn(() => {
      throw new Error(`Cannot find package ${dependency}`);
    });
    vi.doMock(dependency, loadPackage);
    const provider = new SageMakerCompletionProvider('endpoint', {
      config: { modelType: 'custom', region: 'us-east-1' },
    });
    const borrowed = { send: vi.fn(), destroy: vi.fn() };
    provider.sagemakerRuntime = borrowed;
    expect(await provider.getSageMakerRuntimeInstance()).toBe(borrowed);
    expect(loadPackage).not.toHaveBeenCalled();
    provider.sagemakerRuntime = undefined;
    await expect(provider.getSageMakerRuntimeInstance()).rejects.toThrow(
      'The @aws-sdk/client-sagemaker-runtime package is required',
    );
    expect(loadPackage).toHaveBeenCalledOnce();
    expect(borrowed.destroy).not.toHaveBeenCalled();
  });
});
