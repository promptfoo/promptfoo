import { create } from 'zustand';
import { targetConfigSha256 } from './targetConfigSha256';

import type { Config } from '../types';

const TARGET_CONFIG_VALIDATION_STORAGE_KEY = 'redTeamTargetConfigValidation';
const REDTEAM_CONFIG_STORAGE_KEY = 'redTeamConfig';
const TARGET_CONFIG_VALIDATION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
let targetConfigValidationChannel: BroadcastChannel | null = null;
let reconcileTargetConfig: ((config: Config) => boolean) | null = null;
let reconcilingTargetConfig = false;
let currentTargetConfigInvalidMarker: string | null = null;
let targetConfigMarkerSequence = 0;

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

const getClearMessage = (serialized: string, token = 'none'): string =>
  `clear:${token}:${serialized.length.toString(36)}:${targetConfigSha256(serialized)}`;

const isClearMessage = (value: string | null): value is string =>
  value !== null && /^clear:[a-z0-9-]+:[a-z0-9]+:[a-f0-9]{64}$/.test(value);

const getClearToken = (value: string): string => value.split(':')[1];

const getCurrentClearMessage = (): string | null => {
  const snapshot = getPersistedTargetSnapshot();
  if (!snapshot) {
    return null;
  }

  const markers: Array<string | null> = [];
  try {
    markers.push(window.localStorage.getItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY));
  } catch {}
  try {
    markers.push(window.sessionStorage.getItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY));
  } catch {}
  try {
    const prefix = `${TARGET_CONFIG_VALIDATION_STORAGE_KEY}=`;
    markers.push(
      document.cookie
        .split(';')
        .map((cookie) => cookie.trim())
        .find((cookie) => cookie.startsWith(prefix))
        ?.slice(prefix.length) ?? null,
    );
  } catch {}

  for (const marker of markers) {
    if (
      isClearMessage(marker) &&
      marker === getClearMessage(snapshot.serialized, getClearToken(marker))
    ) {
      return marker;
    }
  }
  return null;
};

export const registerTargetConfigReconciler = (reconciler: (config: Config) => boolean) => {
  reconcileTargetConfig = reconciler;
};

const getTargetConfigMarkerFromError = (error: string): string => {
  const kind = error === 'Configuration must be a JSON object' ? 'non-object-json' : 'invalid-json';
  const token = `${Date.now().toString(36)}-${(targetConfigMarkerSequence++).toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${kind}:${token}`;
};

const getTargetConfigMarkerToken = (marker: string | null): string | null => {
  const match = marker?.match(/^(?:invalid-json|non-object-json)(?::([a-z0-9-]+))?$/);
  return match ? (match[1] ?? 'legacy') : null;
};

const getTargetConfigErrorFromMarker = (marker: string | null): string | null => {
  if (!getTargetConfigMarkerToken(marker)) {
    return null;
  }
  if (marker?.startsWith('non-object-json')) {
    return 'Configuration must be a JSON object';
  }
  return marker?.startsWith('invalid-json') ? 'Invalid JSON configuration' : null;
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
    const marker = window.localStorage.getItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY);
    const targetConfigError = getTargetConfigErrorFromMarker(marker);
    if (targetConfigError) {
      currentTargetConfigInvalidMarker = marker;
      return targetConfigError;
    }
  } catch {}
  try {
    const marker = window.sessionStorage.getItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY);
    const targetConfigError = getTargetConfigErrorFromMarker(marker);
    if (targetConfigError) {
      currentTargetConfigInvalidMarker = marker;
      return targetConfigError;
    }
  } catch {}
  const marker = getTargetConfigCookieMarker();
  const targetConfigError = getTargetConfigErrorFromMarker(marker);
  if (targetConfigError) {
    currentTargetConfigInvalidMarker = marker;
  }
  return targetConfigError;
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

