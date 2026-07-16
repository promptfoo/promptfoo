import { create } from 'zustand';

import type { Config } from '../types';

const TARGET_CONFIG_VALIDATION_STORAGE_KEY = 'redTeamTargetConfigValidation';
const REDTEAM_CONFIG_STORAGE_KEY = 'redTeamConfig';
const TARGET_CONFIG_VALIDATION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
let targetConfigValidationChannel: BroadcastChannel | null = null;
let reconcileTargetConfig: ((config: Config) => boolean) | null = null;
let reconcilingTargetConfig = false;
let targetConfigValidationEpoch = 0;

const sha256 = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const getPersistedTargetSnapshot = (): {
  config: Config;
  serialized: string;
} | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawConfig = window.localStorage.getItem(REDTEAM_CONFIG_STORAGE_KEY);
    if (!rawConfig) {
      return null;
    }
    const persisted = JSON.parse(rawConfig) as { state?: { config?: Config } };
    const config = persisted.state?.config;
    const target = config?.target;
    if (
      !target ||
      typeof target.id !== 'string' ||
      typeof target.config !== 'object' ||
      target.config === null ||
      Array.isArray(target.config)
    ) {
      return null;
    }

    return { config, serialized: JSON.stringify(target) };
  } catch {
    return null;
  }
};

export const registerTargetConfigReconciler = (reconciler: (config: Config) => boolean) => {
  reconcileTargetConfig = reconciler;
};

const getTargetConfigMarkerFromError = (error: string): string =>
  error === 'Configuration must be a JSON object' ? 'non-object-json' : 'invalid-json';

const getTargetConfigErrorFromMarker = (marker: string | null): string | null => {
  if (marker === 'non-object-json') {
    return 'Configuration must be a JSON object';
  }
  return marker === 'invalid-json' ? 'Invalid JSON configuration' : null;
};

const getTargetConfigCookieMarker = (): string | null => {
  if (typeof document === 'undefined') {
    return null;
  }
  try {
    const prefix = `${TARGET_CONFIG_VALIDATION_STORAGE_KEY}=`;
    return (
      document.cookie
        .split(';')
        .map((cookie) => cookie.trim())
        .find((cookie) => cookie.startsWith(prefix))
        ?.slice(prefix.length) ?? null
    );
  } catch {
    return null;
  }
};

const getStoredTargetConfigError = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const targetConfigError = getTargetConfigErrorFromMarker(
      window.localStorage.getItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY),
    );
    if (targetConfigError) {
      return targetConfigError;
    }
  } catch {}
  try {
    const targetConfigError = getTargetConfigErrorFromMarker(
      window.sessionStorage.getItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY),
    );
    if (targetConfigError) {
      return targetConfigError;
    }
  } catch {}
  return getTargetConfigErrorFromMarker(getTargetConfigCookieMarker());
};

const hasDurableTargetConfigMarker = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    if (
      getTargetConfigErrorFromMarker(
        window.localStorage.getItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY),
      )
    ) {
      return true;
    }
  } catch {}
  return Boolean(getTargetConfigErrorFromMarker(getTargetConfigCookieMarker()));
};

