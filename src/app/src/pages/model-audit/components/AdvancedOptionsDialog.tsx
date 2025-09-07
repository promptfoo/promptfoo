import { useState } from 'react';

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

export default function AdvancedOptionsDialog({
  open,
  onClose,
  scanOptions,
  onOptionsChange,
}: AdvancedOptionsDialogProps) {
  const [blacklistInput, setBlacklistInput] = useState('');
  const [localOptions, setLocalOptions] = useState(scanOptions);

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
            <TextField
              fullWidth
              type="number"
              value={localOptions.timeout}
              onChange={(e) =>
                setLocalOptions({
                  ...localOptions,
                  timeout: Number.parseInt(e.target.value) || 300,
                })
              }
              InputProps={{
                endAdornment: <InputAdornment position="end">seconds</InputAdornment>,
              }}
            />
          </Box>

          {/* Max Size */}
          <Box>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Maximum Size Limit
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Override auto-detected size limits. Examples: <code>1GB</code>, <code>500MB</code>, <code>2TB</code>, <code>100KB</code>
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
              InputProps={{
                endAdornment: <InputAdornment position="end">size</InputAdornment>,
              }}
            />
          </Box>

          {/* Output Format */}
          <Box>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Output Format
            </Typography>
            <TextField
              fullWidth
              select
              value={localOptions.format || 'text'}
              onChange={(e) =>
                setLocalOptions({
                  ...localOptions,
                  format: e.target.value as 'text' | 'json' | 'sarif',
                })
              }
              SelectProps={{ native: true }}
            >
              <option value="text">Text</option>
              <option value="json">JSON</option>
              <option value="sarif">SARIF</option>
            </TextField>
          </Box>

          {/* Boolean Options */}
          <Stack spacing={2}>
            {/* Verbose */}
            <FormControlLabel
              control={
                <Switch
                  checked={localOptions.verbose}
                  onChange={(e) => setLocalOptions({ ...localOptions, verbose: e.target.checked })}
                />
              }
              label={
                <Box>
                  <Typography variant="subtitle1" fontWeight={600}>
                    Verbose Output
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Show detailed scanning information
                  </Typography>
                </Box>
              }
            />

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

            {/* Dry Run */}
            <FormControlLabel
              control={
                <Switch
                  checked={localOptions.dryRun || false}
                  onChange={(e) => setLocalOptions({ ...localOptions, dryRun: e.target.checked })}
                />
              }
              label={
                <Box>
                  <Typography variant="subtitle1" fontWeight={600}>
                    Dry Run (Preview Mode)
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Preview what would be scanned without actually doing it
                  </Typography>
                </Box>
              }
            />

            {/* Quiet Mode */}
            <FormControlLabel
              control={
                <Switch
                  checked={localOptions.quiet || false}
                  onChange={(e) => setLocalOptions({ ...localOptions, quiet: e.target.checked })}
                />
              }
              label={
                <Box>
                  <Typography variant="subtitle1" fontWeight={600}>
                    Quiet Mode
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Silence detection messages
                  </Typography>
                </Box>
              }
            />

            {/* Progress Reporting */}
            <FormControlLabel
              control={
                <Switch
                  checked={localOptions.progress || false}
                  onChange={(e) => setLocalOptions({ ...localOptions, progress: e.target.checked })}
                />
              }
              label={
                <Box>
                  <Typography variant="subtitle1" fontWeight={600}>
                    Force Progress Reporting
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Force enable progress reporting (auto-detected by default)
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
