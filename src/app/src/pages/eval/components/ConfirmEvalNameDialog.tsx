import { useState, useEffect, useRef } from 'react';
import WarningIcon from '@mui/icons-material/Warning';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

interface ConfirmEvalNameDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  label: string;
  currentName: string;
  actionButtonText: string;
  helperText?: string;
  onConfirm: (newName: string) => Promise<void>;
  // Optional: for large eval warnings (copy only)
  showSizeWarning?: boolean;
  itemCount?: number;
  itemLabel?: string;
}

export const ConfirmEvalNameDialog = ({
  open,
  onClose,
  title,
  label,
  currentName,
  actionButtonText,
  helperText,
  onConfirm,
  showSizeWarning = false,
  itemCount,
  itemLabel = 'items',
}: ConfirmEvalNameDialogProps) => {
  const [name, setName] = useState(currentName);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Determine if this is a large operation
  const isLargeOperation = showSizeWarning && itemCount && itemCount > 10000;
  const isVeryLargeOperation = showSizeWarning && itemCount && itemCount > 50000;

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setName(currentName);
      setError(null);
      setIsLoading(false);
      // Auto-focus and select text after dialog opens
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    }
  }, [open, currentName]);

  const handleConfirm = async () => {
    // Validation: prevent empty/whitespace-only names
    if (isLoading || !name.trim()) {
      return;
    }

    // For rename (no itemCount), if name hasn't changed, just close
    // For copy operations (has itemCount), always proceed even with default name
    if (name.trim() === currentName && itemCount === undefined) {
      onClose();
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await onConfirm(name.trim());
      onClose();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Operation failed';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleConfirm();
    }
  };

  return (
    <Dialog open={open} onClose={isLoading ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {isLargeOperation && (
          <Alert
            severity={isVeryLargeOperation ? 'warning' : 'info'}
            icon={isVeryLargeOperation ? <WarningIcon /> : undefined}
            sx={{ mb: 2 }}
          >
            <Typography variant="body2">
              <strong>
                This evaluation has {itemCount?.toLocaleString()} {itemLabel}.
              </strong>
              {isVeryLargeOperation
                ? ' This operation may take several minutes. Please be patient.'
                : ' This operation may take up to a minute.'}
            </Typography>
          </Alert>
        )}
        <TextField
          inputRef={inputRef}
          autoFocus
          fullWidth
          label={label}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          margin="normal"
          error={!!error}
          helperText={
            error ||
            (isLoading && itemCount
              ? `Processing ${itemCount.toLocaleString()} ${itemLabel}...`
              : helperText || `Enter a ${label.toLowerCase()} for this evaluation`)
          }
          disabled={isLoading}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          disabled={
            isLoading || !name.trim() || (name.trim() === currentName && itemCount === undefined)
          }
          startIcon={isLoading ? <CircularProgress size={20} /> : null}
        >
          {isLoading ? 'Processing...' : actionButtonText}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