const persistTargetConfigError = (error: string | null, broadcast = true) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (!error) {
    try {
      window.localStorage.removeItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY);
    } catch {}
    try {
      window.sessionStorage.removeItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY);
    } catch {}
    try {
      document.cookie = `${TARGET_CONFIG_VALIDATION_STORAGE_KEY}=; Max-Age=0; Path=/; SameSite=Lax`;
    } catch {}
    if (broadcast) {
      const snapshot = getPersistedTargetSnapshot();
      if (snapshot) {
        const clearEpoch = targetConfigValidationEpoch;
        void sha256(snapshot.serialized).then(
          (fingerprint) => {
            if (
              clearEpoch !== targetConfigValidationEpoch ||
              getPersistedTargetSnapshot()?.serialized !== snapshot.serialized
            ) {
              return;
            }
            try {
              targetConfigValidationChannel?.postMessage(
                `clear:${snapshot.serialized.length.toString(36)}:${fingerprint}`,
              );
            } catch {}
          },
          () => {},
        );
      }
    }
    return;
  }

  const marker = getTargetConfigMarkerFromError(error);
  let persistedLocally = false;
  try {
    window.localStorage.setItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY, marker);
    persistedLocally = true;
  } catch {}
  if (!persistedLocally) {
    try {
      window.sessionStorage.setItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY, marker);
    } catch {}
    try {
      document.cookie = `${TARGET_CONFIG_VALIDATION_STORAGE_KEY}=${marker}; Max-Age=${TARGET_CONFIG_VALIDATION_COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
    } catch {}
  }
  if (broadcast) {
    try {
      targetConfigValidationChannel?.postMessage(marker);
    } catch {}
  }
};

interface RedTeamTargetConfigValidationState {
  targetConfigError: string | null;
  targetConfigDraft: string | null;
  targetConfigRevision: number;
  setTargetConfigError: (error: string | null) => void;
  setTargetConfigDraft: (draft: string | null) => void;
  clearTargetConfigValidation: () => void;
  reassertTargetConfigValidation: () => void;
}

export const useRedTeamTargetConfigValidation = create<RedTeamTargetConfigValidationState>()(
  (set, get) => ({
    targetConfigError: getStoredTargetConfigError(),
    targetConfigDraft: null,
    targetConfigRevision: 0,
    setTargetConfigError: (targetConfigError) => {
      const previousError = get().targetConfigError;
      targetConfigValidationEpoch++;
      set({ targetConfigError });
      if (previousError !== targetConfigError) {
        persistTargetConfigError(targetConfigError);
      }
    },
    setTargetConfigDraft: (targetConfigDraft) => {
      targetConfigValidationEpoch++;
      set({ targetConfigDraft });
    },
    clearTargetConfigValidation: () => {
      targetConfigValidationEpoch++;
      persistTargetConfigError(null);
      set((state) => ({
        targetConfigError: null,
        targetConfigDraft: null,
        targetConfigRevision: state.targetConfigRevision + 1,
      }));
    },
    reassertTargetConfigValidation: () => {
      const { targetConfigError } = get();
      if (targetConfigError && !reconcilingTargetConfig && !hasDurableTargetConfigMarker()) {
        persistTargetConfigError(targetConfigError);
      }
    },
  }),
);

if (typeof window !== 'undefined') {
  const targetConfigWindow = window as Window & {
    __promptfooTargetConfigValidationStorageListener?: (event: StorageEvent) => void;
    __promptfooTargetConfigValidationChannel?: BroadcastChannel;
  };
  if (targetConfigWindow.__promptfooTargetConfigValidationStorageListener) {
    window.removeEventListener(
      'storage',
      targetConfigWindow.__promptfooTargetConfigValidationStorageListener,
    );
  }
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== TARGET_CONFIG_VALIDATION_STORAGE_KEY && event.key !== null) {
      return;
    }

    if (!event.newValue) {
      const { targetConfigError } = useRedTeamTargetConfigValidation.getState();
      if (targetConfigError) {
        persistTargetConfigError(targetConfigError, false);
      }
      return;
    }

    const targetConfigError = getTargetConfigErrorFromMarker(event.newValue);
    if (targetConfigError) {
      targetConfigValidationEpoch++;
      useRedTeamTargetConfigValidation.setState({ targetConfigError });
    }
  };
  targetConfigWindow.__promptfooTargetConfigValidationStorageListener = handleStorage;
  window.addEventListener('storage', handleStorage);

  try {
    targetConfigWindow.__promptfooTargetConfigValidationChannel?.close();
  } catch {}
  try {
    targetConfigValidationChannel = new BroadcastChannel(TARGET_CONFIG_VALIDATION_STORAGE_KEY);
    targetConfigValidationChannel.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (typeof event.data !== 'string') {
        return;
      }

      if (/^clear:[a-z0-9]+:[a-f0-9]{64}$/.test(event.data)) {
        const snapshot = getPersistedTargetSnapshot();
        if (!snapshot || !reconcileTargetConfig) {
          return;
        }
        const receivedEpoch = targetConfigValidationEpoch;

        void sha256(snapshot.serialized).then(
          (fingerprint) => {
            const clearMessage = `clear:${snapshot.serialized.length.toString(36)}:${fingerprint}`;
            const latestSnapshot = getPersistedTargetSnapshot();
            if (
              event.data !== clearMessage ||
              receivedEpoch !== targetConfigValidationEpoch ||
              latestSnapshot?.serialized !== snapshot.serialized ||
              !reconcileTargetConfig
            ) {
              return;
            }

            let reconciled = false;
            try {
              reconcilingTargetConfig = true;
              reconciled = reconcileTargetConfig(latestSnapshot.config);
            } catch {
              return;
            } finally {
              reconcilingTargetConfig = false;
            }
            if (!reconciled) {
              return;
            }

            targetConfigValidationEpoch++;
            persistTargetConfigError(null, false);
            useRedTeamTargetConfigValidation.setState((state) => ({
              targetConfigError: null,
              targetConfigDraft: null,
              targetConfigRevision: state.targetConfigRevision + 1,
            }));
          },
          () => {},
        );
        return;
      }

      const targetConfigError = getTargetConfigErrorFromMarker(event.data);
      if (targetConfigError) {
        targetConfigValidationEpoch++;
        useRedTeamTargetConfigValidation.setState({ targetConfigError });
        persistTargetConfigError(targetConfigError, false);
      }
    });
    targetConfigWindow.__promptfooTargetConfigValidationChannel = targetConfigValidationChannel;
  } catch {}
}
