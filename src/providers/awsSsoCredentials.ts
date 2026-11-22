import { createRequire } from 'node:module';

import { getScopedAwsEndpointOptions } from './awsEndpointConfig';
import type { FromSSOInit } from '@aws-sdk/credential-provider-sso';
import type { AwsCredentialIdentityProvider } from '@smithy/types';

import type { EnvOverrides } from '../contracts/env';

export function hasScopedSsoSettings(scoped: EnvOverrides): boolean {
  return [
    'AWS_CONFIG_FILE',
    'AWS_SHARED_CREDENTIALS_FILE',
    'AWS_PROFILE',
    'AWS_USE_FIPS_ENDPOINT',
    'AWS_USE_DUALSTACK_ENDPOINT',
    'AWS_IGNORE_CONFIGURED_ENDPOINT_URLS',
    'AWS_ENDPOINT_URL',
    'AWS_ENDPOINT_URL_SSO',
    'AWS_ENDPOINT_URL_SSO_OIDC',
  ].some((name) => scoped[name] !== undefined);
}

/** The SDK shares clientConfig with OIDC; keep its endpoint separate from SSO role requests. */
export function createScopedSsoProvider(
  fromSSO: (options: FromSSOInit) => AwsCredentialIdentityProvider,
  options: FromSSOInit,
  scoped: EnvOverrides,
  ssoProviderPath?: string,
): AwsCredentialIdentityProvider {
  if (!hasScopedSsoSettings(scoped)) {
    return fromSSO(options);
  }
  return async (properties) => {
    const clientConfig = options.clientConfig ?? {};
    const routingOptions = {
      ...options,
      ...clientConfig,
      // A credential profile does not select the nested client's endpoint profile.
      profile: clientConfig.profile ?? (scoped.AWS_PROFILE === '' ? 'default' : scoped.AWS_PROFILE),
    };
    const oidcOptions = await getScopedAwsEndpointOptions('SSO OIDC', routingOptions, scoped);
    let ownedClient: FromSSOInit['ssoClient'];
    try {
      let ssoClient = options.ssoClient;
      if (!ssoClient) {
        const rootRequire = createRequire(import.meta.url);
        const ssoRequire = createRequire(
          ssoProviderPath ?? rootRequire.resolve('@aws-sdk/credential-provider-sso'),
        );
        const { SSOClient } = ssoRequire('@aws-sdk/nested-clients/sso') as {
          SSOClient: new (
            config: NonNullable<FromSSOInit['clientConfig']>,
          ) => NonNullable<FromSSOInit['ssoClient']>;
        };
        const { parseKnownFiles, loadSsoSessionData, getProfileName } = ssoRequire(
          '@smithy/core/config',
        ) as {
          parseKnownFiles: (
            options: FromSSOInit,
          ) => Promise<Record<string, Record<string, string>>>;
          loadSsoSessionData: (
            options: FromSSOInit,
          ) => Promise<Record<string, Record<string, string>>>;
          getProfileName: (options: { profile?: string }) => string;
        };
        if (
          typeof SSOClient !== 'function' ||
          typeof parseKnownFiles !== 'function' ||
          typeof loadSsoSessionData !== 'function' ||
          typeof getProfileName !== 'function'
        ) {
          throw new Error(
            'Reinstall the AWS SDK: its SSO client configuration helpers are unavailable.',
          );
        }
        const profiles = await parseKnownFiles(options);
        const caller = properties?.callerClientConfig as typeof clientConfig | undefined;
        const parent = options.parentClientConfig as typeof clientConfig | undefined;
        const profile = profiles[getProfileName({ profile: options.profile ?? caller?.profile })];
        const session = profile?.sso_session
          ? (await loadSsoSessionData(options))[profile.sso_session]
          : undefined;
        ownedClient = new SSOClient({
          ...clientConfig,
          ...(await getScopedAwsEndpointOptions('SSO', routingOptions, scoped)),
          region: clientConfig.region ?? session?.sso_region ?? profile?.sso_region,
          logger: clientConfig.logger ?? caller?.logger ?? parent?.logger,
          userAgentAppId:
            clientConfig.userAgentAppId ?? caller?.userAgentAppId ?? parent?.userAgentAppId,
        });
        ssoClient = ownedClient;
      }
      return await fromSSO({
        ...options,
        ssoClient,
        clientConfig: { ...clientConfig, ...oidcOptions },
      })(properties);
    } finally {
      ownedClient?.destroy();
    }
  };
}
