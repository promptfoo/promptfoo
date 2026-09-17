import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';

import type { ProviderOptions } from '../../types';

type AuthMethod = 'default' | 'profile' | 'keys' | 'bearer' | 'custom';
type Config = NonNullable<ProviderOptions['config']>;

function getAuthMethod(config: Config, isHttpApi: boolean): AuthMethod {
  const configured = (value: unknown) =>
    typeof value === 'string' && value.trim() && !value.includes('{{');
  if (configured(config.apiKey)) {
    return 'bearer';
  }
  if (isHttpApi && config.apiKeyRequired === false) {
    return 'custom';
  }
  if ([config.accessKeyId, config.secretAccessKey, config.sessionToken].some(configured)) {
    return 'keys';
  }
  if (configured(config.profile)) {
    return 'profile';
  }
  // Empty fields preserve a newly selected method while the user fills it in.
  if (config.apiKey !== undefined) {
    return 'bearer';
  }
  if (
    [config.accessKeyId, config.secretAccessKey, config.sessionToken].some((v) => v !== undefined)
  ) {
    return 'keys';
  }
  return config.profile === undefined ? 'default' : 'profile';
}

export default function BedrockAuthentication({
  config,
  isHttpApi,
  updateCustomTarget,
}: {
  config: Config;
  isHttpApi: boolean;
  updateCustomTarget: (field: string, value: unknown) => void;
}) {
  const method = getAuthMethod(config, isHttpApi);
  const changeMethod = (next: AuthMethod) => {
    const {
      apiKey: _apiKey,
      accessKeyId: _accessKeyId,
      secretAccessKey: _secretAccessKey,
      sessionToken: _sessionToken,
      profile: _profile,
      apiKeyRequired: _apiKeyRequired,
      ...rest
    } = config;
    updateCustomTarget('config', {
      ...rest,
      ...(next === 'bearer' ? { apiKey: '' } : {}),
      ...(next === 'profile' ? { profile: '' } : {}),
      ...(next === 'keys' ? { accessKeyId: '', secretAccessKey: '' } : {}),
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="bedrock-auth-method">Authentication</Label>
        <select
          id="bedrock-auth-method"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
          value={method}
          onChange={(e) => changeMethod(e.target.value as AuthMethod)}
          aria-describedby="bedrock-auth-help"
        >
          <option value="default">Default (environment / AWS credential chain)</option>
          <option value="profile">Named AWS profile</option>
          <option value="keys">AWS access keys</option>
          <option value="bearer">Bedrock bearer token</option>
          {method === 'custom' && (
            <option value="custom">Custom endpoint authentication (YAML)</option>
          )}
        </select>
        <p id="bedrock-auth-help" className="text-sm text-muted-foreground">
          Changing the authentication method removes the other credential fields from this target.
          {method === 'default' && (
            <>
              {' '}
              Uses <code>AWS_BEARER_TOKEN_BEDROCK</code> when set; otherwise uses AWS credentials
              from the environment or default credential chain on the server.
            </>
          )}
          {method === 'custom' &&
            ' Automatic authentication is disabled by apiKeyRequired: false. Any explicit authentication headers are still sent.'}
        </p>
      </div>

      {method === 'profile' && (
        <div className="space-y-2">
          <Label htmlFor="bedrock-profile">AWS Profile</Label>
          <Input
            id="bedrock-profile"
            value={config.profile ?? ''}
            onChange={(e) => updateCustomTarget('profile', e.target.value)}
            placeholder="default"
          />
          <p className="text-sm text-muted-foreground">
            {isHttpApi
              ? 'AWS credential profile on the server used to generate refreshable Bedrock tokens. Overrides environment bearer tokens.'
              : 'SSO profile from ~/.aws/config on the server. Unset AWS_BEARER_TOKEN_BEDROCK to use this profile with native Bedrock APIs.'}
          </p>
          {!config.profile?.trim() && (
            <p role="alert" className="text-sm text-destructive">
              Enter an AWS profile name.
            </p>
          )}
        </div>
      )}

      {method === 'keys' && (
        <>
          {(
            [
              ['accessKeyId', 'AWS Access Key ID', 'text'],
              ['secretAccessKey', 'AWS Secret Access Key', 'password'],
              ['sessionToken', 'AWS Session Token (optional)', 'password'],
            ] as const
          ).map(([field, label, type]) => (
            <div key={field} className="space-y-2">
              <Label htmlFor={`bedrock-${field}`}>{label}</Label>
              <Input
                id={`bedrock-${field}`}
                type={type}
                autoComplete="off"
                value={config[field] ?? ''}
                onChange={(e) => updateCustomTarget(field, e.target.value)}
              />
            </div>
          ))}
          {(!config.accessKeyId?.trim() || !config.secretAccessKey?.trim()) && (
            <p role="alert" className="text-sm text-destructive">
              Enter both an AWS access key ID and secret access key.
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Include a session token for temporary AWS credentials. Copied credentials must be
            replaced when they expire; prefer a profile or role for automatic renewal.
            {!isHttpApi &&
              ' Unset AWS_BEARER_TOKEN_BEDROCK when using access keys with native Bedrock APIs.'}
          </p>
        </>
      )}

      {method === 'bearer' && (
        <div className="space-y-2">
          <Label htmlFor="bedrock-bearer-token">Bedrock Bearer Token</Label>
          <Input
            id="bedrock-bearer-token"
            type="password"
            autoComplete="off"
            value={config.apiKey ?? ''}
            onChange={(e) => updateCustomTarget('apiKey', e.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            Supplied tokens are used as-is and are not automatically refreshed. Leave blank to use
            environment authentication defaults.
          </p>
        </div>
      )}

      {(method === 'keys' || method === 'bearer') && (
        <p className="text-sm text-muted-foreground">
          Credentials entered here are saved in the target configuration. Use environment
          credentials or a profile to avoid saving secrets in your config.
        </p>
      )}
      {isHttpApi &&
        Object.keys(config.headers ?? {}).some((key) =>
          /^(authorization|x-api-key)$/i.test(key),
        ) && (
          <p className="text-sm text-muted-foreground">
            This target also has explicit authentication headers, which override request headers
            generated here. Edit those headers in YAML to change them.
          </p>
        )}
    </div>
  );
}
