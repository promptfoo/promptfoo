import { CONSENT_ENDPOINT, R_ENDPOINT, VERSION } from './constants';
import { getEnvBool, getEnvString, isCI } from './envars';
import { getUserEmail, getUserId } from './globalConfig/accounts';
import logger from './logger';
import { fetchWithProxy, fetchWithTimeout } from './util/fetch/index';

import type { EventProperties, TelemetryEventTypes } from './telemetryEvents';

export { TELEMETRY_EVENTS, TelemetryEventSchema } from './telemetryEvents';

export type { EventProperties, TelemetryEventTypes } from './telemetryEvents';

const TELEMETRY_TIMEOUT_MS = 1000;

export class Telemetry {
  private telemetryDisabledRecorded = false;
  private id: string;
  private email: string | null;

  constructor() {
    this.id = getUserId();
    this.email = getUserEmail();
  }

  async identify(): Promise<void> {
    // Retained as a no-op for compatibility with older callers now that the
    // backend no longer initializes a vendor analytics client.
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
    // Retained as a no-op because main.ts still treats telemetry cleanup as one
    // step in graceful shutdown.
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
