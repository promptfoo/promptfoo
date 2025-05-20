import { randomUUID } from 'crypto';
import { PostHog } from 'posthog-node';
import { z } from 'zod';
import { VERSION } from './constants';
import { getEnvBool, getEnvString } from './envars';
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

export const POSTHOG_KEY = getEnvString(
  'PROMPTFOO_POSTHOG_KEY',
  'phc_E5n5uHnDo2eREJL1uqX1cIlbkoRby4yFWt3V94HqRRg',
);
const CONSENT_ENDPOINT = 'https://api.promptfoo.dev/consent';
const EVENTS_ENDPOINT = 'https://a.promptfoo.app';
const KA_ENDPOINT = 'https://ka.promptfoo.app/';

let posthogClient: PostHog | null = null;
try {
  posthogClient = POSTHOG_KEY
    ? new PostHog(POSTHOG_KEY, {
        host: getEnvString('PROMPTFOO_POSTHOG_HOST', EVENTS_ENDPOINT),
      })
    : null;
  if (posthogClient) {
    logger.debug('Initialized PostHog client');
  } else {
    logger.debug('Could not initialize PostHog client');
  }
} catch (err) {
  logger.debug(`Could not initialize PostHog client: ${err}`);
  posthogClient = null;
}

const TELEMETRY_TIMEOUT_MS = 1000;

export class Telemetry {
  private telemetryDisabledRecorded = false;
  private id: string;
  private email: string | undefined;

  constructor() {
    logger.debug(`Telemetry enabled: ${!this.disabled}`);

    const globalConfig = readGlobalConfig();
    this.id = globalConfig?.id;
    this.email = globalConfig?.account?.email;
    this.identify();
  }

  identify() {
    if (this.disabled) {
      return;
    }
    if (posthogClient && this.email) {
      posthogClient.identify({
        distinctId: this.id,
        properties: { email: this.email },
      });
    }

    fetch(KA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ profile_id: this.id, email: this.email }),
    }).catch(() => {
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
      logger.debug(`Record event: ${eventName} ${JSON.stringify(properties)}`);
      this.sendEvent(eventName, properties);
    }
  }

  private sendEvent(eventName: TelemetryEventTypes, properties: EventProperties): void {
    if (posthogClient && !getEnvBool('IS_TESTING')) {
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

export {
  CONSENT_ENDPOINT,
  EVENTS_ENDPOINT,
  KA_ENDPOINT,
  posthogClient,
  TELEMETRY_TIMEOUT_MS,
  telemetry,
};
