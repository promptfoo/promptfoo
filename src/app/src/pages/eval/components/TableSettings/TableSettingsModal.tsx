import React from 'react';
import CloseIcon from '@mui/icons-material/Close';
import RestoreIcon from '@mui/icons-material/Restore';
import SettingsIcon from '@mui/icons-material/Settings';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Stack,
  Typography,
  Divider,
  useTheme,
  alpha,
  useMediaQuery,
} from '@mui/material';
import SettingsPanel from './components/SettingsPanel';
import { useSettingsState } from './hooks/useSettingsState';
import { tokens } from './tokens';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const TableSettingsModal: React.FC<SettingsModalProps> = ({ open, onClose }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const { hasChanges, resetToDefaults } = useSettingsState(open);

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        elevation: tokens.elevation.dialog,
        sx: {
          borderRadius: tokens.borderRadius.medium,
          overflow: 'hidden',
          backgroundImage:
            theme.palette.mode === 'dark'
              ? `linear-gradient(${alpha(theme.palette.background.paper, 0.8)}, ${alpha(theme.palette.background.paper, 0.95)})`
              : `linear-gradient(${alpha(theme.palette.background.paper, 0.97)}, ${theme.palette.background.paper})`,
          backdropFilter: 'blur(8px)',
        },
      }}
      sx={{
        '& .MuiBackdrop-root': {
          backdropFilter: 'blur(4px)',
          backgroundColor: alpha(theme.palette.background.default, 0.4),
        },
      }}
      aria-labelledby="settings-dialog-title"
      fullScreen={isMobile}
    >
      <DialogTitle
        id="settings-dialog-title"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: tokens.spacing.padding.container,
          pb: tokens.spacing.padding.item,
          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={tokens.spacing.stack.medium}>
          <SettingsIcon
            color="primary"
            sx={{
              fontSize: '1.75rem',
              opacity: 0.9,
            }}
          />
          <Typography variant="h6" fontWeight={600}>
            Table Settings
          </Typography>
        </Stack>
        <IconButton
          edge="end"
          color="inherit"
          onClick={handleClose}
          aria-label="close"
          sx={{
            transition: `all ${tokens.animation.fast}ms ease`,
            '&:hover': {
              backgroundColor: alpha(theme.palette.primary.main, 0.08),
            },
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent
        sx={{
          p: 0,
          height: {
            xs: 'calc(100% - 125px)',
            sm: 480,
          },
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
        <SettingsPanel />
      </DialogContent>

      <Divider sx={{ opacity: 0.6 }} />

      <DialogActions
        sx={{
          px: {
            xs: tokens.spacing.padding.item,
            sm: tokens.spacing.padding.container,
          },
          py: tokens.spacing.padding.item,
          justifyContent: 'space-between',
        }}
      >
        <Button
          startIcon={<RestoreIcon />}
          onClick={resetToDefaults}
          color="inherit"
          size="small"
          aria-label="Reset settings to defaults"
          title="Reset all settings to their default values"
          sx={{
            borderRadius: tokens.borderRadius.pill,
            px: tokens.spacing.padding.item,
            py: tokens.spacing.padding.compact - 0.25,
            transition: `all ${tokens.animation.fast}ms ease-in-out`,
            '&:hover': {
              backgroundColor: alpha(theme.palette.text.primary, 0.07),
            },
          }}
        >
          Reset to Defaults
        </Button>
        <Button
          onClick={handleClose}
          color="primary"
          variant="contained"
          disableElevation
          sx={{
            borderRadius: tokens.borderRadius.pill,
            px: tokens.spacing.padding.container,
            py: tokens.spacing.padding.compact - 0.1,
            fontWeight: 600,
            backgroundColor: hasChanges
              ? theme.palette.primary.main
              : alpha(theme.palette.primary.main, 0.8),
            boxShadow: hasChanges ? theme.shadows[2] : 'none',
            transition: `all ${tokens.animation.fast}ms ease-in-out`,
            '&:hover': {
              boxShadow: theme.shadows[3],
              transform: 'translateY(-1px)',
            },
          }}
        >
          {hasChanges ? 'Save Changes' : 'Done'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default React.memo(TableSettingsModal);
