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

const CONSENT_ENDPOINT = 'https://api.promptfoo.dev/consent';
const EVENTS_ENDPOINT = 'https://a.promptfoo.app';
const KA_ENDPOINT = 'https://ka.promptfoo.app/';

let posthogClient: PostHog | null = null;
try {
  const posthogKey = getEnvString('POSTHOG_KEY');
  if (posthogKey) {
    posthogClient = new PostHog(posthogKey, {
      host: EVENTS_ENDPOINT,
    });
  }
} catch {
  posthogClient = null;
}

const TELEMETRY_TIMEOUT_MS = 1000;

export class Telemetry {
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
    if (this.disabled) {
      return;
    }
    if (posthogClient && this.email) {
      posthogClient.identify({
        distinctId: this.id,
        properties: { email: this.email },
      });
    }

    // Make non-blocking request
    (async () => {
      try {
        await fetch(KA_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ profile_id: this.id, email: this.email }),
        });
      } catch {
        // Silently ignore errors
      }
    })();
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
    // Skip all telemetry recording when disabled
    if (this.disabled) {
      return;
    }

    // If we get here, telemetry is enabled, so just send the event
    this.sendEvent(eventName, properties);
  }

  private sendEvent(eventName: TelemetryEventTypes, properties: EventProperties): void {
    if (getEnvString('NODE_ENV') === 'test') {
      return;
    }
    
    // Run telemetry in background, don't block execution
    (async () => {
      try {
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

        await fetch(KA_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': `promptfoo/${VERSION}`,
          },
          body: JSON.stringify(kaBody),
        });
      } catch {
        // Silently ignore telemetry errors
      }
    })();
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
