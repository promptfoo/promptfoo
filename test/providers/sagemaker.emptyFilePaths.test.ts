import { createHash } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { createRequire } from 'node:module';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from '../util/utils';
import type { HttpRequest } from '@smithy/core/transport';
import type { NodeHttpHandler as HttpHandler } from '@smithy/node-http-handler';

import type { SageMakerCompletionProvider } from '../../src/providers/sagemaker';

vi.mock('../../src/cache', () => ({ isCacheEnabled: () => false, getCache: vi.fn() }));
vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));

const requireFromTest = createRequire(import.meta.url);
const requireFromSso = createRequire(requireFromTest.resolve('@aws-sdk/credential-provider-sso'));
const sdkConfig = requireFromSso('@smithy/core/config') as typeof import('@smithy/core/config');
const { externalDataInterceptor, getHomeDir } = sdkConfig;
const { HttpResponse } = requireFromSso(
  '@smithy/core/transport',
) as typeof import('@smithy/core/transport');
const { NodeHttpHandler } = requireFromSso(
  '@smithy/node-http-handler',
) as typeof import('@smithy/node-http-handler');

const routes = ['default chain', 'named default chain', 'explicit profile'] as const;
const sources = ['credentials', 'config'] as const;
const inputs = ['missing', 'empty', 'both empty', 'nonempty', 'tilde', 'whitespace'] as const;
const ssoStartUrl = 'https://synthetic-sage.example/login';
const cases = routes.flatMap((route) =>
  sources.flatMap((source) => inputs.map((input) => ({ route, source, input }))),
);

function staticProfile(source: (typeof sources)[number], named: boolean, key: string) {
  const profile = named ? (source === 'config' ? 'profile fixture' : 'fixture') : 'default';
  return `[${profile}]\naws_access_key_id = ${key}\naws_secret_access_key = synthetic-file-secret\naws_session_token = synthetic-file-session\n`;
}

