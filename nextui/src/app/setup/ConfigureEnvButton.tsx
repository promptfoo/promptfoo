import React, { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import SettingsIcon from '@mui/icons-material/Settings';

const ConfigureEnvButton: React.FC = () => {
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleOpen = () => {
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
  };

  return (
    <>
      <Button startIcon={<SettingsIcon />} onClick={handleOpen}>
        API keys
      </Button>
      <Dialog open={dialogOpen} onClose={handleClose}>
        <DialogTitle>Configure APIs</DialogTitle>
        {/* Add your form or other dialog content here */}
      </Dialog>
    </>
  );
};

export default ConfigureEnvButton;
