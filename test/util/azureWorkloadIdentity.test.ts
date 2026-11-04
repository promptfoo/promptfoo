import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';

import * as identity from '@azure/identity';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAzureCredential } from '../../src/util/azureCredentials';
import {
  createAzureEnvironmentFallback,
  createScopedAzureWorkloadCredential,
} from '../../src/util/azureWorkloadIdentity';
import { mockProcessEnv } from './utils';
import type { TokenCredential } from '@azure/identity';

const sdkMetadata = vi.hoisted(() => ({ version: undefined as string | undefined }));
vi.mock('@azure/identity/package.json', async (importOriginal) => {
  const actual = await importOriginal<{ default: typeof import('@azure/identity/package.json') }>();
  return {
    default: {
      get version() {
        return sdkMetadata.version ?? actual.default.version;
      },
    },
  };
});
let restore: () => void;
let directory: string;
const scope = 'https://management.azure.com/.default';
const token = { token: 'fixture-token', expiresOnTimestamp: 9_999_999_999_999 };
const selectors = [undefined, 'prod', 'WorkloadIdentityCredential', 'ManagedIdentityCredential'];
const sources = (credential: TokenCredential): TokenCredential[] =>
  Reflect.get(credential, '_sources');
const workload = (file: string) => ({
  AZURE_CLIENT_ID: 'selected-client',
  AZURE_TENANT_ID: 'selected-tenant',
  AZURE_FEDERATED_TOKEN_FILE: file,
  AZURE_CLIENT_SECRET: '',
});
function stubDeveloperTail(credential: TokenCredential) {
  const calls: string[] = [];
  for (const source of sources(credential)) {
    if (
      [
        'VisualStudioCodeCredential',
        'AzureCliCredential',
        'AzurePowerShellCredential',
        'AzureDeveloperCliCredential',
        'BrokerCredential',
      ].includes(source.constructor.name)
    ) {
      vi.spyOn(source, 'getToken').mockImplementation(async () => {
        calls.push(source.constructor.name);
        if (source.constructor.name === 'AzureCliCredential') {
          return token;
        }
        throw new identity.CredentialUnavailableError('Fixture developer source unavailable.');
      });
    }
  }
  return calls;
}
async function outcome(credential: TokenCredential) {
  try {
    return { token: await credential.getToken(scope, { claims: 'fixture-claims' }) };
  } catch (error) {
    return { errorName: (error as Error).name };
  }
}
beforeEach(() => {
  sdkMetadata.version = undefined;
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-workload-fallback-'));
  restore = mockProcessEnv({}, { clear: true });
  const deny = () => {
    throw new Error('Unexpected network access.');
  };
  vi.spyOn(globalThis, 'fetch').mockImplementation(deny);
  vi.spyOn(http, 'request').mockImplementation(deny);
  vi.spyOn(https, 'request').mockImplementation(deny);
});
afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
  restore();
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('scoped Azure workload SDK fallback', () => {
  it('preserves the native managed-only constructor-unavailable placeholder', async () => {
    const selected = workload(path.join(directory, 'selected'));
    // MSAL memoizes its platform choice. Stub only that platform probe so this
    // counterfactual does not depend on which earlier test initialized it.
    const managed = new identity.ManagedIdentityCredential();
    vi.spyOn(
      Object.getPrototypeOf(Reflect.get(managed, 'managedIdentityApp')),
      'getManagedIdentitySource',
    ).mockReturnValue('CloudShell');
    mockProcessEnv({
      AZURE_TOKEN_CREDENTIALS: 'ManagedIdentityCredential',
    });
    const restoreSelected = mockProcessEnv(selected);
    const native = new identity.DefaultAzureCredential();
    expect(sources(native)[0].constructor.name).toBe('UnavailableDefaultCredential');
    const expected = await outcome(native);
    restoreSelected();
    const actual = await createAzureCredential({}, selected);
    expect(await outcome(actual)).toEqual(expected);
    expect(http.request).not.toHaveBeenCalled();
  });
  it('guards an unsupported SDK major without rejecting compatible minor versions', async () => {
    const native = new identity.DefaultAzureCredential();
    const options = { clientId: 'fixture', tenantId: 'fixture', tokenFilePath: '/fixture/token' };
    sdkMetadata.version = '5.0.0';
    await expect(
      createScopedAzureWorkloadCredential(identity, native, options, undefined),
    ).rejects.toThrow('cannot safely isolate');
    sdkMetadata.version = '4.99.0';
    await expect(
      createScopedAzureWorkloadCredential(identity, native, options, undefined),
    ).resolves.toBeInstanceOf(identity.ChainedTokenCredential);
  });
  it.each(
    selectors.flatMap((selector) =>
      ['empty', 'whitespace', 'missing'].map((file) => ({ selector, file })),
    ),
  )(
    'retains native runtime fallback for $selector/$file without reading the host identity',
    async ({ selector, file }) => {
      const filename = path.join(directory, 'selected');
      if (file !== 'missing') {
        fs.writeFileSync(filename, file === 'empty' ? '' : ' \t\n');
      }
      const selected = workload(filename);
      const original = identity.WorkloadIdentityCredential.prototype.getToken;
      const attempts: string[] = [];
      vi.spyOn(identity.WorkloadIdentityCredential.prototype, 'getToken').mockImplementation(
        function (this: identity.WorkloadIdentityCredential, scopes, options) {
          attempts.push(Reflect.get(this, 'federatedTokenFilePath'));
          return original.call(this, scopes, options);
        },
      );
      mockProcessEnv({ AZURE_TOKEN_CREDENTIALS: selector });
      const restoreSelected = mockProcessEnv(selected);
      const native = new identity.DefaultAzureCredential();
      const nativeDevelopers = stubDeveloperTail(native);
      const expected = await outcome(native);
      const expectedAttempts = [...attempts];
      restoreSelected();
      mockProcessEnv({
        AZURE_CLIENT_ID: 'host-client',
        AZURE_TENANT_ID: 'host-tenant',
        AZURE_CLIENT_SECRET: 'host-secret',
        AZURE_FEDERATED_TOKEN_FILE: path.join(directory, 'host'),
      });
      attempts.length = 0;
      const actual = await createAzureCredential({}, selected);
      const actualDevelopers = stubDeveloperTail(actual);
      expect(await outcome(actual)).toEqual(expected);
      expect(attempts).toEqual(expectedAttempts);
      expect(attempts.every((attempt) => attempt === filename)).toBe(true);
      expect(actualDevelopers).toEqual(nativeDevelopers);
      expect(process.env.AZURE_CLIENT_ID).toBe('host-client');
      expect(http.request).not.toHaveBeenCalled();
      expect(https.request).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each(
    selectors.flatMap((selector) =>
      [
        ['success'],
        ['null', 'success'],
        ['unavailable', 'success'],
        ['required', 'success'],
        ['unavailable', 'authentication'],
        ['unavailable', 'error'],
        ['unavailable', 'null'],
        ['authentication'],
        ['error'],
      ].map((events) => ({ selector, events })),
    ),
  )(
    'matches native error taxonomy and options for $selector/$events',
    async ({ selector, events }) => {
      const selected = workload(path.join(directory, 'selected'));
      let sequence = [...events];
      const attempts: unknown[] = [];
      vi.spyOn(identity.WorkloadIdentityCredential.prototype, 'getToken').mockImplementation(
        async function (this: identity.WorkloadIdentityCredential, scopes, options) {
          attempts.push({
            file: Reflect.get(this, 'federatedTokenFilePath'),
            tenant: Reflect.get(this, 'client').tenantId,
            scopes,
            claims: options?.claims,
          });
          const event = sequence.shift() ?? 'unavailable';
          if (event === 'success') {
            return token;
          }
          if (event === 'null') {
            return null as unknown as typeof token;
          }
          if (event === 'required') {
            throw new identity.AuthenticationRequiredError({
              scopes: [scope],
              message: 'Fixture authentication required.',
            });
          }
          if (event === 'authentication') {
            throw new identity.AuthenticationError(400, { error: 'Fixture fatal authentication.' });
          }
          if (event === 'error') {
            throw new Error('Fixture fatal error.');
          }
          throw new identity.CredentialUnavailableError('Fixture unavailable.');
        },
      );
      mockProcessEnv({ AZURE_TOKEN_CREDENTIALS: selector });
      const restoreSelected = mockProcessEnv(selected);
      const native = new identity.DefaultAzureCredential();
      const nativeDevelopers = stubDeveloperTail(native);
      const expected = await outcome(native);
      const expectedAttempts = [...attempts];
      restoreSelected();
      mockProcessEnv({
        AZURE_CLIENT_ID: 'host-client',
        AZURE_TENANT_ID: 'host-tenant',
        AZURE_FEDERATED_TOKEN_FILE: path.join(directory, 'host'),
      });
      sequence = [...events];
      attempts.length = 0;
      const actual = await createAzureCredential({}, selected);
      const actualDevelopers = stubDeveloperTail(actual);
      expect(await outcome(actual)).toEqual(expected);
      expect(attempts).toEqual(expectedAttempts);
      expect(actualDevelopers).toEqual(nativeDevelopers);
    },
  );

  it.each(selectors)('retains constructor-unavailable fallback for %s', async (selector) => {
    const selected = {
      ...workload(path.join(directory, 'selected')),
      AZURE_TENANT_ID: 'invalid tenant',
    };
    mockProcessEnv({ AZURE_TOKEN_CREDENTIALS: selector });
    const restoreSelected = mockProcessEnv(selected);
    const native = new identity.DefaultAzureCredential();
    stubDeveloperTail(native);
    const expected = await outcome(native);
    restoreSelected();
    const actual = await createAzureCredential({}, selected);
    stubDeveloperTail(actual);
    expect(await outcome(actual)).toEqual(expected);
  });

  it('retains native tail instances and supports additional SDK tail sources', async () => {
    const native = new identity.DefaultAzureCredential();
    const original = [...sources(native)];
    const future = { getToken: vi.fn().mockResolvedValue(token) };
    sources(native).push(future);
    const actual = await createScopedAzureWorkloadCredential(
      identity,
      native,
      { clientId: 'fixture', tenantId: 'fixture', tokenFilePath: '/fixture/token' },
      undefined,
    );
    expect(sources(native)).toEqual([...original, future]);
    expect(sources(actual).slice(2)).toEqual([...original.slice(3), future]);
    expect(sources(actual).at(-1)).toBe(future);
  });

  it.each(['missing', 'reordered', 'extra-production', 'invalid-token-method'])(
    'rejects an unknown %s SDK layout',
    async (layout) => {
      const native = new identity.DefaultAzureCredential();
      if (layout === 'missing') {
        Reflect.deleteProperty(native, '_sources');
      }
      if (layout === 'reordered') {
        sources(native).reverse();
      }
      if (layout === 'extra-production') {
        sources(native).push(new identity.EnvironmentCredential());
      }
      if (layout === 'invalid-token-method') {
        sources(native).push({} as TokenCredential);
      }
      await expect(
        createScopedAzureWorkloadCredential(
          identity,
          native,
          { clientId: 'fixture', tenantId: 'fixture', tokenFilePath: '/fixture/token' },
          undefined,
        ),
      ).rejects.toThrow('cannot safely isolate');
    },
  );
});

describe('scoped Azure environment constructor fallback', () => {
  const modes = ['secret', 'certificate', 'username'] as const;
  const selectedEnvironment = (mode: (typeof modes)[number], tenant = 'invalid tenant') => ({
    AZURE_CLIENT_ID: 'selected-client',
    AZURE_TENANT_ID: tenant,
    ...(mode === 'secret'
      ? { AZURE_CLIENT_SECRET: 'fixture-secret' }
      : mode === 'certificate'
        ? { AZURE_CLIENT_CERTIFICATE_PATH: path.join(directory, 'unused.pem') }
        : { AZURE_USERNAME: 'fixture@example.invalid', AZURE_PASSWORD: 'fixture-password' }),
  });

  it.each(
    modes.flatMap((mode) =>
      [undefined, 'prod', 'EnvironmentCredential'].flatMap((selector) =>
        [false, true].flatMap((ambient) =>
          ['invalid tenant', ' \t '].map((tenant) => ({ mode, selector, ambient, tenant })),
        ),
      ),
    ),
  )(
    'matches SDK fallback for $mode/$selector with ambient principal $ambient and tenant $tenant',
    async ({ mode, selector, ambient, tenant }) => {
      vi.spyOn(identity.ManagedIdentityCredential.prototype, 'getToken').mockRejectedValue(
        new identity.CredentialUnavailableError('Fixture managed identity unavailable.'),
      );
      const environment = vi
        .spyOn(identity.EnvironmentCredential.prototype, 'getToken')
        .mockResolvedValue({
          ...token,
          token: 'host-principal-must-not-be-selected',
        });
      mockProcessEnv({ AZURE_TOKEN_CREDENTIALS: selector });
      const selected = selectedEnvironment(mode, tenant);
      const restoreSelected = mockProcessEnv(selected);
      const native = new identity.DefaultAzureCredential();
      const nativeDevelopers = stubDeveloperTail(native);
      const expected = await outcome(native);
      restoreSelected();
      if (ambient) {
        mockProcessEnv({
          AZURE_CLIENT_ID: 'host-client',
          AZURE_TENANT_ID: 'host-tenant',
          AZURE_CLIENT_SECRET: 'host-secret',
        });
      }
      const actual = await createAzureCredential({}, selected);
      const actualDevelopers = stubDeveloperTail(actual);
      expect(await outcome(actual)).toEqual(expected);
      expect(actualDevelopers).toEqual(nativeDevelopers);
      if (selector === undefined) {
        expect(expected).toEqual({ token });
      } else {
        expect(expected).toHaveProperty('errorName');
      }
      expect(environment).not.toHaveBeenCalled();
    },
  );

  it.each(modes)(
    'does not turn a %s token-acquisition failure into developer fallback',
    async (mode) => {
      const credentialClass =
        mode === 'secret'
          ? identity.ClientSecretCredential
          : mode === 'certificate'
            ? identity.ClientCertificateCredential
            : identity.UsernamePasswordCredential;
      vi.spyOn(credentialClass.prototype, 'getToken').mockRejectedValue(
        new identity.AuthenticationError(400, { error: 'Fixture authentication failed.' }),
      );
      const developer = vi
        .spyOn(identity.AzureCliCredential.prototype, 'getToken')
        .mockResolvedValue(token);
      const credential = await createAzureCredential({}, selectedEnvironment(mode, 'valid-tenant'));
      await expect(credential.getToken(scope)).rejects.toBeInstanceOf(identity.AuthenticationError);
      expect(developer).not.toHaveBeenCalled();
    },
  );

  it('retains SDK tail objects without mutating the native chain', async () => {
    const native = new identity.DefaultAzureCredential();
    const original = [...sources(native)];
    const actual = await createAzureEnvironmentFallback(identity, native, undefined);
    expect(sources(actual).slice(1)).toEqual(original.slice(1));
    expect(await sources(actual)[0].getToken(scope)).toBeNull();
    expect(sources(native)).toEqual(original);
    sdkMetadata.version = '5.0.0';
    await expect(createAzureEnvironmentFallback(identity, native, undefined)).rejects.toThrow(
      'cannot safely isolate',
    );
  });
});
