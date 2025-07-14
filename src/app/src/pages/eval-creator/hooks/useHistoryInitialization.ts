import { useEffect, useRef } from 'react';
import { useStore } from '@app/stores/evalConfig';
import { useHistoryStore } from '@app/stores/evalConfigWithHistory';

export function useHistoryInitialization() {
  const isInitialized = useRef(false);
  const { config } = useStore();

  useEffect(() => {
    // Initialize history with the current config when the component mounts
    // This ensures we have an initial state in history
    if (!isInitialized.current && Object.keys(config).length > 0) {
      const historyStore = useHistoryStore.getState();
      // Clear any existing history and start fresh
      historyStore.clearHistory();
      historyStore.pushToHistory(config, 'Initial configuration');
      isInitialized.current = true;
    }
  }, [config]);

  // Reset initialization flag when component unmounts
  useEffect(() => {
    return () => {
      isInitialized.current = false;
    };
  }, []);
}
