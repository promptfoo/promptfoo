import * as identity from '@azure/identity';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { AzureFoundryAgentProvider } from '../../src/providers/azure/foundry-agent';
import { createAzureCredential } from '../../src/util/azureCredentials';
import { mockProcessEnv } from './utils';

const host = {
  AZURE_CLIENT_ID: 'fixture-client',
  AZURE_TENANT_ID: 'fixture-tenant',
  AZURE_USERNAME: 'fixture@example.invalid',
  AZURE_PASSWORD: 'fixture-password',
  AZURE_FEDERATED_TOKEN_FILE: '/fixture/workload-token',
};
let restore: () => void;
beforeEach(() => {
  restore = mockProcessEnv(host, { clear: true });
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network access.'));
});
afterEach(() => {
  vi.restoreAllMocks();
  restore();
});

describe('Azure environment username precedence', () => {
  it.each([undefined, 'prod', 'EnvironmentCredential'])(
    'retains the native username identity before workload for %s',
    async (selector) => {
      mockProcessEnv({ AZURE_TOKEN_CREDENTIALS: selector });
      vi.spyOn(identity.UsernamePasswordCredential.prototype, 'getToken').mockImplementation(
        async function (this: identity.UsernamePasswordCredential, _scopes, options) {
          return {
            token: JSON.stringify({
              username: Reflect.get(this, 'username'),
              tenant: Reflect.get(this, 'tenantId'),
              claims: options?.claims,
            }),
            expiresOnTimestamp: 9_999_999_999_999,
          };
        },
      );
      const workload = vi
        .spyOn(identity.WorkloadIdentityCredential.prototype, 'getToken')
        .mockRejectedValue(new Error('Workload must not supersede environment credentials.'));
      for (const selected of [
        { AZURE_CLIENT_SEND_CERTIFICATE_CHAIN: '' },
        { AZURE_TENANT_ID: 'selected-tenant' },
        { AZURE_USERNAME: 'selected@example.invalid' },
        { AZURE_PASSWORD: 'selected-password' },
      ]) {
        const restoreSelected = mockProcessEnv(selected);
        const expected = await new identity.DefaultAzureCredential().getToken('fixture-scope', {
          claims: 'fixture-claims',
        });
        restoreSelected();
        const credential = await createAzureCredential({}, selected);
        expect(await credential.getToken('fixture-scope', { claims: 'fixture-claims' })).toEqual(
          expected,
        );
      }
      expect(workload).not.toHaveBeenCalled();
      expect(process.env.AZURE_USERNAME).toBe(host.AZURE_USERNAME);
    },
  );
  it.each(['unavailable', 'required', 'fatal'])(
    'retains fatal EnvironmentCredential wrapping for username %s errors',
    async (kind) => {
      const error =
        kind === 'unavailable'
          ? new identity.CredentialUnavailableError('Fixture unavailable.')
          : kind === 'required'
            ? new identity.AuthenticationRequiredError({
                scopes: ['fixture-scope'],
                message: 'Fixture authentication required.',
              })
            : new Error('Fixture failure.');
      vi.spyOn(identity.UsernamePasswordCredential.prototype, 'getToken').mockRejectedValue(error);
      const workload = vi
        .spyOn(identity.WorkloadIdentityCredential.prototype, 'getToken')
        .mockRejectedValue(new Error('Unexpected workload fallback.'));
      const actual = await createAzureCredential({}, { AZURE_CLIENT_SEND_CERTIFICATE_CHAIN: '' });
      await expect(
        new identity.DefaultAzureCredential().getToken('fixture-scope'),
      ).rejects.toMatchObject({ name: 'AuthenticationError' });
      await expect(actual.getToken('fixture-scope')).rejects.toMatchObject({
        name: 'AuthenticationError',
      });
      expect(workload).not.toHaveBeenCalled();
    },
  );
  it.each(['WorkloadIdentityCredential', 'ManagedIdentityCredential', 'dev'])(
    'honors %s excluding environment username credentials',
    async (selector) => {
      mockProcessEnv({ AZURE_TOKEN_CREDENTIALS: selector });
      const username = vi
        .spyOn(identity.UsernamePasswordCredential.prototype, 'getToken')
        .mockRejectedValue(new Error('Unexpected username credential.'));
      vi.spyOn(identity.WorkloadIdentityCredential.prototype, 'getToken').mockResolvedValue({
        token: 'workload-fixture',
        expiresOnTimestamp: 9_999_999_999_999,
      });
      const credential = await createAzureCredential(
        {},
        { AZURE_CLIENT_SEND_CERTIFICATE_CHAIN: '' },
      );
      if (selector === 'dev') {
        expect(credential).toBeInstanceOf(identity.DefaultAzureCredential);
        expect(
          Reflect.get(credential, '_sources').every(
            (source: object) => !(source instanceof identity.EnvironmentCredential),
          ),
        ).toBe(true);
      } else {
        expect(await credential.getToken('fixture-scope')).toMatchObject({
          token: 'workload-fixture',
        });
      }
      expect(username).not.toHaveBeenCalled();
    },
  );
  it('retains higher-priority secret and certificate modes', async () => {
    expect(
      await createAzureCredential({}, { AZURE_CLIENT_SECRET: 'fixture-secret' }),
    ).toBeInstanceOf(identity.ClientSecretCredential);
    expect(
      await createAzureCredential({}, { AZURE_CLIENT_CERTIFICATE_PATH: '/fixture/certificate' }),
    ).toBeInstanceOf(identity.ClientCertificateCredential);
    expect(await createAzureCredential()).toBeInstanceOf(identity.DefaultAzureCredential);
  });
  it('partitions scoped username identities without using passwords in persistent keys', async () => {
    const namespace = async (username: string, password = 'first-password') =>
      cliState.withEnv({ AZURE_USERNAME: username, AZURE_PASSWORD: password }, () => {
        const provider = new AzureFoundryAgentProvider('fixture', {
          config: { projectUrl: 'https://fixture.services.ai.azure.com/api/projects/project' },
        });
        return Reflect.get(provider, 'getResponseCacheNamespace').call(provider) as string;
      });
    const first = await namespace('first@example.invalid');
    expect(await namespace('first@example.invalid')).toBe(first);
    expect(await namespace('first@example.invalid', 'rotated-password')).toBe(first);
    expect(await namespace('second@example.invalid')).not.toBe(first);
    expect(first).not.toContain('first@example.invalid');
    expect(first).not.toContain('first-password');
    const ambient = new AzureFoundryAgentProvider('fixture', {
      config: { projectUrl: 'https://fixture.services.ai.azure.com/api/projects/project' },
    });
    expect(Reflect.get(ambient, 'getResponseCacheNamespace').call(ambient)).toBeUndefined();
  });
});
