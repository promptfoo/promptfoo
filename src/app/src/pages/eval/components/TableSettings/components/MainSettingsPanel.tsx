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
}

const SettingRow: React.FC<SettingRowProps> = ({ label, children, icon }) => {
  const theme = useTheme();

  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      sx={{
        py: 1.25,
        px: 1,
        mx: -1,
        minHeight: 44, // WCAG compliance
        borderRadius: 1,
        transition: 'all 150ms ease-out',
        '&:hover': {
          backgroundColor: alpha(theme.palette.action.hover, 0.06),
          transform: 'translateX(2px)',
        },
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flex: 1 }}>
        {icon && (
          <Box
            sx={{
              color: alpha(theme.palette.primary.main, 0.7),
              fontSize: '1.1rem',
              display: 'flex',
              alignItems: 'center',
              transition: 'color 150ms ease',
            }}
          >
            {icon}
          </Box>
        )}
        <Typography
          variant="body2"
          sx={{
            fontWeight: 450,
            color: theme.palette.text.primary,
            fontSize: '0.875rem',
          }}
        >
          {label}
        </Typography>
      </Stack>
      <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 'auto' }}>{children}</Box>
    </Stack>
  );
};

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, children }) => {
  const theme = useTheme();

  const sectionId = `settings-section-${title.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <Box 
      sx={{ mb: 3 }} 
      component="section"
      aria-labelledby={sectionId}
      role="group"
    >
      <Typography
        id={sectionId}
        variant="subtitle2"
        sx={{
          fontSize: '0.8125rem',
          fontWeight: 600,
          color: theme.palette.text.secondary,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          mb: 1.5,
          position: 'relative',
          '&::after': {
            content: '""',
            position: 'absolute',
            bottom: -4,
            left: 0,
            width: 24,
            height: 2,
            backgroundColor: alpha(theme.palette.primary.main, 0.6),
            borderRadius: 1,
          },
        }}
      >
        {title}
      </Typography>
      <Box
        sx={{
          '& > *:not(:last-child)': {
            borderBottom: `1px solid ${alpha(theme.palette.divider, 0.08)}`,
          },
        }}
      >
        {children}
      </Box>
    </Box>
  );
};

const CompactSettingsPanel: React.FC = () => {
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
    return value === 1001 ? 'Unlimited' : `${value} chars`;
  }, []);

  return (
    <Box
      sx={{
        p: 2.5,
        height: '100%',
        overflowY: 'auto',
        backgroundColor: theme.palette.background.paper,
      }}
    >
      <Grid container spacing={4}>
        {/* Left Column */}
        <Grid item xs={12} md={6}>
          {/* Hero Text Length Control */}
          <Box
            sx={{
              mb: 4,
              p: 2.5,
              border: `2px solid ${alpha(theme.palette.primary.main, 0.2)}`,
              borderRadius: 2,
              backgroundColor: alpha(theme.palette.primary.main, 0.02),
              position: 'relative',
              overflow: 'hidden',
              boxShadow: `0 2px 8px ${alpha(theme.palette.primary.main, 0.08)}`,
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 3,
                background: `linear-gradient(90deg, ${theme.palette.primary.main}, ${alpha(theme.palette.secondary.main, 0.8)})`,
              },
            }}
          >
            <Stack spacing={2}>
              <Stack direction="row" alignItems="center" spacing={1.5}>
                <Box
                  sx={{
                    color: theme.palette.primary.main,
                    fontSize: '1.2rem',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <TextFormatIcon />
                </Box>
                <Typography
                  variant="subtitle1"
                  sx={{
                    fontWeight: 600,
                    color: theme.palette.text.primary,
                    fontSize: '1rem',
                  }}
                >
                  Text Length Limit
                </Typography>
                <Box
                  sx={{
                    px: 1.5,
                    py: 0.5,
                    background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
                    color: 'white',
                    borderRadius: 1,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                    transition: 'all 200ms ease-out',
                  }}
                >
                  {formatTextLength(localMaxTextLength)}
                </Box>
              </Stack>

              <Slider
                value={localMaxTextLength}
                onChange={(_, value) => handleTextLengthChange(value as number)}
                onChangeCommitted={(_, value) => handleTextLengthCommitted(value as number)}
                min={25}
                max={1001}
                marks={[
                  { value: 25, label: '25' },
                  { value: 250, label: '250' },
                  { value: 500, label: '500' },
                  { value: 1000, label: '1K' },
                  { value: 1001, label: '∞' },
                ]}
                sx={{
                  '& .MuiSlider-thumb': {
                    width: 20,
                    height: 20,
                    backgroundColor: theme.palette.primary.main,
                    border: `2px solid ${theme.palette.background.paper}`,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                    '&:hover': {
                      boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                    },
                  },
                  '& .MuiSlider-track': {
                    height: 6,
                    backgroundColor: theme.palette.primary.main,
                  },
                  '& .MuiSlider-rail': {
                    height: 6,
                    backgroundColor: alpha(theme.palette.text.secondary, 0.15),
                  },
                  '& .MuiSlider-mark': {
                    width: 2,
                    height: 10,
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
                  color: theme.palette.text.secondary,
                  fontSize: '0.75rem',
                  textAlign: 'center',
                }}
              >
                Controls how much text appears in each table cell before truncation
              </Typography>
            </Stack>
          </Box>

          <Section title="Layout & Display">
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
                    px: 1.5,
                    py: 0.5,
                    fontSize: '0.75rem',
                    minWidth: 'auto',
                    border: `1px solid ${alpha(theme.palette.divider, 0.3)}`,
                    '&.Mui-selected': {
                      backgroundColor: alpha(theme.palette.primary.main, 0.12),
                      borderColor: theme.palette.primary.main,
                    },
                  },
                }}
              >
                <ToggleButton value="break-word">Normal</ToggleButton>
                <ToggleButton value="break-all">Break all</ToggleButton>
              </ToggleButtonGroup>
            </SettingRow>
          </Section>

          <Section title="Content Formatting">
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
          </Section>
        </Grid>

        {/* Right Column */}
        <Grid item xs={12} md={6}>
          <Section title="Content Visibility">
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
          </Section>

          <Section title="Image Display">
            <SettingRow label="Max width" icon={<ImageIcon fontSize="small" />}>
              <Stack direction="row" alignItems="center" spacing={2} sx={{ minWidth: 200 }}>
                <Slider
                  value={maxImageWidth}
                  onChange={(_, value) => setMaxImageWidth(value as number)}
                  min={100}
                  max={1000}
                  size="small"
                  sx={{
                    flex: 1,
                    '& .MuiSlider-thumb': {
                      width: 16,
                      height: 16,
                    },
                    '& .MuiSlider-track': {
                      height: 3,
                    },
                    '& .MuiSlider-rail': {
                      height: 3,
                      backgroundColor: alpha(theme.palette.text.secondary, 0.15),
                    },
                  }}
                />
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: '0.75rem',
                    color: theme.palette.text.secondary,
                    minWidth: 50,
                    textAlign: 'right',
                  }}
                >
                  {maxImageWidth}px
                </Typography>
              </Stack>
            </SettingRow>

            <SettingRow label="Max height" icon={<ImageIcon fontSize="small" />}>
              <Stack direction="row" alignItems="center" spacing={2} sx={{ minWidth: 200 }}>
                <Slider
                  value={maxImageHeight}
                  onChange={(_, value) => setMaxImageHeight(value as number)}
                  min={100}
                  max={1000}
                  size="small"
                  sx={{
                    flex: 1,
                    '& .MuiSlider-thumb': {
                      width: 16,
                      height: 16,
                    },
                    '& .MuiSlider-track': {
                      height: 3,
                    },
                    '& .MuiSlider-rail': {
                      height: 3,
                      backgroundColor: alpha(theme.palette.text.secondary, 0.15),
                    },
                  }}
                />
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: '0.75rem',
                    color: theme.palette.text.secondary,
                    minWidth: 50,
                    textAlign: 'right',
                  }}
                >
                  {maxImageHeight}px
                </Typography>
              </Stack>
            </SettingRow>
          </Section>
        </Grid>
      </Grid>
    </Box>
  );
};

export default React.memo(CompactSettingsPanel);
