import { useEffect } from 'react';
import { useTelemetry } from '@app/hooks/useTelemetry';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import { Alert } from '@mui/material';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';

interface PromptsProps {
  onNext: () => void;
}

export default function Purpose({ onNext }: PromptsProps) {
  const { config, updateApplicationDefinition } = useRedTeamConfig();
  const { recordEvent } = useTelemetry();

  useEffect(() => {
    recordEvent('webui_page_view', { page: 'redteam_config_purpose' });
  }, []);

  const isPurposePresent = config.purpose && config.purpose.trim() !== '';

  return (
    <Stack direction="column" spacing={4}>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', mb: 3 }}>
        Application Details
      </Typography>
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
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 'medium' }}>
              External System Access
            </Typography>
            <Typography sx={{ mt: 2 }} variant="body1">
              What external systems are connected to this application?
            </Typography>
            <TextField
              fullWidth
              value={config.applicationDefinition.connectedSystems}
              onChange={(e) => updateApplicationDefinition('connectedSystems', e.target.value)}
              multiline
              rows={2}
              placeholder="e.g. A CRM system for managing customer relationships. Flight booking system. Internal company knowledge base."
            />
            <Typography sx={{ mt: 2 }} variant="body1">
              What data is available to the LLM from connected systems that the user has access to?
            </Typography>
            <TextField
              fullWidth
              value={config.applicationDefinition.accessToData}
              onChange={(e) => updateApplicationDefinition('accessToData', e.target.value)}
              multiline
              rows={2}
              placeholder="e.g. Flight prices and schedules, their own profile and purchase history. Basic HR information like holiday schedules, expense policy. 2024 Company plans, budget allocations and org chart."
            />

            <Typography sx={{ mt: 2 }} variant="body1">
              What data is available to the LLM from connected systems that the user shouldn't have
              access to?
            </Typography>
            <TextField
              fullWidth
              value={config.applicationDefinition.forbiddenData}
              onChange={(e) => updateApplicationDefinition('forbiddenData', e.target.value)}
              multiline
              rows={2}
              placeholder="e.g. Other users' profiles and purchase history. Sensitive company information like financials, strategy, other employee data."
            />

            <Typography sx={{ mt: 2 }} variant="body1">
              What actions can the user take on connected systems?
            </Typography>
            <TextField
              fullWidth
              value={config.applicationDefinition.accessToActions}
              onChange={(e) => updateApplicationDefinition('accessToActions', e.target.value)}
              multiline
              rows={2}
              placeholder="e.g. Update their profile, search for flights, book flights, view purchase history, view HR information."
            />

            <Typography sx={{ mt: 2 }} variant="body1">
              What actions shouldn't the user be able to take on connected systems?
            </Typography>
            <TextField
              fullWidth
              value={config.applicationDefinition.forbiddenActions}
              onChange={(e) => updateApplicationDefinition('forbiddenActions', e.target.value)}
              multiline
              rows={2}
              placeholder="e.g. Update other users' profile, cancel other users' flights."
            />
          </Box>
        </Stack>

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
              disabled={!isPurposePresent}
              sx={{
                backgroundColor: '#3498db',
                '&:hover': { backgroundColor: '#2980b9' },
                '&:disabled': { backgroundColor: '#bdc3c7' },
                px: 4,
                py: 1,
              }}
            >
              Next
            </Button>
          </Box>
        </Grid>
      </Box>
    </Stack>
  );
}
