import chalk from 'chalk';
import packageJson from '../package.json';
import { getEnvBool } from './envars';
import { fetchWithTimeout } from './fetch';
import logger from './logger';

export type EventValue = string | number | boolean | string[];
type TelemetryEvent = {
  event: string;
  packageVersion: string;
  properties: Record<string, EventValue>;
};

type TelemetryEventTypes =
  | 'eval_ran'
  | 'assertion_used'
  | 'command_used'
  | 'funnel'
  | 'feature_used';

const TELEMETRY_ENDPOINT = 'https://api.promptfoo.dev/telemetry';
const CONSENT_ENDPOINT = 'https://api.promptfoo.dev/consent';

const TELEMETRY_TIMEOUT_MS = 1000;

export class Telemetry {
  private events: TelemetryEvent[] = [];

  get disabled() {
    return getEnvBool('PROMPTFOO_DISABLE_TELEMETRY');
  }

  record(eventName: TelemetryEventTypes, properties: Record<string, EventValue>): void {
    if (!this.disabled) {
      this.events.push({
        event: eventName,
        packageVersion: packageJson.version,
        properties,
      });
    }
  }

  private recordedEvents: Set<string> = new Set();

  recordOnce(eventName: TelemetryEventTypes, properties: Record<string, EventValue>): void {
    if (this.disabled) {
      return;
    }

    const eventKey = JSON.stringify({ eventName, properties });
    if (!this.recordedEvents.has(eventKey)) {
      this.events.push({
        event: eventName,
        packageVersion: packageJson.version,
        properties,
      });
      this.recordedEvents.add(eventKey);
    }
  }

  async recordAndSend(
    eventName: TelemetryEventTypes,
    properties: Record<string, EventValue>,
  ): Promise<void> {
    this.record(eventName, properties);
    await this.send();
  }

  async recordAndSendOnce(
    eventName: TelemetryEventTypes,
    properties: Record<string, EventValue>,
  ): Promise<void> {
    this.recordOnce(eventName, properties);
    await this.send();
  }

  async send(): Promise<void> {
    if (!this.disabled && this.events.length > 0) {
      try {
        const response = await fetchWithTimeout(
          TELEMETRY_ENDPOINT,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(this.events),
          },
          TELEMETRY_TIMEOUT_MS,
        );

        if (response.ok) {
          this.events = [];
        }
      } catch {
        // ignore
      }
    }
  }

  /**
   * This is a separate endpoint to save consent used only for redteam data synthesis for "harmful" plugins.
   */
  async saveConsent(email: string): Promise<void> {
    if (!this.disabled) {
      try {
        const response = await fetchWithTimeout(
          CONSENT_ENDPOINT,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email }),
          },
          TELEMETRY_TIMEOUT_MS,
        );

        if (!response.ok) {
          throw new Error(`Failed to save consent: ${response.statusText}`);
        }
      } catch (err) {
        logger.error(`Error saving consent: ${(err as Error).message}`);
      }
    }
  }
}

const telemetry = new Telemetry();
export default telemetry;
