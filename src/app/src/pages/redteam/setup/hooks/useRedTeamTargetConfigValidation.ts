import { create } from 'zustand';
import { targetConfigSha256 } from './targetConfigSha256';

import type { Config } from '../types';

const TARGET_CONFIG_VALIDATION_STORAGE_KEY = 'redTeamTargetConfigValidation';
const REDTEAM_CONFIG_STORAGE_KEY = 'redTeamConfig';
const TARGET_CONFIG_VALIDATION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
let targetConfigValidationChannel: BroadcastChannel | null = null;
let reconcileTargetConfig: ((config: Config) => boolean) | null = null;
let reconcilingTargetConfig = false;

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
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
    if (!target || typeof target.id !== 'string' || !isPlainObject(target.config)) {
      return null;
    }

    return { config, serialized: JSON.stringify(target) };
  } catch {
    return null;
  }
};

const getClearMessage = (serialized: string): string =>
  `clear:${serialized.length.toString(36)}:${targetConfigSha256(serialized)}`;

const isClearMessage = (value: string | null): value is string =>
  value !== null && /^clear:[a-z0-9]+:[a-f0-9]{64}$/.test(value);

const getCurrentClearMessage = (): string | null => {
  try {
    const marker = window.localStorage.getItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY);
    if (!isClearMessage(marker)) {
      return null;
    }
    const snapshot = getPersistedTargetSnapshot();
    return snapshot && marker === getClearMessage(snapshot.serialized) ? marker : null;
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
    const snapshot = getPersistedTargetSnapshot();
    const clearMessage = snapshot ? getClearMessage(snapshot.serialized) : null;
    try {
      if (clearMessage) {
        window.localStorage.setItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY, clearMessage);
      } else {
        window.localStorage.removeItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY);
      }
    } catch {}
    try {
      window.sessionStorage.removeItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY);
    } catch {}
    try {
      document.cookie = `${TARGET_CONFIG_VALIDATION_STORAGE_KEY}=; Max-Age=0; Path=/; SameSite=Lax`;
    } catch {}
    if (broadcast && clearMessage) {
      try {
        targetConfigValidationChannel?.postMessage(clearMessage);
      } catch {}
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
      set({ targetConfigError });
      if (previousError !== targetConfigError) {
        persistTargetConfigError(targetConfigError);
      }
    },
    setTargetConfigDraft: (targetConfigDraft) => set({ targetConfigDraft }),
    clearTargetConfigValidation: () => {
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

const reconcileTargetConfigClear = (clearMessage: string): boolean => {
  const snapshot = getPersistedTargetSnapshot();
  if (
    !snapshot ||
    clearMessage !== getClearMessage(snapshot.serialized) ||
    !reconcileTargetConfig
  ) {
    return false;
  }

  let reconciled = false;
  try {
    reconcilingTargetConfig = true;
    reconciled = reconcileTargetConfig(snapshot.config);
  } catch {
    return false;
  } finally {
    reconcilingTargetConfig = false;
  }
  if (!reconciled) {
    return false;
  }

  persistTargetConfigError(null, false);
  useRedTeamTargetConfigValidation.setState((state) => ({
    targetConfigError: null,
    targetConfigDraft: null,
    targetConfigRevision: state.targetConfigRevision + 1,
  }));
  return true;
};

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

    if (isClearMessage(event.newValue)) {
      reconcileTargetConfigClear(event.newValue);
      return;
    }

    const currentClearMessage = getCurrentClearMessage();
    if (currentClearMessage) {
      reconcileTargetConfigClear(currentClearMessage);
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

      if (isClearMessage(event.data)) {
        reconcileTargetConfigClear(event.data);
        return;
      }

      const targetConfigError = getTargetConfigErrorFromMarker(event.data);
      if (targetConfigError) {
        useRedTeamTargetConfigValidation.setState({ targetConfigError });
        persistTargetConfigError(targetConfigError, false);
      }
    });
    targetConfigWindow.__promptfooTargetConfigValidationChannel = targetConfigValidationChannel;
  } catch {}
}
