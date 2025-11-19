import { useEffect, useState } from 'react';

import { BaseNumberInput } from '@app/components/form/input/BaseNumberInput';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import type { ScanOptions } from '../ModelAudit.types';

interface AdvancedOptionsDialogProps {
  open: boolean;
  onClose: () => void;
  scanOptions: ScanOptions;
  onOptionsChange: (options: ScanOptions) => void;
}

const defaultScanOptions: ScanOptions = {
  blacklist: [],
  timeout: 3600,
  maxSize: undefined,
  strict: false,
};

export default function AdvancedOptionsDialog({
  open,
  onClose,
  scanOptions,
  onOptionsChange,
}: AdvancedOptionsDialogProps) {
  const [blacklistInput, setBlacklistInput] = useState('');
  const [localOptions, setLocalOptions] = useState({
    ...defaultScanOptions,
    ...scanOptions,
  });

  // Update local options when scanOptions prop changes or when dialog opens
  useEffect(() => {
    setLocalOptions({
      ...defaultScanOptions,
      ...scanOptions,
    });
  }, [scanOptions, open]);

  const handleAddBlacklist = () => {
    if (blacklistInput.trim()) {
      setLocalOptions({
        ...localOptions,
        blacklist: [...localOptions.blacklist, blacklistInput.trim()],
      });
      setBlacklistInput('');
    }
  };

  const handleRemoveBlacklist = (index: number) => {
    setLocalOptions({
      ...localOptions,
      blacklist: localOptions.blacklist.filter((_, i) => i !== index),
    });
  };

  const handleSave = () => {
    onOptionsChange(localOptions);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Typography variant="h5" fontWeight={600}>
          Advanced Scan Options
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={4} sx={{ mt: 2 }}>
          {/* Blacklist Patterns */}
          <Box>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Blacklist Patterns
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Add patterns for disallowed model names (regex supported)
            </Typography>
            <TextField
              fullWidth
              label="Add pattern"
              value={blacklistInput}
              onChange={(e) => setBlacklistInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddBlacklist()}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <Button onClick={handleAddBlacklist} disabled={!blacklistInput.trim()}>
                      Add
                    </Button>
                  </InputAdornment>
                ),
              }}
            />
            {localOptions.blacklist.length > 0 && (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
                {localOptions.blacklist.map((pattern, index) => (
                  <Chip key={index} label={pattern} onDelete={() => handleRemoveBlacklist(index)} />
                ))}
              </Stack>
            )}
          </Box>

          {/* Timeout */}
          <Box>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Scan Timeout
            </Typography>
            <BaseNumberInput
              fullWidth
              value={localOptions.timeout}
              onChange={(v) =>
                setLocalOptions({
                  ...localOptions,
                  // @ts-expect-error - undefined will be clamped to 3600 onBlur.  This approach resolves issue where user cannot clear the field.  This would be better addressed using a more robust form approach and setting default on submit.
                  timeout: v,
                })
              }
              min={0}
              onBlur={() => {
                setLocalOptions(({ timeout, ...options }) => ({
                  ...options,
                  timeout: timeout !== undefined ? timeout : 3600,
                }));
              }}
              slotProps={{
                input: { endAdornment: <InputAdornment position="end">seconds</InputAdornment> },
              }}
            />
          </Box>

          {/* Max Size */}
          <Box>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Maximum Size Limit
            </Typography>
            <TextField
              fullWidth
              placeholder="e.g., 1GB, 500MB"
              value={localOptions.maxSize || ''}
              onChange={(e) =>
                setLocalOptions({
                  ...localOptions,
                  maxSize: e.target.value || undefined,
                })
              }
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Format examples: <strong>500MB</strong>, <strong>2GB</strong>, <strong>1.5TB</strong>,{' '}
              <strong>100KB</strong>
            </Typography>
          </Box>

          {/* Boolean Options */}
          <Stack spacing={2}>
            {/* Strict Mode */}
            <FormControlLabel
              control={
                <Switch
                  checked={localOptions.strict || false}
                  onChange={(e) => setLocalOptions({ ...localOptions, strict: e.target.checked })}
                />
              }
              label={
                <Box>
                  <Typography variant="subtitle1" fontWeight={600}>
                    Strict Mode
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Fail on warnings, scan all file types, strict license validation
                  </Typography>
                </Box>
              }
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 3 }}>
        <Button onClick={onClose} variant="outlined">
          Cancel
        </Button>
        <Button onClick={handleSave} variant="contained">
          Save Options
        </Button>
      </DialogActions>
    </Dialog>
  );
}
