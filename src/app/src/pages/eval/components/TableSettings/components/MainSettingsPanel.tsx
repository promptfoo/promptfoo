import React, { useCallback, useMemo, useState } from 'react';

import DoneAllIcon from '@mui/icons-material/DoneAll';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import ImageIcon from '@mui/icons-material/Image';
import SpeedIcon from '@mui/icons-material/Speed';
import TextFormatIcon from '@mui/icons-material/TextFormat';
import ViewListIcon from '@mui/icons-material/ViewList';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
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
  description?: string;
}

const SettingRow: React.FC<SettingRowProps> = ({ label, children, icon, description }) => {
  const theme = useTheme();

  return (
    <Grid
      container
      alignItems="center"
      sx={{
        py: 1,
        minHeight: 44,
        borderBottom: `1px solid ${alpha(theme.palette.divider, 0.05)}`,
        transition: 'background-color 150ms ease',
        '&:hover': {
          backgroundColor: alpha(theme.palette.action.hover, 0.03),
        },
      }}
    >
      <Grid item xs={5}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          {icon && (
            <Box sx={{ color: alpha(theme.palette.text.secondary, 0.7), fontSize: '1rem' }}>
              {icon}
            </Box>
          )}
          <Box>
            <Typography variant="body2" sx={{ fontSize: '0.875rem', fontWeight: 400, lineHeight: 1.2 }}>
              {label}
            </Typography>
            {description && (
              <Typography variant="caption" sx={{ fontSize: '0.75rem', color: theme.palette.text.secondary, lineHeight: 1.2 }}>
                {description}
              </Typography>
            )}
          </Box>
        </Stack>
      </Grid>
      <Grid item xs={7}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>{children}</Box>
      </Grid>
    </Grid>
  );
};

interface EnhancedSliderProps {
  value: number;
  onChange: (value: number) => void;
  onChangeCommitted: (value: number) => void;
  min: number;
  max: number;
  formatValue: (value: number) => string;
  marks?: Array<{ value: number; label: string }>;
}

