import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useResultsViewSettingsStore } from '../../store';

interface SettingsState {
  maxTextLength: number;
  wordBreak: string;
  showInferenceDetails: boolean;
  costDisplayUnit: string;
  showRunsPerCostUnit: boolean;
  renderMarkdown: boolean;
  prettifyJson: boolean;
  showPrompts: boolean;
  showPassFail: boolean;
  showPassReasons: boolean;
  showMetricPills: boolean;
  stickyHeader: boolean;
  maxImageWidth: number;
  maxImageHeight: number;
}

export const useSettingsState = (isOpen: boolean) => {
  const store = useResultsViewSettingsStore();
  const {
    maxTextLength,
    setMaxTextLength,
    wordBreak,
    setWordBreak,
    showInferenceDetails,
    setShowInferenceDetails,
    costDisplayUnit,
    setCostDisplayUnit,
    showRunsPerCostUnit,
    setShowRunsPerCostUnit,
    renderMarkdown,
    setRenderMarkdown,
    prettifyJson,
    setPrettifyJson,
    showPrompts,
    setShowPrompts,
    showPassFail,
    setShowPassFail,
    showPassReasons,
    setShowPassReasons,
    showMetricPills,
    setShowMetricPills,
    stickyHeader,
    setStickyHeader,
    maxImageWidth,
    setMaxImageWidth,
    maxImageHeight,
    setMaxImageHeight,
  } = store;

  const sanitizedMaxTextLength =
    maxTextLength === Number.POSITIVE_INFINITY
      ? Number.POSITIVE_INFINITY
      : Number.isFinite(maxTextLength) && maxTextLength >= 25
        ? maxTextLength
        : 500;
  const [localMaxTextLength, setLocalMaxTextLength] = useState(
    sanitizedMaxTextLength === Number.POSITIVE_INFINITY ? 1001 : sanitizedMaxTextLength,
  );

  const initialStateRef = useRef<SettingsState>({
    maxTextLength,
    wordBreak,
    showInferenceDetails,
    costDisplayUnit,
    showRunsPerCostUnit,
    renderMarkdown,
    prettifyJson,
    showPrompts,
    showPassFail,
    showPassReasons,
    showMetricPills,
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
        costDisplayUnit,
        showRunsPerCostUnit,
        renderMarkdown,
        prettifyJson,
        showPrompts,
        showPassFail,
        showPassReasons,
        showMetricPills,
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
    costDisplayUnit,
    showRunsPerCostUnit,
    renderMarkdown,
    prettifyJson,
    showPrompts,
    showPassFail,
    showPassReasons,
    showMetricPills,
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
      costDisplayUnit !== initialState.costDisplayUnit ||
      showRunsPerCostUnit !== initialState.showRunsPerCostUnit ||
      renderMarkdown !== initialState.renderMarkdown ||
      prettifyJson !== initialState.prettifyJson ||
      showPrompts !== initialState.showPrompts ||
      showPassFail !== initialState.showPassFail ||
      showPassReasons !== initialState.showPassReasons ||
      showMetricPills !== initialState.showMetricPills ||
      stickyHeader !== initialState.stickyHeader ||
      maxImageWidth !== initialState.maxImageWidth ||
      maxImageHeight !== initialState.maxImageHeight
    );
  }, [
    maxTextLength,
    wordBreak,
    showInferenceDetails,
    costDisplayUnit,
    showRunsPerCostUnit,
    renderMarkdown,
    prettifyJson,
    showPrompts,
    showPassFail,
    showPassReasons,
    showMetricPills,
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
    setShowPassReasons(false);
    setShowMetricPills(true);
    setShowInferenceDetails(true);
    setCostDisplayUnit('dollars');
    setShowRunsPerCostUnit(false);
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
    setShowPassReasons,
    setShowMetricPills,
    setShowInferenceDetails,
    setCostDisplayUnit,
    setShowRunsPerCostUnit,
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