describe('SageMaker empty AWS shared-file selectors', () => {
  let restoreEnvironments: (() => void)[];
  let savedFiles: Map<string, PropertyDescriptor | undefined>;
  let originalFilePrototype: object | null;
  let unexpectedReads: number;
  let originalExec: PropertyDescriptor | undefined;
  let originalSsoToken: PropertyDescriptor | undefined;
  let provider: SageMakerCompletionProvider | undefined;
  let defaultPaths: Record<(typeof sources)[number], string>;
  let expandedPaths: Record<(typeof sources)[number], string>;
  let requests: HttpRequest[];
  let ssoRequests: HttpRequest[];
  let handlers: Set<HttpHandler>;

  function setEnvironment(values: Record<string, string | undefined>) {
    restoreEnvironments.push(mockProcessEnv(values));
  }

  function fileContents(filename: string, contents: string) {
    const files = externalDataInterceptor.getFileRecord();
    if (!savedFiles.has(filename)) {
      savedFiles.set(filename, Object.getOwnPropertyDescriptor(files, filename));
    }
    externalDataInterceptor.interceptFile(filename, contents);
  }

  async function loadProvider(config: SageMakerCompletionProvider['config'] = {}) {
    const { loadApiProvider } = await import('../../src/providers');
    provider = (await loadApiProvider('sagemaker:custom:fixture-endpoint', {
      options: { config: { region: 'us-east-1', ...config } },
    })) as SageMakerCompletionProvider;
    return provider;
  }

  beforeEach(() => {
    restoreEnvironments = [];
    savedFiles = new Map();
    unexpectedReads = 0;
    requests = [];
    ssoRequests = [];
    handlers = new Set();
    setEnvironment({
      ...Object.fromEntries(
        Object.keys(process.env)
          .filter((name) => name.startsWith('AWS_'))
          .map((name) => [name, undefined]),
      ),
      AWS_EC2_METADATA_DISABLED: 'true',
      AWS_DEFAULTS_MODE: 'legacy',
      AWS_MAX_ATTEMPTS: '1',
      AWS_SAGEMAKER_MAX_RETRIES: '1',
    });
    const files = externalDataInterceptor.getFileRecord();
    originalFilePrototype = Object.getPrototypeOf(files);
    const deniedReads = new Map<string, Promise<string>>();
    // The interceptor runs before the SDK's file cache, even when another test
    // has already loaded the CJS module. Unknown keys must never reach real fs.
    Object.setPrototypeOf(
      files,
      new Proxy(Object.create(null), {
        get: (_target, filename) => {
          if (typeof filename !== 'string') {
            return undefined;
          }
          let denied = deniedReads.get(filename);
          if (!denied) {
            unexpectedReads++;
            denied = Promise.reject(new Error('Unexpected shared-file read in fixture'));
            // The SDK looks up each interceptor key twice; the first lookup must
            // not leave an unhandled rejection while the second reaches its catch.
            void denied.catch(() => {});
            deniedReads.set(filename, denied);
          }
          return denied;
        },
      }),
    );
    // Home is only an opaque lookup key. Both fallback files are always supplied
    // in memory, and no fixture writes or reads anything under that directory.
    const selectedHome = getHomeDir();
    defaultPaths = {
      credentials: path.join(selectedHome, '.aws', 'credentials'),
      config: path.join(selectedHome, '.aws', 'config'),
    };
    expandedPaths = {
      credentials: path.join(selectedHome, 'synthetic-sage-credentials'),
      config: path.join(selectedHome, 'synthetic-sage-config'),
    };
    for (const filename of [
      ...Object.values(defaultPaths),
      ...Object.values(expandedPaths),
      '/synthetic-sage/credentials',
      '/synthetic-sage/config',
      '',
      ' ',
    ]) {
      fileContents(filename, '');
    }
    const tokens = externalDataInterceptor.getTokenRecord();
    originalExec = Object.getOwnPropertyDescriptor(tokens, 'exec');
    originalSsoToken = Object.getOwnPropertyDescriptor(tokens, ssoStartUrl);
    externalDataInterceptor.interceptToken(
      'exec',
      Object.assign(() => {}, {
        [promisify.custom]: async () => {
          throw new Error('Unexpected credential_process in empty-file-path fixture');
        },
      }),
    );
    for (const transport of [http, https]) {
      vi.spyOn(transport, 'request').mockImplementation(() => {
        throw new Error('Unexpected network in empty-file-path fixture');
      });
    }
    vi.spyOn(NodeHttpHandler.prototype, 'handle').mockImplementation(async function (
      this: HttpHandler,
      request,
    ) {
      handlers.add(this);
      if (request.hostname === 'portal.sso.eu-west-1.amazonaws.com') {
        expect(request.path).toBe('/federation/credentials');
        ssoRequests.push(request);
        return {
          response: new HttpResponse({
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: Buffer.from(
              JSON.stringify({
                roleCredentials: {
                  accessKeyId: 'SYNTHETIC_SSO',
                  secretAccessKey: 'synthetic-sso-secret',
                  sessionToken: 'synthetic-sso-session',
                  expiration: Date.now() + 3_600_000,
                },
              }),
            ),
          }),
        };
      }
      expect(request.hostname).toBe('runtime.sagemaker.us-east-1.amazonaws.com');
      expect(request.headers.authorization).toContain('/us-east-1/sagemaker/aws4_request');
      expect(request.headers['x-amz-content-sha256']).toBe(
        createHash('sha256')
          .update(request.body as Uint8Array)
          .digest('hex'),
      );
      expect(request.headers['amz-sdk-request']).toContain('attempt=1');
      requests.push(request);
      return {
        response: new HttpResponse({
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: Buffer.from('{"output":"synthetic file response"}'),
        }),
      };
    });
  });

  afterEach(() => {
    provider?.cleanup();
    provider = undefined;
    for (const handler of handlers) {
      handler.destroy();
    }
    const files = externalDataInterceptor.getFileRecord();
    Object.setPrototypeOf(files, originalFilePrototype);
    for (const [filename, descriptor] of savedFiles) {
      if (descriptor) {
        Object.defineProperty(files, filename, descriptor);
      } else {
        Reflect.deleteProperty(files, filename);
      }
    }
    const tokens = externalDataInterceptor.getTokenRecord();
    if (originalExec) {
      Object.defineProperty(tokens, 'exec', originalExec);
    } else {
      Reflect.deleteProperty(tokens, 'exec');
    }
    if (originalSsoToken) {
      Object.defineProperty(tokens, ssoStartUrl, originalSsoToken);
    } else {
      Reflect.deleteProperty(tokens, ssoStartUrl);
    }
    vi.restoreAllMocks();
    for (const restore of restoreEnvironments.reverse()) {
      restore();
    }
    expect(unexpectedReads).toBe(0);
  });

  it.each(cases)(
    'signs through $route from sole $source with $input paths',
    async ({ route, source, input }) => {
      const named = route !== 'default chain';
      const pathVariable =
        source === 'credentials' ? 'AWS_SHARED_CREDENTIALS_FILE' : 'AWS_CONFIG_FILE';
      const key = ['nonempty', 'tilde', 'whitespace'].includes(input)
        ? 'OVERRIDE_FILE'
        : 'DEFAULT_FILE';
      fileContents(defaultPaths[source], staticProfile(source, named, 'DEFAULT_FILE'));
      if (input === 'empty') {
        setEnvironment({ [pathVariable]: '' });
      } else if (input === 'both empty') {
        setEnvironment({ AWS_SHARED_CREDENTIALS_FILE: '', AWS_CONFIG_FILE: '' });
      } else if (input === 'nonempty') {
        const filename = `/synthetic-sage/${source}`;
        fileContents(filename, staticProfile(source, named, key));
        setEnvironment({ [pathVariable]: filename });
      } else if (input === 'tilde') {
        fileContents(expandedPaths[source], staticProfile(source, named, key));
        setEnvironment({ [pathVariable]: `~/synthetic-sage-${source}` });
      } else if (input === 'whitespace') {
        // A literal whitespace filename is valid here and must never be trimmed
        // into the fallback file, which contains a different signing key.
        const contents = staticProfile(source, named, key);
        fileContents(' ', contents);
        fileContents(path.resolve(' '), contents);
        setEnvironment({ [pathVariable]: ' ' });
      }
      if (route === 'named default chain') {
        setEnvironment({ AWS_PROFILE: 'fixture' });
      }
      const selected = await loadProvider(
        route === 'explicit profile' ? { profile: 'fixture' } : {},
      );
      const result = await selected.callApi(`${route}: ${source}: ${input}`);
      expect(result.error).toBeUndefined();
      expect(result.output).toBe('synthetic file response');
      expect(requests).toHaveLength(1);
      expect(requests[0].headers.authorization).toContain(`Credential=${key}/`);
      expect(requests[0].headers['x-amz-security-token']).toBe('synthetic-file-session');
      expect(selected.sagemakerRuntime).toBeUndefined();
    },
  );

  it('keeps explicit static credentials ahead of empty shared-file selectors', async () => {
    setEnvironment({ AWS_SHARED_CREDENTIALS_FILE: '', AWS_CONFIG_FILE: '' });
    const selected = await loadProvider({
      accessKeyId: 'EXPLICIT_CONFIG',
      secretAccessKey: 'synthetic-config-secret',
      sessionToken: 'synthetic-config-session',
    });
    expect(await selected.callApi('explicit config')).toMatchObject({
      output: 'synthetic file response',
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].headers.authorization).toContain('Credential=EXPLICIT_CONFIG/');
    expect(requests[0].headers['x-amz-security-token']).toBe('synthetic-config-session');
  });

  it('uses the default config endpoint policy to retain SSO credentials when an ignored endpoint changes', async () => {
    fileContents(
      defaultPaths.config,
      `[default]
ignore_configured_endpoint_urls = true
[profile fixture]
sso_start_url = ${ssoStartUrl}
sso_account_id = 123456789012
sso_region = eu-west-1
sso_role_name = TestRole
`,
    );
    externalDataInterceptor.interceptToken(ssoStartUrl, {
      accessToken: 'synthetic-sso-login-token',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    setEnvironment({
      AWS_CONFIG_FILE: '',
      AWS_ENDPOINT_URL_SSO: 'https://ignored-a.invalid',
    });
    const selected = await loadProvider({ profile: 'fixture' });
    expect(await selected.callApi('first ignored endpoint')).toMatchObject({
      output: 'synthetic file response',
    });
    expect(selected.sagemakerRuntime).toBeUndefined();
    // This deliberate between-row mutation checks scope filtering through the
    // actual helper-policy loadConfig branch; fixture files stay unchanged.
    setEnvironment({ AWS_ENDPOINT_URL_SSO: 'https://ignored-b.invalid' });
    expect(await selected.callApi('second ignored endpoint')).toMatchObject({
      output: 'synthetic file response',
    });
    expect(requests).toHaveLength(2);
    expect(
      requests.every((request) =>
        request.headers.authorization.includes('Credential=SYNTHETIC_SSO/'),
      ),
    ).toBe(true);
    expect(ssoRequests).toHaveLength(1);
  });

  it('keeps a real borrowed client caller-owned with empty shared-file selectors', async () => {
    setEnvironment({ AWS_SHARED_CREDENTIALS_FILE: '', AWS_CONFIG_FILE: '' });
    const { SageMakerRuntimeClient } = await import('@aws-sdk/client-sagemaker-runtime');
    const borrowed = new SageMakerRuntimeClient({
      region: 'us-east-1',
      defaultsMode: 'legacy',
      credentials: { accessKeyId: 'BORROWED_CONFIG', secretAccessKey: 'synthetic-borrowed-secret' },
    });
    const originalConfig = borrowed.config;
    const destroy = vi.spyOn(borrowed, 'destroy');
    try {
      const selected = await loadProvider();
      selected.sagemakerRuntime = borrowed;
      expect(await selected.callApi('borrowed config')).toMatchObject({
        output: 'synthetic file response',
      });
      selected.cleanup();
      expect(requests).toHaveLength(1);
      expect(requests[0].headers.authorization).toContain('Credential=BORROWED_CONFIG/');
      expect(selected.sagemakerRuntime).toBe(borrowed);
      expect(borrowed.config).toBe(originalConfig);
      expect(destroy).not.toHaveBeenCalled();
    } finally {
      borrowed.destroy();
    }
    expect(destroy).toHaveBeenCalledOnce();
  });
});
