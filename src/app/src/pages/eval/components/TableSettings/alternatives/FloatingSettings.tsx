import React, { useState } from 'react';

import CodeIcon from '@mui/icons-material/Code';
import DoneIcon from '@mui/icons-material/Done';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import SettingsIcon from '@mui/icons-material/Settings';
import SpeedIcon from '@mui/icons-material/Speed';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import VisibilityIcon from '@mui/icons-material/Visibility';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import Fab from '@mui/material/Fab';
import Fade from '@mui/material/Fade';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import { alpha, useTheme } from '@mui/material/styles';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Zoom from '@mui/material/Zoom';
import { useResultsViewSettingsStore } from '../../store';

interface QuickAction {
  id: string;
  icon: React.ReactNode;
  label: string;
  color?: 'primary' | 'secondary' | 'default';
}

const FloatingSettings: React.FC = () => {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [textLengthOpen, setTextLengthOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const {
    maxTextLength,
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

  const quickActions: QuickAction[] = [
    {
      id: 'sticky',
      icon: <ViewColumnIcon />,
      label: 'Sticky Header',
      color: stickyHeader ? 'primary' : 'default',
    },
    {
      id: 'markdown',
      icon: <TextFieldsIcon />,
      label: 'Markdown',
      color: renderMarkdown ? 'primary' : 'default',
    },
    {
      id: 'json',
      icon: <CodeIcon />,
      label: 'Pretty JSON',
      color: prettifyJson ? 'primary' : 'default',
    },
    {
      id: 'passfail',
      icon: <DoneIcon />,
      label: 'Pass/Fail',
      color: showPassFail ? 'primary' : 'default',
    },
    {
      id: 'inference',
      icon: <SpeedIcon />,
      label: 'Details',
      color: showInferenceDetails ? 'primary' : 'default',
    },
    {
      id: 'prompts',
      icon: <VisibilityIcon />,
      label: 'Prompts',
      color: showPrompts ? 'primary' : 'default',
    },
  ];

  const handleActionClick = (actionId: string) => {
    switch (actionId) {
      case 'sticky':
        setStickyHeader(!stickyHeader);
        break;
      case 'markdown':
        setRenderMarkdown(!renderMarkdown);
        break;
      case 'json':
        setPrettifyJson(!prettifyJson);
        break;
      case 'passfail':
        setShowPassFail(!showPassFail);
        break;
      case 'inference':
        setShowInferenceDetails(!showInferenceDetails);
        break;
      case 'prompts':
        setShowPrompts(!showPrompts);
        break;
    }
  };

  const handleTextLengthClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
    setTextLengthOpen(!textLengthOpen);
  };

  const handleClose = () => {
    setOpen(false);
    setTextLengthOpen(false);
  };

  const viewMode =
    maxTextLength <= 100
      ? 'compact'
      : maxTextLength <= 250
        ? 'normal'
        : maxTextLength <= 500
          ? 'detailed'
          : 'full';

  return (
    <>
      <ClickAwayListener onClickAway={handleClose}>
        <Box
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1300,
          }}
        >
          {/* Quick Actions */}
          <Fade in={open}>
            <Card
              sx={{
                position: 'absolute',
                bottom: 80,
                right: 0,
                p: 2,
                borderRadius: 3,
                boxShadow: theme.shadows[8],
                backgroundColor: alpha(theme.palette.background.paper, 0.98),
                backdropFilter: 'blur(20px)',
                width: 320,
              }}
            >
              {/* View Mode Selector */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                  VIEW MODE
                </Typography>
                <ToggleButtonGroup
                  value={viewMode}
                  exclusive
                  onChange={(_, newMode) => {
                    if (newMode) {
                      const lengths = {
                        compact: 100,
                        normal: 250,
                        detailed: 500,
                        full: Number.POSITIVE_INFINITY,
                      };
                      setMaxTextLength(lengths[newMode as keyof typeof lengths]);
                    }
                  }}
                  size="small"
                  fullWidth
                  sx={{
                    '& .MuiToggleButton-root': {
                      borderRadius: 2,
                      textTransform: 'none',
                      fontSize: '0.75rem',
                    },
                  }}
                >
                  <ToggleButton value="compact">Compact</ToggleButton>
                  <ToggleButton value="normal">Normal</ToggleButton>
                  <ToggleButton value="detailed">Detailed</ToggleButton>
                  <ToggleButton value="full">Full</ToggleButton>
                </ToggleButtonGroup>
              </Box>

              {/* Quick Toggle Grid */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                  QUICK TOGGLES
                </Typography>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 1,
                  }}
                >
                  {quickActions.map((action) => (
                    <Tooltip key={action.id} title={action.label}>
                      <IconButton
                        onClick={() => handleActionClick(action.id)}
                        color={action.color}
                        sx={{
                          borderRadius: 2,
                          border: `1px solid ${alpha(theme.palette.divider, 0.2)}`,
                          backgroundColor:
                            action.color === 'primary'
                              ? alpha(theme.palette.primary.main, 0.08)
                              : 'transparent',
                          '&:hover': {
                            backgroundColor:
                              action.color === 'primary'
                                ? alpha(theme.palette.primary.main, 0.12)
                                : alpha(theme.palette.action.hover, 0.04),
                          },
                        }}
                      >
                        {action.icon}
                      </IconButton>
                    </Tooltip>
                  ))}
                </Box>
              </Box>

              {/* Text Length Control */}
              <Box>
                <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
                  <Typography variant="caption" color="text.secondary">
                    TEXT LENGTH
                  </Typography>
                  <Typography variant="caption" fontWeight={600}>
                    {maxTextLength === Number.POSITIVE_INFINITY
                      ? 'Unlimited'
                      : `${maxTextLength} chars`}
                  </Typography>
                </Stack>
                <Slider
                  value={maxTextLength === Number.POSITIVE_INFINITY ? 1001 : maxTextLength}
                  onChange={(_, value) => {
                    const newValue = value as number;
                    setMaxTextLength(newValue === 1001 ? Number.POSITIVE_INFINITY : newValue);
                  }}
                  min={25}
                  max={1001}
                  step={25}
                  marks={[
                    { value: 100, label: '100' },
                    { value: 500, label: '500' },
                    { value: 1001, label: '∞' },
                  ]}
                  sx={{
                    '& .MuiSlider-mark': {
                      height: 4,
                    },
                  }}
                />
              </Box>
            </Card>
          </Fade>

          {/* Floating Text Length Control */}
          <Zoom in={!open}>
            <Paper
              sx={{
                position: 'absolute',
                bottom: 80,
                right: 0,
                borderRadius: 20,
                overflow: 'hidden',
                boxShadow: theme.shadows[2],
                backgroundColor: alpha(theme.palette.background.paper, 0.9),
                backdropFilter: 'blur(10px)',
              }}
              onClick={handleTextLengthClick}
            >
              <Box
                sx={{
                  px: 2,
                  py: 1,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  '&:hover': {
                    backgroundColor: alpha(theme.palette.action.hover, 0.04),
                  },
                }}
              >
                <FormatAlignLeftIcon fontSize="small" />
                <Typography variant="caption" fontWeight={500}>
                  {maxTextLength === Number.POSITIVE_INFINITY ? '∞' : maxTextLength}
                </Typography>
              </Box>
            </Paper>
          </Zoom>

          {/* Main FAB */}
          <Fab
            color="primary"
            onClick={() => setOpen(!open)}
            sx={{
              boxShadow: theme.shadows[4],
              transition: 'all 0.2s ease',
              transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
              '&:hover': {
                transform: open ? 'rotate(45deg) scale(1.05)' : 'scale(1.05)',
              },
            }}
          >
            <SettingsIcon />
          </Fab>
        </Box>
      </ClickAwayListener>

      {/* Text Length Popover */}
      <Popper
        open={textLengthOpen}
        anchorEl={anchorEl}
        placement="left"
        transition
        sx={{ zIndex: 1400 }}
      >
        {({ TransitionProps }) => (
          <Fade {...TransitionProps} timeout={200}>
            <Paper
              sx={{
                p: 2,
                borderRadius: 2,
                boxShadow: theme.shadows[8],
                width: 250,
                mr: 1,
              }}
            >
              <Typography variant="body2" fontWeight={500} gutterBottom>
                Text Length
              </Typography>
              <Slider
                value={maxTextLength === Number.POSITIVE_INFINITY ? 1001 : maxTextLength}
                onChange={(_, value) => {
                  const newValue = value as number;
                  setMaxTextLength(newValue === 1001 ? Number.POSITIVE_INFINITY : newValue);
                }}
                min={25}
                max={1001}
                step={25}
                marks
                valueLabelDisplay="auto"
                valueLabelFormat={(value) => (value === 1001 ? '∞' : value)}
              />
            </Paper>
          </Fade>
        )}
      </Popper>
    </>
  );
};

export default React.memo(FloatingSettings);
