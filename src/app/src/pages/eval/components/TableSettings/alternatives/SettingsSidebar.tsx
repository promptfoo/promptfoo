import React, { useState } from 'react';

import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CodeIcon from '@mui/icons-material/Code';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import ImageIcon from '@mui/icons-material/Image';
import RestoreIcon from '@mui/icons-material/Restore';
import SettingsIcon from '@mui/icons-material/Settings';
import SpeedIcon from '@mui/icons-material/Speed';
import TableRowsIcon from '@mui/icons-material/TableRows';
import TextFormatIcon from '@mui/icons-material/TextFormat';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import { alpha, useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { useResultsViewSettingsStore } from '../../store';
import EnhancedRangeSlider from '../components/EnhancedRangeSlider';
import SettingItem from '../components/SettingItem';

interface SettingsSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

const SettingsSection: React.FC<SettingsSectionProps> = ({
  title,
  icon,
  children,
  defaultExpanded = true,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const theme = useTheme();

  return (
    <Box sx={{ mb: 2 }}>
      <Box
        onClick={() => setExpanded(!expanded)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1.5,
          cursor: 'pointer',
          borderRadius: 2,
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: alpha(theme.palette.primary.main, 0.04),
          },
        }}
      >
        <Box sx={{ color: theme.palette.primary.main, display: 'flex' }}>{icon}</Box>
        <Typography variant="body2" fontWeight={500} sx={{ flex: 1 }}>
          {title}
        </Typography>
        <ChevronRightIcon
          sx={{
            transition: 'transform 0.2s ease',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            opacity: 0.5,
          }}
        />
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ pl: 4.5, pr: 1.5, py: 1 }}>{children}</Box>
      </Collapse>
    </Box>
  );
};

const SettingsSidebar: React.FC = () => {
  const theme = useTheme();
  const [open, setOpen] = useState(true);
  const [localMaxTextLength, setLocalMaxTextLength] = useState(500);

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
  } = useResultsViewSettingsStore();

  const handleSliderChange = (value: number) => {
    setLocalMaxTextLength(value);
  };

  const handleSliderChangeCommitted = (value: number) => {
    const newValue = value === 1001 ? Number.POSITIVE_INFINITY : value;
    setMaxTextLength(newValue);
  };

  const resetToDefaults = () => {
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
  };

  const drawerWidth = open ? 320 : 56;

  return (
    <Drawer
      variant="permanent"
      anchor="right"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          position: 'relative',
          height: '100%',
          border: 'none',
          borderLeft: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
          backgroundColor: alpha(theme.palette.background.paper, 0.8),
          backdropFilter: 'blur(10px)',
          transition: 'width 0.3s ease',
          overflowX: 'hidden',
        },
      }}
    >
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box
          sx={{
            p: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
          }}
        >
          {open && (
            <Stack direction="row" alignItems="center" spacing={1}>
              <SettingsIcon color="primary" />
              <Typography variant="h6" fontWeight={600}>
                Settings
              </Typography>
            </Stack>
          )}
          <IconButton
            onClick={() => setOpen(!open)}
            size="small"
            sx={{
              ml: open ? 0 : 'auto',
              mr: open ? 0 : 'auto',
            }}
          >
            {open ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </IconButton>
        </Box>

        {/* Settings Content */}
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            p: open ? 2 : 1,
            '&::-webkit-scrollbar': {
              width: '6px',
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: alpha(theme.palette.text.secondary, 0.2),
              borderRadius: '10px',
            },
          }}
        >
          {open ? (
            <>
              {/* Layout Options */}
              <SettingsSection title="Layout" icon={<TableRowsIcon fontSize="small" />}>
                <SettingItem
                  label="Sticky header"
                  checked={stickyHeader}
                  onChange={setStickyHeader}
                  tooltipText="Keep the header at the top when scrolling"
                />
              </SettingsSection>

              {/* Content Formatting */}
              <SettingsSection title="Formatting" icon={<TextFormatIcon fontSize="small" />}>
                <SettingItem
                  label="Render Markdown"
                  checked={renderMarkdown}
                  onChange={setRenderMarkdown}
                  tooltipText="Format outputs using Markdown"
                />
                <SettingItem
                  label="Prettify JSON"
                  checked={prettifyJson}
                  onChange={setPrettifyJson}
                  tooltipText="Format JSON with indentation"
                />
              </SettingsSection>

              {/* Text Display */}
              <SettingsSection title="Text Display" icon={<FormatAlignLeftIcon fontSize="small" />}>
                <SettingItem
                  label="Force line breaks"
                  checked={wordBreak === 'break-all'}
                  onChange={(checked: boolean) =>
                    setWordBreak(checked ? 'break-all' : 'break-word')
                  }
                  tooltipText="Break lines at any character"
                />
                <EnhancedRangeSlider
                  value={localMaxTextLength}
                  onChange={handleSliderChange}
                  onChangeCommitted={handleSliderChangeCommitted}
                  min={25}
                  max={1001}
                  label="Max text length"
                  tooltipText="Maximum characters before truncating"
                  unlimited
                />
              </SettingsSection>

              {/* Visibility */}
              <SettingsSection title="Visibility" icon={<VisibilityIcon fontSize="small" />}>
                <SettingItem
                  label="Show prompts"
                  checked={showPrompts}
                  onChange={setShowPrompts}
                  tooltipText="Display prompts in output cells"
                />
                <SettingItem
                  label="Pass/fail indicators"
                  checked={showPassFail}
                  onChange={setShowPassFail}
                  tooltipText="Show success/failure status"
                />
                <SettingItem
                  label="Inference details"
                  checked={showInferenceDetails}
                  onChange={setShowInferenceDetails}
                  tooltipText="Show latency, tokens, cost"
                />
              </SettingsSection>

              {/* Images */}
              <SettingsSection title="Images" icon={<ImageIcon fontSize="small" />}>
                <EnhancedRangeSlider
                  value={maxImageWidth}
                  onChange={setMaxImageWidth}
                  min={100}
                  max={1000}
                  label="Max width"
                  unit="px"
                  tooltipText="Maximum image width"
                />
                <EnhancedRangeSlider
                  value={maxImageHeight}
                  onChange={setMaxImageHeight}
                  min={100}
                  max={1000}
                  label="Max height"
                  unit="px"
                  tooltipText="Maximum image height"
                />
              </SettingsSection>
            </>
          ) : (
            // Collapsed view - just icons
            <Stack spacing={2} alignItems="center">
              <IconButton size="small" color={stickyHeader ? 'primary' : 'default'}>
                <TableRowsIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" color={renderMarkdown ? 'primary' : 'default'}>
                <TextFormatIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" color={prettifyJson ? 'primary' : 'default'}>
                <CodeIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" color={showInferenceDetails ? 'primary' : 'default'}>
                <SpeedIcon fontSize="small" />
              </IconButton>
            </Stack>
          )}
        </Box>

        {/* Footer */}
        {open && (
          <Box
            sx={{
              p: 2,
              borderTop: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
            }}
          >
            <Button
              fullWidth
              startIcon={<RestoreIcon />}
              onClick={resetToDefaults}
              variant="outlined"
              size="small"
              sx={{
                borderRadius: 2,
                textTransform: 'none',
              }}
            >
              Reset to Defaults
            </Button>
          </Box>
        )}
      </Box>
    </Drawer>
  );
};

export default React.memo(SettingsSidebar);
