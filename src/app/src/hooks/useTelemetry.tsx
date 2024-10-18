import { useCallback } from 'react';
import { callApi } from '@app/utils/api';

export function useTelemetry() {
  const recordEvent = useCallback(async (eventName: string, properties: Record<string, any>) => {
    try {
      await callApi('/telemetry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventName,
          properties,
        }),
      });
    } catch (error) {
      console.error('Failed to record telemetry event:', error);
    }
  }, []);

  return { recordEvent };
}
