import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import type React from 'react';
import type { TableState } from '../../store';
import { useStore as useResultsViewStore } from '../../store';
import { DEFAULT_TABLE_SETTINGS, type TableSettings } from '../constants';

/**
 * Subset of TableState properties that are tracked for changes
 */
export type SettingsState = TableSettings;

/**
 * Interface defining the return type of the useSettingsState hook
 */
export interface UseSettingsStateReturn {
  /** The store object with all settings */
  store: TableState;
  /** The local version of max text length (for UI state) */
  localMaxTextLength: number;
  /** Function to update local max text length */
  setLocalMaxTextLength: React.Dispatch<React.SetStateAction<number>>;
  /** Whether settings have been changed from their initial values */
  hasChanges: boolean;
  /** Function to reset all settings to their default values */
  resetToDefaults: () => void;
  /** Handler for slider change events */
  handleSliderChange: (value: number) => void;
  /** Handler for slider change committed events */
  handleSliderChangeCommitted: (value: number) => void;
}

export const useSettingsState = (isOpen: boolean): UseSettingsStateReturn => {
  const store = useResultsViewStore();
  const {
    maxTextLength,
    setMaxTextLength,
    wordBreak,
    setWordBreak,
    showInferenceDetails,
    setShowInferenceDetails,
    renderMarkdown,
    setRenderMarkdown,
    prettifyJson,
    setPrettifyJson,
    showPrompts,
    setShowPrompts,
    showPassFail,
    setShowPassFail,
    stickyHeader,
    setStickyHeader,
    maxImageWidth,
    setMaxImageWidth,
    maxImageHeight,
    setMaxImageHeight,
  } = store;

  const [localMaxTextLength, setLocalMaxTextLength] = useState(
    maxTextLength === Number.POSITIVE_INFINITY ? 1001 : maxTextLength,
  );

  const initialStateRef = useRef<SettingsState>({
    maxTextLength,
    wordBreak,
    showInferenceDetails,
    renderMarkdown,
    prettifyJson,
    showPrompts,
    showPassFail,
    stickyHeader,
    maxImageWidth,
    maxImageHeight,
  });

  useEffect(() => {
    if (isOpen) {
      // Update initialStateRef with the current settings from the store
      const currentSettings: SettingsState = {
        maxTextLength,
        wordBreak,
        showInferenceDetails,
        renderMarkdown,
        prettifyJson,
        showPrompts,
        showPassFail,
        stickyHeader,
        maxImageWidth,
        maxImageHeight,
      };
      
      initialStateRef.current = currentSettings;
    }
  }, [
    isOpen,
    maxTextLength,
    wordBreak,
    showInferenceDetails,
    renderMarkdown,
    prettifyJson,
    showPrompts,
    showPassFail,
    stickyHeader,
    maxImageWidth,
    maxImageHeight,
  ]);

  const hasChanges = useMemo(() => {
    const initialState = initialStateRef.current;
    
    // Using type-safe keys to check for changes
    const settingsToCheck: Array<keyof SettingsState> = [
      'maxTextLength',
      'wordBreak',
      'showInferenceDetails',
      'renderMarkdown',
      'prettifyJson',
      'showPrompts',
      'showPassFail',
      'stickyHeader',
      'maxImageWidth',
      'maxImageHeight',
    ];
    
    // Check if any setting has changed from its initial value
    return settingsToCheck.some(key => {
      const initialValue = initialState[key];
      const currentValue = store[key];
      return initialValue !== currentValue;
    });
  }, [
    maxTextLength,
    wordBreak,
    showInferenceDetails,
    renderMarkdown,
    prettifyJson,
    showPrompts,
    showPassFail,
    stickyHeader,
    maxImageWidth,
    maxImageHeight,
    store,
  ]);

  const handleSliderChange = useCallback((value: number) => {
    setLocalMaxTextLength(value);
  }, []);

  const handleSliderChangeCommitted = useCallback(
    (value: number) => {
      const newValue = value === 1001 ? Number.POSITIVE_INFINITY : value;
      setMaxTextLength(newValue);
    },
    [setMaxTextLength],
  );

  const resetToDefaults = useCallback(() => {
    // Apply defaults to both store and local state
    setStickyHeader(DEFAULT_TABLE_SETTINGS.stickyHeader);
    setWordBreak(DEFAULT_TABLE_SETTINGS.wordBreak);
    setRenderMarkdown(DEFAULT_TABLE_SETTINGS.renderMarkdown);
    setPrettifyJson(DEFAULT_TABLE_SETTINGS.prettifyJson);
    setShowPrompts(DEFAULT_TABLE_SETTINGS.showPrompts);
    setShowPassFail(DEFAULT_TABLE_SETTINGS.showPassFail);
    setShowInferenceDetails(DEFAULT_TABLE_SETTINGS.showInferenceDetails);
    setMaxTextLength(DEFAULT_TABLE_SETTINGS.maxTextLength);
    setLocalMaxTextLength(DEFAULT_TABLE_SETTINGS.maxTextLength);
    setMaxImageWidth(DEFAULT_TABLE_SETTINGS.maxImageWidth);
    setMaxImageHeight(DEFAULT_TABLE_SETTINGS.maxImageHeight);
  }, [
    setStickyHeader,
    setWordBreak,
    setRenderMarkdown,
    setPrettifyJson,
    setShowPrompts,
    setShowPassFail,
    setShowInferenceDetails,
    setMaxTextLength,
    setLocalMaxTextLength,
    setMaxImageWidth,
    setMaxImageHeight,
  ]);

  return {
    store,
    localMaxTextLength,
    setLocalMaxTextLength,
    hasChanges,
    resetToDefaults,
    handleSliderChange,
    handleSliderChangeCommitted,
  };
};
