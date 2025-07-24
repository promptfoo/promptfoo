import { useState } from 'react';

import { useTelemetry } from '@app/hooks/useTelemetry';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { useNavigate } from 'react-router-dom';
import { EXAMPLE_CONFIG, useRedTeamConfig } from '../hooks/useRedTeamConfig';

export default function LoadExampleButton() {
  const { setFullConfig } = useRedTeamConfig();
  const { recordEvent } = useTelemetry();
  const navigate = useNavigate();

  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const handleClick = () => {
    setConfirmDialogOpen(true);
  };

  const handleConfirmation = () => {
    recordEvent('feature_used', { feature: 'redteam_config_example' });
    setFullConfig(EXAMPLE_CONFIG);
    setConfirmDialogOpen(false);
    // Reload the page to persist the new config into the form fields:
    navigate(0);
  };

  return (
    <>
      <Dialog open={confirmDialogOpen} onClose={() => setConfirmDialogOpen(false)}>
        <DialogTitle>Load Example Configuration?</DialogTitle>
        <DialogContent>
          Load example configuration with demo chat endpoint and sample application details? Current
          settings will be replaced.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleConfirmation} variant="contained" color="primary">
            Load Example
          </Button>
        </DialogActions>
      </Dialog>
      <Button variant="outlined" onClick={handleClick}>
        Load Example
      </Button>
    </>
  );
}
