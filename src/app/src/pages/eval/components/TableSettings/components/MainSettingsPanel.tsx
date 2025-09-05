import React, { useCallback, useMemo, useState } from 'react';

import DoneAllIcon from '@mui/icons-material/DoneAll';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import ImageIcon from '@mui/icons-material/Image';
import SpeedIcon from '@mui/icons-material/Speed';
import TextFormatIcon from '@mui/icons-material/TextFormat';
import ViewListIcon from '@mui/icons-material/ViewList';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Box from '@mui/material/Box';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import { useResultsViewSettingsStore } from '../../store';

interface SettingRowProps {
  label: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

const SettingRow: React.FC<SettingRowProps> = ({ label, children, icon }) => {
  const theme = useTheme();

  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      sx={{
        py: 1,
        minHeight: 44,
        borderBottom: `1px solid ${alpha(theme.palette.divider, 0.05)}`,
        '&:hover': {
          backgroundColor: alpha(theme.palette.action.hover, 0.03),
        },
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flex: 1 }}>
        {icon && (
          <Box sx={{ color: alpha(theme.palette.text.secondary, 0.7), fontSize: '1rem' }}>
            {icon}
          </Box>
        )}
        <Typography variant="body2" sx={{ fontSize: '0.875rem', fontWeight: 400 }}>
          {label}
        </Typography>
      </Stack>
      {children}
    </Stack>
  );
};

const MainSettingsPanel: React.FC = () => {
  const theme = useTheme();
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
  } = useResultsViewSettingsStore();

  // Optimized slider state management
  const sanitizedMaxTextLength = useMemo(() => {
    return maxTextLength === Number.POSITIVE_INFINITY
      ? 1001
      : Number.isFinite(maxTextLength) && maxTextLength >= 25
        ? maxTextLength
        : 500;
  }, [maxTextLength]);

  const [localMaxTextLength, setLocalMaxTextLength] = useState(() => sanitizedMaxTextLength);

  // Sync local state when store changes (e.g., reset button)
  React.useEffect(() => {
    setLocalMaxTextLength(sanitizedMaxTextLength);
  }, [sanitizedMaxTextLength]);

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

  const formatTextLength = useCallback((value: number) => {
    return value === 1001 ? 'Unlimited' : `${value}`;
  }, []);

  return (
    <Box sx={{ p: 2, height: '100%' }}>
      <Stack spacing={0}>
        {/* Text Length - Compact inline row */}
        <SettingRow label="Text length limit" icon={<TextFormatIcon fontSize="small" />}>
          <Stack direction="row" alignItems="center" spacing={2} sx={{ minWidth: 300 }}>
            <Slider
              value={localMaxTextLength}
              onChange={(_, value) => handleTextLengthChange(value as number)}
              onChangeCommitted={(_, value) => handleTextLengthCommitted(value as number)}
              min={25}
              max={1001}
              size="small"
              sx={{
                flex: 1,
                '& .MuiSlider-thumb': { width: 16, height: 16 },
                '& .MuiSlider-track': { height: 3 },
                '& .MuiSlider-rail': { height: 3 },
              }}
            />
            <Typography variant="caption" sx={{ minWidth: 60, fontSize: '0.75rem' }}>
              {formatTextLength(localMaxTextLength)}
            </Typography>
          </Stack>
        </SettingRow>

        {/* Layout Settings */}
        <SettingRow label="Sticky header" icon={<ViewListIcon fontSize="small" />}>
          <Switch
            checked={stickyHeader}
            onChange={(e) => setStickyHeader(e.target.checked)}
            size="small"
          />
        </SettingRow>

        <SettingRow label="Word breaking" icon={<FormatAlignLeftIcon fontSize="small" />}>
          <ToggleButtonGroup
            value={wordBreak}
            exclusive
            onChange={(_, newValue) => newValue && setWordBreak(newValue)}
            size="small"
            sx={{
              '& .MuiToggleButton-root': {
                px: 1,
                py: 0.25,
                fontSize: '0.75rem',
                border: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
                '&.Mui-selected': {
                  backgroundColor: alpha(theme.palette.primary.main, 0.1),
                  borderColor: theme.palette.primary.main,
                },
              },
            }}
          >
            <ToggleButton value="break-word">Normal</ToggleButton>
            <ToggleButton value="break-all">Break all</ToggleButton>
          </ToggleButtonGroup>
        </SettingRow>

        {/* Content Settings */}
        <SettingRow label="Show full prompts" icon={<VisibilityIcon fontSize="small" />}>
          <Switch
            checked={showPrompts}
            onChange={(e) => setShowPrompts(e.target.checked)}
            size="small"
          />
        </SettingRow>

        <SettingRow label="Pass/fail indicators" icon={<DoneAllIcon fontSize="small" />}>
          <Switch
            checked={showPassFail}
            onChange={(e) => setShowPassFail(e.target.checked)}
            size="small"
          />
        </SettingRow>

        <SettingRow label="Inference details" icon={<SpeedIcon fontSize="small" />}>
          <Switch
            checked={showInferenceDetails}
            onChange={(e) => setShowInferenceDetails(e.target.checked)}
            size="small"
          />
        </SettingRow>

        <SettingRow label="Render markdown" icon={<TextFormatIcon fontSize="small" />}>
          <Switch
            checked={renderMarkdown}
            onChange={(e) => setRenderMarkdown(e.target.checked)}
            size="small"
          />
        </SettingRow>

        <SettingRow label="Prettify JSON" icon={<FormatAlignLeftIcon fontSize="small" />}>
          <Switch
            checked={prettifyJson}
            onChange={(e) => setPrettifyJson(e.target.checked)}
            size="small"
          />
        </SettingRow>

        {/* Image Settings */}
        <SettingRow label="Image max width" icon={<ImageIcon fontSize="small" />}>
          <Stack direction="row" alignItems="center" spacing={2} sx={{ minWidth: 200 }}>
            <Slider
              value={maxImageWidth}
              onChange={(_, value) => setMaxImageWidth(value as number)}
              min={100}
              max={1000}
              size="small"
              sx={{
                flex: 1,
                '& .MuiSlider-thumb': { width: 16, height: 16 },
                '& .MuiSlider-track': { height: 3 },
                '& .MuiSlider-rail': { height: 3 },
              }}
            />
            <Typography variant="caption" sx={{ minWidth: 45, fontSize: '0.75rem' }}>
              {maxImageWidth}px
            </Typography>
          </Stack>
        </SettingRow>

        <SettingRow label="Image max height" icon={<ImageIcon fontSize="small" />}>
          <Stack direction="row" alignItems="center" spacing={2} sx={{ minWidth: 200 }}>
            <Slider
              value={maxImageHeight}
              onChange={(_, value) => setMaxImageHeight(value as number)}
              min={100}
              max={1000}
              size="small"
              sx={{
                flex: 1,
                '& .MuiSlider-thumb': { width: 16, height: 16 },
                '& .MuiSlider-track': { height: 3 },
                '& .MuiSlider-rail': { height: 3 },
              }}
            />
            <Typography variant="caption" sx={{ minWidth: 45, fontSize: '0.75rem' }}>
              {maxImageHeight}px
            </Typography>
          </Stack>
        </SettingRow>
      </Stack>
    </Box>
  );
};

export default React.memo(MainSettingsPanel);
