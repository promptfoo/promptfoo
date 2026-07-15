import { create } from 'zustand';

const TARGET_CONFIG_VALIDATION_STORAGE_KEY = 'redTeamTargetConfigValidation';
let targetConfigValidationChannel: BroadcastChannel | null = null;

const getTargetConfigErrorFromMarker = (marker: string | null): string | null => {
  if (marker === 'non-object-json') {
    return 'Configuration must be a JSON object';
  }
  return marker === 'invalid-json' ? 'Invalid JSON configuration' : null;
};

const getStoredTargetConfigError = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  let marker: string | null = null;
  try {
    marker = window.localStorage.getItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY);
  } catch {}
  if (!marker) {
    try {
      marker = window.sessionStorage.getItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY);
    } catch {}
  }

  return getTargetConfigErrorFromMarker(marker);
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
    return;
  }

  const marker =
    error === 'Configuration must be a JSON object' ? 'non-object-json' : 'invalid-json';
  let persistedLocally = false;
  try {
    window.localStorage.setItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY, marker);
    persistedLocally = true;
  } catch {}
  if (!persistedLocally) {
    try {
      window.sessionStorage.setItem(TARGET_CONFIG_VALIDATION_STORAGE_KEY, marker);
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
    if (event.key !== TARGET_CONFIG_VALIDATION_STORAGE_KEY || !event.newValue) {
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

      const targetConfigError = getTargetConfigErrorFromMarker(event.data);
      if (targetConfigError) {
        useRedTeamTargetConfigValidation.setState({ targetConfigError });
        persistTargetConfigError(targetConfigError, false);
      }
    });
    targetConfigWindow.__promptfooTargetConfigValidationChannel = targetConfigValidationChannel;
  } catch {}
}
