import React from 'react';
import SettingsIcon from '@mui/icons-material/Settings';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { useReportStore } from './store';

const ReportSettingsDialogButton: React.FC = () => {
  const { showPercentagesOnRiskCards, setShowPercentagesOnRiskCards } = useReportStore();
  const [open, setOpen] = React.useState(false);

  const handleOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <>
      <IconButton
        onClick={handleOpen}
        sx={{ position: 'absolute', top: 8, right: 8 }}
        aria-label="settings"
      >
        <SettingsIcon />
      </IconButton>
      <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
        <DialogTitle>Report Settings</DialogTitle>
        <DialogContent>
          <Typography component="div" sx={{ padding: '16px 0' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showPercentagesOnRiskCards}
                onChange={(e) => setShowPercentagesOnRiskCards(e.target.checked)}
                style={{ marginRight: '10px' }}
              />
              Show percentages on risk cards
            </label>
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} variant="contained" color="primary">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default ReportSettingsDialogButton;
