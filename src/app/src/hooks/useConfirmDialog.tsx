import React, { useState } from 'react';
import DeleteIcon from '@mui/icons-material/Delete';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Typography from '@mui/material/Typography';

export interface ConfirmDialogConfig {
  title: string;
  message?: string;
  warningMessage?: string;
  itemName: string;
  itemDetails?: string[];
  actionButtonText?: string;
  actionButtonColor?: 'error' | 'warning' | 'primary';
  icon?: React.ReactNode;
}

/**
 * Reusable hook for confirmation dialogs with loading states
 *
 * @example
 * const { confirm, ConfirmDialog } = useConfirmDialog();
 *
 * const handleDelete = () => {
 *   confirm(
 *     {
 *       title: 'Delete Item?',
 *       warningMessage: 'This cannot be undone',
 *       itemName: 'My Item',
 *       itemDetails: ['10 sub-items', 'Created yesterday'],
 *     },
 *     async () => {
 *       await deleteItem();
 *     }
 *   );
 * };
 *
 * return (
 *   <>
 *     <Button onClick={handleDelete}>Delete</Button>
 *     <ConfirmDialog />
 *   </>
 * );
 */
export const useConfirmDialog = () => {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<ConfirmDialogConfig | null>(null);
  const [onConfirmCallback, setOnConfirmCallback] = useState<(() => Promise<void>) | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const confirm = (dialogConfig: ConfirmDialogConfig, onConfirm: () => Promise<void>) => {
    setConfig(dialogConfig);
    setOnConfirmCallback(() => onConfirm);
    setOpen(true);
  };

  const handleConfirm = async () => {
    if (!onConfirmCallback) {
      return;
    }

    setIsConfirming(true);
    try {
      await onConfirmCallback();
      setOpen(false);
    } catch (error) {
      // Error handling is done in the callback itself
      // Just ensure we clean up the confirming state
      console.error('Confirmation action failed:', error);
    } finally {
      setIsConfirming(false);
    }
  };

  const handleClose = () => {
    if (isConfirming) {
      return; // Prevent closing while confirming
    }
    setOpen(false);
  };

  const ConfirmDialog = () => {
    if (!config) {
      return null;
    }

    const icon = config.icon || <DeleteIcon color="error" />;

    return (
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            {icon}
            {config.title}
          </Box>
        </DialogTitle>

        <DialogContent>
          {config.warningMessage && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {config.warningMessage}
            </Alert>
          )}

          {config.message && (
            <Typography variant="body1" gutterBottom>
              {config.message}
            </Typography>
          )}

          <Box sx={{ pl: 2, py: 1 }}>
            <Typography variant="body2" fontWeight="bold" gutterBottom>
              {config.itemName}
            </Typography>
            {config.itemDetails?.map((detail, idx) => (
              <Typography key={idx} variant="body2" color="text.secondary">
                • {detail}
              </Typography>
            ))}
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} disabled={isConfirming}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            color={config.actionButtonColor || 'error'}
            variant="contained"
            disabled={isConfirming}
            startIcon={isConfirming ? <CircularProgress size={16} /> : icon}
          >
            {isConfirming ? 'Processing...' : config.actionButtonText || 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    );
  };

  return { confirm, ConfirmDialog, isConfirming };
};
