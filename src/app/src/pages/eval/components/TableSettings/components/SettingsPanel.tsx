import React, { useCallback, useState } from 'react';

import Box from '@mui/material/Box';
import { alpha, useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { useResultsViewSettingsStore } from '../../store';
import CompactSlider from './CompactSlider';
import CompactToggle from './CompactToggle';

const SectionHeader = ({ children }: { children: React.ReactNode }) => {
  const theme = useTheme();
  return (
    <Typography
      variant="overline"
      sx={{
        display: 'block',
        fontSize: '0.6875rem',
        fontWeight: 600,
        letterSpacing: '0.1em',
        color: alpha(theme.palette.text.secondary, 0.6),
        mb: 1,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </Typography>
  );
};

const SettingsPanel = () => {
  const theme = useTheme();
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
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '1fr 1px 1fr',
        gap: 2.5,
        p: 2.5,
        pt: 1.5,
      }}
    >
      {/* Left Column - Visibility */}
      <Box>
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
      </Box>

      {/* Subtle Divider */}
      <Box
        sx={{
          backgroundColor: alpha(theme.palette.divider, 0.1),
          my: 0.5,
        }}
      />

      {/* Right Column - Formatting */}
      <Box>
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
          onChange={(checked) => setWordBreak(checked ? 'break-all' : 'break-word')}
          tooltipText="Break lines at any character for narrower columns"
        />

        <Box sx={{ mt: 1.5 }}>
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
        </Box>
      </Box>
    </Box>
  );
};

export default React.memo(SettingsPanel);
