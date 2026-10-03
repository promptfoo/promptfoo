import { getEnvOverrides, getEnvString } from '../envars';
import type { TokenCredential } from '@azure/identity';

import type { EnvOverrides } from '../types/env';

interface AzureCredentialConfig {
  azureClientId?: string;
  azureClientSecret?: string;
  azureTenantId?: string;
  azureAuthorityHost?: string;
}

/** Forward scoped Azure auth inputs while retaining ambient developer and managed identity discovery. */
export async function createAzureCredential(
  config: AzureCredentialConfig = {},
  env?: EnvOverrides,
): Promise<TokenCredential> {
  const identity = await import('@azure/identity');
  const scoped = Object.assign({}, getEnvOverrides('file'), getEnvOverrides(), env);
  const names = [
    'AZURE_CLIENT_ID',
    'AZURE_CLIENT_SECRET',
    'AZURE_TENANT_ID',
    'AZURE_CLIENT_CERTIFICATE_PATH',
    'AZURE_CLIENT_CERTIFICATE_PASSWORD',
    'AZURE_CLIENT_SEND_CERTIFICATE_CHAIN',
    'AZURE_FEDERATED_TOKEN_FILE',
  ];
  const selectedAuthorityHost =
    config.azureAuthorityHost ?? env?.AZURE_AUTHORITY_HOST ?? getEnvString('AZURE_AUTHORITY_HOST');
  const authorityHost =
    selectedAuthorityHost === ''
      ? identity.AzureAuthorityHosts.AzurePublicCloud
      : selectedAuthorityHost;
  const hasScopedIdentity =
    names.some((key) => scoped[key] !== undefined) ||
    [config.azureClientId, config.azureClientSecret, config.azureTenantId].some(
      (value) => value !== undefined,
    );
  if (!hasScopedIdentity) {
    return authorityHost
      ? new identity.DefaultAzureCredential({ authorityHost })
      : new identity.DefaultAzureCredential();
  }
  const value = (key: string) => scoped[key] ?? getEnvString(key);
  const clientId = config.azureClientId ?? value('AZURE_CLIENT_ID');
  const clientSecret = config.azureClientSecret ?? value('AZURE_CLIENT_SECRET');
  const tenantId = config.azureTenantId ?? value('AZURE_TENANT_ID');
  const rejectHostMasks = (values: Record<string, string | undefined>) => {
    const masked = Object.entries(values).find(
      ([name, selected]) => selected === '' && process.env[name],
    );
    if (masked) {
      throw new Error(
        `Scoped ${masked[0]} is empty, but the Azure SDK would restore its host value. Supply an explicit scoped identity or remove the host value before evaluating.`,
      );
    }
  };
  if (clientSecret) {
    if (!clientId?.trim() || !clientSecret.trim() || !tenantId?.trim()) {
      throw new Error(
        'Scoped Azure service principal credentials are incomplete. Set AZURE_CLIENT_ID, AZURE_CLIENT_SECRET and AZURE_TENANT_ID together in the effective environment.',
      );
    }
    return new identity.ClientSecretCredential(tenantId, clientId, clientSecret, { authorityHost });
  }
  const certificatePath = value('AZURE_CLIENT_CERTIFICATE_PATH');
  if (certificatePath && clientId && tenantId) {
    return new identity.ClientCertificateCredential(
      tenantId,
      clientId,
      {
        certificatePath,
        certificatePassword: value('AZURE_CLIENT_CERTIFICATE_PASSWORD'),
      },
      {
        authorityHost,
        sendCertificateChain: ['true', '1'].includes(
          value('AZURE_CLIENT_SEND_CERTIFICATE_CHAIN')?.toLowerCase() ?? '',
        ),
      },
    );
  }
  const tokenFilePath = value('AZURE_FEDERATED_TOKEN_FILE');
  if (tokenFilePath) {
    rejectHostMasks({ AZURE_CLIENT_ID: clientId, AZURE_TENANT_ID: tenantId });
    return new identity.WorkloadIdentityCredential({
      clientId,
      tenantId,
      tokenFilePath,
      authorityHost,
    });
  }
  // The default chain reads these files directly from process.env and cannot
  // represent a cleared scoped selector. Do not silently restore a host identity.
  rejectHostMasks({
    AZURE_CLIENT_ID: clientId,
    AZURE_TENANT_ID: tenantId,
    AZURE_CLIENT_SECRET: clientSecret,
    AZURE_CLIENT_CERTIFICATE_PATH: certificatePath,
    AZURE_FEDERATED_TOKEN_FILE: tokenFilePath,
  });
  // AZURE_CLIENT_ID alone selects a user-assigned managed identity; it is not an
  // incomplete client-secret tuple. Keep the remaining developer credential chain.
  return new identity.DefaultAzureCredential({
    managedIdentityClientId: clientId,
    workloadIdentityClientId: clientId,
    tenantId,
    authorityHost,
  });
}
