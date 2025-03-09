import React, { useState, useCallback, useEffect, useRef } from 'react';
// Icons
import CloseIcon from '@mui/icons-material/Close';
import CodeIcon from '@mui/icons-material/Code';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import FormatShapesIcon from '@mui/icons-material/FormatShapes';
import ImageIcon from '@mui/icons-material/Image';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import PsychologyIcon from '@mui/icons-material/Psychology';
import RestoreIcon from '@mui/icons-material/Restore';
import SettingsIcon from '@mui/icons-material/Settings';
import SpeedIcon from '@mui/icons-material/Speed';
import TableRowsIcon from '@mui/icons-material/TableRows';
import TextFormatIcon from '@mui/icons-material/TextFormat';
import ViewListIcon from '@mui/icons-material/ViewList';
import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Paper,
  Slider,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useTheme,
  alpha,
  Fade,
  InputAdornment,
  Chip,
} from '@mui/material';
import { useDebounce } from 'use-debounce';
import { useStore as useResultsViewStore } from './store';

// A more accessible and elegant slider component
const EnhancedRangeSlider = React.memo(
  ({
    value,
    onChange,
    min,
    max,
    label,
    unit = '',
    unlimited,
    onChangeCommitted,
    disabled = false,
    tooltipText,
    icon,
  }: {
    value: number;
    onChange: (value: number) => void;
    min: number;
    max: number;
    label: string;
    unit?: string;
    unlimited?: boolean;
    onChangeCommitted?: (value: number) => void;
    disabled?: boolean;
    tooltipText?: string;
    icon?: React.ReactNode;
  }) => {
    const [localValue, setLocalValue] = useState(value);
    const [debouncedValue] = useDebounce(localValue, 150);
    const theme = useTheme();
    const [isEditing, setIsEditing] = useState(false);
    const [inputValue, setInputValue] = useState('');

    useEffect(() => {
      if (debouncedValue !== value) {
        onChange(debouncedValue);
      }
    }, [debouncedValue, onChange, value]);

    // Update local value when external value changes
    useEffect(() => {
      setLocalValue(value);
      setInputValue(unlimited && value === max ? 'Unlimited' : value.toString());
    }, [value, max, unlimited]);

    const handleChange = useCallback(
      (_: Event | React.SyntheticEvent, newValue: number | number[]) => {
        setLocalValue(newValue as number);
        setInputValue(
          unlimited && (newValue as number) === max ? 'Unlimited' : (newValue as number).toString(),
        );
      },
      [max, unlimited],
    );

    const handleChangeCommitted = useCallback(
      (_: Event | React.SyntheticEvent, value: number | number[]) => {
        if (onChangeCommitted) {
          onChangeCommitted(value as number);
        }
      },
      [onChangeCommitted],
    );

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
    };

    const handleInputBlur = () => {
      setIsEditing(false);
      if (inputValue === 'Unlimited' && unlimited) {
        setLocalValue(max);
        onChange(max);
        return;
      }

      const parsedValue = Number.parseInt(inputValue, 10);
      if (Number.isNaN(parsedValue)) {
        // Revert to current value if input is invalid
        setInputValue(unlimited && localValue === max ? 'Unlimited' : localValue.toString());
      } else {
        const clampedValue = Math.min(Math.max(parsedValue, min), max);
        setLocalValue(clampedValue);
        setInputValue(clampedValue.toString());
        onChange(clampedValue);
      }
    };

    const handleInputKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleInputBlur();
      } else if (e.key === 'Escape') {
        setIsEditing(false);
        setInputValue(unlimited && localValue === max ? 'Unlimited' : localValue.toString());
      }
    };

    return (
      <Box
        sx={{
          maxWidth: '100%',
          mb: 2.5,
          opacity: disabled ? 0.6 : 1,
          transition: 'opacity 0.2s ease',
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1} mb={1}>
          {icon && <Box sx={{ color: theme.palette.primary.main }}>{icon}</Box>}
          <Typography variant="body1" fontWeight={500} sx={{ flexGrow: 1 }}>
            {label}
          </Typography>

          <Box
            sx={{
              border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
              borderRadius: 1,
              px: 1.5,
              py: 0.5,
              minWidth: 80,
              textAlign: 'center',
              cursor: 'text',
              '&:hover': {
                borderColor: theme.palette.primary.main,
              },
            }}
            onClick={() => !disabled && setIsEditing(true)}
          >
            {isEditing ? (
              <TextField
                autoFocus
                size="small"
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                onKeyDown={handleInputKeyDown}
                variant="standard"
                InputProps={{
                  disableUnderline: true,
                  endAdornment: unit ? (
                    <InputAdornment position="end">{unit}</InputAdornment>
                  ) : undefined,
                }}
                sx={{
                  width: '100%',
                  '& input': {
                    textAlign: 'center',
                    p: 0,
                  },
                }}
              />
            ) : (
              <Typography>
                {unlimited && localValue === max ? 'Unlimited' : `${localValue}${unit}`}
              </Typography>
            )}
          </Box>

          {tooltipText && (
            <Tooltip title={tooltipText} arrow>
              <IconButton size="small" sx={{ p: 0 }}>
                <InfoOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>

        <Slider
          min={min}
          max={max}
          value={localValue}
          onChange={handleChange}
          onChangeCommitted={onChangeCommitted ? handleChangeCommitted : undefined}
          marks={[
            { value: min, label: `${min}${unit}` },
            { value: max, label: unlimited ? 'Unlimited' : `${max}${unit}` },
          ]}
          disabled={disabled}
          sx={{
            '& .MuiSlider-markLabel[data-index="0"]': {
              transform: 'translateX(0%)',
            },
            '& .MuiSlider-markLabel[data-index="1"]': {
              transform: 'translateX(-100%)',
            },
            '& .MuiSlider-thumb': {
              '&:hover, &.Mui-focusVisible': {
                boxShadow: `0px 0px 0px 8px ${alpha(theme.palette.primary.main, 0.16)}`,
              },
            },
          }}
        />
      </Box>
    );
  },
);

// Setting item with improved visual design and accessibility
const SettingItem = React.memo(
  ({
    label,
    checked,
    onChange,
    icon,
    tooltipText,
    disabled = false,
    component = 'checkbox',
  }: {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    icon?: React.ReactNode;
    tooltipText?: string;
    disabled?: boolean;
    component?: 'checkbox' | 'switch';
  }) => {
    const theme = useTheme();

    return (
      <Paper
        elevation={0}
        sx={{
          p: 0.75,
          mb: 1,
          border: `1px solid ${alpha(theme.palette.divider, 0.15)}`,
          borderRadius: 1,
          opacity: disabled ? 0.6 : 1,
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: disabled ? 'transparent' : alpha(theme.palette.primary.main, 0.04),
            borderColor: disabled
              ? alpha(theme.palette.divider, 0.15)
              : alpha(theme.palette.primary.main, 0.3),
          },
        }}
      >
        <FormControlLabel
          control={
            component === 'checkbox' ? (
              <Checkbox
                checked={checked}
                onChange={(e) => !disabled && onChange(e.target.checked)}
                disabled={disabled}
                sx={{
                  '& .MuiSvgIcon-root': {
                    fontSize: '1.3rem',
                  },
                  color: theme.palette.primary.main,
                }}
              />
            ) : (
              <Switch
                checked={checked}
                onChange={(e) => !disabled && onChange(e.target.checked)}
                disabled={disabled}
                size="small"
              />
            )
          }
          label={
            <Stack direction="row" alignItems="center" spacing={0.5}>
              {icon && (
                <Box
                  sx={{ color: theme.palette.primary.main, display: 'flex', alignItems: 'center' }}
                >
                  {icon}
                </Box>
              )}
              <Typography variant="body2">{label}</Typography>
              {tooltipText && (
                <Tooltip title={tooltipText} arrow>
                  <IconButton size="small" sx={{ p: 0, ml: 0.5 }}>
                    <InfoOutlinedIcon sx={{ fontSize: '0.9rem' }} />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          }
          sx={{ margin: 0, width: '100%' }}
        />
      </Paper>
    );
  },
);

// Section component for grouping related settings
const SettingsSection = React.memo(
  ({
    title,
    children,
    icon,
    description,
  }: {
    title: string;
    children: React.ReactNode;
    icon?: React.ReactNode;
    description?: string;
  }) => {
    const theme = useTheme();

    return (
      <Box sx={{ mb: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
          {icon && <Box sx={{ color: theme.palette.primary.main }}>{icon}</Box>}
          <Typography variant="subtitle1" fontWeight={500}>
            {title}
          </Typography>
        </Stack>

        {description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, ml: icon ? 3.5 : 0 }}>
            {description}
          </Typography>
        )}

        <Box sx={{ ml: icon ? 3.5 : 0 }}>{children}</Box>
      </Box>
    );
  },
);

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose }) => {
  const theme = useTheme();
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
    showReasoning,
    setShowReasoning,
    stickyHeader,
    setStickyHeader,
    maxImageWidth,
    setMaxImageWidth,
    maxImageHeight,
    setMaxImageHeight,
  } = useResultsViewStore();

  // State management
  const [localMaxTextLength, setLocalMaxTextLength] = useState(
    maxTextLength === Number.POSITIVE_INFINITY ? 1001 : maxTextLength,
  );
  const [activeTab, setActiveTab] = useState(0);
  const initialStateRef = useRef({
    maxTextLength,
    wordBreak,
    showInferenceDetails,
    renderMarkdown,
    prettifyJson,
    showPrompts,
    showPassFail,
    showReasoning,
    stickyHeader,
    maxImageWidth,
    maxImageHeight,
  });

  // Track if settings are modified
  const hasChanges = React.useMemo(() => {
    const initialState = initialStateRef.current;
    return (
      maxTextLength !== initialState.maxTextLength ||
      wordBreak !== initialState.wordBreak ||
      showInferenceDetails !== initialState.showInferenceDetails ||
      renderMarkdown !== initialState.renderMarkdown ||
      prettifyJson !== initialState.prettifyJson ||
      showPrompts !== initialState.showPrompts ||
      showPassFail !== initialState.showPassFail ||
      showReasoning !== initialState.showReasoning ||
      stickyHeader !== initialState.stickyHeader ||
      maxImageWidth !== initialState.maxImageWidth ||
      maxImageHeight !== initialState.maxImageHeight
    );
  }, [
    maxTextLength,
    wordBreak,
    showInferenceDetails,
    renderMarkdown,
    prettifyJson,
    showPrompts,
    showPassFail,
    showReasoning,
    stickyHeader,
    maxImageWidth,
    maxImageHeight,
  ]);

  // Handle tab change
  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

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

  // Handle reset to defaults
  const resetToDefaults = () => {
    setStickyHeader(true);
    setWordBreak('break-word');
    setRenderMarkdown(true);
    setPrettifyJson(true);
    setShowPrompts(false);
    setShowPassFail(true);
    setShowReasoning(false);
    setShowInferenceDetails(true);
    setMaxTextLength(500);
    setLocalMaxTextLength(500);
    setMaxImageWidth(500);
    setMaxImageHeight(300);
  };

  // Save reference values when modal opens
  useEffect(() => {
    if (open) {
      initialStateRef.current = {
        maxTextLength,
        wordBreak,
        showInferenceDetails,
        renderMarkdown,
        prettifyJson,
        showPrompts,
        showPassFail,
        showReasoning,
        stickyHeader,
        maxImageWidth,
        maxImageHeight,
      };
    }
  }, [
    open,
    maxTextLength,
    wordBreak,
    showInferenceDetails,
    renderMarkdown,
    prettifyJson,
    showPrompts,
    showPassFail,
    showReasoning,
    stickyHeader,
    maxImageWidth,
    maxImageHeight,
  ]);

  // Enhanced accessible UI
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        elevation: 5,
        sx: {
          borderRadius: 2,
          overflow: 'hidden',
        },
      }}
      sx={{
        '& .MuiBackdrop-root': {
          backdropFilter: 'blur(3px)',
        },
      }}
      aria-labelledby="settings-dialog-title"
    >
      <DialogTitle
        id="settings-dialog-title"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 2,
          pb: 1,
          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <SettingsIcon color="primary" />
          <Typography variant="h6">Table Settings</Typography>
          {hasChanges && (
            <Chip
              label="Modified"
              size="small"
              color="primary"
              variant="outlined"
              sx={{
                height: 24,
                ml: 1,
                '& .MuiChip-label': { px: 1 },
                animation: 'pulse 2s infinite',
                '@keyframes pulse': {
                  '0%': { opacity: 0.7 },
                  '50%': { opacity: 1 },
                  '100%': { opacity: 0.7 },
                },
              }}
            />
          )}
        </Stack>
        <IconButton edge="end" color="inherit" onClick={onClose} aria-label="close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        aria-label="settings tabs"
        variant="fullWidth"
        sx={{
          borderBottom: 1,
          borderColor: alpha(theme.palette.divider, 0.1),
          minHeight: 48,
          '& .MuiTab-root': {
            minHeight: 48,
            textTransform: 'none',
            fontWeight: 500,
          },
        }}
      >
        <Tab
          icon={<ViewListIcon fontSize="small" />}
          label="Display"
          iconPosition="start"
          id="tab-0"
          aria-controls="tabpanel-0"
        />
        <Tab
          icon={<FormatShapesIcon fontSize="small" />}
          label="Content & Media"
          iconPosition="start"
          id="tab-1"
          aria-controls="tabpanel-1"
        />
      </Tabs>

      <DialogContent
        sx={{
          p: 3,
          pb: 1,
          '&::-webkit-scrollbar': {
            width: '6px',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: alpha(theme.palette.text.secondary, 0.2),
            borderRadius: '10px',
          },
          '&::-webkit-scrollbar-thumb:hover': {
            backgroundColor: alpha(theme.palette.text.secondary, 0.3),
          },
        }}
      >
        <Fade in={activeTab === 0} mountOnEnter unmountOnExit>
          <Box role="tabpanel" id="tabpanel-0" aria-labelledby="tab-0">
            <SettingsSection
              title="Layout Options"
              icon={<TableRowsIcon />}
              description="Control how the table is displayed and organized"
            >
              <SettingItem
                label="Sticky header"
                checked={stickyHeader}
                onChange={setStickyHeader}
                icon={<ViewListIcon fontSize="small" />}
                tooltipText="Keep the header at the top of the screen when scrolling through the table"
              />

              <SettingItem
                label="Force line breaks"
                checked={wordBreak === 'break-all'}
                onChange={(checked) => setWordBreak(checked ? 'break-all' : 'break-word')}
                icon={<FormatAlignLeftIcon fontSize="small" />}
                tooltipText="Force lines to break at any character, making it easier to adjust column widths"
              />
            </SettingsSection>

            <SettingsSection
              title="Element Visibility"
              icon={<VisibilityIcon />}
              description="Control what content appears in each table cell"
            >
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
                label="Show model reasoning"
                checked={showReasoning}
                onChange={setShowReasoning}
                icon={<PsychologyIcon fontSize="small" />}
                tooltipText="Display the model's reasoning/thinking process instead of final outputs when available"
              />

              <SettingItem
                label="Show inference details"
                checked={showInferenceDetails}
                onChange={setShowInferenceDetails}
                icon={<SpeedIcon fontSize="small" />}
                tooltipText="Display detailed inference statistics such as latency, tokens used, cost, etc."
              />
            </SettingsSection>
          </Box>
        </Fade>

        <Fade in={activeTab === 1} mountOnEnter unmountOnExit>
          <Box role="tabpanel" id="tabpanel-1" aria-labelledby="tab-1">
            <SettingsSection
              title="Content Formatting"
              icon={<TextFormatIcon />}
              description="Control how text and data are formatted"
            >
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
            </SettingsSection>

            <SettingsSection
              title="Text Display"
              icon={<FormatAlignLeftIcon />}
              description="Control text length and appearance"
            >
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
            </SettingsSection>

            <SettingsSection
              title="Image Settings"
              icon={<ImageIcon />}
              description="Control how images are displayed in the table"
            >
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
            </SettingsSection>
          </Box>
        </Fade>
      </DialogContent>

      <DialogActions
        sx={{
          px: 3,
          py: 2,
          justifyContent: 'space-between',
          borderTop: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
        }}
      >
        <Button
          startIcon={<RestoreIcon />}
          onClick={resetToDefaults}
          color="inherit"
          size="small"
          aria-label="Reset settings to defaults"
          title="Reset all settings to their default values"
        >
          Reset to Defaults
        </Button>
        <Button onClick={onClose} color="primary" variant="contained" disableElevation>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default React.memo(SettingsModal);