const persistTargetConfigClear = (broadcast: boolean, existingMarker?: string | null) => {
  const snapshot = getPersistedTargetSnapshot();
  const clearMessage = snapshot
    ? getClearMessage(
        snapshot.serialized,
        getTargetConfigMarkerToken(existingMarker ?? currentTargetConfigInvalidMarker) ?? 'none',
      )
    : null;
  currentTargetConfigInvalidMarker = null;
  let persistedLocally = false;
  try {
    if (clearMessage) {
      window.localStorage.setItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY, clearMessage);
    } else {
      window.localStorage.removeItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY);
    }
    persistedLocally = true;
  } catch {}
  try {
    if (!persistedLocally && clearMessage) {
      window.sessionStorage.setItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY, clearMessage);
    } else {
      window.sessionStorage.removeItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY);
    }
  } catch {}
  try {
    document.cookie =
      !persistedLocally && clearMessage
        ? `${TARGET_CONFIG_VALIDATION_STORAGE_KEY}=${clearMessage}; Max-Age=${TARGET_CONFIG_VALIDATION_COOKIE_MAX_AGE}; Path=/; SameSite=Lax`
        : `${TARGET_CONFIG_VALIDATION_STORAGE_KEY}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {}
  if (broadcast && clearMessage) {
    try {
      targetConfigValidationChannel?.postMessage(clearMessage);
    } catch {}
  }
};

const persistTargetConfigError = (
  error: string | null,
  broadcast = true,
  existingMarker?: string | null,
) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (!error) {
    persistTargetConfigClear(broadcast, existingMarker);
    return;
  }

  const marker = existingMarker ?? getTargetConfigMarkerFromError(error);
  currentTargetConfigInvalidMarker = marker;
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
    setTargetConfigDraft: (targetConfigDraft) => {
      const previousDraft = get().targetConfigDraft;
      set({ targetConfigDraft });
      const { targetConfigError } = get();
      if (targetConfigError && targetConfigDraft !== null && previousDraft !== targetConfigDraft) {
        persistTargetConfigError(targetConfigError);
      }
    },
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
        persistTargetConfigError(targetConfigError, true, currentTargetConfigInvalidMarker);
      }
    },
  }),
);

const reconcileTargetConfigClear = (clearMessage: string): boolean => {
  const snapshot = getPersistedTargetSnapshot();
  const token = getClearToken(clearMessage);
  const currentToken = getTargetConfigMarkerToken(currentTargetConfigInvalidMarker);
  if (
    !snapshot ||
    clearMessage !== getClearMessage(snapshot.serialized, token) ||
    (currentToken && token !== currentToken) ||
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

  persistTargetConfigError(null, false, `invalid-json:${token}`);
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
      if (getCurrentClearMessage() === event.newValue) {
        reconcileTargetConfigClear(event.newValue);
      }
      return;
    }

    const currentClearMessage = getCurrentClearMessage();
    if (currentClearMessage) {
      const targetConfigError = getTargetConfigErrorFromMarker(event.newValue);
      if (
        targetConfigError &&
        getTargetConfigMarkerToken(event.newValue) === getClearToken(currentClearMessage)
      ) {
        currentTargetConfigInvalidMarker = event.newValue;
        useRedTeamTargetConfigValidation.setState({ targetConfigError });
      }
      reconcileTargetConfigClear(currentClearMessage);
      return;
    }

    if (!event.newValue) {
      const { targetConfigError } = useRedTeamTargetConfigValidation.getState();
      if (targetConfigError) {
        persistTargetConfigError(targetConfigError, false, currentTargetConfigInvalidMarker);
      }
      return;
    }

    const targetConfigError = getTargetConfigErrorFromMarker(event.newValue);
    if (targetConfigError) {
      currentTargetConfigInvalidMarker = event.newValue;
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
        const token = getTargetConfigMarkerToken(event.data);
        const currentClearMessage = getCurrentClearMessage();
        if (
          token !== 'legacy' &&
          currentClearMessage &&
          token === getClearToken(currentClearMessage)
        ) {
          reconcileTargetConfigClear(currentClearMessage);
          return;
        }
        useRedTeamTargetConfigValidation.setState({ targetConfigError });
        persistTargetConfigError(targetConfigError, false, event.data);
      }
    });
    targetConfigWindow.__promptfooTargetConfigValidationChannel = targetConfigValidationChannel;
  } catch {}
}
