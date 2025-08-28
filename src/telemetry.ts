import { randomUUID } from 'crypto';

import { PostHog } from 'posthog-node';
import { z } from 'zod';
import { VERSION } from './constants';
import { getEnvBool, isCI } from './envars';
import { fetchWithTimeout } from './fetch';
import { POSTHOG_KEY } from './constants/build';
import { getUserEmail, getUserId, isLoggedIntoCloud } from './globalConfig/accounts';
import logger from './logger';

export const TelemetryEventSchema = z.object({
  event: z.enum([
    'assertion_used',
    'command_used',
    'eval_ran',
    'feature_used',
    'funnel',
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

const CONSENT_ENDPOINT = 'https://api.promptfoo.dev/consent';
const EVENTS_ENDPOINT = 'https://a.promptfoo.app';
const KA_ENDPOINT = 'https://ka.promptfoo.app/';
const R_ENDPOINT = 'https://r.promptfoo.app/';

let posthogClient: PostHog | null = null;

function getPostHogClient(): PostHog | null {
  if (getEnvBool('PROMPTFOO_DISABLE_TELEMETRY') || getEnvBool('IS_TESTING')) {
    return null;
  }

  if (posthogClient === null && POSTHOG_KEY) {
    try {
      posthogClient = new PostHog(POSTHOG_KEY, {
        host: EVENTS_ENDPOINT,
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
    this.identify();
  }

  identify() {
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
          },
        });
        client.flush().catch(() => {
          // Silently ignore flush errors
        });
      } catch (error) {
        logger.debug(`PostHog identify error: ${error}`);
      }
    }

    fetchWithTimeout(
      KA_ENDPOINT,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ profile_id: this.id, email: this.email }),
      },
      TELEMETRY_TIMEOUT_MS,
    ).catch(() => {
      // pass
    });
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

    const kaBody = {
      profile_id: this.id,
      email: this.email,
      events: [
        {
          message_id: randomUUID(),
          type: 'track',
          event: eventName,
          properties: propertiesWithMetadata,
          sent_at: new Date().toISOString(),
        },
      ],
    };

    fetch(KA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `promptfoo/${VERSION}`,
      },
      body: JSON.stringify(kaBody),
    }).catch(() => {
      // pass
    });

    fetch(R_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event: eventName,
        environment: process.env.NODE_ENV ?? 'development',
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
