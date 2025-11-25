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
  packageVersion: z.string().optional().default(VERSION),
  properties: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])),
});
type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;
export type TelemetryEventTypes = TelemetryEvent['event'];
export type EventProperties = TelemetryEvent['properties'];

let posthogClient: PostHog | null = null;

function getPostHogClient(): PostHog | null {
  if (getEnvBool('PROMPTFOO_DISABLE_TELEMETRY') || getEnvBool('IS_TESTING')) {
    return null;
  }

  if (posthogClient === null && POSTHOG_KEY) {
    try {
      posthogClient = new PostHog(POSTHOG_KEY, {
        host: EVENTS_ENDPOINT,
        fetch: fetchWithProxy,
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
    this.identify().then(() => {
      // pass
    });
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
    const client = getPostHogClient();
    if (client) {
      try {
        await client.shutdown();
      } catch (error) {
        logger.debug(`PostHog shutdown error: ${error}`);
      }
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
export default telemetry;
