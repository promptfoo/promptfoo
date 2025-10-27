import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useToast } from '@app/hooks/useToast';
import { callApi } from '@app/utils/api';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import ListItemIcon from '@mui/material/ListItemIcon';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';

interface CopyEvalMenuItemProps {
  evalId: string;
  currentDescription: string;
}

function CopyEvalMenuItem({ evalId, currentDescription }: CopyEvalMenuItemProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newDescription, setNewDescription] = useState(
    `Copy of ${currentDescription}`.slice(0, 200),
  );
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const handleOpenDialog = () => {
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setNewDescription(`Copy of ${currentDescription}`.slice(0, 200));
  };

  const handleCopy = async () => {
    setIsLoading(true);
    try {
      const response = await callApi(`/eval/${evalId}/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: newDescription.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to copy eval');
      }

      const { id: newEvalId } = await response.json();
      showToast('Eval copied successfully', 'success');
      handleCloseDialog();

      // Navigate to the new eval
      navigate(`/eval/?evalId=${newEvalId}`);
    } catch (error) {
      console.error('Failed to copy eval:', error);
      showToast(error instanceof Error ? error.message : 'Failed to copy eval', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Tooltip title="Create a copy of this eval with a new name" placement="left">
        <MenuItem onClick={handleOpenDialog}>
          <ListItemIcon>
            <ContentCopyIcon fontSize="small" />
          </ListItemIcon>
          Copy eval
        </MenuItem>
      </Tooltip>

      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Copy Evaluation</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Name for copied eval"
            fullWidth
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !isLoading &&
                newDescription.trim().length > 0 &&
                newDescription.trim().length <= 200
              ) {
                handleCopy();
              }
            }}
            helperText={`${newDescription.trim().length}/200 characters`}
            error={newDescription.trim().length === 0 || newDescription.trim().length > 200}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleCopy}
            variant="contained"
            disabled={
              isLoading || newDescription.trim().length === 0 || newDescription.trim().length > 200
            }
          >
            {isLoading ? 'Copying...' : 'Copy'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default CopyEvalMenuItem;
