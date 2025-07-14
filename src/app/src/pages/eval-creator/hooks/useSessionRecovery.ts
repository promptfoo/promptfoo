import { useEffect, useState } from 'react';
import { useStore } from '@app/stores/evalConfig';

interface SessionRecoveryState {
  hasRecoveredData: boolean;
  recoveredAt: number | null;
}

export function useSessionRecovery(): SessionRecoveryState {
  const [recoveryState, setRecoveryState] = useState<SessionRecoveryState>({
    hasRecoveredData: false,
    recoveredAt: null,
  });

  const { config, lastSavedAt } = useStore();

  useEffect(() => {
    // Check if we have recovered data from a previous session
    // This happens when we have config data and a lastSavedAt timestamp on initial load
    const hasPrompts = config.prompts && config.prompts.length > 0;
    const hasProviders = config.providers && config.providers.length > 0;
    const hasTests = config.tests && config.tests.length > 0;

    // If we have meaningful data and a lastSavedAt timestamp, we recovered from a previous session
    if (lastSavedAt && (hasPrompts || hasProviders || hasTests)) {
      // Check if the last save was from a previous browser session
      // (more than 1 minute ago, accounting for page refresh)
      const timeSinceLastSave = Date.now() - lastSavedAt;
      const isFromPreviousSession = timeSinceLastSave > 60000; // 1 minute

      if (isFromPreviousSession) {
        setRecoveryState({
          hasRecoveredData: true,
          recoveredAt: Date.now(),
        });
      }
    }
  }, []); // Only run once on mount

  return recoveryState;
}
