import React from 'react';
import SettingsIcon from '@mui/icons-material/Settings';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Slider from '@mui/material/Slider';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useReportStore } from './store';

const ReportSettingsDialogButton: React.FC = () => {
  const {
    showPercentagesOnRiskCards,
    setShowPercentagesOnRiskCards,
    pluginPassRateThreshold,
    setPluginPassRateThreshold,
    showComplianceSection,
    setShowComplianceSection,
  } = useReportStore();
  const [open, setOpen] = React.useState(false);

  const handleOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <>
      <Tooltip title="Report Settings" placement="top">
        <IconButton onClick={handleOpen} aria-label="settings">
          <SettingsIcon />
        </IconButton>
      </Tooltip>
      <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
        <DialogTitle>Report Settings</DialogTitle>
        <DialogContent>
          <Typography component="div" sx={{ padding: '16px 0' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showComplianceSection}
                onChange={(e) => setShowComplianceSection(e.target.checked)}
                style={{ marginRight: '10px' }}
              />
              Show compliance section (NIST, OWASP)
            </label>
          </Typography>
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
          <Typography component="div" sx={{ padding: '16px 0' }}>
            <label>Plugin Pass Rate Threshold: {(pluginPassRateThreshold * 100).toFixed(0)}%</label>
            <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
              Sets the threshold for considering a plugin as passed on the risk cards.
            </Typography>
            <Slider
              value={pluginPassRateThreshold}
              onChange={(_, newValue) => setPluginPassRateThreshold(newValue as number)}
              aria-labelledby="plugin-pass-rate-threshold-slider"
              step={0.05}
              marks
              min={0}
              max={1}
              valueLabelDisplay="auto"
              valueLabelFormat={(value) => `${(value * 100).toFixed(0)}%`}
            />
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
