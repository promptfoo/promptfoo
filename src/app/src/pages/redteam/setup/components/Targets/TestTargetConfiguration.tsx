import React from 'react';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoIcon from '@mui/icons-material/Info';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import type { ProviderOptions } from '../../types';

interface TestTargetConfigurationProps {
  testingTarget: boolean;
  handleTestTarget: () => void;
  selectedTarget: ProviderOptions;
  testResult: any;
  requiresResponseParser: (target: ProviderOptions) => boolean;
  updateCustomTarget: (field: string, value: any) => void;
  hasTestedTarget: boolean;
}

const TestTargetConfiguration: React.FC<TestTargetConfigurationProps> = ({
  testingTarget,
  handleTestTarget,
  selectedTarget,
  testResult,
  requiresResponseParser,
  updateCustomTarget,
  hasTestedTarget,
}) => {
  const theme = useTheme();

  return (
    <Box mt={4}>
      <Stack direction="row" alignItems="center" spacing={2} mb={2}>
        <Typography variant="h6" sx={{ flexGrow: 1 }}>
          Test Target Configuration
        </Typography>
        <Button
          variant="contained"
          onClick={handleTestTarget}
          disabled={testingTarget || !selectedTarget.config.url}
          startIcon={testingTarget ? <CircularProgress size={20} /> : null}
          color="primary"
        >
          {testingTarget ? 'Testing...' : 'Test Target'}
        </Button>
      </Stack>

      {!selectedTarget.config.url && (
        <Alert severity="info">
          Please configure the HTTP endpoint above and click "Test Target" to proceed.
        </Alert>
      )}

      {testResult && (
        <Box mt={2}>
          <Alert severity={testResult.success ? 'success' : 'error'}>{testResult.message}</Alert>
          <Accordion sx={{ mt: 2 }} expanded>
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              aria-controls="provider-response-content"
              id="provider-response-header"
            >
              <Typography>Provider Response Details</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="subtitle2" gutterBottom>
                Headers:
              </Typography>
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100'),
                  maxHeight: '200px',
                  overflow: 'auto',
                }}
              >
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {JSON.stringify(testResult.providerResponse?.metadata?.headers, null, 2)}
                </pre>
              </Paper>
              <Typography variant="subtitle2" gutterBottom>
                Raw Result:
              </Typography>

              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100'),
                  maxHeight: '200px',
                  overflow: 'auto',
                }}
              >
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {JSON.stringify(testResult.providerResponse?.raw, null, 2)}
                </pre>
              </Paper>
              <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                Parsed Result:
              </Typography>
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  bgcolor: 'grey.100',
                  maxHeight: '200px',
                  overflow: 'auto',
                }}
              >
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {JSON.stringify(testResult.providerResponse?.output, null, 2)}
                </pre>
              </Paper>
              <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                Session ID:
              </Typography>
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  bgcolor: 'grey.100',
                  maxHeight: '200px',
                  overflow: 'auto',
                }}
              >
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {testResult.providerResponse?.sessionId}
                </pre>
              </Paper>
            </AccordionDetails>
          </Accordion>
          {testResult.suggestions && (
            <Box mt={2}>
              <Typography variant="subtitle1" gutterBottom>
                Suggestions:
              </Typography>
              <Paper
                elevation={1}
                sx={{
                  p: 2,
                  bgcolor: theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
                }}
              >
                <List>
                  {testResult.suggestions.map((suggestion: string, index: number) => (
                    <ListItem key={index}>
                      <ListItemIcon>
                        <InfoIcon color="primary" />
                      </ListItemIcon>
                      <ListItemText primary={suggestion} />
                    </ListItem>
                  ))}
                </List>
              </Paper>
            </Box>
          )}
        </Box>
      )}

      {requiresResponseParser(selectedTarget) && (
        <Box mt={4}>
          <Typography variant="h6" gutterBottom>
            Configure Response Parser
          </Typography>
          <Box mt={2} p={2} border={1} borderColor="grey.300" borderRadius={1}>
            <TextField
              fullWidth
              label="Response Parser"
              value={selectedTarget.config.responseParser}
              placeholder="Optional: A JavaScript expression to parse the response. E.g. json.choices[0].message.content"
              onChange={(e) => updateCustomTarget('responseParser', e.target.value)}
              margin="normal"
              InputLabelProps={{
                shrink: true,
              }}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Based on the test response above, configure how to extract the relevant content from
              the response.
            </Typography>
          </Box>
          <Box mt={4}>
            <Typography variant="h6" gutterBottom>
              Configure Session Parser
            </Typography>
            <Box mt={2} p={2} border={1} borderColor="grey.300" borderRadius={1}>
              <TextField
                fullWidth
                label="Session Parser"
                value={selectedTarget.config.sessionParser}
                placeholder="Optional: Enter the name of the header that contains the session ID"
                onChange={(e) => updateCustomTarget('sessionParser', e.target.value)}
                margin="normal"
                InputLabelProps={{
                  shrink: true,
                }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Based on the test response above, configure how to extract the session ID from the
                headers. This is only needed for stateful systems.
              </Typography>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default TestTargetConfiguration;
