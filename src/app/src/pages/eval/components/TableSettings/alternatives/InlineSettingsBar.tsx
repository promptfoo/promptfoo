import React, { useState } from 'react';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import { alpha, useTheme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useResultsViewSettingsStore } from '../../store';

const VIEW_PRESETS = {
  compact: {
    name: 'Compact',
    maxTextLength: 100,
    showPrompts: false,
    showInferenceDetails: false,
    renderMarkdown: false,
  },
  normal: {
    name: 'Normal',
    maxTextLength: 250,
    showPrompts: false,
    showInferenceDetails: true,
    renderMarkdown: true,
  },
  detailed: {
    name: 'Detailed',
    maxTextLength: 500,
    showPrompts: true,
    showInferenceDetails: true,
    renderMarkdown: true,
  },
  full: {
    name: 'Full',
    maxTextLength: Number.POSITIVE_INFINITY,
    showPrompts: true,
    showInferenceDetails: true,
    renderMarkdown: true,
  },
};

const InlineSettingsBar: React.FC = () => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [textLengthAnchor, setTextLengthAnchor] = useState<null | HTMLElement>(null);
  const [quickSettingsAnchor, setQuickSettingsAnchor] = useState<null | HTMLElement>(null);

  const {
    maxTextLength: rawMaxTextLength,
    setMaxTextLength,
    showPrompts,
    setShowPrompts,
    showInferenceDetails,
    setShowInferenceDetails,
    renderMarkdown,
    setRenderMarkdown,
    showPassFail,
    setShowPassFail,
    stickyHeader,
    setStickyHeader,
    prettifyJson,
    setPrettifyJson,
  } = useResultsViewSettingsStore();

  // Ensure maxTextLength is never null/undefined
  const maxTextLength = rawMaxTextLength ?? 250;

  const getCurrentPreset = () => {
    for (const [key, preset] of Object.entries(VIEW_PRESETS)) {
      if (
        maxTextLength === preset.maxTextLength &&
        showPrompts === preset.showPrompts &&
        showInferenceDetails === preset.showInferenceDetails &&
        renderMarkdown === preset.renderMarkdown
      ) {
        return key;
      }
    }
    return 'custom';
  };

  const handlePresetChange = (preset: keyof typeof VIEW_PRESETS) => {
    const settings = VIEW_PRESETS[preset];
    setMaxTextLength(settings.maxTextLength);
    setShowPrompts(settings.showPrompts);
    setShowInferenceDetails(settings.showInferenceDetails);
    setRenderMarkdown(settings.renderMarkdown);
    setAnchorEl(null);
  };

  const handleTextLengthChange = (_: Event, value: number | number[]) => {
    const newValue = value as number;
    setMaxTextLength(newValue === 1001 ? Number.POSITIVE_INFINITY : newValue);
  };

  const currentPreset = getCurrentPreset();
  const displayTextLength =
    maxTextLength === Number.POSITIVE_INFINITY ? '∞' : maxTextLength.toString();

  // Safe color helper
  const safeAlpha = (color: string | undefined, opacity: number) => {
    return color ? alpha(color, opacity) : undefined;
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 2,
        py: 1,
        borderBottom: `1px solid ${safeAlpha(theme.palette.divider, 0.1)}`,
        backgroundColor: safeAlpha(theme.palette.background.paper, 0.8),
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* View Preset Selector */}
      <Stack direction="row" alignItems="center" spacing={1}>
        <VisibilityIcon fontSize="small" sx={{ opacity: 0.7 }} />
        <Button
          variant="outlined"
          size="small"
          endIcon={<ExpandMoreIcon />}
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            minWidth: 120,
            borderColor: safeAlpha(theme.palette.divider, 0.2),
            '&:hover': {
              borderColor: theme.palette.primary.main,
              backgroundColor: safeAlpha(theme.palette.primary.main, 0.04),
            },
          }}
        >
          View:{' '}
          {currentPreset === 'custom'
            ? 'Custom'
            : VIEW_PRESETS[currentPreset as keyof typeof VIEW_PRESETS].name}
        </Button>
      </Stack>

      {/* Text Length Quick Control */}
      <Stack direction="row" alignItems="center" spacing={1}>
        <TextFieldsIcon fontSize="small" sx={{ opacity: 0.7 }} />
        <Chip
          label={`Text: ${displayTextLength}`}
          size="small"
          onClick={(e) => setTextLengthAnchor(e.currentTarget)}
          sx={{
            cursor: 'pointer',
            '&:hover': {
              backgroundColor: safeAlpha(theme.palette.primary.main, 0.08),
            },
          }}
        />
      </Stack>

      {/* Quick Toggles */}
      <Stack direction="row" spacing={1} sx={{ ml: 'auto' }}>
        <Tooltip title="Sticky Header">
          <Chip
            label="Sticky"
            size="small"
            color={stickyHeader ? 'primary' : 'default'}
            onClick={() => setStickyHeader(!stickyHeader)}
            sx={{ cursor: 'pointer' }}
          />
        </Tooltip>
        <Tooltip title="Show Pass/Fail">
          <Chip
            label="Pass/Fail"
            size="small"
            color={showPassFail ? 'primary' : 'default'}
            onClick={() => setShowPassFail(!showPassFail)}
            sx={{ cursor: 'pointer' }}
          />
        </Tooltip>
        <Tooltip title="Render Markdown">
          <Chip
            label="Markdown"
            size="small"
            color={renderMarkdown ? 'primary' : 'default'}
            onClick={() => setRenderMarkdown(!renderMarkdown)}
            sx={{ cursor: 'pointer' }}
          />
        </Tooltip>
        <Tooltip title="More Settings">
          <IconButton
            size="small"
            onClick={(e) => setQuickSettingsAnchor(e.currentTarget)}
            sx={{
              ml: 1,
              '&:hover': {
                backgroundColor: safeAlpha(theme.palette.primary.main, 0.08),
              },
            }}
          >
            <ExpandMoreIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* View Preset Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        PaperProps={{
          sx: {
            mt: 1,
            minWidth: 180,
            borderRadius: 2,
            boxShadow: theme.shadows[4],
          },
        }}
      >
        {Object.entries(VIEW_PRESETS).map(([key, preset]) => (
          <MenuItem
            key={key}
            selected={currentPreset === key}
            onClick={() => handlePresetChange(key as keyof typeof VIEW_PRESETS)}
            sx={{
              py: 1.5,
              '&.Mui-selected': {
                backgroundColor: safeAlpha(theme.palette.primary.main, 0.08),
              },
            }}
          >
            <Stack spacing={0.5} sx={{ width: '100%' }}>
              <Typography variant="body2" fontWeight={500}>
                {preset.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {preset.maxTextLength === Number.POSITIVE_INFINITY ? 'Full' : preset.maxTextLength}{' '}
                chars
                {preset.showPrompts && ' • Prompts'}
                {preset.showInferenceDetails && ' • Details'}
              </Typography>
            </Stack>
          </MenuItem>
        ))}
        <MenuItem
          selected={currentPreset === 'custom'}
          disabled
          sx={{
            py: 1.5,
            opacity: currentPreset === 'custom' ? 1 : 0.5,
          }}
        >
          <Typography variant="body2" fontWeight={500}>
            Custom
          </Typography>
        </MenuItem>
      </Menu>

      {/* Text Length Slider Popover */}
      <Menu
        anchorEl={textLengthAnchor}
        open={Boolean(textLengthAnchor)}
        onClose={() => setTextLengthAnchor(null)}
        PaperProps={{
          sx: {
            mt: 1,
            p: 2,
            minWidth: 300,
            borderRadius: 2,
            boxShadow: theme.shadows[4],
          },
        }}
      >
        <Typography variant="body2" fontWeight={500} gutterBottom>
          Maximum Text Length
        </Typography>
        <Box sx={{ px: 1, py: 2 }}>
          <Slider
            value={maxTextLength === Number.POSITIVE_INFINITY ? 1001 : maxTextLength}
            onChange={handleTextLengthChange}
            min={25}
            max={1001}
            step={25}
            marks={[
              { value: 25, label: '25' },
              { value: 250, label: '250' },
              { value: 500, label: '500' },
              { value: 1000, label: '1000' },
              { value: 1001, label: '∞' },
            ]}
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => (value === 1001 ? '∞' : value)}
          />
        </Box>
      </Menu>

      {/* Quick Settings Menu */}
      <Menu
        anchorEl={quickSettingsAnchor}
        open={Boolean(quickSettingsAnchor)}
        onClose={() => setQuickSettingsAnchor(null)}
        PaperProps={{
          sx: {
            mt: 1,
            minWidth: 200,
            borderRadius: 2,
            boxShadow: theme.shadows[4],
          },
        }}
      >
        <MenuItem
          onClick={() => {
            setShowPrompts(!showPrompts);
            setQuickSettingsAnchor(null);
          }}
        >
          <Chip
            size="small"
            label="Show Prompts"
            color={showPrompts ? 'primary' : 'default'}
            sx={{ width: '100%' }}
          />
        </MenuItem>
        <MenuItem
          onClick={() => {
            setShowInferenceDetails(!showInferenceDetails);
            setQuickSettingsAnchor(null);
          }}
        >
          <Chip
            size="small"
            label="Inference Details"
            color={showInferenceDetails ? 'primary' : 'default'}
            sx={{ width: '100%' }}
          />
        </MenuItem>
        <MenuItem
          onClick={() => {
            setPrettifyJson(!prettifyJson);
            setQuickSettingsAnchor(null);
          }}
        >
          <Chip
            size="small"
            label="Prettify JSON"
            color={prettifyJson ? 'primary' : 'default'}
            sx={{ width: '100%' }}
          />
        </MenuItem>
      </Menu>
    </Box>
  );
};

export default React.memo(InlineSettingsBar);
