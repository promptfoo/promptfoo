import React, { useEffect, useState } from 'react';
import { useTelemetry } from '@app/hooks/useTelemetry';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import { Alert, Switch } from '@mui/material';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import { EXAMPLE_CONFIG, useRedTeamConfig } from '../hooks/useRedTeamConfig';

interface PromptsProps {
  onNext: () => void;
}

export default function Purpose({ onNext }: PromptsProps) {
  const theme = useTheme();
  const { config, updateApplicationDefinition, setFullConfig } = useRedTeamConfig();
  const { recordEvent } = useTelemetry();
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [testMode, setTestMode] = useState<'application' | 'model'>('application');
  const [externalSystemEnabled, setExternalSystemEnabled] = useState(
    Boolean(config.applicationDefinition.connectedSystems?.trim()),
  );

  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_purpose' });
  }, []);

  const handleTestModeChange = (
    event: React.MouseEvent<HTMLElement>,
    newMode: 'application' | 'model',
  ) => {
    if (newMode !== null) {
      setTestMode(newMode);
      // Clear application definition fields when switching to model testing
      if (newMode === 'model') {
        Object.keys(config.applicationDefinition).forEach((key) => {
          updateApplicationDefinition(key as keyof typeof config.applicationDefinition, '');
        });
      }
      recordEvent('feature_used', { feature: 'redteam_test_mode_change', mode: newMode });
    }
  };

  const isPurposePresent = config.purpose && config.purpose.trim() !== '';

  const handleLoadExample = () => {
    if (config.purpose || Object.values(config.applicationDefinition).some((val) => val)) {
      setConfirmDialogOpen(true);
    } else {
      recordEvent('feature_used', { feature: 'redteam_config_example' });
      setTestMode('application');
      setExternalSystemEnabled(true);
      setFullConfig(EXAMPLE_CONFIG);
    }
  };

  const handleConfirmLoadExample = () => {
    recordEvent('feature_used', { feature: 'redteam_config_example' });
    setTestMode('application');
    setExternalSystemEnabled(true);
    setFullConfig(EXAMPLE_CONFIG);
    setConfirmDialogOpen(false);
  };

  return (
    <Stack direction="column" spacing={4}>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold' }}>
          Usage Details
        </Typography>
        <Button variant="outlined" onClick={handleLoadExample}>
          Load Example
        </Button>
      </Box>

      <ToggleButtonGroup
        value={testMode}
        exclusive
        onChange={handleTestModeChange}
        aria-label="test mode"
        sx={{
          '& .Mui-selected': {
            backgroundColor: `${alpha(theme.palette.primary.main, 0.08)} !important`,
            '&:hover': {
              backgroundColor: `${alpha(theme.palette.primary.main, 0.12)} !important`,
            },
          },
        }}
      >
        <ToggleButton
          value="application"
          aria-label="test application"
          sx={{
            py: 1.5,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.5,
            flex: 1,
            '&.Mui-selected': {
              color: 'primary.main',
              borderColor: 'primary.main',
            },
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 'medium' }}>
            I'm testing an application
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Test a complete AI application with its context
          </Typography>
        </ToggleButton>
        <ToggleButton
          value="model"
          aria-label="test model"
          sx={{
            py: 1.5,
            display: 'flex',
            flexDirection: 'column',
            gap: 0.5,
            flex: 1,
            '&.Mui-selected': {
              color: 'primary.main',
              borderColor: 'primary.main',
            },
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 'medium' }}>
            I'm testing a model
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Test a model directly without application context
          </Typography>
        </ToggleButton>
      </ToggleButtonGroup>

      {testMode === 'application' ? (
        <>
          <Alert
            severity="info"
            sx={{
              '& .MuiAlert-icon': {
                color: 'info.main',
              },
              backgroundColor: (theme) =>
                theme.palette.mode === 'dark'
                  ? alpha(theme.palette.info.main, 0.1)
                  : alpha(theme.palette.info.main, 0.05),
              border: (theme) =>
                `1px solid ${
                  theme.palette.mode === 'dark'
                    ? alpha(theme.palette.info.main, 0.3)
                    : alpha(theme.palette.info.main, 0.2)
                }`,
              '& .MuiAlert-message': {
                color: 'text.primary',
              },
            }}
          >
            The more information you provide, the better the redteam attacks will be. You can leave
            fields blank if they're not relevant, and you'll be able to revise information later.
          </Alert>

          <Box>
            <Stack direction="column" spacing={3}>
              <Box>
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 'medium' }}>
                  Purpose
                </Typography>
                <Typography variant="body1">
                  The primary objective of the AI in this application.
                </Typography>
                <TextField
                  fullWidth
                  value={config.applicationDefinition.purpose}
                  onChange={(e) => updateApplicationDefinition('purpose', e.target.value)}
                  placeholder="e.g. You are a travel agent specialized in budget trips to Europe."
                  margin="normal"
                  multiline
                  rows={4}
                />
              </Box>

              <Box>
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 'medium' }}>
                  Describe the user the redteamer is impersonating
                </Typography>
                <TextField
                  fullWidth
                  value={config.applicationDefinition.redteamUser}
                  onChange={(e) => updateApplicationDefinition('redteamUser', e.target.value)}
                  placeholder="e.g. A traveler looking for budget flights to Europe. An employee of the company."
                />
              </Box>

              <Box>
                <Typography variant="h5" sx={{ fontWeight: 'medium', mb: 1 }}>
                  External System Access
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Switch
                    checked={externalSystemEnabled}
                    onChange={(e) => setExternalSystemEnabled(e.target.checked)}
                    inputProps={{ 'aria-label': 'toggle external system access' }}
                  />
                  <Typography>This application connects to external systems</Typography>
                </Box>

                {externalSystemEnabled && (
                  <Stack spacing={2}>
                    <Typography variant="body1">
                      What external systems are connected to this application?
                    </Typography>
                    <TextField
                      fullWidth
                      value={config.applicationDefinition.connectedSystems}
                      onChange={(e) =>
                        updateApplicationDefinition('connectedSystems', e.target.value)
                      }
                      multiline
                      rows={2}
                      placeholder="e.g. A CRM system for managing customer relationships. Flight booking system. Internal company knowledge base."
                    />
                    <Typography variant="body1">
                      What data is available to the LLM from connected systems that the user has
                      access to?
                    </Typography>
                    <TextField
                      fullWidth
                      value={config.applicationDefinition.accessToData}
                      onChange={(e) => updateApplicationDefinition('accessToData', e.target.value)}
                      multiline
                      rows={2}
                      placeholder="e.g. Flight prices and schedules, their own profile and purchase history. Basic HR information like holiday schedules, expense policy. 2024 Company plans, budget allocations and org chart."
                    />

                    <Typography variant="body1">
                      What data is available to the LLM from connected systems that the user
                      shouldn't have access to?
                    </Typography>
                    <TextField
                      fullWidth
                      value={config.applicationDefinition.forbiddenData}
                      onChange={(e) => updateApplicationDefinition('forbiddenData', e.target.value)}
                      multiline
                      rows={2}
                      placeholder="e.g. Other users' profiles and purchase history. Sensitive company information like financials, strategy, other employee data."
                    />

                    <Typography variant="body1">
                      What actions can the user take on connected systems?
                    </Typography>
                    <TextField
                      fullWidth
                      value={config.applicationDefinition.accessToActions}
                      onChange={(e) =>
                        updateApplicationDefinition('accessToActions', e.target.value)
                      }
                      multiline
                      rows={2}
                      placeholder="e.g. Update their profile, search for flights, book flights, view purchase history, view HR information."
                    />

                    <Typography variant="body1">
                      What actions shouldn't the user be able to take on connected systems?
                    </Typography>
                    <TextField
                      fullWidth
                      value={config.applicationDefinition.forbiddenActions}
                      onChange={(e) =>
                        updateApplicationDefinition('forbiddenActions', e.target.value)
                      }
                      multiline
                      rows={2}
                      placeholder="e.g. Update other users' profile, cancel other users' flights."
                    />
                  </Stack>
                )}
              </Box>
            </Stack>
          </Box>
        </>
      ) : (
        <Box>
          <Alert
            severity="info"
            sx={{
              '& .MuiAlert-icon': {
                color: 'info.main',
              },
              backgroundColor: (theme) =>
                theme.palette.mode === 'dark'
                  ? alpha(theme.palette.info.main, 0.1)
                  : alpha(theme.palette.info.main, 0.05),
              border: (theme) =>
                `1px solid ${
                  theme.palette.mode === 'dark'
                    ? alpha(theme.palette.info.main, 0.3)
                    : alpha(theme.palette.info.main, 0.2)
                }`,
              '& .MuiAlert-message': {
                color: 'text.primary',
              },
            }}
          >
            When testing a model directly, you don't need to provide application details. You can
            proceed to configure the model and test scenarios in the next steps.
          </Alert>
        </Box>
      )}

      <Grid item xs={12}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            mt: 4,
          }}
        >
          <Button
            variant="contained"
            endIcon={<KeyboardArrowRightIcon />}
            onClick={onNext}
            disabled={testMode === 'application' && !isPurposePresent}
            sx={{
              backgroundColor: theme.palette.primary.main,
              '&:hover': { backgroundColor: theme.palette.primary.dark },
              '&:disabled': { backgroundColor: theme.palette.action.disabledBackground },
              px: 4,
              py: 1,
            }}
          >
            Next
          </Button>
        </Box>
      </Grid>

      <Dialog open={confirmDialogOpen} onClose={() => setConfirmDialogOpen(false)}>
        <DialogTitle>Load Example Configuration?</DialogTitle>
        <DialogContent>
          Load example configuration with demo chat endpoint and sample application details? Current
          settings will be replaced.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleConfirmLoadExample} variant="contained" color="primary">
            Load Example
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
