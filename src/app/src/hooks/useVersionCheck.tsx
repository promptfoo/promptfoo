import { useState } from 'react';
import dedent from 'dedent';
import { useToast } from './useToast';

interface VersionResponse {
  version: string;
}

export function useVersionCheck() {
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const { showToast } = useToast();

  const currentVersion = import.meta.env.VITE_PROMPTFOO_VERSION;

  const compareVersions = (v1: string, v2: string) => {
    const v1Parts = v1.split('.').map(Number);
    const v2Parts = v2.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      if (v1Parts[i] > v2Parts[i]) {return 1;}
      if (v1Parts[i] < v2Parts[i]) {return -1;}
    }
    return 0;
  };

  const checkVersion = async () => {
    if (checking) {return;}

    try {
      setChecking(true);
      const response = await fetch('https://api.promptfoo.dev/api/latestVersion');
      const data: VersionResponse = await response.json();
      setLatestVersion(data.version);

      if (compareVersions(currentVersion, data.version) < 0) {
        showToast(
          dedent`
            A new version of promptfoo is available (${data.version})
            You are currently running version ${currentVersion}
            
            Visit promptfoo.dev to update.
          `,
          'info',
        );
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
    } finally {
      setChecking(false);
    }
  };

  return {
    latestVersion,
    currentVersion,
    checking,
    checkVersion,
  };
}
