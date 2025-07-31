import React, { useEffect, useState } from 'react';

import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { alpha, useTheme } from '@mui/material/styles';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useResultsViewSettingsStore } from '../store';
import type { SettingsUIMode } from '../store';

const UI_MODE_OPTIONS: Array<{
  value: SettingsUIMode;
  label: string;
  description: string;
  details: string;
  bestFor: string[];
}> = [
  {
    value: 'workflow',
    label: 'Workflow Modes',
    description: 'Task-oriented presets with keyboard shortcuts',
    details:
      'Switch between Scan (S), Debug (D), Compare (C), Analyze (A), and Present (P) modes instantly. Each mode optimizes all settings for that specific task.',
    bestFor: ['Iterative development', 'Quick task switching', 'Consistent workflows'],
  },
  {
    value: 'ambient',
    label: 'Ambient Toolbar',
    description: 'Context-aware controls that appear when needed',
    details:
      "Controls appear when you select text, hover over long content, or pause scrolling. Provides just the settings relevant to what you're doing.",
    bestFor: ['Minimal UI preference', 'Focus on content', 'Occasional adjustments'],
  },
  {
    value: 'keyboard',
    label: 'Keyboard Commands',
    description: 'Vim-style commands for power users',
    details:
      'Press / to enter command mode. Use v for view modes, t for toggles, +/- for text length. Everything without touching the mouse.',
    bestFor: ['Keyboard-first workflow', 'Speed and efficiency', 'Power users'],
  },
  {
    value: 'lens',
    label: 'Reading Lens',
    description: 'Focused reading experience for long outputs',
    details:
      'Click any cell to open in reading mode. Compare outputs side-by-side, search within content, track reading progress.',
    bestFor: ['Analyzing long outputs', 'Comparing results', 'Deep content review'],
  },
  {
    value: 'modal',
    label: 'Classic Settings',
    description: 'Traditional settings dialog',
    details:
      'All settings in one familiar dialog window. Good for users who prefer conventional interfaces.',
    bestFor: ['Familiar pattern', 'See all options', 'Infrequent changes'],
  },
];

const SettingsUISelector: React.FC = () => {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const { settingsUIMode, setSettingsUIMode } = useResultsViewSettingsStore();
  const [selectedMode, setSelectedMode] = useState<SettingsUIMode>(settingsUIMode);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Check if we're in an input field or dialog is open
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || open) {
        return;
      }

      // Quick switch with number keys
      const keyNum = parseInt(e.key);
      if (keyNum >= 1 && keyNum <= 5) {
        e.preventDefault();
        const newMode = UI_MODE_OPTIONS[keyNum - 1].value;
        setSettingsUIMode(newMode);
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [setSettingsUIMode, open]);

  const handleOpen = () => {
    setSelectedMode(settingsUIMode);
    setOpen(true);
  };

  const handleSave = () => {
    setSettingsUIMode(selectedMode);
    setOpen(false);
  };

  const handleCancel = () => {
    setSelectedMode(settingsUIMode);
    setOpen(false);
  };

  const selectedOption = UI_MODE_OPTIONS.find((opt) => opt.value === selectedMode);

  return (
    <>
      <Tooltip title="Press 1-5 to quickly switch settings UI">
        <Button
          startIcon={<AutoAwesomeIcon />}
          onClick={handleOpen}
          variant="outlined"
          size="small"
          sx={{
            borderRadius: 2,
            textTransform: 'none',
            borderColor: alpha(theme.palette.primary.main, 0.3),
            '&:hover': {
              borderColor: theme.palette.primary.main,
              backgroundColor: alpha(theme.palette.primary.main, 0.04),
            },
          }}
        >
          {UI_MODE_OPTIONS.find((opt) => opt.value === settingsUIMode)?.label || 'Settings'}
        </Button>
      </Tooltip>

      <Dialog
        open={open}
        onClose={handleCancel}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: 'hidden',
          },
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Stack spacing={1}>
            <Typography variant="h6" fontWeight={600}>
              Choose Your Settings Interface
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Each interface is designed for different workflows and preferences
            </Typography>
          </Stack>
        </DialogTitle>

        <DialogContent sx={{ pb: 2 }}>
          <Stack spacing={2}>
            {UI_MODE_OPTIONS.map((option, index) => (
              <Paper
                key={option.value}
                onClick={() => setSelectedMode(option.value)}
                elevation={selectedMode === option.value ? 8 : 0}
                sx={{
                  p: 3,
                  cursor: 'pointer',
                  border: `2px solid ${
                    selectedMode === option.value
                      ? theme.palette.primary.main
                      : alpha(theme.palette.divider, 0.2)
                  }`,
                  borderRadius: 2,
                  transition: 'all 0.2s ease',
                  backgroundColor:
                    selectedMode === option.value
                      ? alpha(theme.palette.primary.main, 0.02)
                      : 'transparent',
                  '&:hover': {
                    borderColor: theme.palette.primary.main,
                    transform: 'translateX(4px)',
                    boxShadow: theme.shadows[4],
                  },
                }}
              >
                <Stack spacing={2}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Stack direction="row" alignItems="center" spacing={2}>
                      <Typography variant="h6" fontWeight={600}>
                        {option.label}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          px: 1.5,
                          py: 0.5,
                          borderRadius: 1,
                          backgroundColor: alpha(theme.palette.text.secondary, 0.1),
                          fontFamily: 'monospace',
                          fontWeight: 600,
                        }}
                      >
                        {index + 1}
                      </Typography>
                    </Stack>
                    {selectedMode === option.value && (
                      <Typography
                        variant="caption"
                        sx={{
                          px: 2,
                          py: 0.5,
                          borderRadius: 2,
                          backgroundColor: alpha(theme.palette.primary.main, 0.1),
                          color: theme.palette.primary.main,
                          fontWeight: 600,
                        }}
                      >
                        Current
                      </Typography>
                    )}
                  </Stack>

                  <Typography variant="body2" color="text.secondary">
                    {option.description}
                  </Typography>

                  <Typography variant="body2">{option.details}</Typography>

                  <Box>
                    <Typography variant="caption" color="text.secondary" fontWeight={500}>
                      Best for:
                    </Typography>
                    <Stack direction="row" flexWrap="wrap" gap={1} mt={0.5}>
                      {option.bestFor.map((use) => (
                        <Chip
                          key={use}
                          label={use}
                          size="small"
                          sx={{
                            height: 24,
                            fontSize: '0.75rem',
                            backgroundColor: alpha(theme.palette.primary.main, 0.08),
                            border: 'none',
                          }}
                        />
                      ))}
                    </Stack>
                  </Box>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={handleCancel} color="inherit">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={selectedMode === settingsUIMode}
            disableElevation
          >
            Use {selectedOption?.label}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default React.memo(SettingsUISelector);
