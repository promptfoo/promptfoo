import React from 'react';
import Editor from 'react-simple-code-editor';
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
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import dedent from 'dedent';
import 'prismjs/components/prism-clike';
// @ts-expect-error: No types available
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-javascript';
import type { ProviderOptions } from '../../types';
import 'prismjs/themes/prism.css';

interface TestTargetConfigurationProps {
  testingTarget: boolean;
  handleTestTarget: () => void;
  selectedTarget: ProviderOptions;
  testResult: any;
  requiresTransformResponse: (target: ProviderOptions) => boolean;
  updateCustomTarget: (field: string, value: any) => void;
  hasTestedTarget: boolean;
}

const TestTargetConfiguration: React.FC<TestTargetConfigurationProps> = ({
  testingTarget,
  handleTestTarget,
  selectedTarget,
  testResult,
  requiresTransformResponse,
  updateCustomTarget,
}) => {
  const theme = useTheme();
  const darkMode = theme.palette.mode === 'dark';

  return (
    <Box mt={4}>
      {requiresTransformResponse(selectedTarget) && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Configure Request Transform
          </Typography>
          <Box mt={2} p={2} border={1} borderColor="grey.300" borderRadius={1}>
            <Box
              sx={{
                border: 1,
                borderColor: 'grey.300',
                borderRadius: 1,
                mt: 1,
                position: 'relative',
                backgroundColor: darkMode ? '#1e1e1e' : '#fff',
              }}
            >
              <Editor
                value={selectedTarget.config.transformRequest || ''}
                onValueChange={(code) => updateCustomTarget('transformRequest', code)}
                highlight={(code) => highlight(code, languages.javascript)}
                padding={10}
                placeholder={dedent`Optional: A JavaScript expression to transform the prompt before calling the API. Format as:

                  A JSON object with prompt variable: \`{ messages: [{ role: 'user', content: prompt }] }\`
                `}
                style={{
                  fontFamily: '"Fira code", "Fira Mono", monospace',
                  fontSize: 14,
                  minHeight: '100px',
                }}
              />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Transform the prompt into a specific structure required by your API before sending.
            </Typography>
          </Box>
          <Typography variant="h6" gutterBottom mt={4}>
            Configure Response Transform
          </Typography>
          <Box mt={2} p={2} border={1} borderColor="grey.300" borderRadius={1}>
            <Box
              sx={{
                border: 1,
                borderColor: 'grey.300',
                borderRadius: 1,
                mt: 1,
                position: 'relative',
                backgroundColor: darkMode ? '#1e1e1e' : '#fff',
              }}
            >
              <Editor
                value={selectedTarget.config.transformResponse || ''}
                onValueChange={(code) => updateCustomTarget('transformResponse', code)}
                highlight={(code) => highlight(code, languages.javascript)}
                padding={10}
                placeholder={dedent`Optional: Transform the API response before using it. Format as either:

                  1. A JavaScript object path: \`json.choices[0].message.content\`
                  2. A function that receives response data: \`(json, text) => json.choices[0].message.content || text\`
                `}
                style={{
                  fontFamily: '"Fira code", "Fira Mono", monospace',
                  fontSize: 14,
                  minHeight: '100px',
                }}
              />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Extract specific data from the HTTP response. See{' '}
              <a
                href="https://www.promptfoo.dev/docs/providers/http/#response-parser"
                target="_blank"
              >
                docs
              </a>{' '}
              for more information.
            </Typography>
          </Box>
          <Box mt={4} mb={2}>
            <Typography variant="h6" gutterBottom>
              Configure Session Header
            </Typography>
            <Box mt={2} p={2} border={1} borderColor="grey.300" borderRadius={1}>
              <TextField
                fullWidth
                label="Session Header"
                value={selectedTarget.config.sessionParser}
                placeholder="Optional: Enter the name of the header that contains the session ID"
                onChange={(e) => updateCustomTarget('sessionParser', e.target.value)}
                margin="normal"
                InputLabelProps={{
                  shrink: true,
                }}
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Extract session IDs from HTTP response headers for stateful systems. See{' '}
                <a
                  href="https://www.promptfoo.dev/docs/providers/http/#session-management"
                  target="_blank"
                >
                  docs
                </a>{' '}
                for more information.
              </Typography>
            </Box>
          </Box>
        </Box>
      )}
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

      {!selectedTarget.config.url && !selectedTarget.config.request && (
        <Alert severity="info">
          Please configure the HTTP endpoint above and click "Test Target" to proceed.
        </Alert>
      )}
      {selectedTarget.config.request && (
        <Alert severity="info">
          Automated target testing is not available in raw request mode.
        </Alert>
      )}

      {testResult && (
        <Box mt={2}>
          {testResult.success != null && (
            <Alert severity={testResult.success ? 'success' : 'error'}>{testResult.message}</Alert>
          )}
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
                  mb: 2,
                }}
              >
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Header</TableCell>
                      <TableCell>Value</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(testResult.providerResponse?.metadata?.headers || {}).map(
                      ([key, value]) => (
                        <TableRow key={key}>
                          <TableCell>{key}</TableCell>
                          <TableCell
                            sx={{
                              wordBreak: 'break-all',
                            }}
                          >
                            {value as string}
                          </TableCell>
                        </TableRow>
                      ),
                    )}
                  </TableBody>
                </Table>
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
                  {typeof testResult.providerResponse?.raw === 'string'
                    ? testResult.providerResponse?.raw
                    : JSON.stringify(testResult.providerResponse?.raw, null, 2)}
                </pre>
              </Paper>
              <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                Parsed Result:
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
                  {typeof testResult.providerResponse?.output === 'string'
                    ? testResult.providerResponse?.output
                    : JSON.stringify(testResult.providerResponse?.output, null, 2)}
                </pre>
              </Paper>
              <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                Session ID:
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
                  {testResult.providerResponse?.sessionId}
                </pre>
              </Paper>
            </AccordionDetails>
          </Accordion>
        </Box>
      )}
    </Box>
  );
};

export default TestTargetConfiguration;
