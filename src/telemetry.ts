import { randomUUID } from 'crypto';
import { PostHog } from 'posthog-node';
import { z } from 'zod';
import { VERSION } from './constants';
import { getEnvBool } from './envars';
import { fetchWithTimeout } from './fetch';
import { readGlobalConfig } from './globalConfig/globalConfig';
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

const posthogClient = process.env.POSTHOG_KEY
  ? new PostHog(process.env.POSTHOG_KEY, {
      host: EVENTS_ENDPOINT,
    })
  : null;

const TELEMETRY_TIMEOUT_MS = 1000;

export class Telemetry {
  private events: TelemetryEvent[] = [];
  private telemetryDisabledRecorded = false;
  private id: string;
  private email: string | undefined;

  constructor() {
    const globalConfig = readGlobalConfig();
    this.id = globalConfig?.id;
    this.email = globalConfig?.account?.email;
    this.identify();
  }

  identify() {
    if (posthogClient && this.email) {
      posthogClient.identify({
        distinctId: this.id,
        properties: { email: this.email },
      });
    }
    if (KA_ENDPOINT) {
      fetch(KA_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ profile_id: this.id, email: this.email }),
      }).then((res) => {
        if (!res.ok) {
          logger.debug(`Failed to identify user: ${res.statusText}`);
        }
      });
    }
  }

  get disabled() {
    return getEnvBool('PROMPTFOO_DISABLE_TELEMETRY');
  }

  private recordTelemetryDisabled() {
    if (!this.telemetryDisabledRecorded) {
      this.events.push({
        event: 'feature_used',
        packageVersion: VERSION,
        properties: { feature: 'telemetry disabled' },
      });
      this.telemetryDisabledRecorded = true;
    }
  }

  record(eventName: TelemetryEventTypes, properties: EventProperties): void {
    if (this.disabled) {
      this.recordTelemetryDisabled();
    } else {
      if (posthogClient) {
        const globalConfig = readGlobalConfig();
        posthogClient.capture({
          distinctId: globalConfig.id,
          event: eventName,
          properties: { ...properties, packageVersion: VERSION },
        });
      }
      const kaBody = {
        profile_id: this.id,
        email: this.email,
        events: [
          {
            message_id: randomUUID(),
            type: 'track',
            event: eventName,
            properties,
            sent_at: new Date().toISOString(),
          },
        ],
      };
      if (KA_ENDPOINT) {
        fetch(KA_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'promptfoo/1.0.0',
          },
          body: JSON.stringify(kaBody),
        });
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
