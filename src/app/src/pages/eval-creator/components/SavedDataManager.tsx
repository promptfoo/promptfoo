import React, { useState } from 'react';
import { useStore } from '@app/stores/evalConfig';
import { useHistoryStore } from '@app/stores/evalConfigWithHistory';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';

const formatBytes = (bytes: number): string => {
  if (bytes === 0) {
    return '0 Bytes';
  }
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const SavedDataManager: React.FC = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { clearSavedData, getSavedDataSize, config } = useStore();

  const dataSize = getSavedDataSize();
  const hasData = dataSize > 0 || Object.keys(config).length > 0;

  const handleClearData = () => {
    clearSavedData();
    useHistoryStore.getState().clearHistory();
    setDialogOpen(false);
  };

  if (!hasData) {
    return null;
  }

  return (
    <>
      <Button
        variant="outlined"
        color="warning"
        startIcon={<DeleteForeverIcon />}
        onClick={() => setDialogOpen(true)}
        size="small"
      >
        Clear Saved Data ({formatBytes(dataSize)})
      </Button>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        aria-labelledby="clear-data-dialog-title"
        aria-describedby="clear-data-dialog-description"
      >
        <DialogTitle id="clear-data-dialog-title">Clear All Saved Data?</DialogTitle>
        <DialogContent>
          <DialogContentText id="clear-data-dialog-description">
            This will permanently delete all saved evaluation configuration data from your browser's
            local storage. The current configuration ({formatBytes(dataSize)}) will be lost and
            cannot be recovered.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleClearData} color="warning" autoFocus>
            Clear Data
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
