import { getEnvOverrides, getEnvString } from '../envars';
import type { TokenCredential } from '@azure/identity';

import type { EnvOverrides } from '../contracts/env';

interface AzureCredentialConfig {
  azureClientId?: string;
  azureClientSecret?: string;
  azureTenantId?: string;
  azureAuthorityHost?: string;
}

/** Bind scoped service principals without changing the ambient Azure credential chain. */
export async function createAzureCredential(
  config: AzureCredentialConfig = {},
  env?: EnvOverrides,
): Promise<TokenCredential> {
  const identity = await import('@azure/identity');
  const sources = [
    {
      clientId: config.azureClientId,
      clientSecret: config.azureClientSecret,
      tenantId: config.azureTenantId,
    },
    ...[env, getEnvOverrides(), getEnvOverrides('file')].map((layer) => ({
      clientId: layer?.AZURE_CLIENT_ID,
      clientSecret: layer?.AZURE_CLIENT_SECRET,
      tenantId: layer?.AZURE_TENANT_ID,
    })),
  ];
  const authorityHost =
    config.azureAuthorityHost || env?.AZURE_AUTHORITY_HOST || getEnvString('AZURE_AUTHORITY_HOST');
  const source = sources.find(({ clientId, clientSecret, tenantId }) =>
    [clientId, clientSecret, tenantId].some((value) => value !== undefined),
  );
  if (source) {
    const { clientId, clientSecret, tenantId } = source;
    if (!clientId || !clientSecret || !tenantId) {
      throw new Error(
        'Scoped Azure service principal credentials are incomplete. Set AZURE_CLIENT_ID, AZURE_CLIENT_SECRET and AZURE_TENANT_ID together in the same configuration scope.',
      );
    }
    return new identity.ClientSecretCredential(tenantId, clientId, clientSecret, { authorityHost });
  }
  return authorityHost
    ? new identity.DefaultAzureCredential({ authorityHost })
    : new identity.DefaultAzureCredential();
}