const EnhancedSlider: React.FC<EnhancedSliderProps> = ({
  value,
  onChange,
  onChangeCommitted,
  min,
  max,
  formatValue,
  marks,
}) => {
  const theme = useTheme();

  return (
    <Stack direction="row" alignItems="center" spacing={2} sx={{ minWidth: 240 }}>
      <Slider
        value={value}
        onChange={(_, val) => onChange(val as number)}
        onChangeCommitted={(_, val) => onChangeCommitted(val as number)}
        min={min}
        max={max}
        marks={marks}
        size="small"
        sx={{
          flex: 1,
          '& .MuiSlider-thumb': {
            width: 18,
            height: 18,
            backgroundColor: theme.palette.primary.main,
            border: `2px solid ${theme.palette.background.paper}`,
            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            transition: 'box-shadow 150ms ease',
            '&:hover': {
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            },
          },
          '& .MuiSlider-track': {
            height: 4,
            backgroundColor: theme.palette.primary.main,
          },
          '& .MuiSlider-rail': {
            height: 4,
            backgroundColor: alpha(theme.palette.text.secondary, 0.15),
          },
          '& .MuiSlider-mark': {
            display: marks ? 'block' : 'none',
            width: 2,
            height: 8,
            backgroundColor: alpha(theme.palette.text.secondary, 0.4),
          },
          '& .MuiSlider-markLabel': {
            fontSize: '0.7rem',
            color: theme.palette.text.secondary,
          },
        }}
      />
      <Typography
        variant="caption"
        sx={{
          minWidth: 75,
          fontSize: '0.75rem',
          fontWeight: 500,
          textAlign: 'right',
          color: theme.palette.primary.main,
        }}
      >
        {formatValue(value)}
      </Typography>
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
    if (value === 1001) { return 'Unlimited'; }
    if (value <= 50) { return `Short (${value})`; }
    if (value <= 300) { return `Moderate (${value})`; }
    return `Long (${value})`;
  }, []);

  const formatImageSize = useCallback((value: number) => {
    if (value <= 200) { return `Small (${value}px)`; }
    if (value <= 500) { return `Medium (${value}px)`; }
    return `Large (${value}px)`;
  }, []);

  return (
    <Box sx={{ p: 2, height: '100%' }}>
      <Stack spacing={0}>
        {/* Text Length - Most Important Setting */}
        <Box sx={{ 
          mb: 2, 
          p: 2, 
          backgroundColor: alpha(theme.palette.primary.main, 0.03),
          borderRadius: 1,
          border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
        }}>
          <SettingRow 
            label="Text length limit" 
            icon={<TextFormatIcon fontSize="small" />}
            description="Controls text truncation in table cells"
          >
            <EnhancedSlider
              value={localMaxTextLength}
              onChange={handleTextLengthChange}
              onChangeCommitted={handleTextLengthCommitted}
              min={25}
              max={1001}
              formatValue={formatTextLength}
              marks={[
                { value: 25, label: '25' },
                { value: 250, label: '250' },
                { value: 500, label: '500' },
                { value: 1000, label: '1K' },
                { value: 1001, label: '∞' },
              ]}
            />
          </SettingRow>
        </Box>

        {/* All Other Settings - Flat Structure */}
        <SettingRow 
          label="Sticky header" 
          icon={<ViewListIcon fontSize="small" />}
          description="Keep column headers visible while scrolling"
        >
          <Switch
            checked={stickyHeader}
            onChange={(e) => setStickyHeader(e.target.checked)}
            size="small"
          />
        </SettingRow>

        <SettingRow 
          label="Word breaking" 
          icon={<FormatAlignLeftIcon fontSize="small" />}
          description="Normal respects word boundaries, Break all maximizes space"
        >
          <ToggleButtonGroup
            value={wordBreak}
            exclusive
            onChange={(_, newValue) => newValue && setWordBreak(newValue)}
            size="small"
            sx={{
              '& .MuiToggleButton-root': {
                px: 1.5,
                py: 0.5,
                fontSize: '0.75rem',
                border: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
                transition: 'all 150ms ease',
                '&.Mui-selected': {
                  backgroundColor: alpha(theme.palette.primary.main, 0.12),
                  borderColor: theme.palette.primary.main,
                  color: theme.palette.primary.main,
                },
                '&:hover': {
                  backgroundColor: alpha(theme.palette.action.hover, 0.08),
                },
              },
            }}
          >
            <ToggleButton value="break-word">Normal</ToggleButton>
            <ToggleButton value="break-all">Break all</ToggleButton>
          </ToggleButtonGroup>
        </SettingRow>

        <SettingRow 
          label="Show full prompts" 
          icon={<VisibilityIcon fontSize="small" />}
          description="Display complete prompt text in dedicated column"
        >
          <Switch checked={showPrompts} onChange={(e) => setShowPrompts(e.target.checked)} size="small" />
        </SettingRow>

        <SettingRow 
          label="Pass/fail indicators" 
          icon={<DoneAllIcon fontSize="small" />}
          description="Show success/failure badges in cells"
        >
          <Switch checked={showPassFail} onChange={(e) => setShowPassFail(e.target.checked)} size="small" />
        </SettingRow>

        <SettingRow 
          label="Inference details" 
          icon={<SpeedIcon fontSize="small" />}
          description="Display timing and token usage info"
        >
          <Switch checked={showInferenceDetails} onChange={(e) => setShowInferenceDetails(e.target.checked)} size="small" />
        </SettingRow>

        <SettingRow 
          label="Render markdown" 
          icon={<TextFormatIcon fontSize="small" />}
          description="Parse and display markdown formatting"
        >
          <Switch checked={renderMarkdown} onChange={(e) => setRenderMarkdown(e.target.checked)} size="small" />
        </SettingRow>

        <SettingRow 
          label="Prettify JSON" 
          icon={<FormatAlignLeftIcon fontSize="small" />}
          description="Format JSON with proper indentation"
        >
          <Switch checked={prettifyJson} onChange={(e) => setPrettifyJson(e.target.checked)} size="small" />
        </SettingRow>

        <SettingRow 
          label="Image max width" 
          icon={<ImageIcon fontSize="small" />}
          description="Maximum width for embedded images"
        >
          <EnhancedSlider
            value={maxImageWidth}
            onChange={setMaxImageWidth}
            onChangeCommitted={setMaxImageWidth}
            min={100}
            max={1000}
            formatValue={formatImageSize}
          />
        </SettingRow>

        <SettingRow 
          label="Image max height" 
          icon={<ImageIcon fontSize="small" />}
          description="Maximum height for embedded images"
        >
          <EnhancedSlider
            value={maxImageHeight}
            onChange={setMaxImageHeight}
            onChangeCommitted={setMaxImageHeight}
            min={100}
            max={1000}
            formatValue={formatImageSize}
          />
        </SettingRow>
      </Stack>
    </Box>
  );
};

export default React.memo(MainSettingsPanel);