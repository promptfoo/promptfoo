import { useState, useCallback } from 'react';
import { useVersionStore } from '@app/stores/versionStore';
import { callApi } from '@app/utils/api';
import { useToast } from './useToast';

const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

interface VersionResponse {
  version: string;
  hasUpdate: boolean;
  currentVersion: string;
}

// Used in type guard and response type checking
type ApiResponse = VersionResponse | { error: string };

function isVersionResponse(data: unknown): data is VersionResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'version' in data &&
    'hasUpdate' in data &&
    'currentVersion' in data
  );
}

export function useVersionCheck() {
  const [checking, setChecking] = useState(false);
  const { showToast } = useToast();
  const {
    hasShownUpdateNotification,
    markUpdateAsShown,
    setVersionInfo,
    latestVersion,
    currentVersion,
    lastChecked,
  } = useVersionStore();

  const checkVersion = useCallback(
    async (force = false) => {
      if (checking) {
        return;
      }

      // Check cache unless forced
      if (!force && lastChecked && Date.now() - lastChecked < CACHE_DURATION) {
        return;
      }

      try {
        setChecking(true);
        const response = await callApi('/version');
        const data = (await response.json()) as ApiResponse;

        if ('error' in data) {
          throw new Error(String(data.error));
        }

        if (!isVersionResponse(data)) {
          throw new Error('Invalid response format from version check');
        }

        setVersionInfo(data.version, data.currentVersion);

        if (data.hasUpdate && !hasShownUpdateNotification) {
          showToast(
            `A new version of promptfoo (${data.version}) is available. Visit promptfoo.dev to update.`,
            'info',
          );
          markUpdateAsShown();
        }
      } catch (error) {
        console.error('Failed to check for updates:', error);
        showToast('Failed to check for updates. Please try again later.', 'error');
      } finally {
        setChecking(false);
      }
    },
    [
      checking,
      lastChecked,
      hasShownUpdateNotification,
      showToast,
      setVersionInfo,
      markUpdateAsShown,
    ],
  );

  return {
    latestVersion,
    currentVersion,
    checking,
    checkVersion,
    lastChecked,
  };
}
