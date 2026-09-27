import { createRequire } from 'node:module';

import { CONSENT_ENDPOINT, EVENTS_ENDPOINT, R_ENDPOINT, VERSION } from './constants';
import { POSTHOG_KEY } from './constants/build';
import {
  getEnvBool,
  getEnvOverrides,
  getEnvString,
  isCI,
  isHostTesting,
  parseEnvBool,
} from './envars';
import { getUserAuthInfo, getUserId } from './globalConfig/accounts';
import logger from './logger';
import { fetchWithProxy, fetchWithTimeout } from './util/fetch/index';
import type { PostHog } from 'posthog-node';

import type { EventProperties, TelemetryEventTypes } from './telemetryEvents';

export { TELEMETRY_EVENTS, TelemetryEventSchema } from './telemetryEvents';

export type { EventProperties, TelemetryEventTypes } from './telemetryEvents';

const require = createRequire(import.meta.url);

interface ClientRecord {
  client: PostHog;
  users: number;
  shutdown?: Promise<void>;
}

interface ClientRegistry {
  clients: Set<ClientRecord>;
  exiting: boolean;
}

// Share within this module so fetch uses its environment helpers.
let sharedClient: ClientRecord | null = null;
// Drain clients from every loaded module without retaining Telemetry instances.
const CLIENTS_KEY = Symbol.for('promptfoo.telemetry.clients');
const clientRegistry = ((process as unknown as Record<symbol, ClientRegistry>)[CLIENTS_KEY] ??= {
  clients: new Set<ClientRecord>(),
  exiting: false,
});

function shutdownClient(record: ClientRecord): Promise<void> {
  if (!record.shutdown) {
    if (sharedClient === record) {
      sharedClient = null;
    }
    record.shutdown = Promise.resolve()
      .then(() => record.client.shutdown())
      .catch((error) => {
        logger.debug(`PostHog shutdown error: ${error}`);
      })
      .finally(() => clientRegistry.clients.delete(record));
  }
  return record.shutdown;
}

// An invocation or suite cannot turn off the host's test-mode restriction.
function isTestMode(): boolean {
  return (
    isHostTesting || parseEnvBool(getEnvOverrides('file')?.IS_TESTING) || getEnvBool('IS_TESTING')
  );
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
  private clientRecord: ClientRecord | null = null;
  private shutdownPromise: Promise<void> = Promise.resolve();

  private telemetryDisabledRecorded = false;
  private id: string | null = null;

  constructor(initializeImmediately: boolean = true) {
    if (initializeImmediately) {
      this.initialize();
    }
  }

  initialize(): void {
    if (this.id !== null) {
      return;
    }
    this.id = getUserId();
    void this.identify();
  }

  private getPostHogClient(): PostHog | null {
    if (clientRegistry.exiting || getEnvBool('PROMPTFOO_DISABLE_TELEMETRY') || isTestMode()) {
      return null;
    }

    if (!this.clientRecord && POSTHOG_KEY) {
      if (!sharedClient || sharedClient.shutdown) {
        try {
          // Keep capture synchronous without loading the SDK when telemetry is disabled.
          const { PostHog } = require('posthog-node') as typeof import('posthog-node');
          sharedClient = {
            client: new PostHog(POSTHOG_KEY, {
              host: EVENTS_ENDPOINT,
              fetch: fetchWithProxy,
              // Explicit flushes send events without a timer keeping the process alive.
              // See: https://github.com/promptfoo/promptfoo/issues/5893
              flushInterval: 0,
            }),
            users: 0,
          };
          clientRegistry.clients.add(sharedClient);
        } catch {
          return null;
        }
      }
      this.clientRecord = sharedClient;
      this.clientRecord.users++;
    }
    return this.clientRecord?.client ?? null;
  }

  private getId(): string {
    this.id ??= getUserId();
    return this.id;
  }

  private getPersonProperties(ciFlag: boolean) {
    const personProperties = {
      ...getUserAuthInfo(),
      isRunningInCi: ciFlag,
    };
    return personProperties;
  }

  async identify() {
    const client = this.getPostHogClient();
    if (client) {
      try {
        const personProperties = this.getPersonProperties(isCI());
        client.identify({
          distinctId: this.getId(),
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
    if (!this.telemetryDisabledRecorded && !isTestMode()) {
      this.sendEvent('feature_used', { feature: 'telemetry disabled' });
      this.telemetryDisabledRecorded = true;
    }
  }

  record(eventName: TelemetryEventTypes, properties: EventProperties): void {
    this.initialize();
    if (this.disabled) {
      this.recordTelemetryDisabled();
    } else {
      this.sendEvent(eventName, properties);
    }
  }

  private sendEvent(eventName: TelemetryEventTypes, properties: EventProperties): void {
    if (clientRegistry.exiting || isTestMode()) {
      return;
    }

    const ciFlag = isCI();
    const personProperties = this.getPersonProperties(ciFlag);
    const propertiesWithMetadata = {
      ...properties,
      packageVersion: VERSION,
      isRunningInCi: ciFlag,
      ...getRuntimeMetadata(),
    };

    const client = this.getPostHogClient();
    if (client) {
      try {
        client.capture({
          distinctId: this.getId(),
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
          user_id: this.getId(),
          ...propertiesWithMetadata,
        },
      }),
    }).catch(() => {
      // pass
    });
  }

  shutdown(): Promise<void> {
    const record = this.clientRecord;
    if (record) {
      this.clientRecord = null;
      record.users--;
      const pending =
        record.users === 0 || clientRegistry.exiting
          ? shutdownClient(record)
          : Promise.resolve()
              .then(() => record.client.flush())
              .catch((error) => {
                logger.debug(`PostHog flush error: ${error}`);
              });
      this.shutdownPromise = Promise.all([this.shutdownPromise, pending]).then(() => {});
    }
    return this.shutdownPromise;
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

// The CLI initializes this singleton after early --env-file handling so identity and all other
// process-global state use the same config directory. Direct Telemetry instances retain eager
// initialization for backward compatibility.
const telemetry = new Telemetry(false);

// Use Symbol.for to ensure the same symbol across module reloads (e.g., in tests).
// This prevents MaxListenersExceededWarning when tests use vi.resetModules().
const SHUTDOWN_HANDLER_KEY = Symbol.for('promptfoo.telemetry.shutdownHandler');

// Register cleanup handler only once across all module reloads.
// This is a safety net to ensure PostHog client is properly shut down when the process exits.
// The primary fix is disabling PostHog's internal flush timer (flushInterval: 0) so it
// doesn't keep the event loop alive. See: https://github.com/promptfoo/promptfoo/issues/5893
if (!(process as unknown as Record<symbol, boolean>)[SHUTDOWN_HANDLER_KEY]) {
  (process as unknown as Record<symbol, boolean>)[SHUTDOWN_HANDLER_KEY] = true;
  process.once('beforeExit', async () => {
    clientRegistry.exiting = true;
    await Promise.allSettled([...clientRegistry.clients].map(shutdownClient));
  });
}

export default telemetry;
