import React, { useState, useCallback } from 'react';
import { Box, Fade, alpha } from '@mui/material';
import { SettingsSection, SettingItem, EnhancedRangeSlider } from '..';
import { useStore as useResultsViewStore } from '../../store';
import TextFormatIcon from '@mui/icons-material/TextFormat';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import CodeIcon from '@mui/icons-material/Code';
import ImageIcon from '@mui/icons-material/Image';
import { tokens } from '../../tokens';

interface ContentMediaTabPanelProps {
  id: string;
}

const ContentMediaTabPanel: React.FC<ContentMediaTabPanelProps> = ({ id }) => {
  const {
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
    <Fade in timeout={tokens.animation.medium}>
      <Box 
        role="tabpanel" 
        id={id} 
        aria-labelledby={`tab-${id}`}
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
              onChange={(checked) => setWordBreak(checked ? 'break-all' : 'break-word')}
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

        {/* Image Settings Section */}
        <SettingsSection
          title="Image Settings"
          icon={<ImageIcon />}
          description="Control how images are displayed in the table"
        >
          <Box sx={{ my: tokens.spacing.margin.element / 2 }}>
            {/* Image Width Setting */}
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

            {/* Image Height Setting */}
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
    </Fade>
  );
};

export default React.memo(ContentMediaTabPanel); 