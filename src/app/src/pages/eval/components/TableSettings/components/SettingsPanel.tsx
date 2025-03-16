import React, { useState, useCallback } from 'react';
import CodeIcon from '@mui/icons-material/Code';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import ImageIcon from '@mui/icons-material/Image';
import SpeedIcon from '@mui/icons-material/Speed';
import TableRowsIcon from '@mui/icons-material/TableRows';
import TextFormatIcon from '@mui/icons-material/TextFormat';
import ViewListIcon from '@mui/icons-material/ViewList';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { Box, alpha } from '@mui/material';
import { useStore as useResultsViewStore } from '../../store';
import { tokens } from '../tokens';
import EnhancedRangeSlider from './EnhancedRangeSlider';
import SettingItem from './SettingItem';
import SettingsSection from './SettingsSection';

const SettingsPanel: React.FC = () => {
  const {
    stickyHeader,
    setStickyHeader,
    showPrompts,
    setShowPrompts,
    showPassFail,
    setShowPassFail,
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
  } = useResultsViewStore();

  // Local state for slider
  const [localMaxTextLength, setLocalMaxTextLength] = useState(
    maxTextLength === Number.POSITIVE_INFINITY ? 1001 : maxTextLength,
  );

  // Handle slider changes
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

  return (
    <Box
      sx={{
        py: tokens.spacing.padding.compact,
        px: tokens.spacing.padding.item,
        height: '100%',
        overflowY: 'auto',
        '&::-webkit-scrollbar': {
          width: '6px',
        },
        '&::-webkit-scrollbar-thumb': {
          backgroundColor: (theme) => alpha(theme.palette.text.secondary, 0.2),
          borderRadius: '10px',
        },
        '&::-webkit-scrollbar-thumb:hover': {
          backgroundColor: (theme) => alpha(theme.palette.text.secondary, 0.3),
        },
      }}
    >
      {/* Layout Section */}
      <SettingsSection
        title="Layout Options"
        icon={<TableRowsIcon />}
        description="Control how the table is displayed and organized"
      >
        <Box sx={{ my: tokens.spacing.margin.element / 2 }}>
          <SettingItem
            label="Sticky header"
            checked={stickyHeader}
            onChange={setStickyHeader}
            icon={<ViewListIcon fontSize="small" />}
            tooltipText="Keep the header at the top of the screen when scrolling through the table"
          />
        </Box>
      </SettingsSection>

      {/* Content Formatting Section */}
      <SettingsSection
        title="Content Formatting"
        icon={<TextFormatIcon />}
        description="Control how text and data are formatted"
      >
        <Box sx={{ my: tokens.spacing.margin.element / 2 }}>
          <SettingItem
            label="Render Markdown content"
            checked={renderMarkdown}
            onChange={setRenderMarkdown}
            icon={<TextFormatIcon fontSize="small" />}
            tooltipText="Format model outputs using Markdown rendering"
          />

          <SettingItem
            label="Prettify JSON outputs"
            checked={prettifyJson}
            onChange={setPrettifyJson}
            icon={<CodeIcon fontSize="small" />}
            tooltipText="Format JSON outputs with proper indentation and syntax highlighting"
          />
        </Box>
      </SettingsSection>

      {/* Text Display Section */}
      <SettingsSection
        title="Text Display"
        icon={<FormatAlignLeftIcon />}
        description="Control text length and appearance"
      >
        <Box sx={{ my: tokens.spacing.margin.element / 2 }}>
          <SettingItem
            label="Force line breaks"
            checked={wordBreak === 'break-all'}
            onChange={(checked: boolean) => setWordBreak(checked ? 'break-all' : 'break-word')}
            icon={<FormatAlignLeftIcon fontSize="small" />}
            tooltipText="Force lines to break at any character, making it easier to adjust column widths"
          />

          <EnhancedRangeSlider
            value={localMaxTextLength}
            onChange={handleSliderChange}
            onChangeCommitted={handleSliderChangeCommitted}
            min={25}
            max={1001}
            label="Maximum text length"
            tooltipText="Maximum number of characters to display before truncating. 'Unlimited' means show all text."
            unlimited
            icon={<FormatAlignLeftIcon fontSize="small" />}
          />
        </Box>
      </SettingsSection>

      {/* Element Visibility Section */}
      <SettingsSection
        title="Element Visibility"
        icon={<VisibilityIcon />}
        description="Control what content appears in each table cell"
      >
        <Box sx={{ my: tokens.spacing.margin.element / 2 }}>
          <SettingItem
            label="Show full prompts in output cells"
            checked={showPrompts}
            onChange={setShowPrompts}
            tooltipText="Display the final prompt that produced each output in its cell"
          />

          <SettingItem
            label="Show pass/fail indicators"
            checked={showPassFail}
            onChange={setShowPassFail}
            icon={<DoneAllIcon fontSize="small" />}
            tooltipText="Display success/failure status indicators for each test result"
          />

          <SettingItem
            label="Show inference details"
            checked={showInferenceDetails}
            onChange={setShowInferenceDetails}
            icon={<SpeedIcon fontSize="small" />}
            tooltipText="Display detailed inference statistics such as latency, tokens used, cost, etc."
          />
        </Box>
      </SettingsSection>

      {/* Image Settings Section */}
      <SettingsSection
        title="Image Settings"
        icon={<ImageIcon />}
        description="Control how images are displayed in the table"
      >
        <Box sx={{ my: tokens.spacing.margin.element / 2 }}>
          <EnhancedRangeSlider
            value={maxImageWidth}
            onChange={setMaxImageWidth}
            min={100}
            max={1000}
            label="Maximum image width"
            unit="px"
            tooltipText="Maximum width for displayed images in pixels"
            icon={<ImageIcon fontSize="small" />}
          />

          <EnhancedRangeSlider
            value={maxImageHeight}
            onChange={setMaxImageHeight}
            min={100}
            max={1000}
            label="Maximum image height"
            unit="px"
            tooltipText="Maximum height for displayed images in pixels"
            icon={<ImageIcon fontSize="small" />}
          />
        </Box>
      </SettingsSection>
    </Box>
  );
};

export default React.memo(SettingsPanel);
