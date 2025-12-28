import React, { useCallback, useState } from 'react';

import { CheckboxWithLabel } from '@app/components/ui/checkbox';
import { Separator } from '@app/components/ui/separator';
import { SliderWithLabel } from '@app/components/ui/slider';
import { TooltipProvider } from '@app/components/ui/tooltip';
import { useResultsViewSettingsStore } from '../../store';

const SectionHeader = ({ children }: { children: React.ReactNode }) => {
  return (
    <span className="block text-[0.6875rem] font-semibold tracking-[0.1em] text-muted-foreground/60 mb-2 uppercase">
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

  return (
    <TooltipProvider>
      <div className="grid grid-cols-[1fr_1px_1fr] gap-5 p-5 pt-3">
        {/* Left Column - Visibility */}
        <div>
          <SectionHeader>Show</SectionHeader>

          <CheckboxWithLabel
            label="Sticky header"
            checked={stickyHeader}
            onChange={setStickyHeader}
            tooltipText="Keep the header fixed when scrolling"
          />

          <CheckboxWithLabel
            label="Pass/fail indicators"
            checked={showPassFail}
            onChange={setShowPassFail}
            tooltipText="Show success/failure status for each test"
          />

          <CheckboxWithLabel
            label="Pass reasons"
            checked={showPassReasons}
            onChange={setShowPassReasons}
            tooltipText="Show reasons for passing assertions (e.g., from llm-rubric)"
            disabled={!showPassFail}
          />

          <CheckboxWithLabel
            label="Inference details"
            checked={showInferenceDetails}
            onChange={setShowInferenceDetails}
            tooltipText="Show latency, tokens, cost, etc."
          />

          <CheckboxWithLabel
            label="Full prompts"
            checked={showPrompts}
            onChange={setShowPrompts}
            tooltipText="Show the prompt that produced each output"
          />
        </div>

        {/* Subtle Divider */}
        <Separator orientation="vertical" className="bg-border/10 my-1" />

        {/* Right Column - Formatting */}
        <div>
          <SectionHeader>Display</SectionHeader>

          <CheckboxWithLabel
            label="Render Markdown"
            checked={renderMarkdown}
            onChange={setRenderMarkdown}
            tooltipText="Format outputs using Markdown"
          />

          <CheckboxWithLabel
            label="Prettify JSON"
            checked={prettifyJson}
            onChange={setPrettifyJson}
            tooltipText="Format JSON with indentation"
          />

          <CheckboxWithLabel
            label="Force line breaks"
            checked={wordBreak === 'break-all'}
            onChange={(checked) => setWordBreak(checked ? 'break-all' : 'break-word')}
            tooltipText="Break lines at any character for narrower columns"
          />

          <div className="mt-3 space-y-3">
            <SliderWithLabel
              label="Max text length"
              value={localMaxTextLength}
              onValueChange={handleTextLengthChange}
              onValueCommit={handleTextLengthCommitted}
              min={25}
              max={1001}
              tooltipText="Characters before truncating"
              formatValue={(v) => (v >= 1001 ? 'Unlimited' : String(v))}
              size="sm"
            />

            <SliderWithLabel
              label="Max image width"
              value={maxImageWidth}
              onValueChange={setMaxImageWidth}
              min={100}
              max={1000}
              tooltipText="Maximum image width in pixels"
              formatValue={(v) => `${v} px`}
              size="sm"
            />

            <SliderWithLabel
              label="Max image height"
              value={maxImageHeight}
              onValueChange={setMaxImageHeight}
              min={100}
              max={1000}
              tooltipText="Maximum image height in pixels"
              formatValue={(v) => `${v} px`}
              size="sm"
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default React.memo(SettingsPanel);
