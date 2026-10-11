import { useCallback } from 'react';

import { useResultsViewSettingsStore } from '../../store';

export const useSettingsState = () => {
  const {
    setMaxTextLength,
    setWordBreak,
    setShowInferenceDetails,
    setRenderMarkdown,
    setPrettifyJson,
    setShowPrompts,
    setShowPassFail,
    setShowPassReasons,
    setShowMetricPills,
    setStickyHeader,
    setMaxImageWidth,
    setMaxImageHeight,
  } = useResultsViewSettingsStore();

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
    setMaxTextLength(500);
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
    setMaxTextLength,
    setMaxImageWidth,
    setMaxImageHeight,
  ]);

  return { resetToDefaults };
};
