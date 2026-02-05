import { PostHog } from 'posthog-node';
import { z } from 'zod';
import { CONSENT_ENDPOINT, EVENTS_ENDPOINT, R_ENDPOINT, VERSION } from './constants';
import { POSTHOG_KEY } from './constants/build';
import { getEnvBool, getEnvString, isCI } from './envars';
import { getAuthMethod, getUserEmail, getUserId, isLoggedIntoCloud } from './globalConfig/accounts';
import logger from './logger';
import { fetchWithProxy, fetchWithTimeout } from './util/fetch/index';

export const TelemetryEventSchema = z.object({
  event: z.enum([
    'assertion_used',
    'command_used',
    'eval_ran',
    'feature_used',
    'funnel',
    'redteam discover',
    'redteam generate',
    'redteam init',
    'redteam poison',
    'redteam report',
    'redteam run',
    'redteam setup',
    'webui_action',
    'webui_api',
    'webui_page_view',
  ]),
  packageVersion: z.string().optional().prefault(VERSION),
  properties: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  ),
});
type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;
export type TelemetryEventTypes = TelemetryEvent['event'];
export type EventProperties = TelemetryEvent['properties'];

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

export class Telemetry {
  private telemetryDisabledRecorded = false;
  private id: string;
  private email: string | null;

  constructor() {
    this.id = getUserId();
    this.email = getUserEmail();
    void this.identify();
  }

  async identify() {
    if (this.disabled || getEnvBool('IS_TESTING')) {
      return;
    }

    const client = getPostHogClient();
    if (client) {
      try {
        client.identify({
          distinctId: this.id,
          properties: {
            email: this.email,
            isLoggedIntoCloud: isLoggedIntoCloud(),
            authMethod: getAuthMethod(),
            isRunningInCi: isCI(),
          },
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
    const propertiesWithMetadata = {
      ...properties,
      packageVersion: VERSION,
      isRunningInCi: isCI(),
    };

    const client = getPostHogClient();
    if (client && !getEnvBool('IS_TESTING')) {
      try {
        client.capture({
          distinctId: this.id,
          event: eventName,
          properties: propertiesWithMetadata,
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
        email: this.email,
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
