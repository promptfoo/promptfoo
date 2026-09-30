import { getEnvString } from '../envars';
import { resolveProviderApiKey } from './credentials';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { hasHeaderOverride } from './openai/index';

import type { ProviderOptions } from '../types/index';
import type { OpenAiCompletionOptions } from './openai/types';

type PortkeyConfig = OpenAiCompletionOptions & {
  portkeyApiKey?: string;
  portkeyVirtualKey?: string;
  portkeyMetadata?: Record<string, any>;
  portkeyConfig?: string;
  portkeyProvider?: string;
  portkeyCustomHost?: string;
  portkeyTraceId?: string;
  portkeyCacheForceRefresh?: boolean;
  portkeyCacheNamespace?: string;
  portkeyForwardHeaders?: string[];
  portkeyApiBaseUrl?: string;
  portkeyAzureResourceName?: string;
  portkeyAzureDeploymentId?: string;
  portkeyAzureApiVersion?: string;
  portkeyVertexProjectId?: string;
  portkeyVertexRegion?: string;
  portkeyAwsSecretAccessKey?: string;
  portkeyAwsRegion?: string;
  portkeyAwsSessionToken?: string;
  portkeyAwsAccessKeyId?: string;
  [key: string]: any;
};

interface PortkeyProviderOptions extends ProviderOptions {
  config?: PortkeyConfig;
}

const PORTKEY_CONFIG_PREFIX = 'portkey';

/** Sets the gateway URL promptfoo calls, so it is not forwarded as a header. */
const PORTKEY_API_BASE_URL_KEY = 'portkeyApiBaseUrl';

export function toKebabCase(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function toHeaderValue(value: unknown): string {
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/**
 * Builds the request headers from `portkey*` config keys, applying `config.headers` last.
 *
 * Only `portkey`-prefixed keys are mapped. Everything else in the provider config is either a
 * request body parameter (`max_tokens`) or promptfoo bookkeeping (`basePath`); forwarding
 * those leaked local state to the gateway and could produce invalid header values.
 *
 * `portkeyApiKey` is passed in rather than read from config so an environment-supplied
 * credential never has to be written into the config that eval results persist.
 */
export function getPortkeyHeaders(
  config: Record<string, any> = {},
  portkeyApiKey?: string,
): Record<string, string> {
  const customHeaders: Record<string, unknown> =
    typeof config.headers === 'object' && config.headers !== null ? config.headers : {};
  const headers: Record<string, string> = {};

  // Header names are case-insensitive, so never emit a name the caller already set. A
  // differently-cased duplicate would otherwise reach the wire as two combined values.
  const setGenerated = (name: string, value: unknown) => {
    if (value != null && !hasHeaderOverride(customHeaders as Record<string, string>, name)) {
      headers[name] = toHeaderValue(value);
    }
  };

  setGenerated('x-portkey-api-key', portkeyApiKey);
  for (const [key, value] of Object.entries(config)) {
    if (key.startsWith(PORTKEY_CONFIG_PREFIX) && key !== PORTKEY_API_BASE_URL_KEY) {
      setGenerated(`x-portkey-${toKebabCase(key.slice(PORTKEY_CONFIG_PREFIX.length))}`, value);
    }
  }

  // Values come from user YAML, so coerce them rather than trusting the declared type.
  for (const [key, value] of Object.entries(customHeaders)) {
    if (value != null) {
      headers[key] = toHeaderValue(value);
    }
  }

  return headers;
}

/**
 * Rewrites any `Authorization` entry to its canonical casing.
 *
 * The inherited request builder adds `Authorization` before spreading these headers, and it
 * only guards the originator and organization headers case-insensitively. A caller-supplied
 * `authorization` would therefore survive as a second entry that fetch joins into one value;
 * emitting the canonical name lets it replace the generated bearer instead.
 */
function canonicalizeAuthorization(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key.toLowerCase() === 'authorization' ? 'Authorization' : key,
      value,
    ]),
  );
}

/**
 * Portkey's own credential. It belongs in `x-portkey-api-key`; the `Authorization` bearer is
 * reserved for an upstream provider credential that Portkey forwards.
 */
