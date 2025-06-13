import { useState } from 'react';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { EXAMPLE_CONFIG, useRedTeamConfig } from '../hooks/useRedTeamConfig';

export default function LoadExampleButton() {
  const { setFullConfig } = useRedTeamConfig();
  const { recordEvent } = useTelemetry();

  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const handleClick = () => {
    setConfirmDialogOpen(true);
  };

  const handleConfirmation = () => {
    recordEvent('feature_used', { feature: 'redteam_config_example' });
    //setTestMode('application');
    setFullConfig(EXAMPLE_CONFIG);
    setConfirmDialogOpen(false);
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
