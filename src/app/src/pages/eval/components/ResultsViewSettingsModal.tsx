import React, { useState, useCallback } from 'react';
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

const MemoizedRangeSlider = React.memo(
  ({
    value,
    onChange,
    onChangeCommitted,
    min,
    max,
    label,
    unlimited,
  }: {
    value: number;
    onChange: (event: Event | React.SyntheticEvent, value: number | number[]) => void;
    onChangeCommitted?: (event: Event | React.SyntheticEvent, value: number | number[]) => void;
    min: number;
    max: number;
    label: string;
    unlimited?: boolean;
  }) => {
    const displayValue = unlimited && value === max ? 'Unlimited' : value;
    const marks = [
      { value: min, label: String(min) },
      { value: max, label: unlimited ? 'Unlimited' : String(max) },
    ];

    return (
      <Box maxWidth="sm">
        <Typography mt={2}>
          {label}: {displayValue}
        </Typography>
        <Slider
          min={min}
          max={max}
          value={value}
          onChange={onChange}
          onChangeCommitted={onChangeCommitted}
          marks={marks}
          sx={{
            '& .MuiSlider-markLabel[data-index="0"]': {
              transform: 'translateX(0%)',
            },
            '& .MuiSlider-markLabel[data-index="1"]': {
              transform: 'translateX(-100%)',
            },
          }}
        />
      </Box>
    );
  },
);

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
    prettifyJson,
    setPrettifyJson,
    showPrompts,
    setShowPrompts,
    showPassFail,
    setShowPassFail,
    stickyHeader,
    setStickyHeader,
    maxImageWidth,
    setMaxImageWidth,
    maxImageHeight,
    setMaxImageHeight,
  } = useResultsViewStore();

  const [localMaxTextLength, setLocalMaxTextLength] = useState(
    maxTextLength === Number.POSITIVE_INFINITY ? 1001 : maxTextLength,
  );

  const handleSliderChange = useCallback(
    (_event: Event | React.SyntheticEvent, value: number | number[]) => {
      setLocalMaxTextLength(value as number);
    },
    [],
  );

  const handleSliderChangeCommitted = useCallback(
    (_event: Event | React.SyntheticEvent, value: number | number[]) => {
      const newValue = value === 1001 ? Number.POSITIVE_INFINITY : (value as number);
      setMaxTextLength(newValue);
    },
    [setMaxTextLength],
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Table View Settings</DialogTitle>
      <DialogContent>
        <Box>
          <FormControlLabel
            control={
              <Checkbox
                checked={stickyHeader}
                onChange={(e) => setStickyHeader(e.target.checked)}
              />
            }
            label="Sticky header"
          />
        </Box>
        <Box>
          <Tooltip
            title="Forcing line breaks makes it easier to adjust column widths to your liking"
            placement="right"
          >
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
          <FormControlLabel
            control={
              <Checkbox
                checked={prettifyJson}
                onChange={(e) => setPrettifyJson(e.target.checked)}
              />
            }
            label="Prettify JSON outputs"
          />
        </Box>
        <Box>
          <Tooltip
            title="Show the final prompt that produced the output in each cell."
            placement="right"
          >
            <FormControlLabel
              control={
                <Checkbox
                  checked={showPrompts}
                  onChange={(e) => setShowPrompts(e.target.checked)}
                />
              }
              label="Show full prompt in output cell"
            />
          </Tooltip>
        </Box>
        <Box>
          <Tooltip title="Show pass/fail status for each output." placement="right">
            <FormControlLabel
              control={
                <Checkbox
                  checked={showPassFail}
                  onChange={(e) => setShowPassFail(e.target.checked)}
                />
              }
              label="Show pass/fail status"
            />
          </Tooltip>
        </Box>
        <Box>
          <Tooltip
            title="Show detailed inference statistics such as latency, tokens used, cost, etc."
            placement="right"
          >
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
        <MemoizedRangeSlider
          value={localMaxTextLength}
          onChange={handleSliderChange}
          onChangeCommitted={handleSliderChangeCommitted}
          min={25}
          max={1001}
          label="Max text length"
          unlimited
        />
        <MemoizedRangeSlider
          value={maxImageWidth}
          onChange={(_, value) => setMaxImageWidth(value as number)}
          min={100}
          max={1000}
          label="Max image width (px)"
        />
        <MemoizedRangeSlider
          value={maxImageHeight}
          onChange={(_, value) => setMaxImageHeight(value as number)}
          min={100}
          max={1000}
          label="Max image height (px)"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default React.memo(SettingsModal);