function resolvePortkeyApiKey(
  config: PortkeyConfig = {},
  env?: ProviderOptions['env'],
): string | undefined {
  return resolveProviderApiKey({ apiKey: config.portkeyApiKey }, env, ['PORTKEY_API_KEY']);
}

export class PortkeyChatCompletionProvider extends OpenAiChatCompletionProvider {
  declare config: PortkeyConfig;

  constructor(modelName: string, providerOptions: PortkeyProviderOptions) {
    const config = providerOptions.config ?? {};
    const portkeyApiKey = resolvePortkeyApiKey(config, providerOptions.env);
    super(modelName, {
      ...providerOptions,
      config: {
        ...config,
        // Not used to resolve the bearer, but it names the provider's primary credential for
        // the missing-key diagnostics in src/util/provider.ts.
        apiKeyEnvar: 'PORTKEY_API_KEY',
        // Portkey authenticates with x-portkey-api-key, so a bearer is only required when
        // forwarding an upstream provider credential. The credential can also arrive as an
        // explicit header rather than through config or the environment.
        apiKeyRequired:
          config.apiKeyRequired ??
          !(portkeyApiKey || hasHeaderOverride(config.headers, 'x-portkey-api-key')),
        apiBaseUrl:
          getEnvString('PORTKEY_API_BASE_URL') ||
          config.portkeyApiBaseUrl ||
          'https://api.portkey.ai/v1',
        headers: getPortkeyHeaders(config, portkeyApiKey),
      },
    });
  }

  /**
   * Re-derives the `x-portkey-*` headers for each request.
   *
   * The inherited chat provider merges `context.prompt.config` over the provider config
   * shallowly, so a per-prompt `headers` block replaces this object wholesale. Rebuilding
   * here preserves provider headers when a prompt adds an unrelated header.
   */
  override getOpenAiRequestHeaders(
    customHeaders: Record<string, string> | undefined = this.config.headers,
  ): Record<string, string> {
    const providerHeaders = getPortkeyHeaders(
      this.config,
      resolvePortkeyApiKey(this.config, this.env),
    );
    const headers = {
      ...Object.fromEntries(
        Object.entries(providerHeaders).filter(([name]) => !hasHeaderOverride(customHeaders, name)),
      ),
      ...getPortkeyHeaders({ headers: customHeaders }),
    };
    const providerRoute = new Headers(providerHeaders);
    const requestRoute = new Headers(headers);
    // Chat resolves its bearer before applying prompt headers. Compare the route itself:
    // different upstreams can resolve to the same explicit key or to no key.
    const routeChanged =
      providerRoute.get('x-portkey-provider')?.toLowerCase() !==
        requestRoute.get('x-portkey-provider')?.toLowerCase() ||
      providerRoute.get('x-portkey-virtual-key') !== requestRoute.get('x-portkey-virtual-key');
    if (!hasHeaderOverride(headers, 'Authorization') && routeChanged) {
      throw new Error(
        'Portkey prompt headers change upstream credential routing. Configure the route on the provider or set Authorization explicitly.',
      );
    }
    return canonicalizeAuthorization(super.getOpenAiRequestHeaders(headers));
  }

  /** Resolve the upstream bearer from the effective Portkey route, including header overrides. */
  getApiKey(config: PortkeyConfig = this.config): string | undefined {
    const headers = new Headers(getPortkeyHeaders(config));
    const upstream = headers.get('x-portkey-provider')?.toLowerCase();
    if (
      !upstream ||
      upstream.startsWith('@') ||
      this.modelName.startsWith('@') ||
      headers.get('x-portkey-virtual-key')
    ) {
      return undefined;
    }
    // apiKeyEnvar names the gateway credential for diagnostics, never the upstream bearer.
    return resolveProviderApiKey(
      { apiKey: config.apiKey },
      this.env,
      upstream === 'openai' ? ['OPENAI_API_KEY'] : [],
    );
  }

  protected override getMissingApiKeyErrorMessage(): string {
    return 'Portkey API key is not set. Set the PORTKEY_API_KEY environment variable or add `portkeyApiKey` to the provider config.';
  }
}
