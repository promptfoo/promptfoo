import { randomUUID } from 'crypto';
import { PostHog } from 'posthog-node';
import { z } from 'zod';
import { VERSION } from './constants';
import { getEnvBool, isCI } from './envars';
import { fetchWithTimeout } from './fetch';
import { POSTHOG_KEY } from './generated-constants';
import { getUserEmail, getUserId } from './globalConfig/accounts';
import logger from './logger';

export const TelemetryEventSchema = z.object({
  event: z.enum([
    'assertion_used',
    'command_used',
    'eval_ran',
    'feature_used',
    'funnel',
    'webui_api',
    'webui_page_view',
  ]),
  packageVersion: z.string().optional().default(VERSION),
  properties: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])),
});
export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;
export type TelemetryEventTypes = TelemetryEvent['event'];
export type EventProperties = TelemetryEvent['properties'];

const CONSENT_ENDPOINT = 'https://api.promptfoo.dev/consent';
const EVENTS_ENDPOINT = 'https://a.promptfoo.app';
const KA_ENDPOINT = 'https://ka.promptfoo.app/';

let posthogClient: PostHog | null = null;
try {
  posthogClient = POSTHOG_KEY
    ? new PostHog(POSTHOG_KEY, {
        host: EVENTS_ENDPOINT,
      })
    : null;
} catch {
  posthogClient = null;
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
    // Do not use getEnvBool here - it will be mocked in tests
    if (this.disabled || process.env.IS_TESTING) {
      return;
    }

    if (posthogClient) {
      posthogClient.identify({
        distinctId: this.id,
        properties: { email: this.email },
      });
      posthogClient.flush();
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

    // Do not use getEnvBool here - it will be mocked in tests
    if (posthogClient && !process.env.IS_TESTING) {
      posthogClient.capture({
        distinctId: this.id,
        event: eventName,
        properties: propertiesWithMetadata,
      });
      posthogClient.flush();
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
