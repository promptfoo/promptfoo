import { PostHog } from 'posthog-node';
import { CONSENT_ENDPOINT, EVENTS_ENDPOINT, R_ENDPOINT, VERSION } from './constants';
import { POSTHOG_KEY } from './constants/build';
import { getEnvBool, getEnvString, isCI } from './envars';
import { getUserAuthInfo, getUserId } from './globalConfig/accounts';
import logger from './logger';
import { fetchWithProxy, fetchWithTimeout } from './util/fetch/index';

import type { ProviderStats } from './runStats/types';
import type { EventProperties, TelemetryEventTypes } from './telemetryEvents';

export { TELEMETRY_EVENTS, TelemetryEventSchema } from './telemetryEvents';

export type { EventProperties, TelemetryEventTypes } from './telemetryEvents';

const SENSITIVE_TELEMETRY_IDENTIFIER_PREFIXES = new Set([
  'exec',
  'file',
  'http',
  'https',
  'python',
  'ruby',
  'webhook',
]);

/**
 * Keep telemetry useful for model/provider analysis without transmitting
 * configured paths, endpoints, or URL/query data from custom integrations.
 */
export function sanitizeTelemetryIdentifier(identifier: string): string {
  const separatorIndex = identifier.indexOf(':');
  if (separatorIndex === -1) {
    return /[\\/?#]/.test(identifier) ? 'custom' : identifier;
  }

  const prefix = identifier.slice(0, separatorIndex).toLowerCase();
  const suffix = identifier.slice(separatorIndex + 1);
  if (
    SENSITIVE_TELEMETRY_IDENTIFIER_PREFIXES.has(prefix) ||
    suffix.includes('://') ||
    /[\\/?#]/.test(suffix)
  ) {
    return `${prefix}:custom`;
  }

  return identifier;
}

/**
 * Provider IDs without a namespace are custom labels, not stable model identifiers.
 */
export function sanitizeTelemetryProviderIdentifier(identifier: string): string {
  return identifier.includes(':') ? sanitizeTelemetryIdentifier(identifier) : 'custom';
}

/**
 * Aggregate after sanitizing so different private endpoints do not create
 * indistinguishable rows in the emitted provider breakdown.
 */
export function sanitizeTelemetryProviderBreakdown(
  providerStats: ProviderStats[],
): ProviderStats[] {
  const aggregated = new Map<
    string,
    Omit<
      ProviderStats,
      'provider' | 'successRate' | 'avgLatencyMs' | 'tokensPerRequest' | 'cacheRate'
    > & {
      totalLatencyMs: number;
    }
  >();

  for (const stats of providerStats) {
    const provider = sanitizeTelemetryProviderIdentifier(stats.provider);
    const aggregate = aggregated.get(provider) ?? {
      requests: 0,
      successes: 0,
      failures: 0,
      totalLatencyMs: 0,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
    };

    aggregate.requests += stats.requests;
    aggregate.successes += stats.successes;
    aggregate.failures += stats.failures;
    aggregate.totalLatencyMs += stats.avgLatencyMs * stats.requests;
    aggregate.totalTokens += stats.totalTokens;
    aggregate.promptTokens += stats.promptTokens;
    aggregate.completionTokens += stats.completionTokens;
    aggregate.cachedTokens += stats.cachedTokens;
    aggregated.set(provider, aggregate);
  }

  return Array.from(aggregated.entries())
    .map(([provider, aggregate]) => ({
      provider,
      requests: aggregate.requests,
      successes: aggregate.successes,
      failures: aggregate.failures,
      successRate: aggregate.requests > 0 ? aggregate.successes / aggregate.requests : 0,
      avgLatencyMs:
        aggregate.requests > 0 ? Math.round(aggregate.totalLatencyMs / aggregate.requests) : 0,
      totalTokens: aggregate.totalTokens,
      promptTokens: aggregate.promptTokens,
      completionTokens: aggregate.completionTokens,
      cachedTokens: aggregate.cachedTokens,
      tokensPerRequest:
        aggregate.requests > 0 ? Math.round(aggregate.totalTokens / aggregate.requests) : 0,
      cacheRate: aggregate.totalTokens > 0 ? aggregate.cachedTokens / aggregate.totalTokens : 0,
    }))
    .sort((a, b) => b.requests - a.requests || a.provider.localeCompare(b.provider));
}

let posthogClient: PostHog | null = null;
let isShuttingDown = false;

function getPostHogClient(): PostHog | null {
  if (getEnvBool('PROMPTFOO_DISABLE_TELEMETRY') || getEnvBool('IS_TESTING')) {
    return null;
  }

  if (posthogClient === null && POSTHOG_KEY) {
    try {
      posthogClient = new PostHog(POSTHOG_KEY, {
        host: EVENTS_ENDPOINT,
        fetch: fetchWithProxy,
        // Disable automatic flush interval to prevent keeping the event loop alive.
        // Without this, PostHog's internal setInterval keeps the Node.js event loop
        // alive indefinitely, causing processes that import promptfoo to hang.
        // Events are still sent immediately via explicit flush() calls after each capture.
        // See: https://github.com/promptfoo/promptfoo/issues/5893
        flushInterval: 0,
      });
    } catch {
      posthogClient = null;
    }
  }
  return posthogClient;
}

const TELEMETRY_TIMEOUT_MS = 1000;

function getRuntimeMetadata() {
  return {
    nodeVersion: process.version,
    nodeMajor: Number.parseInt(process.versions.node, 10),
    platform: process.platform,
    arch: process.arch,
  };
}

export class Telemetry {
  private telemetryDisabledRecorded = false;
  private id: string;

  constructor() {
    this.id = getUserId();
    void this.identify();
  }

  private getPersonProperties(ciFlag: boolean) {
    const personProperties = {
      ...getUserAuthInfo(),
      isRunningInCi: ciFlag,
    };
    return personProperties;
  }

  async identify() {
    if (this.disabled || getEnvBool('IS_TESTING')) {
      return;
    }

    const client = getPostHogClient();
    if (client) {
      try {
        const personProperties = this.getPersonProperties(isCI());
        client.identify({
          distinctId: this.id,
          properties: personProperties,
        });
        client.flush().catch(() => {
          // Silently ignore flush errors
        });
      } catch (error) {
        logger.debug(`PostHog identify error: ${error}`);
      }
    }
  }

  get disabled() {
    return getEnvBool('PROMPTFOO_DISABLE_TELEMETRY');
  }

  private recordTelemetryDisabled() {
    if (!this.telemetryDisabledRecorded) {
      this.sendEvent('feature_used', { feature: 'telemetry disabled' });
      this.telemetryDisabledRecorded = true;
    }
  }

  record(eventName: TelemetryEventTypes, properties: EventProperties): void {
    if (this.disabled) {
      this.recordTelemetryDisabled();
    } else {
      this.sendEvent(eventName, properties);
    }
  }

  private sendEvent(eventName: TelemetryEventTypes, properties: EventProperties): void {
    const ciFlag = isCI();
    const personProperties = this.getPersonProperties(ciFlag);
    const propertiesWithMetadata = {
      ...properties,
      packageVersion: VERSION,
      isRunningInCi: ciFlag,
      ...getRuntimeMetadata(),
    };

    const client = getPostHogClient();
    if (client && !getEnvBool('IS_TESTING')) {
      try {
        client.capture({
          distinctId: this.id,
          event: eventName,
          properties: {
            ...propertiesWithMetadata,
            // Mirror person properties on every event so dashboard filters on person
            // properties (e.g. excluding CI traffic) work even when the user only
            // ever fires real events and never the auto-generated $identify.
            $set: personProperties,
          },
        });
        client.flush().catch(() => {
          // Silently ignore flush errors
        });
      } catch (error) {
        logger.debug(`PostHog capture error: ${error}`);
      }
    }

    fetchWithProxy(R_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event: eventName,
        environment: getEnvString('NODE_ENV', 'development'),
        email: personProperties.email,
        meta: {
          user_id: this.id,
          ...propertiesWithMetadata,
        },
      }),
    }).catch(() => {
      // pass
    });
  }

  async shutdown(): Promise<void> {
    // Guard against multiple shutdown calls (from beforeExit + explicit shutdown in main.ts)
    if (isShuttingDown) {
      return;
    }

    const client = getPostHogClient();
    if (!client) {
      // No client to shut down - don't set the flag so future shutdowns work
      // if telemetry becomes enabled (e.g., in test harnesses)
      return;
    }

    isShuttingDown = true;
    try {
      await client.shutdown();
    } catch (error) {
      logger.debug(`PostHog shutdown error: ${error}`);
    }
  }

  /**
   * This is a separate endpoint to save consent used only for redteam data synthesis for "harmful" plugins.
   */
  async saveConsent(email: string, metadata?: Record<string, string>): Promise<void> {
    try {
      const response = await fetchWithTimeout(
        CONSENT_ENDPOINT,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email, metadata }),
        },
        TELEMETRY_TIMEOUT_MS,
      );

      if (!response.ok) {
        throw new Error(`Failed to save consent: ${response.statusText}`);
      }
    } catch (err) {
      logger.debug(`Failed to save consent: ${(err as Error).message}`);
    }
  }
}

