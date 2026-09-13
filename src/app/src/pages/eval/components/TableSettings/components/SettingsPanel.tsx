import React, { useCallback, useState } from 'react';

import { Select, SelectContent, SelectItem, SelectTrigger } from '@app/components/ui/select';
import { useResultsViewSettingsStore } from '../../store';
import CompactSlider from './CompactSlider';
import CompactToggle from './CompactToggle';

interface SettingsPanelProps {
  resultsTableZoom: number;
  onResultsTableZoomChange: (zoom: number) => void;
}

const RESULTS_TABLE_ZOOM_OPTIONS = [
  { value: '0.5', label: '50%' },
  { value: '0.75', label: '75%' },
  { value: '0.9', label: '90%' },
  { value: '1', label: '100%' },
  { value: '1.25', label: '125%' },
  { value: '1.5', label: '150%' },
  { value: '2', label: '200%' },
] as const;
const DEFAULT_MAX_TEXT_LENGTH = 500;
// Slider values are finite-only, so this sentinel represents "unlimited"
// and maps to Number.POSITIVE_INFINITY in settings state.
const INFINITY_SLIDER_VALUE = 1001;

function sanitizeMaxTextLength(value: number) {
  if (value === Number.POSITIVE_INFINITY) {
    return Number.POSITIVE_INFINITY;
  }

  if (Number.isFinite(value) && value >= 25) {
    return value;
  }

  return DEFAULT_MAX_TEXT_LENGTH;
}

const SectionHeader = ({ children }: { children: React.ReactNode }) => {
  return (
    <span className="block text-[0.6875rem] font-semibold tracking-widest text-muted-foreground/60 mb-2 uppercase">
      {children}
    </span>
  );
};

const SettingsPanel = ({ resultsTableZoom, onResultsTableZoomChange }: SettingsPanelProps) => {
  const {
    stickyHeader,
    setStickyHeader,
    showPrompts,
    setShowPrompts,
    showPassFail,
    setShowPassFail,
    showPassReasons,
    setShowPassReasons,
    showMetricPills,
    setShowMetricPills,
    showInferenceDetails,
    setShowInferenceDetails,
    costDisplayUnit,
    setCostDisplayUnit,
    showRunsPerCostUnit,
    setShowRunsPerCostUnit,
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
  const sanitizedMaxTextLength = sanitizeMaxTextLength(maxTextLength);
  const [localMaxTextLength, setLocalMaxTextLength] = useState(
    sanitizedMaxTextLength === Number.POSITIVE_INFINITY
      ? INFINITY_SLIDER_VALUE
      : sanitizedMaxTextLength,
  );

  const handleTextLengthChange = useCallback((value: number) => {
    setLocalMaxTextLength(value);
  }, []);

  const handleTextLengthCommitted = useCallback(
    (value: number) => {
      const newValue = value === INFINITY_SLIDER_VALUE ? Number.POSITIVE_INFINITY : value;
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

  const handleResultsTableZoomChange = useCallback(
    (value: string) => {
      onResultsTableZoomChange(Number(value));
    },
    [onResultsTableZoomChange],
  );

  return (
    <div className="grid grid-cols-1 gap-5 p-5 pt-3 sm:grid-cols-[1fr_1px_1fr]">
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
          label="Metrics pills"
          checked={showMetricPills}
          onChange={setShowMetricPills}
          tooltipText="Show custom metric pills in each results table cell"
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
      <div className="hidden bg-border/10 sm:my-1 sm:block" />

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
          label="Cost in cents"
          checked={costDisplayUnit === 'cents'}
          onChange={(checked) => setCostDisplayUnit(checked ? 'cents' : 'dollars')}
          tooltipText="Change cost display units without changing stored costs"
        />

        <CompactToggle
          label="Runs per cost unit"
          checked={showRunsPerCostUnit}
          onChange={setShowRunsPerCostUnit}
          tooltipText="Show runs per $1 or 1 cent with cost details"
        />

        <CompactToggle
          label="Force line breaks"
          checked={wordBreak === 'break-all'}
          onChange={handleWordBreakChange}
          tooltipText="Break lines at any character for narrower columns"
        />

        <div className="mt-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-[0.8125rem] leading-normal">Zoom</span>
            <Select value={String(resultsTableZoom)} onValueChange={handleResultsTableZoomChange}>
              <SelectTrigger aria-label="Results zoom" className="h-8 w-[110px] text-xs">
                {Math.round(resultsTableZoom * 100)}%
              </SelectTrigger>
              <SelectContent>
                {RESULTS_TABLE_ZOOM_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <CompactSlider
            label="Max text length"
            value={localMaxTextLength}
            onChange={handleTextLengthChange}
            onChangeCommitted={handleTextLengthCommitted}
            min={25}
            max={INFINITY_SLIDER_VALUE}
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
