import { useCallback } from 'react';
import { callApi } from '@app/utils/api';
import type { EventProperties, TelemetryEventTypes } from '@promptfoo/telemetry';

export function useTelemetry() {
  const recordEvent = useCallback(
    async (eventName: TelemetryEventTypes, properties: EventProperties) => {
      if (!['0', 'false'].includes(import.meta.env.VITE_PROMPTFOO_DISABLE_TELEMETRY)) {
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
    [],
  );

  return { recordEvent };
}
