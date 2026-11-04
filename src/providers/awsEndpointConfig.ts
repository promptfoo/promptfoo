import { createRequire } from 'node:module';

type Profile = Record<string, string | undefined>;
interface FileOptions {
  profile?: string;
  endpoint?: unknown;
  useFipsEndpoint?: boolean | (() => Promise<boolean>);
  useDualstackEndpoint?: boolean | (() => Promise<boolean>);
  ignoreConfiguredEndpointUrls?: boolean | (() => Promise<boolean>);
  filepath?: string;
  configFilepath?: string;
  ignoreCache?: boolean;
}
interface ConfigSelector<T> {
  environmentVariableSelector: (env: NodeJS.ProcessEnv) => T | undefined;
  configFileSelector: (profile: Profile, config?: Record<string, Profile>) => T | undefined;
  default: T;
}
interface ConfigSdk {
  loadConfig: <T>(selector: ConfigSelector<T>, options: FileOptions) => () => Promise<T>;
  NODE_USE_FIPS_ENDPOINT_CONFIG_OPTIONS: ConfigSelector<boolean>;
  NODE_USE_DUALSTACK_ENDPOINT_CONFIG_OPTIONS: ConfigSelector<boolean>;
  booleanSelector: (values: Profile, key: string, type: string) => boolean | undefined;
  SelectorType: { ENV: string; CONFIG: string };
  CONFIG_PREFIX_SEPARATOR: string;
}

function loadConfigSdk(): ConfigSdk {
  const rootRequire = createRequire(import.meta.url);
  for (const packageName of [
    '@aws-sdk/client-bedrock-runtime',
    '@aws-sdk/client-sagemaker-runtime',
    '@aws-sdk/client-bedrock-agent-runtime',
    '@aws-sdk/client-s3',
  ]) {
    let entry: string;
    try {
      entry = rootRequire.resolve(packageName);
    } catch {
      continue;
    }
    const sdk = createRequire(entry)('@smithy/core/config') as ConfigSdk;
    if (
      typeof sdk.loadConfig !== 'function' ||
      typeof sdk.booleanSelector !== 'function' ||
      !sdk.NODE_USE_FIPS_ENDPOINT_CONFIG_OPTIONS ||
      !sdk.NODE_USE_DUALSTACK_ENDPOINT_CONFIG_OPTIONS ||
      !sdk.SelectorType ||
      typeof sdk.CONFIG_PREFIX_SEPARATOR !== 'string'
    ) {
      throw new Error(
        `Scoped AWS endpoint settings require the config helpers bundled with ${packageName}. Reinstall that AWS SDK package.`,
      );
    }
    return sdk;
  }
  throw new Error(
    'Scoped AWS endpoint settings require an AWS SDK client. Install the SDK package for the selected provider.',
  );
}

/** Bind SDK endpoint settings to the same invocation files without mutating process.env. */
export async function getScopedAwsEndpointOptions(
  serviceId: string,
  options: FileOptions,
  scoped: Record<string, string | undefined>,
) {
  const serviceSuffix = serviceId
    .split(' ')
    .map((word) => word.toUpperCase())
    .join('_');
  const fields = [
    'AWS_CONFIG_FILE',
    'AWS_SHARED_CREDENTIALS_FILE',
    'AWS_PROFILE',
    'AWS_USE_FIPS_ENDPOINT',
    'AWS_USE_DUALSTACK_ENDPOINT',
    'AWS_IGNORE_CONFIGURED_ENDPOINT_URLS',
    'AWS_ENDPOINT_URL',
    `AWS_ENDPOINT_URL_${serviceSuffix}`,
  ];
  if (!fields.some((name) => scoped[name] !== undefined)) {
    return {};
  }
  const sdk = loadConfigSdk();
  const effective = { ...process.env, ...scoped };
  const load = <T>(selector: ConfigSelector<T>, fileOptions = options) =>
    sdk.loadConfig(
      {
        ...selector,
        environmentVariableSelector: () => selector.environmentVariableSelector(effective),
      },
      fileOptions,
    )();
  // Native FIPS/dualstack honor a constructor profile; endpoint_url discovery
  // independently follows AWS_PROFILE, including when config.profile is set.
  const endpointOptions = { ...options, profile: effective.AWS_PROFILE || 'default' };
  const ignore =
    options.endpoint ||
    ((options.ignoreConfiguredEndpointUrls === undefined
      ? undefined
      : typeof options.ignoreConfiguredEndpointUrls === 'function'
        ? await options.ignoreConfiguredEndpointUrls()
        : options.ignoreConfiguredEndpointUrls) ??
      (await load(
        {
          environmentVariableSelector: (values) =>
            sdk.booleanSelector(
              values,
              'AWS_IGNORE_CONFIGURED_ENDPOINT_URLS',
              sdk.SelectorType.ENV,
            ),
          configFileSelector: (profile) =>
            sdk.booleanSelector(
              profile,
              'ignore_configured_endpoint_urls',
              sdk.SelectorType.CONFIG,
            ),
          default: false,
        },
        endpointOptions,
      )));
  const endpoint = ignore
    ? undefined
    : await load<string | undefined>(
        {
          environmentVariableSelector: (values) =>
            values[`AWS_ENDPOINT_URL_${serviceSuffix}`] || values.AWS_ENDPOINT_URL || undefined,
          configFileSelector: (profile, config) => {
            if (profile.services) {
              const section = config?.[`services${sdk.CONFIG_PREFIX_SEPARATOR}${profile.services}`];
              if (!section) {
                throw new Error(
                  `The services section "${profile.services}" specified in the profile is not present in the shared configuration file.`,
                );
              }
              const serviceEndpoint =
                section[`${serviceSuffix.toLowerCase()}${sdk.CONFIG_PREFIX_SEPARATOR}endpoint_url`];
              if (serviceEndpoint) {
                return serviceEndpoint;
              }
            }
            return profile.endpoint_url || undefined;
          },
          default: undefined,
        },
        endpointOptions,
      );
  return {
    ...(endpoint ? { endpoint } : {}),
    // Prevent the SDK's later endpoint loader from restoring host-file values
    // when the selected file/profile has no configured endpoint.
    ignoreConfiguredEndpointUrls: true,
    useFipsEndpoint:
      options.useFipsEndpoint ?? (await load(sdk.NODE_USE_FIPS_ENDPOINT_CONFIG_OPTIONS)),
    useDualstackEndpoint:
      options.useDualstackEndpoint ?? (await load(sdk.NODE_USE_DUALSTACK_ENDPOINT_CONFIG_OPTIONS)),
  };
}
