import React, { useCallback, useState } from 'react';

import { useResultsViewSettingsStore } from '../../store';
import CompactSlider from './CompactSlider';
import CompactToggle from './CompactToggle';

const SectionHeader = ({ children }: { children: React.ReactNode }) => {
  return (
    <span className="block text-[0.6875rem] font-semibold tracking-widest text-muted-foreground/60 mb-2 uppercase">
      {children}
    </span>
  );
};

const SettingsPanel = () => {
  const {
    stickyHeader,
    setStickyHeader,
    showPrompts,
    setShowPrompts,
    showPassFail,
    setShowPassFail,
    showPassReasons,
    setShowPassReasons,
    showInferenceDetails,
    setShowInferenceDetails,
    maxTextLength,
    setMaxTextLength,
    renderMarkdown,
    setRenderMarkdown,
    prettifyJson,
    setPrettifyJson,
    maxImageWidth,
    setMaxImageWidth,
    maxImageHeight,
    setMaxImageHeight,
    wordBreak,
    setWordBreak,
  } = useResultsViewSettingsStore();

  // Local state for text length slider
  const sanitizedMaxTextLength =
    maxTextLength === Number.POSITIVE_INFINITY
      ? Number.POSITIVE_INFINITY
      : Number.isFinite(maxTextLength) && maxTextLength >= 25
        ? maxTextLength
        : 500;
  const [localMaxTextLength, setLocalMaxTextLength] = useState(
    sanitizedMaxTextLength === Number.POSITIVE_INFINITY ? 1001 : sanitizedMaxTextLength,
  );

  const handleTextLengthChange = useCallback((value: number) => {
    setLocalMaxTextLength(value);
  }, []);

  const handleTextLengthCommitted = useCallback(
    (value: number) => {
      const newValue = value === 1001 ? Number.POSITIVE_INFINITY : value;
      setMaxTextLength(newValue);
    },
    [setMaxTextLength],
  );

  const handleWordBreakChange = useCallback(
    (checked: boolean) => {
      setWordBreak(checked ? 'break-all' : 'break-word');
    },
    [setWordBreak],
  );

  return (
    <div className="grid grid-cols-[1fr_1px_1fr] gap-5 p-5 pt-3">
      {/* Left Column - Visibility */}
      <div>
        <SectionHeader>Show</SectionHeader>

        <CompactToggle
          label="Sticky header"
          checked={stickyHeader}
          onChange={setStickyHeader}
          tooltipText="Keep the header fixed when scrolling"
        />

        <CompactToggle
          label="Pass/fail indicators"
          checked={showPassFail}
          onChange={setShowPassFail}
          tooltipText="Show success/failure status for each test"
        />

        <CompactToggle
          label="Pass reasons"
          checked={showPassReasons}
          onChange={setShowPassReasons}
          tooltipText="Show reasons for passing assertions (e.g., from llm-rubric)"
          disabled={!showPassFail}
        />

        <CompactToggle
          label="Inference details"
          checked={showInferenceDetails}
          onChange={setShowInferenceDetails}
          tooltipText="Show latency, tokens, cost, etc."
        />

        <CompactToggle
          label="Full prompts"
          checked={showPrompts}
          onChange={setShowPrompts}
          tooltipText="Show the prompt that produced each output"
        />
      </div>

      {/* Subtle Divider */}
      <div className="bg-border/10 my-1" />

      {/* Right Column - Formatting */}
      <div>
        <SectionHeader>Display</SectionHeader>

        <CompactToggle
          label="Render Markdown"
          checked={renderMarkdown}
          onChange={setRenderMarkdown}
          tooltipText="Format outputs using Markdown"
        />

        <CompactToggle
          label="Prettify JSON"
          checked={prettifyJson}
          onChange={setPrettifyJson}
          tooltipText="Format JSON with indentation"
        />

        <CompactToggle
          label="Force line breaks"
          checked={wordBreak === 'break-all'}
          onChange={handleWordBreakChange}
          tooltipText="Break lines at any character for narrower columns"
        />

        <div className="mt-3">
          <CompactSlider
            label="Max text length"
            value={localMaxTextLength}
            onChange={handleTextLengthChange}
            onChangeCommitted={handleTextLengthCommitted}
            min={25}
            max={1001}
            tooltipText="Characters before truncating"
            unlimited
          />

          <CompactSlider
            label="Max image width"
            value={maxImageWidth}
            onChange={setMaxImageWidth}
            min={100}
            max={1000}
            unit="px"
            tooltipText="Maximum image width in pixels"
          />

          <CompactSlider
            label="Max image height"
            value={maxImageHeight}
            onChange={setMaxImageHeight}
            min={100}
            max={1000}
            unit="px"
            tooltipText="Maximum image height in pixels"
          />
        </div>
      </div>
    </div>
  );
};

export default React.memo(SettingsPanel);