const telemetry = new Telemetry();

// Use Symbol.for to ensure the same symbol across module reloads (e.g., in tests).
// This prevents MaxListenersExceededWarning when tests use vi.resetModules().
const TELEMETRY_INSTANCE_KEY = Symbol.for('promptfoo.telemetry.instance');
const SHUTDOWN_HANDLER_KEY = Symbol.for('promptfoo.telemetry.shutdownHandler');

// Store telemetry instance on process so the beforeExit handler can access the current instance
(process as unknown as Record<symbol, unknown>)[TELEMETRY_INSTANCE_KEY] = telemetry;

// Register cleanup handler only once across all module reloads.
// This is a safety net to ensure PostHog client is properly shut down when the process exits.
// The primary fix is disabling PostHog's internal flush timer (flushInterval: 0) so it
// doesn't keep the event loop alive. See: https://github.com/promptfoo/promptfoo/issues/5893
if (!(process as unknown as Record<symbol, boolean>)[SHUTDOWN_HANDLER_KEY]) {
  (process as unknown as Record<symbol, boolean>)[SHUTDOWN_HANDLER_KEY] = true;
  process.once('beforeExit', () => {
    const instance = (process as unknown as Record<symbol, Telemetry | undefined>)[
      TELEMETRY_INSTANCE_KEY
    ];
    if (instance) {
      instance.shutdown().catch(() => {
        // Silently ignore - logger may be unavailable during shutdown
      });
    }
  });
}

export default telemetry;
