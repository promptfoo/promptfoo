import React from 'react';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { ProviderOptions } from '../../types';

interface BrowserAutomationConfigurationProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
}

const BrowserAutomationConfiguration: React.FC<BrowserAutomationConfigurationProps> = ({
  selectedTarget,
  updateCustomTarget,
}) => {
  return (
    <Box mt={2}>
      <Typography variant="h6" gutterBottom>
        Browser Automation Configuration
      </Typography>
      <Box mt={2} p={2} border={1} borderColor="grey.300" borderRadius={1}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Configure browser automation steps to interact with web applications. Each step represents
          an action like navigation, clicking, or typing.
        </Typography>

        <FormControl fullWidth margin="normal">
          <InputLabel>Headless Mode</InputLabel>
          <Select
            value={selectedTarget.config.headless ?? true}
            onChange={(e) => updateCustomTarget('headless', e.target.value === 'true')}
            label="Headless Mode"
          >
            <MenuItem value="true">Yes (Hidden Browser)</MenuItem>
            <MenuItem value="false">No (Visible Browser)</MenuItem>
          </Select>
        </FormControl>

        <TextField
          fullWidth
          label="Timeout (ms)"
          type="number"
          value={selectedTarget.config.timeoutMs || 30000}
          onChange={(e) => updateCustomTarget('timeoutMs', Number(e.target.value))}
          margin="normal"
          helperText="Maximum time to wait for browser operations (in milliseconds)"
        />

        <TextField
          fullWidth
          label="Response Transform"
          value={selectedTarget.config.transformResponse || ''}
          onChange={(e) => updateCustomTarget('transformResponse', e.target.value)}
          margin="normal"
          placeholder="e.g., extracted.searchResults"
          helperText="JavaScript expression to parse the extracted data"
        />

        <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>
          Browser Steps
        </Typography>

        {selectedTarget.config.steps?.map((step: any, index: number) => (
          <Box
            key={index}
            sx={{ mb: 2, p: 2, border: 1, borderColor: 'grey.300', borderRadius: 1 }}
          >
            <Stack direction="row" spacing={2} alignItems="center">
              <FormControl sx={{ minWidth: 200 }}>
                <InputLabel>Action Type</InputLabel>
                <Select
                  value={step.action || ''}
                  onChange={(e) => {
                    const newSteps = [...(selectedTarget.config.steps || [])];
                    newSteps[index] = { ...step, action: e.target.value };
                    updateCustomTarget('steps', newSteps);
                  }}
                  label="Action Type"
                >
                  <MenuItem value="navigate">Navigate</MenuItem>
                  <MenuItem value="click">Click</MenuItem>
                  <MenuItem value="type">Type</MenuItem>
                  <MenuItem value="extract">Extract</MenuItem>
                  <MenuItem value="wait">Wait</MenuItem>
                  <MenuItem value="waitForNewChildren">Wait for New Children</MenuItem>
                </Select>
              </FormControl>

              <IconButton
                onClick={() => {
                  const newSteps = selectedTarget.config.steps?.filter(
                    (_: any, i: number) => i !== index,
                  );
                  updateCustomTarget('steps', newSteps);
                }}
              >
                <DeleteIcon />
              </IconButton>
            </Stack>

            <Box sx={{ mt: 2 }}>
              {step.action === 'navigate' && (
                <TextField
                  fullWidth
                  label="URL"
                  value={step.args?.url || ''}
                  onChange={(e) => {
                    const newSteps = [...(selectedTarget.config.steps || [])];
                    newSteps[index] = {
                      ...step,
                      args: { ...step.args, url: e.target.value },
                    };
                    updateCustomTarget('steps', newSteps);
                  }}
                  margin="normal"
                  placeholder="https://example.com"
                />
              )}

              {(step.action === 'click' || step.action === 'type' || step.action === 'extract') && (
                <Stack spacing={2}>
                  <TextField
                    fullWidth
                    label="Selector"
                    value={step.args?.selector || ''}
                    onChange={(e) => {
                      const newSteps = [...(selectedTarget.config.steps || [])];
                      newSteps[index] = {
                        ...step,
                        args: { ...step.args, selector: e.target.value },
                      };
                      updateCustomTarget('steps', newSteps);
                    }}
                    margin="normal"
                    placeholder="#search-input"
                  />
                  {step.action === 'click' && (
                    <FormControl>
                      <InputLabel>Optional</InputLabel>
                      <Select
                        value={step.args?.optional || false}
                        onChange={(e) => {
                          const newSteps = [...(selectedTarget.config.steps || [])];
                          newSteps[index] = {
                            ...step,
                            args: { ...step.args, optional: e.target.value === 'true' },
                          };
                          updateCustomTarget('steps', newSteps);
                        }}
                        label="Optional"
                      >
                        <MenuItem value="true">Yes</MenuItem>
                        <MenuItem value="false">No</MenuItem>
                      </Select>
                    </FormControl>
                  )}
                </Stack>
              )}

              {step.action === 'type' && (
                <TextField
                  fullWidth
                  label="Text"
                  value={step.args?.text || ''}
                  onChange={(e) => {
                    const newSteps = [...(selectedTarget.config.steps || [])];
                    newSteps[index] = {
                      ...step,
                      args: { ...step.args, text: e.target.value },
                    };
                    updateCustomTarget('steps', newSteps);
                  }}
                  margin="normal"
                  placeholder="{{prompt}}"
                />
              )}

              {step.action === 'wait' && (
                <TextField
                  fullWidth
                  label="Wait Time (ms)"
                  type="number"
                  value={step.args?.ms || 1000}
                  onChange={(e) => {
                    const newSteps = [...(selectedTarget.config.steps || [])];
                    newSteps[index] = {
                      ...step,
                      args: { ...step.args, ms: Number(e.target.value) },
                    };
                    updateCustomTarget('steps', newSteps);
                  }}
                  margin="normal"
                />
              )}

              {step.action === 'extract' && (
                <TextField
                  fullWidth
                  label="Variable Name"
                  value={step.name || ''}
                  onChange={(e) => {
                    const newSteps = [...(selectedTarget.config.steps || [])];
                    newSteps[index] = { ...step, name: e.target.value };
                    updateCustomTarget('steps', newSteps);
                  }}
                  margin="normal"
                  placeholder="searchResults"
                />
              )}

              {step.action === 'waitForNewChildren' && (
                <>
                  <TextField
                    fullWidth
                    label="Parent Selector"
                    value={step.args?.parentSelector || ''}
                    onChange={(e) => {
                      const newSteps = [...(selectedTarget.config.steps || [])];
                      newSteps[index] = {
                        ...step,
                        args: { ...step.args, parentSelector: e.target.value },
                      };
                      updateCustomTarget('steps', newSteps);
                    }}
                    margin="normal"
                    placeholder="#results"
                  />
                  <TextField
                    fullWidth
                    label="Initial Delay (ms)"
                    type="number"
                    value={step.args?.delay || 1000}
                    onChange={(e) => {
                      const newSteps = [...(selectedTarget.config.steps || [])];
                      newSteps[index] = {
                        ...step,
                        args: { ...step.args, delay: Number(e.target.value) },
                      };
                      updateCustomTarget('steps', newSteps);
                    }}
                    margin="normal"
                  />
                  <TextField
                    fullWidth
                    label="Timeout (ms)"
                    type="number"
                    value={step.args?.timeout || 30000}
                    onChange={(e) => {
                      const newSteps = [...(selectedTarget.config.steps || [])];
                      newSteps[index] = {
                        ...step,
                        args: { ...step.args, timeout: Number(e.target.value) },
                      };
                      updateCustomTarget('steps', newSteps);
                    }}
                    margin="normal"
                  />
                </>
              )}
            </Box>
          </Box>
        ))}

        <Button
          startIcon={<AddIcon />}
          onClick={() => {
            const newSteps = [...(selectedTarget.config.steps || []), { action: '', args: {} }];
            updateCustomTarget('steps', newSteps);
          }}
          variant="outlined"
          sx={{ mt: 1 }}
        >
          Add Step
        </Button>
      </Box>
    </Box>
  );
};

export default BrowserAutomationConfiguration;
