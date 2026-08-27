import { omitProviderCredentials } from '@app/stores/evalConfig';
import { create } from 'zustand';
import { targetConfigSha256 } from './targetConfigSha256';

import type { Config } from '../types';

const TARGET_CONFIG_VALIDATION_STORAGE_KEY = 'redTeamTargetConfigValidation';
const TARGET_CONFIG_VALIDATION_ISOLATION_STORAGE_KEY = 'redTeamTargetConfigValidationIsolated';
const REDTEAM_CONFIG_STORAGE_KEY = 'redTeamConfig';
const TARGET_CONFIG_VALIDATION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
let targetConfigValidationChannel: BroadcastChannel | null = null;
let reconcileTargetConfig: ((config: Config) => boolean) | null = null;
let reconcilingTargetConfig = false;
let currentTargetConfigInvalidMarker: string | null = null;
let targetConfigMarkerSequence = 0;

export const getCurrentTargetConfigInvalidMarker = (): string | null =>
  currentTargetConfigInvalidMarker;

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

const canonicalizeCredentialFreeTarget = (value: unknown, parentKey?: string): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeCredentialFreeTarget(item, parentKey));
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const normalizedParent = parentKey?.toLowerCase().replace(/[-_]/g, '');
  const redactAllValues =
    normalizedParent !== undefined &&
    ['auth', 'headers', 'signatureauth', 'tls', 'clienv', 'env'].includes(normalizedParent);
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, child]) => [
        key,
        redactAllValues ? '[REDACTED]' : canonicalizeCredentialFreeTarget(child, key),
      ]),
  );
};

const getClearMessage = (serialized: string, token = 'none'): string => {
  const credentialFreeTarget = JSON.stringify(
    canonicalizeCredentialFreeTarget(omitProviderCredentials(JSON.parse(serialized))),
  );
  return `clear:${token}:${credentialFreeTarget.length.toString(36)}:${targetConfigSha256(credentialFreeTarget)}`;
};

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

const getTargetConfigMarkerFromError = (error: string, source?: 'import'): string => {
  const kind =
    error === 'Configuration must be a JSON object'
      ? 'non-object-json'
      : source === 'import'
        ? 'invalid-import-json'
        : 'invalid-json';
  const token = `${Date.now().toString(36)}-${(targetConfigMarkerSequence++).toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${kind}:${token}`;
};

const getTargetConfigMarkerToken = (marker: string | null): string | null => {
  const match = marker?.match(
    /^(?:invalid-json|invalid-import-json|non-object-json)(?::([a-z0-9-]+))?$/,
  );
  return match ? (match[1] ?? 'legacy') : null;
};

const getTargetConfigErrorFromMarker = (marker: string | null): string | null => {
  if (!getTargetConfigMarkerToken(marker)) {
    return null;
  }
  if (marker?.startsWith('non-object-json')) {
    return 'Configuration must be a JSON object';
  }
  return marker?.startsWith('invalid-json') || marker?.startsWith('invalid-import-json')
    ? 'Invalid JSON configuration'
    : null;
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

  const markers: Array<string | null> = [];
  try {
    markers.push(window.localStorage.getItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY));
  } catch {}
  try {
    markers.push(window.sessionStorage.getItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY));
  } catch {}
  markers.push(getTargetConfigCookieMarker());

  const snapshot = getPersistedTargetSnapshot();
  const consumedTokens = new Set<string>();
  if (snapshot) {
    for (const marker of markers) {
      if (!isClearMessage(marker)) {
        continue;
      }
      const token = getClearToken(marker);
      if (
        token !== 'legacy' &&
        token !== 'none' &&
        marker === getClearMessage(snapshot.serialized, token)
      ) {
        consumedTokens.add(token);
      }
    }
  }

  try {
    const isolationToken = window.sessionStorage.getItem(
      TARGET_CONFIG_VALIDATION_ISOLATION_STORAGE_KEY,
    );
    const isolatedMarker = markers[1];
    const isolatedError = getTargetConfigErrorFromMarker(isolatedMarker);
    if (
      isolationToken &&
      getTargetConfigMarkerToken(isolatedMarker) === isolationToken &&
      isolatedError &&
      !consumedTokens.has(isolationToken)
    ) {
      currentTargetConfigInvalidMarker = isolatedMarker;
      return isolatedError;
    }
  } catch {}

  for (const marker of markers) {
    const targetConfigError = getTargetConfigErrorFromMarker(marker);
    const token = getTargetConfigMarkerToken(marker);
    if (!targetConfigError || (token !== null && consumedTokens.has(token))) {
      continue;
    }
    currentTargetConfigInvalidMarker = marker;
    return targetConfigError;
  }
  return null;
};

