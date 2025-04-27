import { useCallback } from 'react';
import { callApi } from '@app/utils/api';
import type { EventProperties, TelemetryEventTypes } from '@promptfoo/telemetry';

export function useTelemetry() {
  const telemetryDisabled = ['1', 'true'].includes(import.meta.env.VITE_PROMPTFOO_DISABLE_TELEMETRY);

  const recordEvent = useCallback(
    async (eventName: TelemetryEventTypes, properties: EventProperties) => {
      // Skip telemetry if disabled
      if (telemetryDisabled) {
        return;
      }

      try {
        await callApi('/telemetry', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            event: eventName,
            properties,
          }),
        });
      } catch (error) {
        console.error('Failed to record telemetry event:', error);
      }
    },
    [telemetryDisabled],
  );

  return { recordEvent, telemetryDisabled };
}
