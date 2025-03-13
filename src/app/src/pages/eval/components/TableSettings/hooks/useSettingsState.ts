import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useStore as useResultsViewStore } from '../../store';

export interface SettingsState {
  maxTextLength: number;
  wordBreak: string;
  showInferenceDetails: boolean;
  renderMarkdown: boolean;
  prettifyJson: boolean;
  showPrompts: boolean;
  showPassFail: boolean;
  stickyHeader: boolean;
  maxImageWidth: number;
  maxImageHeight: number;
}

export const useSettingsState = (isOpen: boolean) => {
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
      initialStateRef.current = {
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
    return (
      maxTextLength !== initialState.maxTextLength ||
      wordBreak !== initialState.wordBreak ||
      showInferenceDetails !== initialState.showInferenceDetails ||
      renderMarkdown !== initialState.renderMarkdown ||
      prettifyJson !== initialState.prettifyJson ||
      showPrompts !== initialState.showPrompts ||
      showPassFail !== initialState.showPassFail ||
      stickyHeader !== initialState.stickyHeader ||
      maxImageWidth !== initialState.maxImageWidth ||
      maxImageHeight !== initialState.maxImageHeight
    );
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
    setStickyHeader(true);
    setWordBreak('break-word');
    setRenderMarkdown(true);
    setPrettifyJson(true);
    setShowPrompts(false);
    setShowPassFail(true);
    setShowInferenceDetails(true);
    setMaxTextLength(500);
    setLocalMaxTextLength(500);
    setMaxImageWidth(500);
    setMaxImageHeight(300);
  }, [
    setStickyHeader,
    setWordBreak,
    setRenderMarkdown,
    setPrettifyJson,
    setShowPrompts,
    setShowPassFail,
    setShowInferenceDetails,
    setMaxTextLength,
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