const hasStoredTargetConfigInvalidToken = (token: string): boolean => {
  const markers: Array<string | null> = [];
  try {
    markers.push(window.localStorage.getItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY));
  } catch {}
  try {
    markers.push(window.sessionStorage.getItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY));
  } catch {}
  markers.push(getTargetConfigCookieMarker());
  return markers.some((marker) => getTargetConfigMarkerToken(marker) === token);
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
  try {
    const sessionToken = getTargetConfigMarkerToken(
      window.sessionStorage.getItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY),
    );
    if (
      sessionToken &&
      sessionToken === getTargetConfigMarkerToken(currentTargetConfigInvalidMarker)
    ) {
      return true;
    }
  } catch {}
  return Boolean(getTargetConfigErrorFromMarker(getTargetConfigCookieMarker()));
};

const persistTargetConfigClear = (
  broadcast: boolean,
  existingMarker?: string | null,
  expectedSerializedTarget?: string,
): boolean => {
  const snapshot = getPersistedTargetSnapshot();
  if (
    expectedSerializedTarget !== undefined &&
    (!snapshot || snapshot.serialized !== expectedSerializedTarget)
  ) {
    return false;
  }
  const invalidMarker = existingMarker ?? currentTargetConfigInvalidMarker;
  const invalidToken = getTargetConfigMarkerToken(invalidMarker);
  const clearMessage = snapshot
    ? getClearMessage(snapshot.serialized, getTargetConfigMarkerToken(invalidMarker) ?? 'none')
    : null;
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
    }
  } catch {}
  try {
    document.cookie =
      !persistedLocally && clearMessage
        ? `${TARGET_CONFIG_VALIDATION_STORAGE_KEY}=${clearMessage}; Max-Age=${TARGET_CONFIG_VALIDATION_COOKIE_MAX_AGE}; Path=/; SameSite=Lax`
        : `${TARGET_CONFIG_VALIDATION_STORAGE_KEY}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {}
  if (getPersistedTargetSnapshot()?.serialized !== snapshot?.serialized) {
    return false;
  }
  try {
    if (persistedLocally) {
      window.sessionStorage.removeItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY);
    }
    if (
      invalidToken &&
      window.sessionStorage.getItem(TARGET_CONFIG_VALIDATION_ISOLATION_STORAGE_KEY) === invalidToken
    ) {
      window.sessionStorage.removeItem(TARGET_CONFIG_VALIDATION_ISOLATION_STORAGE_KEY);
    }
  } catch {}
  currentTargetConfigInvalidMarker = null;
  if (broadcast && clearMessage) {
    try {
      targetConfigValidationChannel?.postMessage(clearMessage);
    } catch {}
  }
  return true;
};

const persistTargetConfigError = (
  error: string | null,
  broadcast = true,
  existingMarker?: string | null,
  source?: 'import',
) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (!error) {
    persistTargetConfigClear(broadcast, existingMarker);
    return;
  }

  const marker = existingMarker ?? getTargetConfigMarkerFromError(error, source);
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

const persistTargetConfigErrorInSession = (
  error: string,
  existingMarker?: string | null,
  isolate = false,
): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  const marker = existingMarker ?? getTargetConfigMarkerFromError(error);
  const token = getTargetConfigMarkerToken(marker);
  try {
    window.sessionStorage.setItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY, marker);
    if (isolate && token) {
      window.sessionStorage.setItem(TARGET_CONFIG_VALIDATION_ISOLATION_STORAGE_KEY, token);
    }
    currentTargetConfigInvalidMarker = marker;
    return true;
  } catch {
    return false;
  }
};

const isTargetConfigDraftIsolated = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  const activeToken = getTargetConfigMarkerToken(currentTargetConfigInvalidMarker);
  if (!activeToken) {
    return false;
  }
  try {
    if (
      window.sessionStorage.getItem(TARGET_CONFIG_VALIDATION_ISOLATION_STORAGE_KEY) !== activeToken
    ) {
      return false;
    }
  } catch {
    return false;
  }
  try {
    return (
      getTargetConfigMarkerToken(
        window.localStorage.getItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY),
      ) !== activeToken
    );
  } catch {
    return true;
  }
};

const persistTargetConfigDraftError = (
  error: string,
  broadcast = true,
  existingMarker?: string | null,
) => {
  if (
    isTargetConfigDraftIsolated() &&
    persistTargetConfigErrorInSession(error, existingMarker, true)
  ) {
    return;
  }
  persistTargetConfigError(error, broadcast, existingMarker);
};

interface RedTeamTargetConfigValidationState {
  targetConfigError: string | null;
  targetConfigDraft: string | null;
  targetConfigRevision: number;
  setTargetConfigError: (error: string | null) => void;
  setTargetConfigDraft: (draft: string | null) => void;
  replaceTargetConfigValidation: (error: string, draft: string, source?: 'import') => void;
  clearTargetConfigValidation: (
    expectedSerializedTarget?: string,
    incrementRevision?: boolean,
  ) => boolean;
  reassertTargetConfigValidation: () => void;
}

export const useRedTeamTargetConfigValidation = create<RedTeamTargetConfigValidationState>()(
  (set, get) => ({
    targetConfigError: getStoredTargetConfigError(),
    targetConfigDraft: null,
    targetConfigRevision: 0,
    setTargetConfigError: (targetConfigError) => {
      if (!targetConfigError) {
        return;
      }
      const previousError = get().targetConfigError;
      set({ targetConfigError });
      if (previousError !== targetConfigError) {
        persistTargetConfigDraftError(targetConfigError);
      }
    },
    setTargetConfigDraft: (targetConfigDraft) => {
      const previousDraft = get().targetConfigDraft;
      set({ targetConfigDraft });
      const { targetConfigError } = get();
      if (targetConfigError && targetConfigDraft !== null && previousDraft !== targetConfigDraft) {
        persistTargetConfigDraftError(targetConfigError);
      }
    },
    replaceTargetConfigValidation: (targetConfigError, targetConfigDraft, source) => {
      persistTargetConfigError(targetConfigError, true, undefined, source);
      set((state) => ({
        targetConfigError,
        targetConfigDraft,
        targetConfigRevision: state.targetConfigRevision + 1,
      }));
    },
    clearTargetConfigValidation: (expectedSerializedTarget, incrementRevision = true) => {
      if (!persistTargetConfigClear(true, undefined, expectedSerializedTarget)) {
        const state = get();
        const targetConfigError = state.targetConfigError ?? 'Invalid JSON configuration';
        let targetConfigDraft = state.targetConfigDraft;
        if (targetConfigDraft === null && expectedSerializedTarget) {
          try {
            const expectedTarget = JSON.parse(expectedSerializedTarget) as { config?: unknown };
            targetConfigDraft = JSON.stringify(expectedTarget.config, null, 2) ?? 'null';
          } catch {
            targetConfigDraft = expectedSerializedTarget;
          }
        }
        persistTargetConfigDraftError(
          targetConfigError,
          true,
          currentTargetConfigInvalidMarker ?? undefined,
        );
        set({ targetConfigError, targetConfigDraft });
        return false;
      }
      set((state) => ({
        targetConfigError: null,
        targetConfigDraft: null,
        targetConfigRevision: state.targetConfigRevision + (incrementRevision ? 1 : 0),
      }));
      return true;
    },
    reassertTargetConfigValidation: () => {
      const { targetConfigError } = get();
      if (!targetConfigError || reconcilingTargetConfig) {
        return;
      }
      if (!hasDurableTargetConfigMarker()) {
        persistTargetConfigDraftError(targetConfigError, true, currentTargetConfigInvalidMarker);
        return;
      }
      if (
        !isTargetConfigDraftIsolated() &&
        currentTargetConfigInvalidMarker &&
        !getTargetConfigErrorFromMarker(getTargetConfigCookieMarker())
      ) {
        try {
          document.cookie = `${TARGET_CONFIG_VALIDATION_STORAGE_KEY}=${currentTargetConfigInvalidMarker}; Max-Age=${TARGET_CONFIG_VALIDATION_COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
        } catch {}
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
    token === 'legacy' ||
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
  if (
    !reconciled ||
    getTargetConfigMarkerToken(currentTargetConfigInvalidMarker) !== currentToken
  ) {
    return false;
  }

  if (!persistTargetConfigClear(false, `invalid-json:${token}`, snapshot.serialized)) {
    const state = useRedTeamTargetConfigValidation.getState();
    const targetConfigError = state.targetConfigError ?? 'Invalid JSON configuration';
    let targetConfigDraft = state.targetConfigDraft;
    if (targetConfigDraft === null) {
      try {
        targetConfigDraft = JSON.stringify(snapshot.config.target?.config, null, 2) ?? 'null';
      } catch {
        targetConfigDraft = snapshot.serialized;
      }
    }
    persistTargetConfigError(
      targetConfigError,
      false,
      currentTargetConfigInvalidMarker ?? undefined,
    );
    useRedTeamTargetConfigValidation.setState({ targetConfigError, targetConfigDraft });
    return false;
  }
  useRedTeamTargetConfigValidation.setState((state) => ({
    targetConfigError: null,
    targetConfigDraft: null,
    targetConfigRevision: state.targetConfigRevision + 1,
  }));
  return true;
};

