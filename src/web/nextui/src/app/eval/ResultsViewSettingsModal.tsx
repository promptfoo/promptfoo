import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Slider from '@mui/material/Slider';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { useStore as useResultsViewStore } from './store';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose }) => {
  const {
    maxTextLength,
    setMaxTextLength,
    wordBreak,
    setWordBreak,
    showInferenceDetails,
    setShowInferenceDetails,
    renderMarkdown,
    setRenderMarkdown,
  } = useResultsViewStore();
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Table View Settings</DialogTitle>
      <DialogContent>
        <Box>
          <Tooltip title="Forcing line breaks makes it easier to adjust column widths to your liking">
            <FormControlLabel
              control={
                <Checkbox
                  checked={wordBreak === 'break-all'}
                  onChange={(e) => setWordBreak(e.target.checked ? 'break-all' : 'break-word')}
                />
              }
              label="Force line breaks"
            />
          </Tooltip>
        </Box>
        <Box>
          <FormControlLabel
            control={
              <Checkbox
                checked={renderMarkdown}
                onChange={(e) => setRenderMarkdown(e.target.checked)}
              />
            }
            label="Render model outputs as Markdown"
          />
        </Box>
        <Box>
          <Tooltip title="Show detailed inference statistics such as latency, tokens used, cost, etc.">
            <FormControlLabel
              control={
                <Checkbox
                  checked={showInferenceDetails}
                  onChange={(e) => setShowInferenceDetails(e.target.checked)}
                />
              }
              label="Show inference details"
            />
          </Tooltip>
        </Box>
        <Box maxWidth="sm">
          <Typography mt={2}>Max text length: {maxTextLength}</Typography>
          <Slider
            min={25}
            max={1000}
            value={maxTextLength}
            onChange={(_, val: number | number[]) => setMaxTextLength(val as number)}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default SettingsModal;
