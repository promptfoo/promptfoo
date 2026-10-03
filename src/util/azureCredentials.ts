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
  // DefaultAzureCredential owns this process-level selector and its validation.
  // Adapt only credential modes included in the selected chain; the SDK keeps
  // developer/plugin and managed-identity ordering without rebuilding that chain.
  const selector = process.env.AZURE_TOKEN_CREDENTIALS?.trim().toLowerCase();
  const includesEnvironment = !selector || ['prod', 'environmentcredential'].includes(selector);
  const includesWorkload = !selector || ['prod', 'workloadidentitycredential'].includes(selector);
  const includesManaged = !selector || ['prod', 'managedidentitycredential'].includes(selector);
  const defaultCredential = () =>
    new identity.DefaultAzureCredential({
      managedIdentityClientId: clientId,
      workloadIdentityClientId: clientId,
      authorityHost,
    });
  if (!includesEnvironment && !includesWorkload && !includesManaged) {
    // Developer credentials use their own tenant selection; an environment
    // principal's tenant must not become an explicit CLI --tenant option.
    return authorityHost
      ? new identity.DefaultAzureCredential({ authorityHost })
      : new identity.DefaultAzureCredential();
  }
  if (includesEnvironment && clientSecret && clientId && tenantId) {
    if (!clientId?.trim() || !clientSecret.trim() || !tenantId?.trim()) {
      throw new Error(
        'Scoped Azure service principal credentials are incomplete. Set AZURE_CLIENT_ID, AZURE_CLIENT_SECRET and AZURE_TENANT_ID together in the effective environment.',
      );
    }
    return new identity.ClientSecretCredential(tenantId, clientId, clientSecret, { authorityHost });
  }
  const certificatePath = value('AZURE_CLIENT_CERTIFICATE_PATH');
  if (includesEnvironment && certificatePath && clientId && tenantId) {
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
  if (includesWorkload && tokenFilePath && clientId && tenantId) {
    rejectHostMasks({ AZURE_CLIENT_ID: clientId, AZURE_TENANT_ID: tenantId });
    return new identity.WorkloadIdentityCredential({
      clientId,
      tenantId,
      tokenFilePath,
      authorityHost,
    });
  }
  // Reject only masks that could restore a usable ambient mode. Partial host
  // settings cannot select that identity and must retain ordinary SDK fallback.
  const hostEnvironmentAvailable =
    includesEnvironment &&
    process.env.AZURE_CLIENT_ID &&
    process.env.AZURE_TENANT_ID &&
    (process.env.AZURE_CLIENT_SECRET ||
      process.env.AZURE_CLIENT_CERTIFICATE_PATH ||
      (process.env.AZURE_USERNAME && process.env.AZURE_PASSWORD));
  const hostWorkloadAvailable =
    (includesWorkload || includesManaged) &&
    process.env.AZURE_FEDERATED_TOKEN_FILE &&
    process.env.AZURE_TENANT_ID &&
    (clientId || process.env.AZURE_CLIENT_ID);
  rejectHostMasks({
    ...(includesManaged || hostEnvironmentAvailable || hostWorkloadAvailable
      ? { AZURE_CLIENT_ID: clientId }
      : {}),
    ...(hostEnvironmentAvailable || hostWorkloadAvailable ? { AZURE_TENANT_ID: tenantId } : {}),
    ...(hostEnvironmentAvailable
      ? {
          AZURE_CLIENT_SECRET: clientSecret,
          AZURE_CLIENT_CERTIFICATE_PATH: certificatePath,
        }
      : {}),
    ...(hostWorkloadAvailable ? { AZURE_FEDERATED_TOKEN_FILE: tokenFilePath } : {}),
  });
  // Partial identities remain unavailable to their SDK mode and retain fallback.
  // Do not pass tenantId here: it would also constrain CLI/PowerShell/azd tenants.
  // Complete scoped principal/workload identities receive it above.
  return defaultCredential();
}