const preserveIndependentTargetConfigDraft = (incomingMarker: string | null): boolean => {
  const incomingToken = getTargetConfigMarkerToken(incomingMarker);
  const activeToken = getTargetConfigMarkerToken(currentTargetConfigInvalidMarker);
  const { targetConfigError, targetConfigDraft } = useRedTeamTargetConfigValidation.getState();
  if (
    !targetConfigError ||
    targetConfigDraft === null ||
    !incomingToken ||
    !activeToken ||
    incomingToken === activeToken
  ) {
    return false;
  }

  persistTargetConfigErrorInSession(targetConfigError, currentTargetConfigInvalidMarker, true);
  return true;
};

const persistTargetConfigErrorFromRemoteEvent = (error: string, existingMarker?: string | null) => {
  if (
    isTargetConfigDraftIsolated() &&
    persistTargetConfigErrorInSession(error, existingMarker, true)
  ) {
    return;
  }
  persistTargetConfigError(error, false, existingMarker);
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
      const reconciled =
        getCurrentClearMessage() === event.newValue && reconcileTargetConfigClear(event.newValue);
      const { targetConfigError } = useRedTeamTargetConfigValidation.getState();
      if (!reconciled && targetConfigError) {
        persistTargetConfigErrorFromRemoteEvent(
          targetConfigError,
          currentTargetConfigInvalidMarker,
        );
      }
      return;
    }

    if (preserveIndependentTargetConfigDraft(event.newValue)) {
      return;
    }

    const currentClearMessage = getCurrentClearMessage();
    if (currentClearMessage) {
      const targetConfigError = getTargetConfigErrorFromMarker(event.newValue);
      const invalidToken = getTargetConfigMarkerToken(event.newValue);
      const activeInvalidToken = getTargetConfigMarkerToken(currentTargetConfigInvalidMarker);
      if (
        targetConfigError &&
        invalidToken === getClearToken(currentClearMessage) &&
        activeInvalidToken &&
        activeInvalidToken !== invalidToken &&
        hasStoredTargetConfigInvalidToken(activeInvalidToken)
      ) {
        const { targetConfigError: activeTargetConfigError } =
          useRedTeamTargetConfigValidation.getState();
        if (activeTargetConfigError) {
          persistTargetConfigErrorFromRemoteEvent(
            activeTargetConfigError,
            currentTargetConfigInvalidMarker,
          );
        }
        return;
      }
      if (
        targetConfigError &&
        (invalidToken === 'legacy' || invalidToken !== getClearToken(currentClearMessage))
      ) {
        currentTargetConfigInvalidMarker = event.newValue;
        useRedTeamTargetConfigValidation.setState({ targetConfigError });
        persistTargetConfigError(targetConfigError, false, event.newValue);
        return;
      }
      if (
        targetConfigError &&
        getTargetConfigMarkerToken(event.newValue) === getClearToken(currentClearMessage)
      ) {
        currentTargetConfigInvalidMarker = event.newValue;
        useRedTeamTargetConfigValidation.setState({ targetConfigError });
      }
      const reconciled = reconcileTargetConfigClear(currentClearMessage);
      if (!reconciled) {
        const { targetConfigError: activeTargetConfigError } =
          useRedTeamTargetConfigValidation.getState();
        if (activeTargetConfigError) {
          persistTargetConfigErrorFromRemoteEvent(
            activeTargetConfigError,
            currentTargetConfigInvalidMarker,
          );
        }
      }
      return;
    }

    if (!event.newValue) {
      const { targetConfigError } = useRedTeamTargetConfigValidation.getState();
      if (targetConfigError) {
        persistTargetConfigErrorFromRemoteEvent(
          targetConfigError,
          currentTargetConfigInvalidMarker,
        );
      }
      return;
    }

    const targetConfigError = getTargetConfigErrorFromMarker(event.newValue);
    if (targetConfigError) {
      currentTargetConfigInvalidMarker = event.newValue;
      useRedTeamTargetConfigValidation.setState({ targetConfigError });
      persistTargetConfigError(targetConfigError, false, event.newValue);
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
        const reconciled = reconcileTargetConfigClear(event.data);
        const { targetConfigError } = useRedTeamTargetConfigValidation.getState();
        if (!reconciled && targetConfigError) {
          persistTargetConfigErrorFromRemoteEvent(
            targetConfigError,
            currentTargetConfigInvalidMarker,
          );
        }
        return;
      }

      const targetConfigError = getTargetConfigErrorFromMarker(event.data);
      if (targetConfigError) {
        if (preserveIndependentTargetConfigDraft(event.data)) {
          return;
        }
        const token = getTargetConfigMarkerToken(event.data);
        const currentClearMessage = getCurrentClearMessage();
        if (
          token !== 'legacy' &&
          currentClearMessage &&
          token === getClearToken(currentClearMessage)
        ) {
          const activeInvalidToken = getTargetConfigMarkerToken(currentTargetConfigInvalidMarker);
          if (
            activeInvalidToken &&
            activeInvalidToken !== token &&
            hasStoredTargetConfigInvalidToken(activeInvalidToken)
          ) {
            const { targetConfigError: activeTargetConfigError } =
              useRedTeamTargetConfigValidation.getState();
            if (activeTargetConfigError) {
              persistTargetConfigErrorFromRemoteEvent(
                activeTargetConfigError,
                currentTargetConfigInvalidMarker,
              );
            }
            return;
          }
          const reconciled = reconcileTargetConfigClear(currentClearMessage);
          if (reconciled) {
            return;
          }
          currentTargetConfigInvalidMarker = event.data;
        }
        useRedTeamTargetConfigValidation.setState({ targetConfigError });
        persistTargetConfigError(targetConfigError, false, event.data);
      }
    });
    targetConfigWindow.__promptfooTargetConfigValidationChannel = targetConfigValidationChannel;
  } catch {}
}
